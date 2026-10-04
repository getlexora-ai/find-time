import type { CatKey } from './tokens';

/**
 * The calendar's own event shape — ported from calendar.html's `E(...)` factory.
 * Distinct from `src/lib/types.ts` (which the Plan tab uses); this module does not
 * touch that one.
 */
/**
 * What a block is. Six values, each with its own silhouette — see `kinds.tsx`,
 * which is the single place that decides how a kind looks.
 *
 * These are not invented for the UI; each maps onto a real column that
 * `calendar_events` already has (db/003_calendar_events.sql):
 *
 *   event    item_type 'event'
 *   task     item_type 'task'
 *   break    item_type 'break'
 *   focus    item_type 'deepwork' / flexibility 'protected'
 *   routine  rrule is not null — a block that repeats
 *   ai       origin 'ai' or is_draft
 */
export type EventKind = 'event' | 'task' | 'routine' | 'focus' | 'ai' | 'break';

export type CalEvent = {
  id: number;
  /** yyyy-mm-dd */
  date: string;
  /** HH:MM 24h */
  start: string;
  /** HH:MM 24h */
  end: string;
  title: string;
  cat: CatKey;
  project: string;
  kind: EventKind;
  notes: string;
  /** RFC 5545 rule body, no "RRULE:" prefix. Present ⇒ this is a routine. */
  rrule?: string;
  /** part of the deliberate Wed 11:00 double-book */
  conflict?: boolean;
  /** AI may move this block */
  flexible?: boolean;
  /**
   * Synced from Google Calendar. Google owns its title, times, notes and
   * whether it exists — sync overwrites them and nothing is pushed back — so
   * the calendar shows those read-only (src/lib/synced-fields.ts).
   */
  imported?: boolean;
  /** Imported, and Google lets you move, resize and delete it from here; the change goes to Google first. */
  googleEditable?: boolean;
  /** Source calendar (calendars.id). Absent = Find Time's own block. */
  calendarId?: string;
  /** Google all-day event — drawn in the all-day lane, never on the hours. */
  allDay?: boolean;
  /**
   * yyyy-mm-dd the event ends on, only when that is not `date`: an overnight
   * block (22:00 → 02:00) or a multi-day all-day event. For all-day events it
   * is exclusive (Google's convention); for timed ones it is the real end day.
   */
  endDate?: string;
};

/** A laid-out block: source event + its column slot within an overlap cluster. */
export type LaidBlock = {
  ev: CalEvent;
  /** drawn start / end, minutes of day, already clipped to your hours */
  s: number;
  t: number;
  col: number;
  cols: number;
  /** the event really starts above the drawn top (earlier hour or earlier day) */
  cutTop: boolean;
  /** the event really ends below the drawn bottom */
  cutBottom: boolean;
  /** real start / end minute on this day; null = it runs over midnight */
  trueStart: number | null;
  trueEnd: number | null;
};
