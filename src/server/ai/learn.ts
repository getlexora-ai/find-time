/**
 * The update rule — how a user's correction becomes a change in behaviour.
 *
 * Nothing here is machine learning infrastructure. Placement is a weighted sum
 * (scoring.ts), so an edit is just a labelled pair: "you ranked slot A top, I
 * picked slot B instead". That is a one-line gradient step on the weight
 * vector, and the whole learned state stays a handful of readable numbers the
 * user can be shown and can delete. Fine-tuning a model would be the wrong
 * tool at every level — no data volume, the model isn't making the placement
 * decision, and it would put personal scheduling data in a training set.
 *
 * Two things are learned, separately, because they fail differently:
 *   - WEIGHTS: how much each factor matters. Slow, continuous, always soft.
 *   - CLAIMS: discrete statements ("prefers afternoons for design"). Fast,
 *     legible, individually deletable.
 *
 * Pure — no DB, no clock. Callers pass `now` explicitly so the behaviour is
 * reproducible and testable.
 */

import {
  type AgentProfile,
  type LearnedKind,
  type LearnedPref,
  type Weights,
  DEFAULT_WEIGHTS,
  WEIGHT_KEYS,
  WEIGHT_MAX,
  WEIGHT_MIN,
} from './preferences.ts';
import { type SlotFeatures, hourOf, weekdayOf } from './scoring.ts';

export type ReasonCode =
  | 'too-early'
  | 'too-late'
  | 'wrong-day'
  | 'back-to-back'
  | 'needs-prep'
  | 'too-long'
  | 'too-short'
  | 'not-needed'
  | 'other';

export type Outcome = 'accepted' | 'edited' | 'rejected';

/** One decided proposal, as recorded on `ai_suggestions` by db/015. */
export type Feedback = {
  outcome: Outcome;
  category: string;
  /** what the agent proposed */
  proposedStart: string;
  proposedEnd: string;
  proposedFeatures: SlotFeatures;
  /** where it actually ended up — only meaningful for 'edited' */
  finalStart?: string | null;
  finalEnd?: string | null;
  /** the feature vector of the slot the user chose, when we can reconstruct it */
  finalFeatures?: SlotFeatures | null;
  reasonCode?: ReasonCode | null;
};

/**
 * How much a signal is allowed to move the model.
 *
 * An explicit edit is the strongest evidence there is: the user looked at a
 * concrete alternative and moved the block to it. A bare acceptance is the
 * weakest — people accept to make the panel go away — so it barely moves
 * anything. Getting this asymmetry wrong is how these systems end up confidently
 * learning that whatever they already do is correct.
 */
export const SIGNAL_WEIGHT: Record<Outcome, number> = {
  edited: 1.0,
  rejected: 0.6,
  accepted: 0.15,
};

export const BASE_LEARNING_RATE = 0.08;
/** No single correction may move a weight further than this. One chaotic week
 *  should not be able to rewrite a profile built over months. */
export const MAX_STEP = 0.15;
/** Pull toward the cold-start defaults on every update. This is what handles
 *  drift: evidence that stops being reinforced quietly fades instead of
 *  persisting forever. */
export const DECAY = 0.02;
/** EMA rate for a claim's signed strength. */
export const CLAIM_ALPHA = 0.25;

function clampWeight(n: number): number {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, n));
}

/**
 * One gradient step toward ranking the user's choice above our proposal.
 *
 * score(slot) = Σ wₖ·fₖ, so ∂(score(chosen) − score(proposed))/∂wₖ is simply
 * (f_chosenₖ − f_proposedₖ). Ascend that, clamp the step, then decay toward the
 * defaults. Returns the new vector and the per-key delta so the change can be
 * shown to the user rather than applied invisibly.
 */
export function updateWeights(
  current: Weights,
  proposed: SlotFeatures,
  chosen: SlotFeatures,
  signal: number,
): { weights: Weights; delta: Partial<Weights> } {
  const lr = BASE_LEARNING_RATE * Math.max(0, Math.min(1, signal));
  const weights = {} as Weights;
  const delta: Partial<Weights> = {};

  for (const k of WEIGHT_KEYS) {
    const raw = lr * (chosen[k] - proposed[k]);
    const step = Math.max(-MAX_STEP, Math.min(MAX_STEP, raw));
    const decayed = current[k] + DECAY * (DEFAULT_WEIGHTS[k] - current[k]);
    const next = clampWeight(decayed + step);
    weights[k] = next;
    if (Math.abs(next - current[k]) > 1e-4) delta[k] = next - current[k];
  }
  return { weights, delta };
}

// ── claims ──────────────────────────────────────────────────────────────────

/** A statement the feedback supports, before it is merged into the profile. */
export type Claim = {
  kind: LearnedKind;
  scope: string;
  value: Record<string, number>;
  /** +1 = evidence for, -1 = evidence against */
  direction: 1 | -1;
};

const HOUR_BAND = 2;

