import { toMin, WD } from './cal-date';
import { CATS, CAT_KEYS, type CatKey } from './tokens';
import type { CalEvent } from './types';

/**
 * The four numbers above the grid.
 *
 * Every figure here is derived from the same events the grid draws — there is
 * no second source and no stored aggregate, so a KPI can never disagree with
 * what you are looking at. Hidden kinds are filtered out upstream, which means
 * unticking "Routine" in the rail re-reads the whole panel too.
 *
 * Deliberately absent: anything the data model cannot answer. `calendar_events`
 * has no done flag and no deadline column (db/003_calendar_events.sql), so
 * there is no "tasks ticked" and no "overdue" count. Inventing either would put
 * a number on screen that nothing can ever move.
 */

/**
 * The window "open capacity" is measured inside. Narrower than the grid's own
 * 07:00–21:00: free time at 07:00 is not capacity you would actually schedule
 * into, and counting it made every week look half empty.
 */
export const WAKE_START = 8;
export const WAKE_END = 20;

/**
 * Weekly hour targets per category, and the weekly protected-focus goal.
 *
 * These are defaults, not preferences — there is no per-user target in the
 * schema yet. They live here as one table so that when preferences do land,
 * this is the only thing that has to start reading from them.
 */
export const WEEK_TARGET_H: Record<CatKey, number> = {
  deep: 16,
  design: 8,
  research: 5,
  sync: 6,
  admin: 4,
};
export const FOCUS_GOAL_WEEK_H = 14;

/** Kinds that occupy real time. A proposal is not booked until you accept it. */
const isBooked = (e: CalEvent) => e.kind !== 'ai';

const hoursOf = (e: CalEvent) => Math.max(0, toMin(e.end) - toMin(e.start)) / 60;

export type CatSlice = {
  key: CatKey;
  label: string;
  color: string;
  hours: number;
  target: number;
};

export type FreeDay = {
  /** yyyy-mm-dd */
  date: string;
  /** Mon / Tue / … */
  label: string;
  hours: number;
  isToday: boolean;
};

export type Kpis = {
  /** how many days the panel is summarising — 7 in week view, 1 in day view */
  dayCount: number;
  /** per-category hours, in the palette's fixed order; zero rows included */
  byCat: CatSlice[];
  plannedH: number;
  targetH: number;
  /** the category with the most hours, or null when nothing is planned */
  lead: CatSlice | null;
  focusH: number;
  focusGoalH: number;
  focusBlocks: number;
  focusLongestH: number;
  free: FreeDay[];
  freeH: number;
  /** the day with the most open time */
  best: FreeDay | null;
  clashes: number;
  /** AI blocks still waiting to be accepted */
  proposals: number;
  /** booked blocks on screen */
  blocks: number;
  /** of those, how many the AI is allowed to move */
  movable: number;
};

/**
 * `days` is the exact set of days the grid is rendering, so week and day view
 * share one code path and the panel is always scoped to what is visible.
 * `clashes` is passed in because the screen already computes real overlaps for
 * the conflict banner; recomputing them here would be a second definition of
 * "clash" that could drift from the one the banner uses.
 */
export function computeKpis(events: CalEvent[], days: string[], clashes: number): Kpis {
  const inView = new Set(days);
  const scoped = events.filter((e) => inView.has(e.date));
  const booked = scoped.filter(isBooked);

  /* ── 1. planned hours, split by category ── */
  const hours = {} as Record<CatKey, number>;
  for (const k of CAT_KEYS) hours[k] = 0;
  for (const e of booked) hours[e.cat] = (hours[e.cat] ?? 0) + hoursOf(e);

  // Day view should be measured against a day's worth of target, not a week's.
  const scale = days.length / 7;
  const byCat: CatSlice[] = CAT_KEYS.map((k) => ({
    key: k,
    label: CATS[k].label,
    color: CATS[k].color,
    hours: hours[k],
    target: WEEK_TARGET_H[k] * scale,
  }));

  const plannedH = byCat.reduce((a, c) => a + c.hours, 0);
  const targetH = byCat.reduce((a, c) => a + c.target, 0);
  const ranked = [...byCat].sort((a, b) => b.hours - a.hours);
  const lead = ranked[0] && ranked[0].hours > 0 ? ranked[0] : null;

  /* ── 2. protected focus ── */
  const focusBlocks = booked.filter((e) => e.kind === 'focus');
  const focusH = focusBlocks.reduce((a, e) => a + hoursOf(e), 0);
  const focusLongestH = focusBlocks.reduce((a, e) => Math.max(a, hoursOf(e)), 0);

  /* ── 3. open capacity, per day ── */
  const free: FreeDay[] = days.map((date) => ({
    date,
    label: WD[wdOf(date)],
    hours: freeHoursOn(booked, date),
    isToday: date === todayIso(),
  }));
  const freeH = free.reduce((a, f) => a + f.hours, 0);
  const best = free.reduce<FreeDay | null>((a, f) => (!a || f.hours > a.hours ? f : a), null);

  /* ── 4. plan health ── */
  return {
    dayCount: days.length,
    byCat,
    plannedH,
    targetH,
    lead,
    focusH,
    focusGoalH: FOCUS_GOAL_WEEK_H * scale,
    focusBlocks: focusBlocks.length,
    focusLongestH,
    free,
    freeH,
    best,
    clashes,
    proposals: scoped.length - booked.length,
    blocks: booked.length,
    movable: booked.filter((e) => e.flexible).length,
  };
}

/**
 * Unbooked hours inside the waking window on one day. Overlapping blocks are
 * merged first, so a double-booked morning costs an hour of capacity once, not
 * twice — which is what made the naive "sum the durations" version report
 * negative free time on a clashing day.
 */
function freeHoursOn(booked: CalEvent[], date: string): number {
  const lo = WAKE_START * 60;
  const hi = WAKE_END * 60;
  const spans = booked
    .filter((e) => e.date === date)
    .map((e) => [Math.max(toMin(e.start), lo), Math.min(toMin(e.end), hi)] as const)
    .filter(([s, t]) => t > s)
    .sort((a, b) => a[0] - b[0]);

  let free = 0;
  let cursor = lo;
  for (const [s, t] of spans) {
    if (s > cursor) free += s - cursor;
    cursor = Math.max(cursor, t);
  }
  return (free + Math.max(0, hi - cursor)) / 60;
}

/** Monday-indexed weekday of a yyyy-mm-dd string, without building a Date at call sites. */
function wdOf(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

function todayIso(): string {
  const n = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`;
}

/** "6h", "6h 30m", "45m" — the panel's one number format. */
export function hLabel(h: number): string {
  const m = Math.round(h * 60);
  if (m <= 0) return '0h';
  const hh = Math.floor(m / 60);
  const mm = m % 60;
  if (!hh) return `${mm}m`;
  return mm ? `${hh}h ${mm}m` : `${hh}h`;
}
