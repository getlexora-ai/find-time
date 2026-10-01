import { WD, WD_LONG } from './cal-date';
import { type Hours, workFor } from './hours';
import { type Kpis } from './kpi';
import { type DaySlice, sliceOn } from './layout';
import type { CalEvent } from './types';

/**
 * Insights — the readings behind the Insights page, one day at a time.
 *
 * Same rule as `kpi.ts`: everything is derived from the events the grid draws,
 * cut with the grid's own `sliceOn`, so a reading can never disagree with the
 * planner. `kpi.ts` keeps the totals it already owns (planned, focus, capacity,
 * by category); this adds the shape of each day — where the free windows are,
 * how fragmented it is, how much of it is meetings — and the same readings for
 * the week before, so the page can say what changed.
 *
 * Still nothing the schema cannot answer: no "done", no "overdue".
 */

/** A free stretch this long, inside working hours, can hold real focus work. */
export const FOCUS_READY_MIN = 60;
/** Smallest free stretch worth offering to plan into. */
export const OPEN_MIN = 30;
/** Two meetings this close count as back to back. */
export const B2B_GAP_MIN = 5;

export type Gap = { s: number; t: number };

export type DayRead = {
  /** yyyy-mm-dd */
  date: string;
  /** Mon / Tue / … */
  label: string;
  long: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
  /** working hours that day in minutes, null = a day off */
  work: Gap | null;
  workMin: number;
  /** every timed slice on the day, booked and proposed, by start */
  slices: DaySlice[];
  /** booked time, overlaps merged once (a double-book costs its hour once) */
  bookedMin: number;
  /** booked time that falls inside working hours, merged */
  inWorkMin: number;
  /** free stretches inside working hours, any length */
  gaps: Gap[];
  freeMin: number;
  /** of the free time, what sits in stretches ≥ FOCUS_READY_MIN */
  readyMin: number;
  readyCount: number;
  /** free stretches shorter than OPEN_MIN — time too short to use */
  crumbMin: number;
  focusMin: number;
  focusLongestMin: number;
  meetingMin: number;
  meetings: number;
  /** runs of ≥ 2 meetings with ≤ B2B_GAP_MIN between them */
  b2bRuns: number;
  b2bLongestMin: number;
  /** category changes between consecutive booked blocks (breaks excluded) */
  switches: number;
  /** event / task / focus time outside working hours (a day off counts whole) */
  outsideMin: number;
  breaks: number;
  breakMin: number;
  /** first booked start / last booked end that day, minutes; null when empty */
  first: number | null;
  last: number | null;
};

export type WeekTotals = {
  bookedMin: number;
  inWorkMin: number;
  workMin: number;
  freeMin: number;
  readyMin: number;
  readyCount: number;
  focusMin: number;
  meetingMin: number;
  meetings: number;
  b2bRuns: number;
  switches: number;
  /** working days that have at least two blocks — the switch average's base */
  switchDays: number;
  outsideMin: number;
  breakMin: number;
  /** working days with a break booked, of working days */
  breakDays: number;
  workDays: number;
};

export type Insight = {
  days: DayRead[];
  totals: WeekTotals;
  /** the same span one week earlier; null when nothing was booked then (no data ≠ zero) */
  prev: WeekTotals | null;
  /** the day with the most booked time inside working hours */
  busiest: DayRead | null;
};

const isBooked = (e: CalEvent) => e.kind !== 'ai';
const isMeeting = (e: CalEvent) => e.cat === 'sync';
/** what counts as working on something: not a routine, not a break */
const isWork = (e: CalEvent) => e.kind === 'event' || e.kind === 'task' || e.kind === 'focus';

function mergeSpans(spans: Gap[]): Gap[] {
  const sorted = spans.filter((g) => g.t > g.s).sort((a, b) => a.s - b.s);
  const out: Gap[] = [];
  for (const g of sorted) {
    const last = out[out.length - 1];
    if (last && g.s <= last.t) last.t = Math.max(last.t, g.t);
    else out.push({ ...g });
  }
  return out;
}
const total = (spans: Gap[]) => spans.reduce((a, g) => a + (g.t - g.s), 0);

function clip(spans: Gap[], lo: number, hi: number): Gap[] {
  return spans.map((g) => ({ s: Math.max(g.s, lo), t: Math.min(g.t, hi) })).filter((g) => g.t > g.s);
}

