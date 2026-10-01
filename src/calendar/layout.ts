import { repeatsOn } from '../lib/repeats';
import { addDays, fromIso, iso, startOfWeek, toMin } from './cal-date';
import { MAX_COLS, ROW } from './tokens';
import type { CalEvent, LaidBlock } from './types';

/** Month grid cells — Monday-start, always whole weeks (the date picker). */
export function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const out: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

/* ───────────────────────── repeats ───────────────────────── */

// Repeat expansion lives in src/lib/repeats.ts (pure, shared with the server agent).
export { repeatsOn };

/* ───────────────────────── one day's slice of an event ───────────────────────── */

/**
 * Where an event sits on one day, before the window is applied. Handles events
 * that run past midnight (22:00 → 02:00 is drawn on both days) and repeats.
 * Minutes are 0–1440 within `day`.
 */
export type DaySlice = {
  ev: CalEvent;
  s: number;
  t: number;
  /** started on an earlier day */
  fromPrev: boolean;
  /** carries on into the next day */
  toNext: boolean;
};

export function sliceOn(ev: CalEvent, day: string): DaySlice | null {
  if (ev.allDay) return null;
  const startMin = toMin(ev.start);
  let endMin = toMin(ev.end);

  // A repeat is always a same-day block at its own times.
  if (ev.rrule) {
    if (!repeatsOn(ev, day)) return null;
    if (endMin <= startMin) endMin = Math.min(1440, startMin + 15);
    return { ev: { ...ev, date: day }, s: startMin, t: endMin, fromPrev: false, toNext: false };
  }

  const endDay = ev.endDate ?? ev.date;
  if (day < ev.date || day > endDay) return null;
  // Ends exactly at midnight: nothing of it is on the end day.
  if (day === endDay && day !== ev.date && endMin === 0) return null;

  const s = day === ev.date ? startMin : 0;
  let t = day === endDay ? endMin : 1440;
  // Bad data (end before start on one day) still gets a readable tile.
  if (t <= s) t = Math.min(1440, s + 15);
  const endsAtMidnight = endDay === iso(addDays(fromIso(day), 1)) && endMin === 0;
  return { ev, s, t, fromPrev: day !== ev.date, toNext: day !== endDay && !endsAtMidnight };
}

/* ───────────────────────── the window ───────────────────────── */

/** A slice clipped to your hours, or which edge it fell off. */
export type Placed =
  | { at: 'in'; slice: DaySlice; s: number; t: number; cutTop: boolean; cutBottom: boolean }
  | { at: 'before' | 'after'; slice: DaySlice };

export function placeIn(slice: DaySlice, winStart: number, winEnd: number): Placed {
  const ws = winStart * 60;
  const we = winEnd * 60;
  if (slice.t <= ws) return { at: 'before', slice };
  if (slice.s >= we) return { at: 'after', slice };
  return {
    at: 'in',
    slice,
    s: Math.max(slice.s, ws),
    t: Math.min(slice.t, we),
    cutTop: slice.s < ws || slice.fromPrev,
    cutBottom: slice.t > we || slice.toNext,
  };
}

/** Everything one column needs: tiles in the window, and what fell off each edge. */
export type DayPlan = {
  blocks: LaidBlock[];
  overflow: Overflow[];
  before: CalEvent[];
  after: CalEvent[];
};

export function planDay(
  events: CalEvent[],
  day: string,
  winStart: number,
  winEnd: number,
  maxCols: number = MAX_COLS,
): DayPlan {
  const inside: { slice: DaySlice; s: number; t: number; cutTop: boolean; cutBottom: boolean }[] = [];
  const before: CalEvent[] = [];
  const after: CalEvent[] = [];
  for (const ev of events) {
    const slice = sliceOn(ev, day);
    if (!slice) continue;
    const p = placeIn(slice, winStart, winEnd);
    if (p.at === 'in') inside.push(p);
    else (p.at === 'before' ? before : after).push(slice.ev);
  }
  const { blocks, overflow } = laidOut(inside, maxCols);
  return { blocks, overflow, before, after };
}

/** All-day events covering `day` (end date exclusive, Google's convention). */
export function allDayOn(events: CalEvent[], day: string): CalEvent[] {
  return events.filter((e) => {
    if (!e.allDay) return false;
    if (e.rrule) return repeatsOn(e, day);
    const end = e.endDate ?? iso(addDays(fromIso(e.date), 1));
    return e.date <= day && day < end;
  });
}

