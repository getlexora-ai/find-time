/**
 * Overlap-column resolution for a single day's timed events, plus small
 * derived helpers (which events fall on a given day, which are all-day,
 * simple conflict flagging). This is the standard calendar-app "collision
 * cluster -> greedy column packing" algorithm — sort by start, chain
 * clusters while any event in the running cluster is still open, then
 * greedily assign each event the first column whose last occupant has
 * already ended.
 */
import { endOfDay, startOfDay } from "date-fns";
import type { CalendarEvent } from "@/lib/types/event";

export interface PositionedEvent {
  event: CalendarEvent;
  /** clipped to this day's [00:00, 24:00) bounds */
  start: Date;
  end: Date;
  columnIndex: number;
  columnCount: number;
  /** true when this event and >=1 other non-flexible event genuinely double-book the same slot */
  conflict: boolean;
}

/** Timed (non-all-day) events that intersect the given day, clipped to it. */
export function getEventsForDay(events: CalendarEvent[], day: Date): { event: CalendarEvent; start: Date; end: Date }[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return events
    .filter((e) => !e.allDay)
    .filter((e) => new Date(e.start) < dayEnd && new Date(e.end) > dayStart)
    .map((event) => ({
      event,
      start: new Date(event.start) < dayStart ? dayStart : new Date(event.start),
      end: new Date(event.end) > dayEnd ? dayEnd : new Date(event.end),
    }));
}

export function getAllDayEvents(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day);
  const dayEnd = endOfDay(day);
  return events.filter((e) => e.allDay && new Date(e.start) < dayEnd && new Date(e.end) > dayStart);
}

export function layoutDayEvents(events: CalendarEvent[], day: Date): PositionedEvent[] {
  const items = getEventsForDay(events, day).sort(
    (a, b) => a.start.getTime() - b.start.getTime() || a.end.getTime() - b.end.getTime(),
  );

  const results: PositionedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd: number | null = null;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const columns: (typeof items)[] = [];
    for (const item of cluster) {
      let placed = false;
      for (const col of columns) {
        const last = col[col.length - 1];
        if (last.end.getTime() <= item.start.getTime()) {
          col.push(item);
          placed = true;
          break;
        }
      }
      if (!placed) columns.push([item]);
    }
    const columnCount = columns.length;
    const nonFlexibleCount = cluster.filter((c) => c.event.flexibility !== "flexible").length;
    columns.forEach((col, columnIndex) => {
      col.forEach((item) => {
        const conflict = columnCount > 1 && nonFlexibleCount > 1 && item.event.flexibility === "fixed";
        results.push({ event: item.event, start: item.start, end: item.end, columnIndex, columnCount, conflict });
      });
    });
    cluster = [];
    clusterEnd = null;
  };

  for (const item of items) {
    if (clusterEnd !== null && item.start.getTime() >= clusterEnd) {
      flushCluster();
    }
    cluster.push(item);
    clusterEnd = clusterEnd === null ? item.end.getTime() : Math.max(clusterEnd, item.end.getTime());
  }
  flushCluster();

  return results;
}
