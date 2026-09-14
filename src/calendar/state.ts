import type { CalEvent } from './types';

/**
 * Two views, not three. Month was a density map with the times stripped out —
 * it could tell you Tuesday was busy and never what with, so every path through
 * it ended in week or day anyway. The mini-month in the rail is the part that
 * was actually doing work (jump to a date) and it stays.
 */
export type ViewKind = 'week' | 'day';

/** Pointer location of the tap that opened an event — anchors the desktop popover. */
export type PointAnchor = { x: number; y: number };

/** state = { view, cursor, selected, loading } — the reference's nav model (spec §3). */
export type CalState = {
  view: ViewKind;
  cursor: Date;
  selected: Date;
  loading: boolean;
};

/** Everything a surface needs to talk back to the screen. */
export type CalActions = {
  setView: (v: ViewKind) => void;
  step: (dir: -1 | 1) => void;
  goToday: () => void;
  /** pick a date — moves the cursor and the selection, never the view */
  pick: (dateIso: string) => void;
  /** `autoPlace` opens the sheet with "Let AI place it" already on, which is
   *  what turns Reschedule into a real move rather than a second Edit. */
  openCompose: (id: number | null, dateIso?: string, at?: string, autoPlace?: boolean) => void;
  openEvent: (id: number, anchor?: PointAnchor) => void;
  openAI: (prefill?: string) => void;
  openPicker: () => void;
  toast: (msg: string) => void;
};

export const eventsOn = (list: CalEvent[], dateIso: string) =>
  list.filter((e) => e.date === dateIso);
