/**
 * The example week the landing draws — once in the hero (as it arrives) and
 * again in the story, where it is planned one stage at a time.
 *
 * It is the worked example from docs/planning-agent-plan.md §0: a thesis draft
 * due Thursday (10 h), gym three times, Copenhagen from Thursday evening, and a
 * call that lands on Wednesday's writing after the week is accepted.
 *
 * Stages (story chapters):
 *   0  you say it        — the week as it is
 *   1  it reads          — free stretches found, the trip blocked
 *   2  it proposes       — dashed proposals
 *   3  you accept        — proposals become blocks
 *   4  it replans        — a new call, the lost hour moved to Thursday
 */

export const DAY_START = 7 * 60;
export const DAY_END = 20 * 60;
export const DAYS = [
  { short: 'Mon', num: 14 },
  { short: 'Tue', num: 15 },
  { short: 'Wed', num: 16 },
  { short: 'Thu', num: 17 },
  { short: 'Fri', num: 18 },
] as const;

export type TileKind = 'meet' | 'away' | 'thesis' | 'gym' | 'new';

export type Tile = {
  id: string;
  day: number;
  /** minutes from midnight */
  s: number;
  e: number;
  title: string;
  kind: TileKind;
  /** first stage it shows on (default 0) */
  from?: number;
  /** stage → a different end time from then on */
  endFrom?: { stage: number; e: number };
};

const h = (hh: number, mm = 0) => hh * 60 + mm;

export const TILES: Tile[] = [
  // Monday
  { id: 'm1', day: 0, s: h(10), e: h(10, 30), title: 'Standup', kind: 'meet' },
  { id: 'm2', day: 0, s: h(10, 45), e: h(11, 45), title: 'Hiring sync', kind: 'meet' },
  { id: 'm3', day: 0, s: h(13), e: h(14), title: 'Design review', kind: 'meet' },
  { id: 'm4', day: 0, s: h(15, 30), e: h(16), title: '1:1 with Ana', kind: 'meet' },
  { id: 'm5', day: 0, s: h(16, 20), e: h(17), title: 'Budget check-in', kind: 'meet' },
  // Tuesday — the packed day
  { id: 't1', day: 1, s: h(10), e: h(10, 30), title: 'Standup', kind: 'meet' },
  { id: 't2', day: 1, s: h(10, 50), e: h(12, 30), title: 'Client call', kind: 'meet' },
  { id: 't3', day: 1, s: h(13), e: h(14), title: 'Planning', kind: 'meet' },
  { id: 't4', day: 1, s: h(14), e: h(15, 30), title: 'Interviews', kind: 'meet' },
  { id: 't5', day: 1, s: h(15, 30), e: h(16, 30), title: 'Vendor call', kind: 'meet' },
  { id: 't6', day: 1, s: h(16, 30), e: h(19), title: 'Partner calls', kind: 'meet' },
  // Wednesday
  { id: 'w1', day: 2, s: h(10), e: h(10, 30), title: 'Standup', kind: 'meet' },
  { id: 'w2', day: 2, s: h(12, 30), e: h(13, 30), title: 'Lunch with Sam', kind: 'meet' },
  { id: 'w3', day: 2, s: h(15), e: h(16), title: 'Roadmap review', kind: 'meet' },
  // Thursday
  { id: 'h1', day: 3, s: h(10), e: h(10, 30), title: 'Standup', kind: 'meet' },
  { id: 'h2', day: 3, s: h(14), e: h(15), title: 'Retro', kind: 'meet' },

  // Stage 1 — the trip is blocked before anything is planned
  { id: 'a1', day: 3, s: h(18), e: DAY_END, title: 'Copenhagen', kind: 'away', from: 1 },
  { id: 'a2', day: 4, s: DAY_START, e: DAY_END, title: 'Copenhagen', kind: 'away', from: 1 },

  // Stage 2 — proposals: 4 × 2.5 h of writing, done before Thursday evening
  { id: 'p1', day: 0, s: h(7, 30), e: h(10), title: 'Thesis', kind: 'thesis', from: 2 },
  { id: 'p2', day: 1, s: h(7, 30), e: h(10), title: 'Thesis', kind: 'thesis', from: 2 },
  {
    id: 'p3', day: 2, s: h(7, 30), e: h(10), title: 'Thesis', kind: 'thesis', from: 2,
    endFrom: { stage: 4, e: h(9) },
  },
  { id: 'p4', day: 3, s: h(7, 30), e: h(10), title: 'Thesis', kind: 'thesis', from: 2 },
  { id: 'g1', day: 0, s: h(18), e: h(19), title: 'Gym', kind: 'gym', from: 2 },
  { id: 'g2', day: 2, s: h(18), e: h(19), title: 'Gym', kind: 'gym', from: 2 },

  // Stage 4 — a call lands on Wednesday's writing; the lost hour moves to Thursday
  { id: 'n1', day: 2, s: h(9), e: h(10), title: 'Call with Lena', kind: 'new', from: 4 },
  { id: 'p5', day: 3, s: h(11), e: h(12), title: 'Thesis', kind: 'thesis', from: 4 },
];