/** The [start, end) band around an hour that a single observation speaks to. */
function bandAround(hour: number): { hourStart: number; hourEnd: number } {
  const h = Math.floor(hour);
  return { hourStart: Math.max(0, h - HOUR_BAND / 2), hourEnd: Math.min(24, h + HOUR_BAND / 2) };
}

/**
 * Turn one decided proposal into the claims it actually supports.
 *
 * The important case is the one that produces NOTHING: `not-needed` means the
 * task evaporated, which says nothing whatsoever about when the user likes to
 * work. Treating it as a vote against that hour is exactly the confounding that
 * makes naive versions of this feature learn noise — most rejections are not
 * about the time.
 */
export function claimsFrom(fb: Feedback): Claim[] {
  const claims: Claim[] = [];
  const pStart = Date.parse(fb.proposedStart);
  if (!Number.isFinite(pStart)) return claims;

  const proposedHour = hourOf(pStart);
  const proposedDay = weekdayOf(pStart);
  const durMin = (Date.parse(fb.proposedEnd) - pStart) / 60_000;

  if (fb.outcome === 'rejected') {
    switch (fb.reasonCode) {
      // Says nothing about time. Deliberately no claim.
      case 'not-needed':
      case 'other':
      case null:
      case undefined:
        return claims;

      case 'too-early':
      case 'too-late':
        claims.push({ kind: 'avoid-hours', scope: fb.category, value: bandAround(proposedHour), direction: 1 });
        break;

      case 'wrong-day':
        claims.push({ kind: 'avoid-weekday', scope: proposedDay, value: {}, direction: 1 });
        break;

      case 'back-to-back':
      case 'needs-prep':
        claims.push({ kind: 'buffer', scope: '*', value: { minutes: 20 }, direction: 1 });
        break;

      case 'too-long':
        claims.push({ kind: 'duration-bias', scope: fb.category, value: { multiplier: 0.85 }, direction: 1 });
        if (durMin > 0) {
          claims.push({ kind: 'block-length', scope: fb.category, value: { minutes: Math.round(durMin * 0.75) }, direction: 1 });
        }
        break;

      case 'too-short':
        claims.push({ kind: 'duration-bias', scope: fb.category, value: { multiplier: 1.2 }, direction: 1 });
        if (durMin > 0) {
          claims.push({ kind: 'block-length', scope: fb.category, value: { minutes: Math.round(durMin * 1.25) }, direction: 1 });
        }
        break;
    }
    return claims;
  }

  if (fb.outcome === 'edited' && fb.finalStart) {
    const fStart = Date.parse(fb.finalStart);
    if (!Number.isFinite(fStart)) return claims;
    const finalHour = hourOf(fStart);
    const finalDay = weekdayOf(fStart);

    // Moved to a materially different hour: the destination is evidence FOR,
    // the origin is evidence AGAINST. A drag of under an hour is treated as
    // tidying, not as a preference.
    if (Math.abs(finalHour - proposedHour) >= 1) {
      claims.push({ kind: 'preferred-hours', scope: fb.category, value: bandAround(finalHour), direction: 1 });
      claims.push({ kind: 'avoid-hours', scope: fb.category, value: bandAround(proposedHour), direction: 1 });
    }
    if (finalDay !== proposedDay) {
      claims.push({ kind: 'preferred-weekday', scope: finalDay, value: {}, direction: 1 });
      claims.push({ kind: 'avoid-weekday', scope: proposedDay, value: {}, direction: 1 });
    }

    // Resized: the user's own correction to our duration estimate.
    if (fb.finalEnd) {
      const finalMin = (Date.parse(fb.finalEnd) - fStart) / 60_000;
      if (durMin > 0 && Number.isFinite(finalMin) && Math.abs(finalMin - durMin) / durMin > 0.15) {
        claims.push({
          kind: 'duration-bias',
          scope: fb.category,
          value: { multiplier: finalMin / durMin },
          direction: 1,
        });
      }
    }
    return claims;
  }

  if (fb.outcome === 'accepted') {
    // Weak positive: the hour we chose was at least acceptable.
    claims.push({ kind: 'preferred-hours', scope: fb.category, value: bandAround(proposedHour), direction: 1 });
  }
  return claims;
}

/**
 * Merge a claim into the existing set: EMA the strength, bump the evidence
 * count, and blend the numeric payload toward the new observation.
 *
 * A claim the user has explicitly rejected is never re-learned — re-deriving a
 * preference someone just deleted is the fastest way to make an adaptive system
 * feel like it isn't listening.
 */
export function mergeClaim(
  existing: LearnedPref | undefined,
  claim: Claim,
  signal: number,
  idFactory: () => string,
): LearnedPref | null {
  if (existing?.userVerdict === 'rejected') return null;

  const alpha = CLAIM_ALPHA * Math.max(0, Math.min(1, signal));
  const target = claim.direction;

  if (!existing) {
    return {
      id: idFactory(),
      kind: claim.kind,
      scope: claim.scope,
      value: { ...claim.value },
      strength: alpha * target,
      evidenceCount: 1,
      userVerdict: null,
    };
  }

  const strength = Math.max(-1, Math.min(1, existing.strength * (1 - alpha) + alpha * target));
  const value: Record<string, number> = { ...existing.value };
  for (const [k, v] of Object.entries(claim.value)) {
    const prev = typeof value[k] === 'number' ? value[k] : v;
    value[k] = prev * (1 - alpha) + v * alpha;
  }
  return {
    ...existing,
    value,
    strength,
    evidenceCount: existing.evidenceCount + 1,
  };
}

