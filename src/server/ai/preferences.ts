/**
 * The agent's model of the user: hard rules it must obey, soft preferences it
 * has inferred, and the weight vector the slot scorer uses.
 *
 * Pure and dependency-free — no DB, no clock, no I/O — so `preferences.check.mjs`
 * can import it directly and so the scorer stays deterministic. The repository
 * layer (src/server/ai/repo.ts) loads rows and hands them here.
 *
 * Times follow the app-wide convention: ISO strings are UTC wall-clock
 * (src/server/ai/find-time.ts), so "hour of day" means the UTC hour.
 */

export const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const CATEGORIES = ['deep-work', 'design', 'research', 'meeting', 'admin'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Scorer weights. Every feature is normalised to [0, 1] and every weight is
 * non-negative, so `score` is a plain weighted sum and a bigger weight always
 * means "this matters more" — which is what makes the learned vector legible on
 * the "what I've learned" screen. Penalty-shaped features (fragmentation,
 * dayLoad, backToBack) are inverted by the scorer before weighting, so 1.0
 * always means "good".
 */
export type Weights = {
  /** slot sits inside the hours this user likes for this category */
  hourFit: number;
  /** slot lands where the user's energy curve is high */
  energy: number;
  /** slot doesn't strand an unusably small gap beside it */
  fragmentation: number;
  /** slot doesn't pile onto a day that is already full */
  dayLoad: number;
  /** slot has breathing room either side rather than abutting a meeting */
  backToBack: number;
  /** sooner is better — matters more as a deadline closes */
  earliness: number;
  /** slot lands on a weekday this user favours for this kind of work */
  weekdayFit: number;
};

export const WEIGHT_KEYS = [
  'hourFit',
  'energy',
  'fragmentation',
  'dayLoad',
  'backToBack',
  'earliness',
  'weekdayFit',
] as const satisfies readonly (keyof Weights)[];

/**
 * Cold-start weights. Deliberately opinionated rather than uniform: a new user
 * gets a scheduler that already behaves sensibly (protect energy, avoid
 * back-to-back, don't shred the day) and the learner nudges from there. Uniform
 * weights would make early proposals feel random, and early randomness is what
 * makes people stop trusting an adaptive scheduler before it has any data.
 */
export const DEFAULT_WEIGHTS: Weights = {
  hourFit: 1.0,
  energy: 0.8,
  fragmentation: 0.6,
  dayLoad: 0.5,
  backToBack: 0.4,
  earliness: 0.7,
  weekdayFit: 0.3,
};

/** No weight may learn its way outside this band — see learn.ts. */
export const WEIGHT_MIN = 0.05;
export const WEIGHT_MAX = 2.5;

/** A hard rule the user stated. The placer treats these as filters, not scores. */
export type HardRule = {
  id: string;
  kind: 'work-hours' | 'protected' | 'no-meetings' | 'leave-by' | 'buffer' | 'hard-bound';
  /** shape varies by kind; see `ruleBlocks` in scoring.ts for the ones enforced */
  rule: Record<string, unknown>;
  hard: boolean;
  label: string;
  source: 'onboarding' | 'settings' | 'nl' | 'chat' | 'learned';
};

export type LearnedKind =
  | 'preferred-hours'
  | 'avoid-hours'
  | 'preferred-weekday'
  | 'avoid-weekday'
  | 'buffer'
  | 'duration-bias'
  | 'block-length';

/** An inferred, always-soft preference. Mirrors db/015 `learned_preferences`. */
export type LearnedPref = {
  id: string;
  kind: LearnedKind;
  /** a Category, a Weekday, or '*' */
  scope: string;
  value: Record<string, number>;
  /** signed EMA in [-1, 1]; sign says toward/away */
  strength: number;
  evidenceCount: number;
  userVerdict: 'confirmed' | 'rejected' | null;
};

/**
 * How much evidence an inferred preference needs before the scorer is allowed
 * to act on it. Three data points is a coincidence, not a preference — acting
 * on it produces the "why is it suddenly doing that?" moment that kills trust.
 * A preference the user has explicitly confirmed bypasses the gate entirely.
 */
export const MIN_EVIDENCE = 5;

export type AgentProfile = {
  timezone: string;
  /** null = a non-working day */
  workHours: Partial<Record<Weekday, { start: number; end: number } | null>>;
  weights: Weights;
  /** hour -> 0..1; sparse, missing hours fall back to a default curve */
  energyCurve: Partial<Record<number, number>>;
  /** category -> multiplier on estimated duration (>1 = user runs long) */
  durationBias: Partial<Record<string, number>>;
  defaultBufferMin: number;
  minFocusBlockMin: number;
  maxDailyFocusMin: number;
  rules: HardRule[];
  learned: LearnedPref[];
};

export const DEFAULT_WORK_HOURS: AgentProfile['workHours'] = {
  sun: null,
  mon: { start: 9, end: 18 },
  tue: { start: 9, end: 18 },
  wed: { start: 9, end: 18 },
  thu: { start: 9, end: 18 },
  fri: { start: 9, end: 18 },
  sat: null,
};

/**
 * A mild circadian default: a morning peak, a post-lunch dip, a smaller
 * afternoon recovery. Replaced hour-by-hour as real evidence arrives.
 */
export const DEFAULT_ENERGY: Record<number, number> = {
  6: 0.3, 7: 0.5, 8: 0.7, 9: 0.9, 10: 1.0, 11: 0.95,
  12: 0.6, 13: 0.45, 14: 0.6, 15: 0.75, 16: 0.7, 17: 0.55,
  18: 0.4, 19: 0.3, 20: 0.2,
};

export function defaultProfile(): AgentProfile {
  return {
    timezone: 'Europe/Berlin',
    workHours: { ...DEFAULT_WORK_HOURS },
    weights: { ...DEFAULT_WEIGHTS },
    energyCurve: { ...DEFAULT_ENERGY },
    durationBias: {},
    defaultBufferMin: 10,
    minFocusBlockMin: 45,
    maxDailyFocusMin: 240,
    rules: [],
    learned: [],
  };
}

/** Clamp + fill an untrusted weights blob (jsonb from the DB) into a full vector. */
export function normaliseWeights(raw: unknown): Weights {
  const src = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Weights;
  for (const k of WEIGHT_KEYS) {
    const v = src[k];
    out[k] =
      typeof v === 'number' && Number.isFinite(v)
        ? Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, v))
        : DEFAULT_WEIGHTS[k];
  }
  return out;
}