/** Tiles the planner placed (proposed until accepted). */
export const isPlanned = (t: Tile) => t.kind === 'thesis' || t.kind === 'gym';

/** How a tile draws at a stage: hidden, proposed (dashed) or solid. */
export function tileState(t: Tile, stage: number): 'hidden' | 'proposal' | 'solid' {
  const from = t.from ?? 0;
  if (stage < from) return 'hidden';
  if (!isPlanned(t)) return 'solid';
  // accepted at stage 3; the Thursday hour added at stage 4 is a fresh proposal
  return stage >= 3 && from < 4 ? 'solid' : 'proposal';
}

export const tileEnd = (t: Tile, stage: number) =>
  t.endFrom && stage >= t.endFrom.stage ? t.endFrom.e : t.e;

/** Free stretches ≥ 60 min between 07:00 and 19:30, on the week as it arrives. */
export const FREE = (() => {
  const out: { day: number; s: number; e: number }[] = [];
  const end = h(19, 30);
  DAYS.forEach((_, day) => {
    const busy = TILES.filter((t) => t.day === day && (t.kind === 'meet' || t.kind === 'away'))
      .map((t) => [t.s, t.e] as const)
      .sort((a, b) => a[0] - b[0]);
    let cur = DAY_START;
    for (const [s, e] of [...busy, [end, end] as const]) {
      if (s - cur >= 60) out.push({ day, s: cur, e: Math.min(s, end) });
      cur = Math.max(cur, e);
      if (cur >= end) break;
    }
  });
  return out;
})();

/** Gaps under 30 min between meetings — "too short to use" (insights.ts OPEN_MIN). */
export const CRUMBS = (() => {
  const out: { day: number; s: number; e: number }[] = [];
  DAYS.forEach((_, day) => {
    const ms = TILES.filter((t) => t.day === day && t.kind === 'meet').sort((a, b) => a.s - b.s);
    for (let i = 1; i < ms.length; i++) {
      const gap = ms[i].s - ms[i - 1].e;
      if (gap > 0 && gap < 30) out.push({ day, s: ms[i - 1].e, e: ms[i].s });
    }
  });
  return out;
})();

export const pct = (min: number) => ((min - DAY_START) / (DAY_END - DAY_START)) * 100;
export const clock = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** "1 h 15 m", "3 h", "40 m" */
export const dur = (m: number) => {
  const hh = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return hh ? (mm ? `${hh} h ${mm} m` : `${hh} h`) : `${mm} m`;
};

/**
 * Insights for the example week at a stage, read the way src/calendar/insights.ts
 * reads a real one: working hours 08:00–18:00, free stretches ≥ 30 min count as
 * free (OPEN_MIN), ≥ 60 min as focus-ready (FOCUS_READY_MIN), meetings ≤ 5 min
 * apart as back to back (B2B_GAP_MIN). Derived, so the dashboard can't disagree
 * with the week the story draws.
 */
export function readWeek(stage: number) {
  const W0 = h(8);
  const W1 = h(18);
  const days = DAYS.map((d, day) => {
    const shown = TILES.filter((t) => t.day === day && tileState(t, stage) !== 'hidden').map((t) => ({
      ...t,
      e: tileEnd(t, stage),
    }));
    const away = shown.some((t) => t.kind === 'away' && t.s <= W0 && t.e >= W1);
    const meets = shown.filter((t) => t.kind === 'meet' || t.kind === 'new').sort((a, b) => a.s - b.s);
    const focus = shown.filter((t) => t.kind === 'thesis').reduce((n, t) => n + t.e - t.s, 0);
    const meet = meets.reduce((n, t) => n + t.e - t.s, 0);
    let b2b = 0;
    let run = 1;
    for (let i = 1; i <= meets.length; i++) {
      if (i < meets.length && meets[i].s - meets[i - 1].e <= 5) run++;
      else {
        if (run >= 2) b2b++;
        run = 1;
      }
    }
    // free stretches inside working hours, around everything on the day
    const busy = shown.map((t) => [Math.max(t.s, W0), Math.min(t.e, W1)] as const)
      .filter(([s, e]) => e > s)
      .sort((a, b) => a[0] - b[0]);
    let cur = W0;
    let free = 0;
    let ready = 0;
    for (const [s, e] of [...busy, [W1, W1] as const]) {
      const gap = s - cur;
      if (gap >= 30) free += gap;
      if (gap >= 60) ready += gap;
      cur = Math.max(cur, e);
    }
    return { label: d.short, away, focus, meet, free: away ? 0 : free, ready: away ? 0 : ready, b2b };
  });
  const sum = (k: 'focus' | 'meet' | 'ready' | 'b2b') => days.reduce((n, d) => n + d[k], 0);
  return { days, focus: sum('focus'), meet: sum('meet'), ready: sum('ready'), b2b: sum('b2b') };
}
