import type { ApiEvent } from '@/lib/api-types';
import { isImported } from '@/lib/synced-fields';
import { dayWindowFor } from '../clarify';
import { blocksTime } from '../find-time';
import { type CalEvent, holidaysIn } from '../holidays';
import type { AgentProfile } from '../preferences';

/**
 * The model's read-only lookups. It asks; the engine counts. Nothing here
 * writes. The model reads titles so it knows what an event is: "after
 * Threshold" means nothing without them. Only title and time go out, never
 * notes, guests or locations, and only on a lookup (privacy policy, "AI
 * features"). What is saved keeps the generic name (shownTitle, scrub.ts).
 *
 * Pure (events and profile passed in), so look.check.mjs runs it directly.
 */

const WD_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_MS = 86_400_000;
/** How far find_events reaches: something named in a sentence can be months out. */
export const MAX_LOOKUP_DAYS = 120;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** The name saved with a card or clash text: its own title for Find Time's blocks, never a Google one. */
export const shownTitle = (e: Pick<ApiEvent, 'origin' | 'title'>) => (isImported(e.origin) ? 'a calendar event' : e.title || 'a block');

export type FreeDay = {
  date: string;
  /** the hours counted: your working hours that day, or the personal window on a day off */
  window: string;
  working_day: boolean;
  /** a public holiday: not a working day, whatever the weekday. Its name when Google gave one */
  public_holiday?: string | true;
  free_min: number;
  /** the biggest single gap: what decides whether something fits */
  longest_gap_min: number;
  gaps: string[];
  busy_blocks: number;
};

/**
 * Free time on `days` days from `date`: the day's window (working hours, or the
 * personal window on a day off — a public holiday is one), minus what blocks
 * time, from now on for today.
 */
export function freeTime(events: CalEvent[], profile: AgentProfile, nowISO: string, date: string, days = 1): FreeDay[] {
  const out: FreeDay[] = [];
  const holidays = holidaysIn(events);
  for (let i = 0; i < Math.min(7, Math.max(1, days)); i++) {
    const day = new Date(Date.parse(`${date}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
    if (day < nowISO.slice(0, 10)) continue;
    const holiday = holidays.find((h) => h.date === day);
    const hours = holiday ? null : profile.workHours[WD_KEYS[new Date(`${day}T00:00:00Z`).getUTCDay()]];
    const win = hours ?? dayWindowFor(profile, 'personal');
    let lo = win.start * 60;
    const hi = win.end * 60;
    if (day === nowISO.slice(0, 10)) lo = Math.max(lo, minOf(nowISO));
    const busy = events
      .filter((e) => blocksTime(e) && !e.allDay && e.start.slice(0, 10) <= day && e.end.slice(0, 10) >= day)
      .map((e) => [e.start.slice(0, 10) < day ? 0 : minOf(e.start), e.end.slice(0, 10) > day ? 1440 : minOf(e.end)] as const)
      .filter(([s, t]) => t > lo && s < hi)
      .sort((a, b) => a[0] - b[0]);
    const gaps: string[] = [];
    let free = 0;
    let longest = 0;
    let cur = lo;
    for (const [s, t] of busy) {
      if (s > cur) {
        gaps.push(`${hhmm(cur)}–${hhmm(Math.min(s, hi))}`);
        free += Math.min(s, hi) - cur;
        longest = Math.max(longest, Math.min(s, hi) - cur);
      }
      cur = Math.max(cur, t);
    }
    if (hi > cur) {
      gaps.push(`${hhmm(cur)}–${hhmm(hi)}`);
      free += hi - cur;
      longest = Math.max(longest, hi - cur);
    }
    out.push({ date: day, window: `${hhmm(win.start * 60)}–${hhmm(hi)}`, working_day: Boolean(hours), ...(holiday ? { public_holiday: holiday.name ?? true } : {}), free_min: Math.max(0, free), longest_gap_min: longest, gaps, busy_blocks: busy.length });
  }
  return out;
}

/** An all-day event ends at the midnight after its last day. */
const lastDay = (e: Pick<ApiEvent, 'allDay' | 'end'>) =>
  (e.allDay && e.end.slice(11, 16) === '00:00' ? new Date(Date.parse(e.end) - DAY_MS).toISOString() : e.end).slice(0, 10);

export type FoundEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  /** last day, for something that runs over several */
  end_date: string;
  end: string;
  all_day: boolean;
  /** the calendar it is on, by name */
  calendar?: string;
  /** on a public-holiday calendar: a day off for planning */
  public_holiday?: true;
  /** may Find Time move or delete it? and if not, why */
  editable: boolean;
  why_locked?: string;
};

/** Why an event can't be moved or deleted from here, or null if it can. */
export function lockReason(e: ApiEvent): string | null {
  if (e.allDay) return 'it is an all-day event — change it in the calendar';
  if (e.rrule) return 'it repeats — change the series in the calendar';
  if (isImported(e.origin) && !e.googleEditable) return 'it is a Google event with guests, repeating, or organised by someone else — change it in Google Calendar';
  return null;
}

/**
 * Events whose title contains `match` (every word, any order; '' = all) from
 * `from` for `days` days, counting one already running on `from` (a course
 * that started last week). All-day ones count: a program or a trip often is one.
 */
export function findEvents(events: CalEvent[], match: string, from: string, days = 7): FoundEvent[] {
  const words = match.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + Math.min(MAX_LOOKUP_DAYS, Math.max(1, days)) * DAY_MS).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return events
    .filter((e) => lastDay(e) >= from && e.start.slice(0, 10) < to)
    .filter((e) => words.every((w) => e.title.toLowerCase().includes(w)))
    .filter((e) => {
      // An own repeat is expanded per day with one id: list it once, as its first day here.
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    })
    .slice(0, 10)
    .map((e) => {
      const lock = lockReason(e);
      return {
        id: e.id,
        title: e.title || 'a block',
        date: e.start.slice(0, 10),
        start: e.start.slice(11, 16),
        end_date: lastDay(e),
        end: e.end.slice(11, 16),
        all_day: Boolean(e.allDay),
        ...(e.holiday ? { public_holiday: true as const } : {}),
        editable: !lock,
        ...(lock ? { why_locked: lock } : {}),
      };
    });
}