/* ───────────────────────── overlaps ───────────────────────── */

/** "+n" for a cluster wider than MAX_COLS, drawn in its last column. */
export type Overflow = { s: number; t: number; col: number; cols: number; items: CalEvent[] };

/**
 * Overlap layout. Sort by start, group mutually-overlapping slices into
 * clusters, greedily give each the first column that is free, split the width.
 * A cluster needing more than MAX_COLS keeps the first MAX_COLS − 1 columns and
 * folds the rest into one "+n" chip — four 25%-wide tiles carry no readable
 * title, and a packed hour is better shown as "there is more here".
 */
export function laidOut(
  list: { slice: DaySlice; s: number; t: number; cutTop: boolean; cutBottom: boolean }[],
  maxCols: number = MAX_COLS,
): { blocks: LaidBlock[]; overflow: Overflow[] } {
  const items = list
    .map((p) => ({ ...p, ev: p.slice.ev, col: 0, cols: 1 }))
    .sort((a, b) => a.s - b.s || b.t - a.t);
  const blocks: LaidBlock[] = [];
  const overflow: Overflow[] = [];
  let cluster: typeof items = [];
  let end = -1;

  const flush = () => {
    if (!cluster.length) return;
    const ends: number[] = [];
    // Plan with AI drafts take the first columns, so they are never the ones
    // folded into "+n" — they are what the person is deciding on right now.
    const order = cluster.some((it) => it.ev.draft)
      ? [...cluster.filter((it) => it.ev.draft), ...cluster.filter((it) => !it.ev.draft)]
      : cluster;
    for (const it of order) {
      let c = ends.findIndex((e) => e <= it.s);
      if (c === -1) {
        c = ends.length;
        ends.push(0);
      }
      ends[c] = it.t;
      it.col = c;
    }
    const n = ends.length;
    if (n <= maxCols) {
      for (const it of cluster) blocks.push(toBlock(it, n));
    } else {
      const keep = Math.max(1, maxCols - 1);
      const hidden = cluster.filter((it) => it.col >= keep);
      for (const it of cluster) if (it.col < keep) blocks.push(toBlock(it, keep + 1));
      overflow.push({
        s: Math.min(...hidden.map((h) => h.s)),
        t: Math.max(...hidden.map((h) => h.t)),
        col: keep,
        cols: keep + 1,
        items: hidden.map((h) => h.ev),
      });
    }
    cluster = [];
  };

  for (const it of items) {
    if (it.s >= end && cluster.length) {
      flush();
      end = -1;
    }
    cluster.push(it);
    end = Math.max(end, it.t);
  }
  flush();
  return { blocks, overflow };
}

function toBlock(
  it: { ev: CalEvent; s: number; t: number; col: number; cutTop: boolean; cutBottom: boolean; slice: DaySlice },
  cols: number,
): LaidBlock {
  return {
    ev: it.ev,
    s: it.s,
    t: it.t,
    col: it.col,
    cols,
    cutTop: it.cutTop,
    cutBottom: it.cutBottom,
    trueStart: it.slice.fromPrev ? null : it.slice.s,
    trueEnd: it.slice.toNext ? null : it.slice.t,
  };
}

/* ───────────────────────── geometry ───────────────────────── */

/** Vertical offset (px) of a minute-of-day inside a grid starting at `winStart`. */
export const minToY = (min: number, winStart: number) => ((min - winStart * 60) / 60) * ROW;

/** Minute-of-day under a y offset, unsnapped. */
export const yToMin = (y: number, winStart: number) => winStart * 60 + (y / ROW) * 60;

export const snapMin = (m: number, step: number) => Math.round(m / step) * step;

export function blockGeometry(it: Pick<LaidBlock, 's' | 't' | 'col' | 'cols'>, winStart: number) {
  const top = minToY(it.s, winStart);
  const height = Math.max(14, ((it.t - it.s) / 60) * ROW - 2);
  const widthPct = 100 / it.cols;
  return { top, height, widthPct, leftPct: it.col * widthPct };
}

/** Hours down the gutter. */
export const gutterHours = (start: number, end: number) => {
  const out: number[] = [];
  for (let h = start; h < end; h++) out.push(h);
  return out;
};

export const bodyH = (start: number, end: number) => (end - start) * ROW;
