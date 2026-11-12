/**
 * Public holidays as days off for planning.
 *
 * A holiday is an all-day event on one of Google's public-holiday calendars
 * (provider id `…#holiday@group.v.calendar.google.com`, the same test as
 * src/prism/cal-look.ts). Google marks them free, so `blocksTime` alone would
 * let "plan my week" put work on 25 Dec. Instead the day is treated like a
 * weekend: no new work on it, personal time as usual, and blocks already
 * there stay where they are. A time the user names on a holiday is kept, and
 * the reply says what day it is.
 *
 * The calendar facts (which calendar, its name, whether it is a holiday one)
 * ride on the loaded events as `holiday` / `calendarName` (`onCalendars`), so
 * every planner reads them from the events it already has. The holiday's name
 * is the live Google title; it is never stored (scrub.ts takes it out of the
 * saved reply).
 *
 * Pure, so the .check.mjs files import it directly.
 */
import type { ApiEvent } from '../../lib/api-types.ts';

export const isHolidayCalendar = (providerCalendarId: string) => /#holiday@group\.v\.calendar\.google\.com$/i.test(providerCalendarId);

/** A read-enabled calendar, as the AI needs it (repo.ts listCalendars). */
export type CalendarInfo = { id: string; name: string; holiday: boolean };

/** What the AI knows about an event's calendar. Names are not event content. */
export type OnCalendar = { holiday?: boolean; calendarName?: string };
export type CalEvent = ApiEvent & OnCalendar;

/** Events with their calendar's name, and holiday days marked. */
export function onCalendars<E extends Pick<ApiEvent, 'calendarId' | 'allDay'>>(events: E[], calendars: CalendarInfo[]): (E & OnCalendar)[] {
  if (!calendars.length) return events;
  const byId = new Map(calendars.map((c) => [c.id, c]));
  return events.map((e) => {
    const c = e.calendarId ? byId.get(e.calendarId) : undefined;
    if (!c) return e;
    return { ...e, calendarName: c.name, ...(c.holiday && e.allDay ? { holiday: true } : {}) };
  });
}

/** One holiday day. `name` is the live Google title, or null when it couldn't be read. */
export type Holiday = { date: string; name: string | null };

const DAY = 86_400_000;

/** Every day a holiday event covers, once each, in date order. */
export function holidaysIn(events: { start: string; end: string; holiday?: boolean; title?: string }[]): Holiday[] {
  const out = new Map<string, Holiday>();
  for (const e of events) {
    if (!e.holiday) continue;
    const s = Date.parse(`${e.start.slice(0, 10)}T00:00:00Z`);
    const end = Date.parse(e.end);
    if (!Number.isFinite(s) || !Number.isFinite(end)) continue;
    // 'Busy' is what live-details falls back to when Google can't be read.
    const name = e.title && e.title.trim() && e.title.trim().toLowerCase() !== 'busy' ? e.title.trim() : null;
    for (let d = s; d < Math.max(end, s + DAY); d += DAY) {
      const date = new Date(d).toISOString().slice(0, 10);
      const had = out.get(date);
      if (!had || (!had.name && name)) out.set(date, { date, name });
    }
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-12-25" → "Fri 25 Dec" */
export function dayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
}

/** "Fri 25 Dec (Christmas Day)", or "Fri 25 Dec" with no name. */
const named = (h: Holiday) => `${dayLabel(h.date)}${h.name ? ` (${h.name})` : ''}`;

/** "Fri 25 Dec (Christmas Day) and Sat 26 Dec" */
function list(hs: Holiday[]): string {
  const parts = hs.map(named);
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * Work kept off holidays: "Fri 25 Dec (Christmas Day) is a public holiday, so
 * no new work was planned on it." ('plan'), "…so I kept work off it." ('search').
 */
export function plannedAroundNote(hs: Holiday[], how: 'plan' | 'search' = 'plan'): string {
  if (!hs.length) return '';
  const one = hs.length === 1;
  const it = one ? 'it' : 'them';
  return `${list(hs)} ${one ? 'is a public holiday' : 'are public holidays'}, so ${how === 'plan' ? `no new work was planned on ${it}` : `I kept work off ${it}`}.`;
}

/** A time or day the user named: "Fri 25 Dec is a public holiday (Christmas Day) — I kept the time you asked for." */
export function namedDayNote(h: Holiday, what: 'time' | 'day' = 'time'): string {
  return `${dayLabel(h.date)} is a public holiday${h.name ? ` (${h.name})` : ''} — I kept the ${what} you asked for.`;
}

/** The holiday a time falls on, if any. */
export const holidayOn = (hs: Holiday[], iso: string) => hs.find((h) => h.date === iso.slice(0, 10)) ?? null;

/** The holidays on days that [fromISO, toISO) touches. */
export function holidaysBetween(hs: Holiday[], fromISO: string, toISO: string): Holiday[] {
  const lo = Date.parse(fromISO);
  const hi = Date.parse(toISO);
  return hs.filter((h) => {
    const d = Date.parse(`${h.date}T00:00:00Z`);
    return d < hi && d + DAY > lo;
  });
}

/**
 * Whether every day [fromISO, toISO) touches is a holiday: the user asked for
 * that day ("2h on 25 Dec"), so it is searched, and the reply says what it is.
 */
export function onlyHolidays(hs: Holiday[], fromISO: string, toISO: string): boolean {
  const lo = Math.floor(Date.parse(fromISO) / DAY) * DAY;
  const hi = Date.parse(toISO);
  if (!(hi > lo)) return false;
  const days = Math.ceil((hi - lo) / DAY);
  return days > 0 && holidaysBetween(hs, fromISO, toISO).length === days;
}
