import type { ApiEvent } from '@/lib/api-types';
import { isImported } from '@/lib/synced-fields';
import { dayWindowFor } from '../clarify';
import { blocksTime } from '../find-time';
import type { AgentProfile } from '../preferences';

/**
 * The model's read-only lookups. It asks; the engine counts. Nothing here
 * writes, and nothing here sends a Google event's title to the model: those
 * come back as "a calendar event" (privacy policy, "AI features").
 *
 * Pure (events and profile passed in), so look.check.mjs runs it directly.
 */

const WD_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const DAY_MS = 86_400_000;
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));

/** What the model may call an event: its own title for Find Time's blocks, never a Google one. */
export const shownTitle = (e: Pick<ApiEvent, 'origin' | 'title'>) => (isImported(e.origin) ? 'a calendar event' : e.title || 'a block');

export type FreeDay = {
  date: string;
  /** the hours counted: your working hours that day, or the personal window on a day off */
  window: string;
  working_day: boolean;
  free_min: number;
  gaps: string[];
  busy_blocks: number;
};

/**
 * Free time on `days` days from `date`: the day's window (working hours, or the
 * personal window on a day off), minus what blocks time, from now on for today.
 */
export function freeTime(events: ApiEvent[], profile: AgentProfile, nowISO: string, date: string, days = 1): FreeDay[] {
  const out: FreeDay[] = [];
  for (let i = 0; i < Math.min(7, Math.max(1, days)); i++) {
    const day = new Date(Date.parse(`${date}T00:00:00Z`) + i * DAY_MS).toISOString().slice(0, 10);
    if (day < nowISO.slice(0, 10)) continue;
    const hours = profile.workHours[WD_KEYS[new Date(`${day}T00:00:00Z`).getUTCDay()]];
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
    let cur = lo;
    for (const [s, t] of busy) {
      if (s > cur) {
        gaps.push(`${hhmm(cur)}–${hhmm(Math.min(s, hi))}`);
        free += Math.min(s, hi) - cur;
      }
      cur = Math.max(cur, t);
    }
    if (hi > cur) {
      gaps.push(`${hhmm(cur)}–${hhmm(hi)}`);
      free += hi - cur;
    }
    out.push({ date: day, window: `${hhmm(win.start * 60)}–${hhmm(hi)}`, working_day: Boolean(hours), free_min: Math.max(0, free), gaps, busy_blocks: busy.length });
  }
  return out;
}

export type FoundEvent = {
  id: string;
  title: string;
  date: string;
  start: string;
  end: string;
  /** may Find Time move or delete it? and if not, why */
  editable: boolean;
  why_locked?: string;
};

/** Why an event can't be moved or deleted from here, or null if it can. */
export function lockReason(e: ApiEvent): string | null {
  if (e.rrule) return 'it repeats — change the series in the calendar';
  if (isImported(e.origin) && !e.googleEditable) return 'it is a Google event with guests, repeating, or organised by someone else — change it in Google Calendar';
  return null;
}

/**
 * Events whose title contains `match` (every word, any order; '' = all) from
 * `from` for `days` days. Titles are matched here, in code — including live
 * Google titles — but only Find Time's own titles go back to the model.
 */
export function findEvents(events: ApiEvent[], match: string, from: string, days = 7): FoundEvent[] {
  const words = match.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const to = new Date(Date.parse(`${from}T00:00:00Z`) + Math.min(21, Math.max(1, days)) * DAY_MS).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return events
    .filter((e) => !e.allDay && e.start.slice(0, 10) >= from && e.start.slice(0, 10) < to)
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
        title: shownTitle(e),
        date: e.start.slice(0, 10),
        start: e.start.slice(11, 16),
        end: e.end.slice(11, 16),
        editable: !lock,
        ...(lock ? { why_locked: lock } : {}),
      };
    });
}
