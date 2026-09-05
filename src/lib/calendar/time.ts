/**
 * Pure date/geometry math for the calendar grid.
 *
 * This is where the "standing principle" (PLAN.md §9 axis 5) lives in
 * numeric form: every pixel an event renders at must be derivable from these
 * functions alone — no fudging, no eyeballed offsets.
 *
 *   top    = minutesFromDayStart(event.start) * pxPerMinute(hourHeight)
 *   height = durationMinutes * pxPerMinute(hourHeight)
 *
 * Example (also hand-verified in the build report): a 90-minute event
 * starting at 10:30 with hourHeight=64 sits at top=672px (10.5h * 64),
 * height=96px (90min * 64/60).
 */
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay as dateFnsIsSameDay,
  isSameMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { DEFAULT_HOUR_HEIGHT, SNAP_MINUTES } from "@/lib/calendar/constants";

export const isSameDay = dateFnsIsSameDay;
export { isSameMonth, startOfDay };

/** px per minute of the grid, derived from the single hourHeight source of truth. */
export function pxPerMinute(hourHeight: number = DEFAULT_HOUR_HEIGHT): number {
  return hourHeight / 60;
}

/** Minutes elapsed between a moment and the start of its calendar day. */
export function minutesFromDayStart(date: Date, dayStart: Date = startOfDay(date)): number {
  return differenceInMinutes(date, dayStart);
}

/** Absolute pixel `top` for an event start time within its day column. */
export function topForStart(start: Date, hourHeight: number = DEFAULT_HOUR_HEIGHT, dayStart: Date = startOfDay(start)): number {
  return minutesFromDayStart(start, dayStart) * pxPerMinute(hourHeight);
}

/** Pixel `height` for a duration. */
export function heightForDuration(durationMinutes: number, hourHeight: number = DEFAULT_HOUR_HEIGHT): number {
  return Math.max(0, durationMinutes) * pxPerMinute(hourHeight);
}

/** Convert a pixel delta (e.g. drag distance) into minutes at this density. */
export function pxToMinutes(px: number, hourHeight: number = DEFAULT_HOUR_HEIGHT): number {
  return px / pxPerMinute(hourHeight);
}

/** Snap a minute value to the nearest grid increment (default 15min). */
export function snapMinutes(minutes: number, snap: number = SNAP_MINUTES): number {
  return Math.round(minutes / snap) * snap;
}

/** Full 24h in px at a given density — the height of one day column. */
export function dayColumnHeight(hourHeight: number = DEFAULT_HOUR_HEIGHT): number {
  return 24 * hourHeight;
}

export function getWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** 6-row month grid (Mon-start), including lead/trail days from adjacent months. */
export function getMonthGridDays(anchor: Date): Date[] {
  const gridStart = startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 });
  const days: Date[] = [];
  let cur = gridStart;
  while (cur <= gridEnd) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

export function formatHourLabel(hour: number): string {
  return format(new Date(2000, 0, 1, hour, 0), "HH:mm");
}

export function formatTimeShort(date: Date): string {
  return format(date, "HH:mm");
}

/** Format a "minutes since day start" integer as an HH:mm clock string. */
export function formatMinutesOfDay(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTimeRange(start: Date, end: Date): string {
  return `${formatTimeShort(start)}–${formatTimeShort(end)}`;
}

export function formatDayHeading(date: Date): string {
  return format(date, "EEE");
}

export function formatDateNum(date: Date): string {
  return format(date, "d");
}

export { addMinutes, addDays };
