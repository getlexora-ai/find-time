/**
 * Training capture, pure half — shaping and classification with no I/O.
 *
 * Split from capture.ts for the same reason as rate-limit-core.ts: the check
 * harness imports .ts directly, so anything reachable from a test must not
 * pull in `@/server/db` (and through it, pg). The writers live next door.
 *
 * Why any of this exists: 015 gave the agent a way to learn from corrections;
 * this layer answers the prior question of *which factors are worth learning
 * about at all*. It records every placement as a discrete choice — every slot
 * that was on offer, one row each, with the one the user took flagged —
 * because the slots that were passed over are what carry the information. A
 * corrections table alone cannot say whether `fragmentation` predicts anything
 * once `hourFit` is controlled for; it never sees the options that lost.
 *
 * TWO TRACKS. Track A (numbers, enums, timestamps) is always written and
 * carries no personal content by construction. Track B (`*_note`) explains
 * where a number came from and is written only at capture_profile='full',
 * which is the state while there is a single consenting tester. The profile is
 * stamped on every occasion rather than assumed globally, so a corpus spanning
 * the switch stays honest about which rows have a Track B. See db/016.
 *
 * Event titles, attendees and descriptions are in neither track at any
 * profile — third-party content, no flag unlocks it (docs/ai-learning.md §8).
 */

import { createHash } from 'node:crypto';

import type { RankedSlot } from './find-time.ts';
import type { SlotFeatures, SlotNotes } from './scoring.ts';

const MIN = 60_000;

export type CaptureProfile = 'full' | 'anon';

/**
 * 'full' while there is one consenting tester; 'anon' from beta onwards.
 *
 * Read per call rather than cached at import so flipping the env var takes
 * effect on the next request instead of the next deploy.
 */
export function captureProfile(): CaptureProfile {
  return process.env.FT_CAPTURE_PROFILE === 'anon' ? 'anon' : 'full';
}

/** Track B is written only at 'full'. */
export function keepNotes(): boolean {
  return captureProfile() === 'full';
}

/**
 * Share of occasions that widen the candidate set.
 *
 * Deliberately a constant rather than a tunable: the value only means anything
 * if it is stable across the corpus, and an exploration rate that drifts with
 * configuration cannot be corrected for at analysis time.
 */
export const EXPLORE_RATE = 0.15;

/** Whether this occasion explores. The one genuinely random decision here. */
export function shouldExplore(rate = EXPLORE_RATE): boolean {
  return Math.random() < rate;
}

/** Stable digest of the model input, for grouping replays of one question. */
export function hashInput(input: unknown): string {
  return createHash('sha256').update(canonical(input)).digest('hex').slice(0, 32);
}

/** JSON with object keys sorted, so equal inputs hash equal. */
function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
}

/** varchar(n) in the schema; trim rather than let an insert fail on length. */
export function cap(s: string | null | undefined, n: number): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  if (!t) return null;
  return t.length <= n ? t : t.slice(0, n);
}

// ── helpers for the routes ──────────────────────────────────────────────────

/**
 * Classify a block edit by what actually changed.
 *
 * Duration and time are separated because they are different complaints: "an
 * hour was not enough" says nothing about when the block should sit, and
 * collapsing both into `edited` is how a duration signal ends up training the
 * hour-of-day weight.
 */
export function editKind(
  proposed: { startISO: string; endISO: string },
  final: { startISO: string; endISO: string },
): string {
  const ps = Date.parse(proposed.startISO);
  const pe = Date.parse(proposed.endISO);
  const fs = Date.parse(final.startISO);
  const fe = Date.parse(final.endISO);
  if (![ps, pe, fs, fe].every(Number.isFinite)) return 'moved_time';

  const durChanged = Math.abs((fe - fs) - (pe - ps)) >= 5 * MIN;
  const movedDay = Math.floor(fs / 86_400_000) !== Math.floor(ps / 86_400_000);
  const movedTime = Math.abs(fs - ps) >= 5 * MIN;

  if (durChanged && !movedTime) return 'changed_duration';
  if (durChanged && movedDay) return 'changed_day_and_duration';
  if (durChanged) return 'changed_time_and_duration';
  if (movedDay) return 'changed_day';
  return 'moved_time';
}

export type TurnInput = {
  userId: string;
  sessionId: string | null;
  action: 'propose' | 'ask' | 'record_rule' | 'answer' | 'error';
  modelId: string;
  promptVersion: string;
  scorerVersion: string;
  temperature?: number;
  /** structured only — categories, hours, busy bounds; never event text */
  input: Record<string, unknown>;
  toolArgs?: Record<string, unknown>;
  latencyMs?: number;
  promptTokens?: number;
  outputTokens?: number;
  error?: string | null;
};

/** A candidate as stored: the ranking, the seven factors, and their traces. */
export type CandidateInput = {
  startISO: string;
  endISO: string;
  rank: number;
  score: number;
  features: SlotFeatures;
  notes?: SlotNotes;
  /** shown to the user, as opposed to merely ranked */
  offered: boolean;
};

export type OccasionInput = {
  userId: string;
  turnId: string | null;
  suggestionId: string | null;
  category: string;
  requestedMinutes: number;
  randomised: boolean;
  strategy: 'top' | 'spread';
  modelId: string;
  promptVersion: string;
  scorerVersion: string;
  weekBusyMinutes?: number | null;
  dayBusyMinutes?: number | null;
  contextNote?: string | null;
  candidates: CandidateInput[];
};

/**
 * How many candidates one occasion may store.
 *
 * A fortnight of 15-minute steps is thousands of legal slots, and storing all
 * of them would swamp the table with rows nobody will look at while adding
 * nothing: the tail is slots the user never saw and would never have picked.
 * The cap keeps the head — where the decision was actually made — plus
 * whatever was offered.
 */
export const MAX_CANDIDATES = 40;

export type CorrectionSource = 'block' | 'chat' | 'rule' | 'preference';

export type CorrectionInput = {
  userId: string;
  occasionId?: string | null;
  turnId?: string | null;
  suggestionId?: string | null;
  source: CorrectionSource;
  kind: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  reasonCode?: string | null;
  /** Track B — the user's own words. Dropped entirely at capture_profile='anon'. */
  reasonNote?: string | null;
};

/** Ranked slots as candidate rows, flagging the ones the user was shown. */
export function candidatesFrom(
  ranked: RankedSlot[],
  offered: RankedSlot[],
  notesFor?: (r: RankedSlot) => SlotNotes,
): CandidateInput[] {
  const offeredKeys = new Set(offered.map((o) => o.startISO));
  return ranked.map((r, i) => ({
    startISO: r.startISO,
    endISO: r.endISO,
    rank: i,
    score: r.score,
    features: r.features,
    notes: notesFor ? notesFor(r) : undefined,
    offered: offeredKeys.has(r.startISO),
  }));
}