/** Gaps between merged spans inside [lo, hi]. */
function holes(merged: Gap[], lo: number, hi: number): Gap[] {
  const out: Gap[] = [];
  let cursor = lo;
  for (const g of clip(merged, lo, hi)) {
    if (g.s > cursor) out.push({ s: cursor, t: g.s });
    cursor = Math.max(cursor, g.t);
  }
  if (hi > cursor) out.push({ s: cursor, t: hi });
  return out;
}

export function readDay(events: CalEvent[], date: string, h: Hours, todayIso: string): DayRead {
  const wd = wdOf(date);
  const w = workFor(h, wd);
  const work = w ? { s: w.start * 60, t: w.end * 60 } : null;

  const slices: DaySlice[] = [];
  for (const e of events) {
    const sl = sliceOn(e, date);
    if (sl) slices.push(sl);
  }
  slices.sort((a, b) => a.s - b.s || b.t - a.t);
  const booked = slices.filter((sl) => isBooked(sl.ev));

  const merged = mergeSpans(booked.map((sl) => ({ s: sl.s, t: sl.t })));
  const inWork = work ? clip(merged, work.s, work.t) : [];
  const gaps = work ? holes(merged, work.s, work.t) : [];
  const ready = gaps.filter((g) => g.t - g.s >= FOCUS_READY_MIN);

  const focus = booked.filter((sl) => sl.ev.kind === 'focus');
  const meet = booked.filter((sl) => isMeeting(sl.ev));

  // back to back: walk meetings by start, chain while the next starts ≤ 5 min after
  let b2bRuns = 0;
  let b2bLongestMin = 0;
  let run: Gap | null = null;
  let runLen = 0;
  const closeRun = () => {
    if (run && runLen >= 2) {
      b2bRuns++;
      b2bLongestMin = Math.max(b2bLongestMin, run.t - run.s);
    }
  };
  for (const sl of meet) {
    if (run && sl.s <= run.t + B2B_GAP_MIN) {
      run.t = Math.max(run.t, sl.t);
      runLen++;
    } else {
      closeRun();
      run = { s: sl.s, t: sl.t };
      runLen = 1;
    }
  }
  closeRun();

  let switches = 0;
  const flow = booked.filter((sl) => sl.ev.kind !== 'break');
  for (let i = 1; i < flow.length; i++) if (flow[i].ev.cat !== flow[i - 1].ev.cat) switches++;

  const workSpans = mergeSpans(booked.filter((sl) => isWork(sl.ev)).map((sl) => ({ s: sl.s, t: sl.t })));
  const outsideMin = work ? total(workSpans) - total(clip(workSpans, work.s, work.t)) : total(workSpans);

  const d = fromIsoLocal(date);
  return {
    date,
    label: WD[wd],
    long: WD_LONG[wd],
    dayNum: d.getDate(),
    isToday: date === todayIso,
    isPast: date < todayIso,
    work,
    workMin: work ? work.t - work.s : 0,
    slices,
    bookedMin: total(merged),
    inWorkMin: total(inWork),
    gaps,
    freeMin: total(gaps),
    readyMin: total(ready),
    readyCount: ready.length,
    crumbMin: total(gaps.filter((g) => g.t - g.s < OPEN_MIN)),
    focusMin: focus.reduce((a, sl) => a + (sl.t - sl.s), 0),
    focusLongestMin: focus.reduce((a, sl) => Math.max(a, sl.t - sl.s), 0),
    meetingMin: total(mergeSpans(meet.map((sl) => ({ s: sl.s, t: sl.t })))),
    meetings: meet.length,
    b2bRuns,
    b2bLongestMin,
    switches,
    outsideMin,
    breaks: booked.filter((sl) => sl.ev.kind === 'break').length,
    breakMin: booked.filter((sl) => sl.ev.kind === 'break').reduce((a, sl) => a + (sl.t - sl.s), 0),
    first: merged.length ? merged[0].s : null,
    last: merged.length ? merged[merged.length - 1].t : null,
  };
}

function sum(days: DayRead[]): WeekTotals {
  const work = days.filter((d) => d.work);
  const add = (f: (d: DayRead) => number) => days.reduce((a, d) => a + f(d), 0);
  const switchDays = work.filter((d) => d.slices.filter((sl) => isBooked(sl.ev) && sl.ev.kind !== 'break').length >= 2);
  return {
    bookedMin: add((d) => d.bookedMin),
    inWorkMin: add((d) => d.inWorkMin),
    workMin: add((d) => d.workMin),
    freeMin: add((d) => d.freeMin),
    readyMin: add((d) => d.readyMin),
    readyCount: add((d) => d.readyCount),
    focusMin: add((d) => d.focusMin),
    meetingMin: add((d) => d.meetingMin),
    meetings: add((d) => d.meetings),
    b2bRuns: add((d) => d.b2bRuns),
    switches: switchDays.reduce((a, d) => a + d.switches, 0),
    switchDays: switchDays.length,
    outsideMin: add((d) => d.outsideMin),
    breakMin: add((d) => d.breakMin),
    breakDays: work.filter((d) => d.breaks > 0).length,
    workDays: work.length,
  };
}

