/**
 * The clarification policy — whether a placement request has enough in it to
 * place, and if not, what to ask.
 *
 * The model reports where the day and the length came from (`whenFrom`,
 * `durationFrom` on propose_blocks). This module, not the model, decides what
 * that means: a guessed day or a guessed length never reaches the placer, it
 * becomes a question. Leaving the decision to the prompt is what produced
 * "gym, tomorrow 10:00" from "when can I do it?" — the model was told to prefer
 * defaults, and did.
 *
 * The day options are solver-backed: a bucket is only offered if the placer
 * finds at least one free slot of the requested length in it, so tapping an
 * option can never lead straight to "no free time".
 *
 * Pure — no DB, no clock (callers pass `nowMs`), so clarify.check.mjs can run
 * it directly.
 */

import { type Busy, rankFreeSlots } from './find-time.ts';
import { type AgentProfile, PERSONAL_DAY_WINDOW } from './preferences.ts';

const DAY = 86_400_000;

export type Source = 'user' | 'conversation' | 'guessed';

export type Missing = 'when' | 'duration' | null;

/** What to ask about first. The day matters more than the length, so it goes first. */
export function missingInfo(args: { whenFrom?: unknown; durationFrom?: unknown }): Missing {
  // An absent field counts as guessed: a model that skips the question it was
  // required to answer has not shown it knows.
  const known = (v: unknown) => v === 'user' || v === 'conversation';
  if (!known(args.whenFrom)) return 'when';
  if (!known(args.durationFrom)) return 'duration';
  return null;
}

/** The day window to search: the user's working hours for work, the waking day for personal time. */
export function dayWindowFor(profile: AgentProfile, category: string): { start: number; end: number } {
  if (category === 'personal') return { ...PERSONAL_DAY_WINDOW };
  const days = Object.values(profile.workHours).filter(
    (d): d is { start: number; end: number } => Boolean(d),
  );
  if (!days.length) return { start: 9, end: 18 };
  return {
    start: Math.min(...days.map((d) => d.start)),
    end: Math.max(...days.map((d) => d.end)),
  };
}

const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');

/**
 * Up to four day buckets that actually have room, as tappable answers. Their
 * wording is what the model reads back on the next turn, so it has to be
 * something it resolves without help ("Tomorrow", not a slot id).
 */
export function whenOptions(opts: {
  busy: Busy[];
  profile: AgentProfile;
  category: string;
  durationMin: number;
  nowMs: number;
  horizonMs: number;
}): string[] {
  const { busy, profile, category, durationMin, nowMs, horizonMs } = opts;
  const win = dayWindowFor(profile, category);
  const personal = category === 'personal';

  const today = Math.floor(nowMs / DAY) * DAY;
  const dow = new Date(today).getUTCDay(); // 0 Sun … 6 Sat
  const nextMonday = today + (((8 - dow) % 7) || 7) * DAY;

  const buckets: { label: string; from: number; to: number }[] = [
    { label: 'Today', from: nowMs, to: today + DAY },
    { label: 'Tomorrow', from: today + DAY, to: today + 2 * DAY },
    { label: 'Later this week', from: today + 2 * DAY, to: nextMonday },
    { label: 'Next week', from: nextMonday, to: nextMonday + 7 * DAY },
  ];

  const out: string[] = [];
  for (const b of buckets) {
    const to = Math.min(b.to, horizonMs);
    if (to <= b.from) continue;
    const ranked = rankFreeSlots(
      busy,
      {
        durationMin,
        count: 1,
        earliestISO: iso(b.from),
        latestISO: iso(to),
        dayStartHour: win.start,
        dayEndHour: win.end,
        bufferMin: 0,
        skipWeekends: !personal,
        category,
      },
      profile,
    );
    if (ranked.length) out.push(b.label);
  }
  return out;
}

/** Tappable lengths, shaped to what the thing usually takes. */
export function durationOptions(category: string): string[] {
  if (category === 'meeting') return ['15 min', '30 min', '45 min', '1 hour'];
  if (category === 'personal') return ['30 min', '1 hour', '90 min', '2 hours'];
  return ['30 min', '1 hour', '2 hours', '3 hours'];
}

/** The question itself, in the user's terms. */
export function questionFor(missing: Exclude<Missing, null>, title: string, hasOptions: boolean): string {
  const what = title.trim() || 'this';
  if (missing === 'duration') return `How long do you need for ${what}?`;
  return hasOptions
    ? `When would you like to fit in ${what}?`
    : `I can't see a free gap for ${what} in the next few weeks — when were you thinking?`;
}
