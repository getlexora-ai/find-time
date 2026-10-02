/**
 * The hero's "type your week" demo — the product's own code, run in the browser
 * against the example week.
 *
 * - Reading the sentence: `understand()` (src/server/ai/understand.ts), the
 *   rule parser Plan with AI runs on. Same words, same reading.
 * - Choosing times: `rankFreeSlots` + `selectSlots` (src/server/ai/find-time.ts)
 *   with a new user's `defaultProfile()` — the same ranking a real account
 *   starts with.
 * - A missing length becomes the question the app would ask, with its options.
 *
 * All of it is pure (no DB, no network), so nothing typed here leaves the page.
 */
import { durationOptions, questionFor } from '@/server/ai/clarify';
import { type Busy, rankFreeSlots, selectSlots } from '@/server/ai/find-time';
import { defaultProfile } from '@/server/ai/preferences';
import { understand } from '@/server/ai/understand';

import { DAYS, TILES } from './week-data';

/** Monday of the example week, 06:00 — "now" for the parser. */
const WEEK0 = Date.UTC(2026, 8, 14);
const NOW_ISO = new Date(WEEK0 + 6 * 3600_000).toISOString();
const WEEK_END = WEEK0 + DAYS.length * 86_400_000;
const DAY = 86_400_000;
/** sessions of a long piece of work, like the planner's task splitting */
const MAX_SESSION = 150;

export type DemoBlock = { id: string; day: number; s: number; e: number; title: string; reason: string };

export type DemoResult =
  | { type: 'plan'; title: string; blocks: DemoBlock[]; asked: number; reason: string }
  | { type: 'ask'; question: string; options: string[] }
  | { type: 'other' };

const iso = (ms: number) => new Date(ms).toISOString();

/** The example week's busy time (meetings and the trip), plus blocks already accepted. */
function busyOf(accepted: DemoBlock[]): Busy[] {
  const at = (day: number, min: number) => iso(WEEK0 + day * DAY + min * 60_000);
  return [
    ...TILES.filter((t) => (t.kind === 'meet' || t.kind === 'away') && (t.from ?? 0) <= 1).map((t) => ({
      start: at(t.day, t.s),
      end: at(t.day, t.e),
    })),
    ...accepted.map((b) => ({ start: at(b.day, b.s), end: at(b.day, b.e) })),
  ];
}

type Ask = {
  title: string;
  category: string;
  count: number;
  durationMin?: number;
  earliestISO?: string;
  latestISO?: string;
  dayStartHour?: number;
  dayEndHour?: number;
  oneBlockPerDay?: boolean;
};

const WINDOWS = { morning: [7, 12], afternoon: [12, 17], evening: [17, 20] } as const;

/** What the sentence asks for, in one shape — or null when it isn't a planning request. */
function read(text: string): Ask | { ask: string; options: string[] } | null {
  const r = understand(text, { nowISO: NOW_ISO, previous: null, lastProposals: [] });
  const a = r.args as Record<string, unknown>;
  if (r.name === 'ask_clarification') {
    return { ask: String(a.question ?? ''), options: (a.options as string[]) ?? [] };
  }
  if (r.name === 'propose_blocks') {
    return {
      title: String(a.title),
      category: String(a.category ?? 'deep-work'),
      count: Number(a.count ?? 1),
      durationMin: a.durationFrom === 'guessed' ? undefined : (a.durationMin as number | undefined),
      earliestISO: a.earliestISO as string | undefined,
      latestISO: a.latestISO as string | undefined,
      dayStartHour: a.dayStartHour as number | undefined,
      dayEndHour: a.dayEndHour as number | undefined,
      oneBlockPerDay: a.oneBlockPerDay !== false,
    };
  }
  if (r.name === 'add_habit') {
    const w = WINDOWS[(a.preferredWindow as keyof typeof WINDOWS) ?? 'morning'];
    return {
      title: String(a.title),
      category: String(a.category ?? 'personal'),
      count: Number(a.perWeek ?? 1),
      durationMin: a.durationMin as number | undefined,
      dayStartHour: a.preferredWindow ? w[0] : undefined,
      dayEndHour: a.preferredWindow ? w[1] : undefined,
      oneBlockPerDay: true,
    };
  }
  if (r.name === 'add_task') {
    return {
      title: String(a.title),
      category: String(a.category ?? 'deep-work'),
      count: 1,
      durationMin: a.durationMin as number | undefined,
      latestISO: a.dueByISO as string | undefined,
      oneBlockPerDay: true,
    };
  }
  return null;
}

export function planSentence(text: string, accepted: DemoBlock[]): DemoResult {
  const got = read(text);
  if (!got) return { type: 'other' };
  if ('ask' in got) return { type: 'ask', question: got.ask, options: got.options };
  if (!got.durationMin) {
    return {
      type: 'ask',
      question: questionFor('duration', got.title, true),
      options: durationOptions(got.category),
    };
  }

  // long work is split into sessions, as the planner does with a task
  let count = Math.min(DAYS.length, Math.max(1, got.count));
  let dur = got.durationMin;
  if (count === 1 && dur > MAX_SESSION) {
    count = Math.min(DAYS.length, Math.ceil(dur / MAX_SESSION));
    dur = Math.round(dur / count / 15) * 15;
  }

  const earliest = Math.max(WEEK0, got.earliestISO ? Date.parse(got.earliestISO) : WEEK0);
  const latest = Math.min(WEEK_END, got.latestISO ? Date.parse(got.latestISO) : WEEK_END);
  const personal = got.category === 'personal';
  const spec = {
    durationMin: dur,
    count,
    earliestISO: iso(earliest),
    latestISO: iso(latest),
    dayStartHour: got.dayStartHour ?? (personal ? 7 : 8),
    dayEndHour: Math.min(20, got.dayEndHour ?? (personal ? 20 : 18)),
    bufferMin: 10,
    maxPerDay: got.oneBlockPerDay ? 1 : undefined,
    skipWeekends: true,
    category: got.category,
  };
  const ranked = rankFreeSlots(busyOf(accepted), spec, defaultProfile());
  const { chosen } = selectSlots(ranked, { count, maxPerDay: spec.maxPerDay, bufferMin: 10 });

  const blocks = chosen
    .map((c, i) => {
      const s = Date.parse(c.startISO);
      const day = Math.floor((s - WEEK0) / DAY);
      const sMin = Math.round((s - WEEK0 - day * DAY) / 60_000);
      return {
        id: `u-${Date.now().toString(36)}-${i}`,
        day,
        s: sMin,
        e: sMin + dur,
        title: got.title,
        reason: c.reason,
      };
    })
    .sort((a, b) => a.day - b.day || a.s - b.s);

  return { type: 'plan', title: got.title, blocks, asked: count, reason: chosen[0]?.reason ?? '' };
}
