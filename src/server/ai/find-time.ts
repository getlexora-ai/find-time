/**
 * Deterministic slot finder. The LLM (src/server/ai/gemini.ts) turns the
 * user's sentence into a `FindSpec`; this function does the actual placement so
 * the model can never hallucinate a double-book. Pure — no I/O, no clock.
 *
 * Times are ISO 8601 strings treated as UTC wall-clock, matching the rest of the
 * app (src/calendar/api-adapter.ts `partsToIso` writes `...T HH:MM:00.000Z`, and
 * the server runs UTC). "Hour of day" therefore means the UTC hour.
 *
 * Two placers live here:
 *   - `findFreeSlots` — the original first-fit walk. Kept because it is the
 *     zero-config fallback used when a user has no profile yet, and because it
 *     is the behaviour the existing self-check pins.
 *   - `rankFreeSlots` / `selectSlots` — score-and-rank placement (see
 *     scoring.ts). This is the path the agent uses: it enumerates every legal
 *     candidate, scores it against the user's learned profile, and returns them
 *     ordered, so placement is argmax rather than "first hole big enough".
 *     Only this version can learn.
 *
 * Server-only, but dependency-free, so the .check.mjs can import it directly.
 */

// NOTE: relative imports inside src/server/ai/ carry an explicit `.ts`
// extension so that `node src/server/ai/*.check.mjs` can run these modules
// directly with no build step (Node's ESM resolver does not guess extensions).
// `module: preserve` in tsconfig makes tsc accept them.
import type { AgentProfile } from './preferences.ts';
import {
  type Interval,
  type ScoreContext,
  type SlotFeatures,
  anyRuleBlocks,
  scoreFeatures,
  slotFeatures,
  topReason,
} from './scoring.ts';

export type Busy = { start: string; end: string };
export type Slot = { startISO: string; endISO: string };

export type FindSpec = {
  durationMin: number;
  count: number;
  /** search window, inclusive start / exclusive end */
  earliestISO: string;
  latestISO: string;
  /** local (UTC) hour a block may start at the earliest, 0–23 */
  dayStartHour: number;
  /** local (UTC) hour a block must end by at the latest, 1–24 */
  dayEndHour: number;
  /** minutes kept clear between two newly-placed blocks (a new block may still
   *  butt right up against an existing calendar event — that is normal) */
  bufferMin: number;
  /** Most blocks to put on any single day. Undefined = no limit, which packs
   *  the earliest day to capacity before moving on. The route passes 1 for a
   *  multi-block request so "three review slots this week" spreads Mon/Tue/Wed
   *  instead of stacking all three on Monday morning. */
  maxPerDay?: number;
  /** Skip Saturday and Sunday (UTC weekday, matching the wall-clock convention). */
  skipWeekends?: boolean;
  /** Work category, used by the scorer to pick the right learned preferences.
   *  Ignored by the first-fit `findFreeSlots`. */
  category?: string;
};

const MIN = 60_000;
const DAY = 86_400_000;
const STEP_MIN = 15;

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

/** Start of the UTC day containing `ms`. */
function dayStart(ms: number): number {
  return Math.floor(ms / DAY) * DAY;
}

export function findFreeSlots(busy: Busy[], spec: FindSpec): Slot[] {
  const durMs = Math.max(1, Math.round(spec.durationMin)) * MIN;
  const bufMs = Math.max(0, Math.round(spec.bufferMin)) * MIN;
  const stepMs = STEP_MIN * MIN;
  const count = Math.max(1, Math.round(spec.count));

  const earliest = Date.parse(spec.earliestISO);
  const latest = Date.parse(spec.latestISO);
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest <= earliest) return [];

  // Existing events block their exact span (no buffer — abutting a meeting is fine).
  const blocked = busy
    .map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > earliest && b.s < latest)
    .sort((a, b) => a.s - b.s);

  const placed: Slot[] = [];
  const placedIntervals: { s: number; e: number }[] = [];

  const hitsBlocked = (s: number, e: number) =>
    blocked.some((b) => s < b.e && e > b.s) ||
    placedIntervals.some((b) => s < b.e && e > b.s);

  const perDay = spec.maxPerDay && spec.maxPerDay > 0 ? spec.maxPerDay : Infinity;

  for (let day = dayStart(earliest); day <= latest && placed.length < count; day += DAY) {
    if (spec.skipWeekends) {
      const dow = new Date(day).getUTCDay();
      if (dow === 0 || dow === 6) continue;
    }
    const windowStart = Math.max(earliest, day + spec.dayStartHour * 60 * MIN);
    const windowEnd = Math.min(latest, day + spec.dayEndHour * 60 * MIN);
    // Align the first candidate to the 15-minute grid.
    let c = Math.ceil(windowStart / stepMs) * stepMs;
    let placedToday = 0;

    while (c + durMs <= windowEnd && placed.length < count && placedToday < perDay) {
      if (hitsBlocked(c, c + durMs)) {
        c += stepMs;
        continue;
      }
      placed.push({ startISO: iso(c), endISO: iso(c + durMs) });
      placedIntervals.push({ s: c, e: c + durMs + bufMs });
      placedToday++;
      c += durMs + bufMs;
    }
  }

  return placed;
}