/** Energy at an hour, falling back to the default curve then to a flat 0.5. */
export function energyAt(profile: AgentProfile, hour: number): number {
  const v = profile.energyCurve[hour];
  if (typeof v === 'number' && Number.isFinite(v)) return Math.min(1, Math.max(0, v));
  return DEFAULT_ENERGY[hour] ?? 0.5;
}

/**
 * The inferred preferences the scorer is currently allowed to use: confirmed
 * ones always, unconfirmed ones only once they clear MIN_EVIDENCE, and rejected
 * ones never.
 */
export function activeLearned(profile: AgentProfile): LearnedPref[] {
  return profile.learned.filter((p) => {
    if (p.userVerdict === 'rejected') return false;
    if (p.userVerdict === 'confirmed') return true;
    return p.evidenceCount >= MIN_EVIDENCE && Math.abs(p.strength) > 0.15;
  });
}

/** The preferred [startHour, endHour) for a category, if one has been learned. */
export function preferredHours(
  profile: AgentProfile,
  category: string,
): { start: number; end: number } | null {
  const hit = activeLearned(profile).find(
    (p) => p.kind === 'preferred-hours' && (p.scope === category || p.scope === '*') && p.strength > 0,
  );
  if (!hit) return null;
  const start = hit.value.hourStart;
  const end = hit.value.hourEnd;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start, end };
}

/** Hour ranges the user drifts away from, as [start, end) pairs. */
export function avoidedHours(profile: AgentProfile, category: string): { start: number; end: number }[] {
  return activeLearned(profile)
    .filter(
      (p) =>
        p.kind === 'avoid-hours' && (p.scope === category || p.scope === '*') && p.strength > 0,
    )
    .map((p) => ({ start: p.value.hourStart, end: p.value.hourEnd }))
    .filter((r) => Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start);
}

/** +1 / -1 / 0 weekday leaning, from learned preferred/avoid-weekday claims. */
export function weekdayLean(profile: AgentProfile, day: Weekday): number {
  let lean = 0;
  for (const p of activeLearned(profile)) {
    if (p.scope !== day) continue;
    if (p.kind === 'preferred-weekday') lean += p.strength;
    if (p.kind === 'avoid-weekday') lean -= p.strength;
  }
  return Math.min(1, Math.max(-1, lean));
}

/** The buffer to use, widened if the user keeps asking for more air. */
export function effectiveBuffer(profile: AgentProfile): number {
  const hit = activeLearned(profile).find((p) => p.kind === 'buffer');
  if (hit && Number.isFinite(hit.value.minutes)) {
    return Math.min(60, Math.max(0, Math.round(hit.value.minutes)));
  }
  return profile.defaultBufferMin;
}

/**
 * Apply the learned actual-vs-estimated multiplier for a category. The user
 * asks for 60 minutes of "design"; if design reliably runs 1.3x long, book 78.
 * Clamped so a noisy multiplier can't book a whole afternoon.
 */
export function adjustDuration(profile: AgentProfile, category: string, minutes: number): number {
  const raw = profile.durationBias[category];
  const bias = typeof raw === 'number' && Number.isFinite(raw) ? raw : 1;
  const clamped = Math.min(1.5, Math.max(0.7, bias));
  return Math.max(15, Math.round((minutes * clamped) / 5) * 5);
}