/**
 * `days` is exactly what the planner shows (7 in week view, 1 in day view).
 * The comparison span is the same days one week earlier.
 */
export function readInsight(events: CalEvent[], days: string[], h: Hours, todayIso: string): Insight {
  const reads = days.map((d) => readDay(events, d, h, todayIso));
  const prevReads = days.map((d) => readDay(events, shiftIso(d, -7), h, todayIso));
  const prev = sum(prevReads);
  const busiest = reads.reduce<DayRead | null>((a, d) => (d.inWorkMin > (a?.inWorkMin ?? 0) ? d : a), null);
  return { days: reads, totals: sum(reads), prev: prev.bookedMin > 0 ? prev : null, busiest };
}

/**
 * Free time still ahead today: gaps clipped to now. For any other day, the
 * whole day's gaps (a past day has nothing ahead; a future day has all of it).
 */
export function gapsAhead(d: DayRead, nowMin: number): Gap[] {
  if (d.isPast) return [];
  if (!d.isToday) return d.gaps;
  return d.gaps.map((g) => ({ s: Math.max(g.s, nowMin), t: g.t })).filter((g) => g.t - g.s >= 1);
}

/**
 * Two short, true sentences about the span — the page's headline. Every clause
 * is a reading on the page; nothing is said that a number below doesn't show.
 */
export function headline(ins: Insight, k: Kpis, nowMin: number): { lead: string; sub: string } {
  const t = ins.totals;
  if (ins.days.length === 1) {
    const d = ins.days[0];
    if (!d.work && !d.bookedMin) return { lead: `${d.long} is a day off.`, sub: 'Nothing booked.' };
    const lead = d.work
      ? `${pct(d.inWorkMin, d.workMin)}% of ${d.isToday ? 'today' : d.long}'s working hours ${d.isPast ? 'were' : 'are'} booked.`
      : `${d.long} is a day off, with ${hm(d.bookedMin)} booked.`;
    const next = gapsAhead(d, nowMin).find((g) => g.t - g.s >= OPEN_MIN);
    const sub = d.isPast
      ? `${hm(d.focusMin)} of focus, ${d.meetings} meeting${d.meetings === 1 ? '' : 's'}.`
      : next
        ? `Next open window ${clock(next.s)} – ${clock(next.t)} (${hm(next.t - next.s)}).`
        : d.work
          ? 'No open window of 30 minutes or more is left.'
          : '';
    return { lead, sub };
  }
  if (!t.bookedMin) return { lead: 'Nothing is booked this week yet.', sub: `${hm(t.freeMin)} of working time is open.` };
  const lead = `${pct(t.inWorkMin, t.workMin)}% of your working week is booked.`;
  const parts: string[] = [];
  if (ins.busiest && ins.busiest.inWorkMin) parts.push(`${ins.busiest.long} is the fullest day`);
  const short = k.focusGoalH * 60 - t.focusMin;
  parts.push(short > 0 ? `focus is ${hm(short)} short of your ${Math.round(k.focusGoalH)}h goal` : 'your focus goal is met');
  const sub = parts.join('; ') + '.';
  return { lead, sub: sub.charAt(0).toUpperCase() + sub.slice(1) };
}

/* ───────────────────────── formatting ───────────────────────── */

export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

/** "6h", "6h 30m", "45m", "0m" — minutes in. */
export function hm(min: number): string {
  const m = Math.round(min);
  if (m <= 0) return '0m';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** "+3h", "−45m", "same" — a change in minutes. */
export function deltaHm(min: number): string {
  if (Math.abs(min) < 1) return 'same';
  return `${min > 0 ? '+' : '−'}${hm(Math.abs(min))}`;
}

export const clock = (m: number) => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

function wdOf(dateIso: string): number {
  return (fromIsoLocal(dateIso).getDay() + 6) % 7;
}
function fromIsoLocal(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}
function shiftIso(s: string, n: number) {
  const d = fromIsoLocal(s);
  d.setDate(d.getDate() + n);
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