// ── score-and-rank placement ────────────────────────────────────────────────

/** A candidate slot with the evidence for why it scored what it did. */
export type RankedSlot = {
  startISO: string;
  endISO: string;
  score: number;
  features: SlotFeatures;
  /** short phrase naming the dominant reason — shown to the user */
  reason: string;
};

/**
 * Every legal candidate on the 15-minute grid, scored and sorted best-first.
 *
 * "Legal" means: inside the day window, free, and not forbidden by a hard rule
 * the user stated. Hard rules filter; the profile's weights only reorder what
 * survives. Nothing here mutates the profile — learning happens later, on
 * feedback, in learn.ts.
 */
/**
 * The scoring context for a search: busy intervals clipped to the window, plus
 * the bounds the features are measured against.
 *
 * Exported because the capture layer needs the *same* context the ranking used
 * in order to describe why a slot scored what it did (`slotNotes`). Rebuilding
 * it from the spec independently would be two implementations of one thing,
 * free to drift apart, and the drift would show up as notes that quietly stop
 * matching the numbers beside them.
 */
export function buildScoreContext(busy: Busy[], spec: FindSpec): ScoreContext {
  const earliest = Date.parse(spec.earliestISO);
  const latest = Date.parse(spec.latestISO);
  const blocked: Interval[] = busy
    .map((b) => ({ s: Date.parse(b.start), e: Date.parse(b.end) }))
    .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e) && b.e > earliest && b.s < latest)
    .sort((a, b) => a.s - b.s);

  return {
    busy: blocked,
    earliest,
    latest,
    category: spec.category ?? 'deep-work',
    dayStartHour: spec.dayStartHour,
    dayEndHour: spec.dayEndHour,
  };
}

export function rankFreeSlots(busy: Busy[], spec: FindSpec, profile: AgentProfile): RankedSlot[] {
  const durMs = Math.max(1, Math.round(spec.durationMin)) * MIN;
  const stepMs = STEP_MIN * MIN;

  const earliest = Date.parse(spec.earliestISO);
  const latest = Date.parse(spec.latestISO);
  if (!Number.isFinite(earliest) || !Number.isFinite(latest) || latest <= earliest) return [];

  const ctx = buildScoreContext(busy, spec);
  const blocked = ctx.busy;

  const hardRules = profile.rules.filter((r) => r.hard);
  const out: RankedSlot[] = [];

  for (let day = dayStart(earliest); day <= latest; day += DAY) {
    if (spec.skipWeekends) {
      const dow = new Date(day).getUTCDay();
      if (dow === 0 || dow === 6) continue;
    }
    const windowStart = Math.max(earliest, day + spec.dayStartHour * 60 * MIN);
    const windowEnd = Math.min(latest, day + spec.dayEndHour * 60 * MIN);
    let c = Math.ceil(windowStart / stepMs) * stepMs;

    for (; c + durMs <= windowEnd; c += stepMs) {
      const e = c + durMs;
      if (blocked.some((b) => c < b.e && e > b.s)) continue;
      if (anyRuleBlocks(hardRules, c, e, ctx.category)) continue;

      const features = slotFeatures(profile, ctx, c, e);
      out.push({
        startISO: iso(c),
        endISO: iso(e),
        score: scoreFeatures(features, profile),
        features,
        reason: topReason(features, profile),
      });
    }
  }

  // Best first; ties broken by "sooner", which is the intuition a user brings
  // when two slots genuinely look equivalent.
  out.sort((a, b) => b.score - a.score || Date.parse(a.startISO) - Date.parse(b.startISO));
  return out;
}

export type Selection = {
  chosen: RankedSlot[];
  /** runners-up worth offering, one tier down and not overlapping the picks */
  alternatives: RankedSlot[];
};

