import type { CalEvent, EventKind } from './types';

/**
 * Two views, not three. Month was a density map with the times stripped out —
 * it could tell you Tuesday was busy and never what with.
 */
export type ViewKind = 'week' | 'day';

/** Pointer location of the tap that opened something — anchors desktop popovers. */
export type PointAnchor = { x: number; y: number };

export type CalState = {
  view: ViewKind;
  cursor: Date;
  selected: Date;
  loading: boolean;
};

/** What the full sheet opens with when it is not editing an existing block. */
export type ComposePreset = {
  /** HH:MM; with `at`, fixes the length */
  end?: string;
  kind?: EventKind;
  title?: string;
};

/** A slot the person picked on the grid, for quick-create. */
export type Slot = { date: string; start: string; end: string; anchor: PointAnchor | null };

/** Something an action toast can undo. */
export type ToastAction = { label: string; run: () => void };

/** Everything a surface needs to talk back to the screen. */
export type CalActions = {
  setView: (v: ViewKind) => void;
  step: (dir: -1 | 1) => void;
  goToday: () => void;
  /** pick a date — moves the cursor and the selection, never the view */
  pick: (dateIso: string) => void;
  /** `autoPlace` opens the sheet with "Let AI place it" already on, which is
   *  what turns Reschedule into a real move rather than a second Edit. */
  openCompose: (
    id: number | null,
    dateIso?: string,
    at?: string,
    autoPlace?: boolean,
    preset?: ComposePreset,
  ) => void;
  /** click or drag on empty grid → the small create popover at that slot */
  openQuick: (slot: Slot) => void;
  openEvent: (id: number, anchor?: PointAnchor) => void;
  /** a short list of events (a "+2" chip, "1 after 22:00") */
  openList: (title: string, events: CalEvent[], anchor?: PointAnchor) => void;
  openAI: (prefill?: string) => void;
  openPicker: () => void;
  toast: (msg: string, action?: ToastAction) => void;
};
