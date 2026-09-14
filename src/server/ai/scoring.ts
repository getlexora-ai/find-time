/**
 * Slot scoring — the step that turns "any free gap" into "the right gap".
 *
 * The old placer was first-fit: walk the day, take the first hole big enough.
 * First-fit has no preference to learn *into*, so no amount of user feedback
 * could ever change what it did. This module makes the decision parametric:
 * every candidate slot gets a feature vector, the profile supplies the weights,
 * and placement becomes argmax. Feedback then has somewhere to land
 * (src/server/ai/learn.ts).
 *
 * Two separate mechanisms, deliberately not mixed:
 *   - HARD rules the user stated are *filters* (`ruleBlocks`). They remove
 *     candidates outright and are never traded off against a score.
 *   - SOFT preferences, learned or default, are *weights*. They only reorder
 *     candidates that are already legal.
 *
 * Pure: no DB, no clock, no I/O. Every feature is normalised to [0, 1] where 1
 * is always "good", so the weighted sum stays legible and every weight stays
 * non-negative.
 */

import {
  type AgentProfile,
  type HardRule,
  type Weekday,
  WEEKDAYS,
  WEIGHT_KEYS,
  avoidedHours,
  effectiveBuffer,
  energyAt,
  preferredHours,
  weekdayLean,
} from './preferences.ts';

/**
 * Bump whenever a feature's definition changes or a factor is added/removed.
 *
 * Feature values are only comparable within a scorer version: if `dayLoad`
 * starts measuring something else, rows from before and after the change are
 * different variables wearing the same name, and pooling them silently
 * corrupts any analysis run across the boundary.
 */
export const SCORER_VERSION = 's1';

const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

export type Interval = { s: number; e: number };

export type SlotFeatures = {
  hourFit: number;
  energy: number;
  fragmentation: number;
  dayLoad: number;
  backToBack: number;
  earliness: number;
  weekdayFit: number;
};

export type ScoreContext = {
  /** sorted, non-overlapping busy intervals in epoch ms */
  busy: Interval[];
  earliest: number;
  latest: number;
  category: string;
  /** the day window in hours, after hard rules have been applied */
  dayStartHour: number;
  dayEndHour: number;
};

export const ZERO_FEATURES: SlotFeatures = {
  hourFit: 0,
  energy: 0,
  fragmentation: 0,
  dayLoad: 0,
  backToBack: 0,
  earliness: 0,
  weekdayFit: 0,
};

/** Start of the UTC day containing `ms` (wall-clock convention, see find-time.ts). */
export function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

export function weekdayOf(ms: number): Weekday {
  return WEEKDAYS[new Date(ms).getUTCDay()];
}

