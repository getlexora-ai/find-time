import type { ApiCalendar } from '@/lib/api-types';
import type { CalEvent } from '@/calendar/types';

/**
 * Colour says which calendar, shape says what kind (the pattern Google,
 * Apple and Notion Calendar share). A Google event takes its calendar's own
 * colour as a tint and a left bar; Find Time's own blocks keep their forms
 * (solid focus, hatched routine, checkbox task, dashed proposal) and no bar.
 */
export type CalLook = { color: string; name: string; holiday: boolean };
export type CalLooks = ReadonlyMap<string, CalLook>;

/** Google's public-holiday calendars, e.g. `en.german#holiday@group.v.calendar.google.com`. */
export const isHolidayCalendar = (providerCalendarId: string) => /#holiday@group\.v\.calendar\.google\.com$/i.test(providerCalendarId);

export function calLooks(calendars: ApiCalendar[]): CalLooks {
  return new Map(
    calendars
      .filter((c) => c.color)
      .map((c) => [c.id, { color: c.color, name: c.name, holiday: isHolidayCalendar(c.providerCalendarId) }]),
  );
}

/** The calendar look of an event that came from Google, or null for Find Time's own blocks. */
export function lookOf(ev: Pick<CalEvent, 'imported' | 'calendarId'>, looks: CalLooks | undefined): CalLook | null {
  if (!ev.imported || !ev.calendarId || !looks) return null;
  return looks.get(ev.calendarId) ?? null;
}