export type LearnResult = {
  weights: Weights;
  weightDelta: Partial<Weights>;
  claims: LearnedPref[];
  /** one-line, user-facing summaries of what changed; empty when nothing did */
  notes: string[];
};

/**
 * The whole update for one decided proposal. Returns the new state rather than
 * mutating, so the caller decides whether to persist it.
 */
export function learnFrom(
  profile: AgentProfile,
  fb: Feedback,
  idFactory: () => string,
): LearnResult {
  const signal = SIGNAL_WEIGHT[fb.outcome] ?? 0;

  // Weights only move when we can compare two concrete slots. A rejection with
  // no alternative tells us this slot was wrong but not what "better" looks
  // like, so it updates claims only.
  let weights = profile.weights;
  let weightDelta: Partial<Weights> = {};
  if (fb.finalFeatures && fb.outcome === 'edited') {
    const upd = updateWeights(profile.weights, fb.proposedFeatures, fb.finalFeatures, signal);
    weights = upd.weights;
    weightDelta = upd.delta;
  }

  const byKey = new Map(profile.learned.map((p) => [`${p.kind}:${p.scope}`, p]));
  const touched: LearnedPref[] = [];
  for (const claim of claimsFrom(fb)) {
    const key = `${claim.kind}:${claim.scope}`;
    const merged = mergeClaim(byKey.get(key), claim, signal, idFactory);
    if (!merged) continue;
    byKey.set(key, merged);
    touched.push(merged);
  }

  const notes: string[] = [];
  for (const p of touched) {
    if (p.evidenceCount === 1) continue; // don't announce a single data point
    const line = describeClaim(p);
    if (line) notes.push(line);
  }

  return { weights, weightDelta, claims: touched, notes };
}

// ── explanation ─────────────────────────────────────────────────────────────

function hhmm(hour: number): string {
  const h = Math.floor(hour);
  const m = Math.round((hour - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

const DAY_NAME: Record<string, string> = {
  sun: 'Sundays', mon: 'Mondays', tue: 'Tuesdays', wed: 'Wednesdays',
  thu: 'Thursdays', fri: 'Fridays', sat: 'Saturdays',
};

function scopeLabel(scope: string): string {
  return scope === '*' ? 'work' : scope.replace('-', ' ');
}

/**
 * A learned preference in the user's own terms. Every inferred preference must
 * be sayable in one sentence — if it can't be explained it shouldn't be acting
 * on the calendar, and the user can't disagree with what they can't read.
 */
export function describeClaim(p: LearnedPref): string | null {
  const sure = p.strength > 0;
  switch (p.kind) {
    case 'preferred-hours':
      if (!sure) return null;
      return `You prefer ${scopeLabel(p.scope)} between ${hhmm(p.value.hourStart)} and ${hhmm(p.value.hourEnd)}.`;
    case 'avoid-hours':
      if (!sure) return null;
      return `You move ${scopeLabel(p.scope)} out of ${hhmm(p.value.hourStart)}–${hhmm(p.value.hourEnd)}.`;
    case 'preferred-weekday':
      return sure ? `${DAY_NAME[p.scope] ?? p.scope} work for you.` : null;
    case 'avoid-weekday':
      return sure ? `You keep ${DAY_NAME[p.scope] ?? p.scope} clear.` : null;
    case 'buffer':
      return `You want about ${Math.round(p.value.minutes)} minutes of space around a block.`;
    case 'duration-bias': {
      const m = p.value.multiplier;
      if (!Number.isFinite(m) || Math.abs(m - 1) < 0.08) return null;
      return m > 1
        ? `${scopeLabel(p.scope)} usually runs about ${Math.round((m - 1) * 100)}% longer than you estimate.`
        : `${scopeLabel(p.scope)} usually finishes about ${Math.round((1 - m) * 100)}% sooner than you estimate.`;
    }
    case 'block-length':
      return `You like ${scopeLabel(p.scope)} in chunks of about ${Math.round(p.value.minutes)} minutes.`;
    default:
      return null;
  }
}

/** Everything the agent believes about this user, ready for the settings screen. */
export function explainProfile(profile: AgentProfile): { text: string; evidence: number; id: string }[] {
  return profile.learned
    .filter((p) => p.userVerdict !== 'rejected')
    .map((p) => ({ id: p.id, text: describeClaim(p) ?? '', evidence: p.evidenceCount }))
    .filter((x) => x.text.length > 0)
    .sort((a, b) => b.evidence - a.evidence);
}
