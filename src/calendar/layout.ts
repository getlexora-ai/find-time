import { addDays, startOfWeek, toMin } from './cal-date';
import { DAY_END, DAY_START, ROW } from './tokens';
import type { CalEvent, LaidBlock } from './types';

/** Month grid cells — Monday-start, always whole weeks. Ported from calendar.html. */
export function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const start = startOfWeek(first);
  const end = addDays(startOfWeek(last), 6);
  const out: Date[] = [];
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) out.push(new Date(d));
  return out;
}

/**
 * Overlap layout — ported verbatim from calendar.html `laidOut`.
 * Sort by start, group into clusters of mutually-overlapping events, greedily
 * assign the first column whose last end ≤ this start, divide 100% by the
 * cluster's column count.
 */
export function laidOut(list: CalEvent[]): LaidBlock[] {
  const items = list
    .map((e) => ({ ev: e, s: toMin(e.start), t: toMin(e.end), col: 0, cols: 1 }))
    .sort((a, b) => a.s - b.s || b.t - a.t);
  let cluster: typeof items = [];
  let end = -1;
  const out: LaidBlock[] = [];
  const flush = () => {
    if (!cluster.length) return;
    const cols: number[] = [];
    cluster.forEach((it) => {
      let c = cols.findIndex((col) => col <= it.s);
      if (c === -1) {
        c = cols.length;
        cols.push(0);
      }
      cols[c] = it.t;
      it.col = c;
    });
    cluster.forEach((it) => {
      it.cols = cols.length;
      out.push(it);
    });
    cluster = [];
  };
  items.forEach((it) => {
    if (it.s >= end && cluster.length) flush();
    cluster.push(it);
    end = Math.max(end, it.t);
  });
  flush();
  return out;
}

/** Pixel geometry for a week/day block — ported from calendar.html `blockHTML`. */
export function blockGeometry(it: LaidBlock) {
  const top = ((it.s - DAY_START * 60) / 60) * ROW;
  const height = Math.max(22, ((it.t - it.s) / 60) * ROW - 2);
  const widthPct = 100 / it.cols;
  const leftPct = it.col * widthPct;
  const tight = height < 46;
  return { top, height, widthPct, leftPct, tight };
}

/** Vertical offset (px) of a minute-of-day inside the time grid. */
export const minToY = (min: number) => ((min - DAY_START * 60) / 60) * ROW;

/** The hour labels down the gutter. */
export const gutterHours = () => {
  const out: number[] = [];
  for (let h = DAY_START; h < DAY_END; h++) out.push(h);
  return out;
};

export const BODY_H = (DAY_END - DAY_START) * ROW;
