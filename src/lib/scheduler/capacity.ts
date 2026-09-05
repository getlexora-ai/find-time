import { addDays, addMinutes, startOfDay } from "date-fns";
import type { CalendarEvent } from "../types/event";
import type { SchedulerProfile } from "../types/user";
import type { Constraint } from "../types/ai";
import { GRID_MINUTES, type FreeInterval } from "./types";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

function dayKey(date: Date) {
  return DAY_KEYS[date.getDay()];
}

function atLocalTime(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

function roundUpToGrid(date: Date): Date {
  const ms = GRID_MINUTES * 60_000;
  return new Date(Math.ceil(date.getTime() / ms) * ms);
}

function roundDownToGrid(date: Date): Date {
  const ms = GRID_MINUTES * 60_000;
  return new Date(Math.floor(date.getTime() / ms) * ms);
}

/** Merge overlapping/adjacent intervals, sorted ascending. */
export function mergeIntervals(intervals: FreeInterval[]): FreeInterval[] {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: FreeInterval[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = out[out.length - 1];
    const cur = sorted[i];
    if (cur.start.getTime() <= last.end.getTime()) {
      if (cur.end.getTime() > last.end.getTime()) last.end = cur.end;
    } else {
      out.push({ ...cur });
    }
  }
  return out;
}

/** Subtract `busy` spans from `base` spans, returning the remaining free pieces. */
export function subtractIntervals(base: FreeInterval[], busy: FreeInterval[]): FreeInterval[] {
  if (busy.length === 0) return base.map((b) => ({ ...b }));
  const mergedBusy = mergeIntervals(busy);
  let result: FreeInterval[] = base.map((b) => ({ ...b }));
  for (const b of mergedBusy) {
    const next: FreeInterval[] = [];
    for (const seg of result) {
      if (b.end.getTime() <= seg.start.getTime() || b.start.getTime() >= seg.end.getTime()) {
        next.push(seg);
        continue;
      }
      if (b.start.getTime() > seg.start.getTime()) {
        next.push({ start: seg.start, end: new Date(Math.min(b.start.getTime(), seg.end.getTime())) });
      }
      if (b.end.getTime() < seg.end.getTime()) {
        next.push({ start: new Date(Math.max(b.end.getTime(), seg.start.getTime())), end: seg.end });
      }
    }
    result = next;
  }
  return result.filter((seg) => seg.end.getTime() > seg.start.getTime());
}

/** Clip `intervals` to `[windowStart, windowEnd)`. */
export function intersectWindow(intervals: FreeInterval[], windowStart: Date, windowEnd: Date): FreeInterval[] {
  const out: FreeInterval[] = [];
  for (const seg of intervals) {
    const start = seg.start.getTime() > windowStart.getTime() ? seg.start : windowStart;
    const end = seg.end.getTime() < windowEnd.getTime() ? seg.end : windowEnd;
    if (end.getTime() > start.getTime()) out.push({ start, end });
  }
  return out;
}

/**
 * Work-hours capacity across `[horizonStart, horizonEnd)`, minus busy calendar events (each
 * padded by `bufferMin` on both sides) and any `extraBusy` spans (e.g. materialized "protected"
 * constraints), snapped to the 15-minute grid. A day with no work-hours entry for that weekday
 * contributes no capacity at all.
 */
export function computeWorkHourFreeIntervals(
  calendar: CalendarEvent[],
  profile: SchedulerProfile,
  horizonStart: Date,
  horizonEnd: Date,
  bufferMin: number,
  extraBusy: FreeInterval[] = []
): FreeInterval[] {
  const dayWindows: FreeInterval[] = [];
  let cursor = startOfDay(horizonStart);
  while (cursor.getTime() < horizonEnd.getTime()) {
    const hours = profile.workHours[dayKey(cursor)];
    if (hours) {
      const start = atLocalTime(cursor, hours.start);
      const end = atLocalTime(cursor, hours.end);
      const clippedStart = start.getTime() < horizonStart.getTime() ? horizonStart : start;
      const clippedEnd = end.getTime() > horizonEnd.getTime() ? horizonEnd : end;
      if (clippedEnd.getTime() > clippedStart.getTime()) {
        dayWindows.push({ start: roundUpToGrid(clippedStart), end: roundDownToGrid(clippedEnd) });
      }
    }
    cursor = addDays(cursor, 1);
  }

  const busy: FreeInterval[] = calendar
    .filter((e) => e.status !== "cancelled" && !e.allDay)
    .map((e) => ({
      start: addMinutes(new Date(e.start), -bufferMin),
      end: addMinutes(new Date(e.end), bufferMin),
    }))
    .concat(extraBusy);

  return subtractIntervals(dayWindows, busy).filter(
    (seg) => (seg.end.getTime() - seg.start.getTime()) / 60_000 >= GRID_MINUTES
  );
}

/** Materializes `profile.focusWindows` as concrete date spans across the horizon. `day` follows `Date#getDay()` (0 = Sunday). */
export function computeFocusIntervals(profile: SchedulerProfile, horizonStart: Date, horizonEnd: Date): FreeInterval[] {
  const out: FreeInterval[] = [];
  let cursor = startOfDay(horizonStart);
  while (cursor.getTime() < horizonEnd.getTime()) {
    for (const fw of profile.focusWindows) {
      if (fw.day !== cursor.getDay()) continue;
      const start = atLocalTime(cursor, fw.start);
      const end = atLocalTime(cursor, fw.end);
      if (end.getTime() > horizonStart.getTime() && start.getTime() < horizonEnd.getTime()) {
        out.push({
          start: start.getTime() < horizonStart.getTime() ? horizonStart : start,
          end: end.getTime() > horizonEnd.getTime() ? horizonEnd : end,
        });
      }
    }
    cursor = addDays(cursor, 1);
  }
  return mergeIntervals(out);
}

/** `kind === "protected"` constraints materialize as hard busy spans (`rule.start`/`rule.end`, ISO strings). */
export function protectedConstraintIntervals(constraints: Constraint[]): FreeInterval[] {
  const out: FreeInterval[] = [];
  for (const c of constraints) {
    if (c.kind !== "protected") continue;
    const start = c.rule.start;
    const end = c.rule.end;
    if (typeof start === "string" && typeof end === "string") {
      const s = new Date(start);
      const e = new Date(end);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e.getTime() > s.getTime()) {
        out.push({ start: s, end: e });
      }
    }
  }
  return out;
}

/** A `kind === "buffer"` constraint (`rule.minutes: number`) overrides `profile.defaultBufferMin` for this run. */
export function bufferOverrideMinutes(constraints: Constraint[], fallback: number): number {
  for (const c of constraints) {
    if (c.kind === "buffer" && typeof c.rule.minutes === "number") return c.rule.minutes;
  }
  return fallback;
}
