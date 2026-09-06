import type { CalEvent } from './types';

export type ViewKind = 'month' | 'week' | 'day';

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
  /** pick a date; in month view on desktop this also drops into day view */
  pick: (dateIso: string, fromMonthTile?: boolean) => void;
  openCompose: (id: number | null, dateIso?: string, at?: string) => void;
  openEvent: (id: number, anchor?: PointAnchor) => void;
  openAI: (prefill?: string) => void;
  openPicker: () => void;
  toast: (msg: string) => void;
};

export const eventsOn = (list: CalEvent[], dateIso: string) =>
  list.filter((e) => e.date === dateIso);
