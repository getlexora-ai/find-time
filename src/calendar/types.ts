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
};

/** A laid-out block: source event + its column slot within an overlap cluster. */
export type LaidBlock = {
  ev: CalEvent;
  s: number; // start minutes
  t: number; // end minutes
  col: number;
  cols: number;
};