/**
 * Greedily take the best non-overlapping candidates, honouring the per-day cap
 * and keeping `bufferMin` between two blocks we are placing ourselves.
 *
 * `alternatives` exists for a specific reason: if the agent only ever shows its
 * single top pick, and the user only ever accepts or rejects that one slot, it
 * never observes that 4pm would have been fine — it just keeps proposing
 * mornings and learning from a self-selected sample. Offering a couple of
 * ranked runners-up makes the user's *choice among them* the training signal,
 * which gets exploration without ever showing a deliberately worse slot.
 */
export function selectSlots(
  ranked: RankedSlot[],
  opts: {
    count: number;
    maxPerDay?: number;
    bufferMin: number;
    alternatives?: number;
    /**
     * How the runners-up are drawn. 'top' takes the best remaining, which is
     * what a user wants day to day. 'spread' takes them across the whole
     * ranked range instead — same legality, wider band.
     *
     * 'spread' exists to break a confound, not to be nice to the user: if the
     * scorer only ever offers its own top tier, every observed choice is a
     * choice among slots it already approved of, and "afternoons don't work"
     * becomes indistinguishable from "we never offered an afternoon". Rows
     * collected under 'spread' are the only ones where the choice is
     * interpretable as being about the slot rather than about the ranking.
     * Nothing illegal is ever shown — hard rules have already filtered
     * `ranked` before this runs.
     */
    strategy?: 'top' | 'spread';
  },
): Selection {
  const count = Math.max(1, Math.round(opts.count));
  const perDay = opts.maxPerDay && opts.maxPerDay > 0 ? opts.maxPerDay : Infinity;
  const bufMs = Math.max(0, Math.round(opts.bufferMin)) * MIN;

  const chosen: RankedSlot[] = [];
  const taken: Interval[] = [];
  const byDay = new Map<number, number>();

  const fits = (r: RankedSlot) => {
    const s = Date.parse(r.startISO);
    const e = Date.parse(r.endISO);
    if (taken.some((t) => s < t.e && e > t.s)) return false;
    const d = dayStart(s);
    return (byDay.get(d) ?? 0) < perDay;
  };

  for (const r of ranked) {
    if (chosen.length >= count) break;
    if (!fits(r)) continue;
    const s = Date.parse(r.startISO);
    const e = Date.parse(r.endISO);
    chosen.push(r);
    taken.push({ s: s - bufMs, e: e + bufMs });
    const d = dayStart(s);
    byDay.set(d, (byDay.get(d) ?? 0) + 1);
  }

  // Runners-up: best remaining slots that clash with nothing we picked. Capped
  // to one per day so the list reads as real options, not a dump of the grid.
  const wanted = opts.alternatives ?? 2;

  // Everything that could legitimately be offered: doesn't clash with a pick,
  // and no more than one per day so the list reads as real options rather than
  // a dump of the grid. Collected in full first, because 'spread' needs to
  // know the shape of the whole field before choosing from it.
  const eligible: RankedSlot[] = [];
  const altDays = new Set<number>();
  for (const r of ranked) {
    if (chosen.includes(r)) continue;
    const s = Date.parse(r.startISO);
    const e = Date.parse(r.endISO);
    if (taken.some((t) => s < t.e && e > t.s)) continue;
    const d = dayStart(s);
    if (altDays.has(d)) continue;
    altDays.add(d);
    eligible.push(r);
  }

  const alternatives: RankedSlot[] =
    opts.strategy === 'spread' ? spreadPick(eligible, wanted) : eligible.slice(0, wanted);

  return { chosen, alternatives };
}

/**
 * `n` items drawn evenly across `list` rather than off the front, so the set
 * spans the score range instead of clustering at the top.
 *
 * Deterministic on purpose. The *decision to explore* is a coin flip and
 * belongs at the call site, where it can be recorded on the occasion; once
 * that flip has come up heads, which slots get offered should be reproducible
 * from the ranking alone — otherwise a logged occasion cannot be replayed.
 */
export function spreadPick<T>(list: T[], n: number): T[] {
  const want = Math.max(0, Math.round(n));
  if (want === 0 || list.length === 0) return [];
  if (list.length <= want) return list.slice();

  const out: T[] = [];
  const seen = new Set<number>();
  // The first item is always the best remaining — an exploration set with no
  // strong option in it reads as the agent having got worse.
  for (let i = 0; i < want; i++) {
    const idx = Math.min(list.length - 1, Math.round((i * (list.length - 1)) / (want - 1 || 1)));
    if (seen.has(idx)) continue;
    seen.add(idx);
    out.push(list[idx]);
  }
  return out;
}