/** Fractional UTC hour of day, e.g. 09:30 -> 9.5. */
export function hourOf(ms: number): number {
  return (ms - dayStart(ms)) / HOUR;
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** How much of [s, e) overlaps [ws, we), in ms. */
function overlapMs(s: number, e: number, ws: number, we: number): number {
  return Math.max(0, Math.min(e, we) - Math.max(s, ws));
}

// ── hard rules ──────────────────────────────────────────────────────────────

/**
 * Does a stated rule forbid this slot outright? Only `hard` rules filter; a
 * soft rule of the same kind is left to the scorer.
 *
 * Rule payloads are `Record<string, unknown>` straight out of jsonb, so every
 * field is validated here rather than trusted.
 */
export function ruleBlocks(rule: HardRule, startMs: number, endMs: number, category: string): boolean {
  if (!rule.hard) return false;
  const r = rule.rule ?? {};
  const day = typeof r.day === 'string' ? r.day : null;
  if (day && day !== weekdayOf(startMs)) return false;

  const start = typeof r.start === 'number' ? r.start : null;
  const end = typeof r.end === 'number' ? r.end : null;
  const from = hourOf(startMs);
  // Measured as a span from `from` rather than re-deriving the end hour, so a
  // block that ends exactly on a boundary (16:00–17:00 against a 17:00 close,
  // or 11:00–12:00 against a window starting at 12:00) reads as adjacent rather
  // than overlapping — and so a block running past midnight yields to > 24
  // instead of wrapping to 0.
  const to = from + (endMs - startMs) / HOUR;

  switch (rule.kind) {
    case 'work-hours':
      // Must sit entirely inside the working window.
      if (start === null || end === null) return false;
      return from < start || to > end;

    case 'protected':
      // Nothing may overlap a protected window.
      if (start === null || end === null) return false;
      return from < end && to > start;

    case 'no-meetings':
      if (category !== 'meeting') return false;
      if (start === null || end === null) return true; // whole-day no-meeting rule
      return from < end && to > start;

    case 'leave-by': {
      const by = typeof r.hour === 'number' ? r.hour : end;
      if (by === null || by === undefined) return false;
      return to > by;
    }

    case 'hard-bound': {
      const lo = typeof r.earliestISO === 'string' ? Date.parse(r.earliestISO) : NaN;
      const hi = typeof r.latestISO === 'string' ? Date.parse(r.latestISO) : NaN;
      if (Number.isFinite(lo) && startMs < lo) return true;
      if (Number.isFinite(hi) && endMs > hi) return true;
      return false;
    }

    // 'buffer' is a spacing preference, not a legality filter — see effectiveBuffer.
    default:
      return false;
  }
}

export function anyRuleBlocks(
  rules: HardRule[],
  startMs: number,
  endMs: number,
  category: string,
): boolean {
  return rules.some((r) => ruleBlocks(r, startMs, endMs, category));
}

// ── features ────────────────────────────────────────────────────────────────

/**
 * How well the slot's hours match what this user likes for this category.
 * Learned `preferred-hours` wins if present; otherwise the requested day window
 * is treated as neutral-good. Learned `avoid-hours` overlap drags it down.
 */
function hourFitFeature(profile: AgentProfile, ctx: ScoreContext, s: number, e: number): number {
  const from = hourOf(s);
  const to = from + (e - s) / HOUR;
  const span = Math.max(1e-6, to - from);

  const pref = preferredHours(profile, ctx.category);
  let fit: number;
  if (pref) {
    // fraction of the block that lands inside the preferred window
    fit = clamp01(Math.max(0, Math.min(to, pref.end) - Math.max(from, pref.start)) / span);
    // a block fully outside a known preference is bad, but not illegal
    fit = 0.15 + 0.85 * fit;
  } else {
    // no learned preference yet — inside the requested window is simply fine
    const inside =
      Math.max(0, Math.min(to, ctx.dayEndHour) - Math.max(from, ctx.dayStartHour)) / span;
    fit = 0.4 + 0.6 * clamp01(inside);
  }

  for (const av of avoidedHours(profile, ctx.category)) {
    const bad = Math.max(0, Math.min(to, av.end) - Math.max(from, av.start)) / span;
    fit *= 1 - 0.8 * clamp01(bad);
  }
  return clamp01(fit);
}

/** Mean of the energy curve across the hours the block spans. */
function energyFeature(profile: AgentProfile, s: number, e: number): number {
  const first = Math.floor(hourOf(s));
  const last = Math.max(first, Math.ceil(hourOf(e)) - 1);
  let sum = 0;
  let n = 0;
  for (let h = first; h <= last && n < 24; h++) {
    sum += energyAt(profile, ((h % 24) + 24) % 24);
    n++;
  }
  return n ? clamp01(sum / n) : 0.5;
}

/** The free gap that contains [s, e), clipped to that day's usable window. */
function containingGap(ctx: ScoreContext, s: number, e: number): Interval {
  const d = dayStart(s);
  let lo = d + ctx.dayStartHour * HOUR;
  let hi = d + ctx.dayEndHour * HOUR;
  for (const b of ctx.busy) {
    if (b.e <= s && b.e > lo) lo = b.e;
    if (b.s >= e && b.s < hi) hi = b.s;
  }
  return { s: lo, e: Math.max(lo, hi) };
}

/**
 * Penalise slots that strand a hole too small to use. Booking 09:15–10:15 in a
 * 09:00–11:00 gap leaves a 15-minute orphan before it and a 45-minute one after
 * — the calendar looks free but nothing fits. Aligning to an edge avoids this.
 */
function fragmentationFeature(profile: AgentProfile, ctx: ScoreContext, s: number, e: number): number {
  const gap = containingGap(ctx, s, e);
  const minUsable = Math.max(15, profile.minFocusBlockMin) * MIN;
  const before = s - gap.s;
  const after = gap.e - e;
  let score = 1;
  if (before > 0 && before < minUsable) score -= 0.5 * (1 - before / minUsable);
  if (after > 0 && after < minUsable) score -= 0.5 * (1 - after / minUsable);
  return clamp01(score);
}

/** How much room is left in the day's focus budget once this block lands. */
function dayLoadFeature(profile: AgentProfile, ctx: ScoreContext, s: number, e: number): number {
  const d = dayStart(s);
  const ws = d + ctx.dayStartHour * HOUR;
  const we = d + ctx.dayEndHour * HOUR;
  let booked = 0;
  for (const b of ctx.busy) booked += overlapMs(b.s, b.e, ws, we);
  const budget = Math.max(60, profile.maxDailyFocusMin) * MIN;
  return clamp01(1 - (booked + (e - s)) / budget);
}

/** Breathing room either side, measured against the user's buffer preference. */
function backToBackFeature(profile: AgentProfile, ctx: ScoreContext, s: number, e: number): number {
  const buf = effectiveBuffer(profile) * MIN;
  if (buf <= 0) return 1;
  const gap = containingGap(ctx, s, e);
  const before = s - gap.s;
  const after = gap.e - e;
  // An edge of the day counts as clear air, not as a wall.
  const d = dayStart(s);
  const atDayStart = gap.s <= d + ctx.dayStartHour * HOUR;
  const atDayEnd = gap.e >= d + ctx.dayEndHour * HOUR;
  const b = atDayStart && before === 0 ? 1 : clamp01(before / buf);
  const a = atDayEnd && after === 0 ? 1 : clamp01(after / buf);
  return clamp01(0.5 * b + 0.5 * a);
}

/** 1 at the earliest allowed moment, decaying linearly to 0 at the latest. */
function earlinessFeature(ctx: ScoreContext, s: number): number {
  const span = ctx.latest - ctx.earliest;
  if (span <= 0) return 1;
  return clamp01(1 - (s - ctx.earliest) / span);
}

function weekdayFitFeature(profile: AgentProfile, s: number): number {
  return clamp01(0.5 + 0.5 * weekdayLean(profile, weekdayOf(s)));
}

export function slotFeatures(
  profile: AgentProfile,
  ctx: ScoreContext,
  startMs: number,
  endMs: number,
): SlotFeatures {
  return {
    hourFit: hourFitFeature(profile, ctx, startMs, endMs),
    energy: energyFeature(profile, startMs, endMs),
    fragmentation: fragmentationFeature(profile, ctx, startMs, endMs),
    dayLoad: dayLoadFeature(profile, ctx, startMs, endMs),
    backToBack: backToBackFeature(profile, ctx, startMs, endMs),
    earliness: earlinessFeature(ctx, startMs),
    weekdayFit: weekdayFitFeature(profile, startMs),
  };
}

/** Weighted sum, normalised by total weight so scores stay comparable in [0, 1]. */
export function scoreFeatures(features: SlotFeatures, profile: AgentProfile): number {
  let sum = 0;
  let total = 0;
  for (const k of WEIGHT_KEYS) {
    const w = profile.weights[k];
    sum += w * features[k];
    total += w;
  }
  return total > 0 ? sum / total : 0;
}

/**
 * The single biggest contributor to a slot's score, as a short phrase. This is
 * what lets the agent say *why* it picked a slot in words the user can argue
 * with — which is the only way the feedback it gets back is about the right
 * thing.
 */
export function topReason(features: SlotFeatures, profile: AgentProfile): string {
  const labels: Record<keyof SlotFeatures, string> = {
    hourFit: 'it matches the hours you usually want this kind of work in',
    energy: "it's when your energy is highest",
    fragmentation: "it doesn't leave an unusable gap either side",
    dayLoad: "that day still has room",
    backToBack: 'it keeps some air around the block',
    earliness: "it's the soonest slot that works",
    weekdayFit: "it's on a day you tend to keep for this",
  };
  let best: keyof SlotFeatures = 'earliness';
  let bestVal = -Infinity;
  for (const k of WEIGHT_KEYS) {
    const contribution = profile.weights[k] * features[k];
    if (contribution > bestVal) {
      bestVal = contribution;
      best = k;
    }
  }
  return labels[best];
}

// ── track B: why each number came out that way ──────────────────────────────

/**
 * A short, human-readable trace behind each feature value.
 *
 * A bare `0.55` says the scorer was unenthusiastic but not why, and while
 * there is a single consenting tester the "why" is the whole point — you
 * cannot tell which of the seven factors deserves to survive until you have
 * watched a few hundred decisions with the reasoning attached.
 *
 * These live here rather than in the capture layer because every intermediate
 * value they describe is already in scope here. Reconstructing them downstream
 * from the feature values alone would duplicate this module's logic and then
 * drift from it.
 *
 * Each note is capped at NOTE_MAX characters, matching the varchar(24) in
 * db/016. The cap is the point: a field that cannot hold prose will not
 * accrete it. They are written for a person reading a row six weeks later,
 * never parsed by anything.
 */
export type SlotNotes = Record<keyof SlotFeatures, string>;

export const NOTE_MAX = 24;

/** Trim to the column width rather than letting the insert fail. */
function note(s: string): string {
  return s.length <= NOTE_MAX ? s : s.slice(0, NOTE_MAX);
}

/** Whole hours where possible ("14h"), one decimal where not ("14.5h"). */
function h(hour: number): string {
  const r = Math.round(hour * 10) / 10;
  return `${Number.isInteger(r) ? r : r.toFixed(1)}h`;
}

/** Minutes as the shortest readable unit: 45m, 3h, 2.5h. */
function dur(ms: number): string {
  const mins = Math.round(ms / MIN);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round((mins / 60) * 10) / 10;
  return `${Number.isInteger(hrs) ? hrs : hrs.toFixed(1)}h`;
}

export function slotNotes(
  profile: AgentProfile,
  ctx: ScoreContext,
  startMs: number,
  endMs: number,
): SlotNotes {
  const from = hourOf(startMs);
  const pref = preferredHours(profile, ctx.category);
  const avoid = avoidedHours(profile, ctx.category);

  // hourFit — the comparison that produced the number: where it landed
  // against where this category is supposed to go.
  let hourFit: string;
  if (pref) hourFit = `${h(from)}/pref${pref.start}-${pref.end}`;
  else if (avoid.length) hourFit = `${h(from)}/avoid${avoid[0].start}-${avoid[0].end}`;
  else hourFit = `${h(from)}/nopref`;

  // energy — the band matters more than the value; the hour says which part
  // of the curve it came from.
  const e = energyAt(profile, Math.floor(((from % 24) + 24) % 24));
  const band = e >= 0.7 ? 'peak' : e <= 0.4 ? 'dip' : 'mid';
  const energy = `${band}@${h(from)}`;

  // fragmentation — what the block leaves behind on each side, which is the
  // thing the feature is actually about.
  const gap = containingGap(ctx, startMs, endMs);
  const before = startMs - gap.s;
  const after = gap.e - endMs;
  const fragmentation =
    before === 0 && after === 0
      ? 'fills-gap'
      : before === 0
        ? `keeps${dur(after)}`
        : after === 0
          ? `keeps${dur(before)}`
          : `splits${dur(before)}+${dur(after)}`;

  // dayLoad — booked against the budget, in the units the feature uses.
  const d = dayStart(startMs);
  const ws = d + ctx.dayStartHour * HOUR;
  const we = d + ctx.dayEndHour * HOUR;
  let booked = 0;
  for (const b of ctx.busy) booked += overlapMs(b.s, b.e, ws, we);
  const budget = Math.max(60, profile.maxDailyFocusMin) * MIN;
  const dayLoad = `${dur(booked + (endMs - startMs))}/${dur(budget)}`;

  // backToBack — how much air there actually is, not how much was wanted.
  const buf = effectiveBuffer(profile);
  const backToBack =
    buf <= 0
      ? 'no-buffer-set'
      : before <= 0 && after <= 0
        ? 'flush-both'
        : `${dur(before)}|${dur(after)}·b${buf}m`;

  // earliness — distance from the earliest allowed moment, in days.
  const days = Math.round(((startMs - ctx.earliest) / DAY) * 10) / 10;
  const earliness = `+${Number.isInteger(days) ? days : days.toFixed(1)}d`;

  // weekdayFit — the day, and whether anything is actually leaning on it.
  const wd = weekdayOf(startMs);
  const lean = weekdayLean(profile, wd);
  const weekdayFit = `${wd}·${lean > 0.05 ? 'for' : lean < -0.05 ? 'against' : 'neutral'}`;

  return {
    hourFit: note(hourFit),
    energy: note(energy),
    fragmentation: note(fragmentation),
    dayLoad: note(dayLoad),
    backToBack: note(backToBack),
    earliness: note(earliness),
    weekdayFit: note(weekdayFit),
  };
}
