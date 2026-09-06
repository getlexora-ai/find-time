import type { CatKey } from './tokens';

/**
 * The calendar's own event shape — ported from calendar.html's `E(...)` factory.
 * Distinct from `src/lib/types.ts` (which the Plan tab uses); this module does not
 * touch that one.
 */
export type EventKind = 'event' | 'focus' | 'ai' | 'break';

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
