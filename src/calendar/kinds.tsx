import type { TextStyle, ViewStyle } from 'react-native';

import type { IconName } from './Icon';
import { HATCH, N, SHADOW } from './tokens';
import type { CalEvent, EventKind } from './types';

/**
 * What a block *is*, as one table every surface reads (docs/calendar-spec.md §3.1).
 *
 * There is no colour channel in the Nexus calendar, so each kind is told apart
 * by fill, edge and glyph alone — which also means the taxonomy survives
 * greyscale, print and a colour-vision deficiency:
 *
 *   focus     ink, solid           the heaviest thing on the grid
 *   event     white, sm shadow     a commitment, usually with people
 *   task      white, hairline      yours to close (checkbox glyph)
 *   routine   hatched grey         backdrop, repeats
 *   break     hatched grey, quiet  backdrop, recovery
 *   ai        white, dashed        not real until approved
 *
 * The kinds are not invented for the UI — each maps onto a real column of
 * `calendar_events` (see types.ts).
 */

export type KindSpec = {
  key: EventKind;
  /** singular noun: legend, detail popover, quick-create */
  label: string;
  /** one line explaining what the kind means */
  blurb: string;
  icon: IconName;
};

export const KINDS: Record<EventKind, KindSpec> = {
  focus: {
    key: 'focus',
    label: 'Focus',
    blurb: 'Protected deep work. Find Time will never move it.',
    icon: 'lock',
  },
  event: {
    key: 'event',
    label: 'Event',
    blurb: 'A commitment at a fixed time, usually with other people.',
    icon: 'calendar-mark',
  },
  task: {
    key: 'task',
    label: 'Task',
    blurb: 'Work you time-boxed for yourself.',
    icon: 'check',
  },
  routine: {
    key: 'routine',
    label: 'Routine',
    blurb: 'Repeats on a schedule. Deliberately quiet — it is the backdrop.',
    icon: 'refresh-plain',
  },
  break: {
    key: 'break',
    label: 'Break',
    blurb: 'Recovery time, held open on purpose.',
    icon: 'cup',
  },
  ai: {
    key: 'ai',
    label: 'Proposed',
    blurb: 'Suggested by Find Time. Nothing is booked until you approve it.',
    icon: 'magic',
  },
};

/** Legend / filter order: heaviest commitment first, backdrop, then proposals. */
export const KIND_KEYS: EventKind[] = ['focus', 'event', 'task', 'routine', 'break', 'ai'];

/** The kinds a person can pick when making or changing a block. */
export const PICKABLE: EventKind[] = ['event', 'focus', 'task', 'routine', 'break'];

export const specOf = (ev: Pick<CalEvent, 'kind'>): KindSpec => KINDS[ev.kind] ?? KINDS.event;

/** Everything a surface needs to draw one kind. */
export type Paint = {
  spec: KindSpec;
  box: ViewStyle[];
  title: TextStyle;
  meta: TextStyle;
  /** colour for the kind's glyph */
  glyph: string;
  /** dark tile: the selection ring and the drag label flip to suit */
  dark: boolean;
};

const BOX: Record<EventKind, ViewStyle[]> = {
  focus: [{ backgroundColor: N.ink }],
  event: [{ backgroundColor: N.surface }, SHADOW.sm],
  task: [{ backgroundColor: N.surface, borderWidth: 1, borderColor: N.lineStrong }],
  routine: [{ backgroundColor: N.sunken, borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' }, HATCH.tile],
  break: [{ backgroundColor: N.sunken }, HATCH.tile],
  ai: [{ backgroundColor: N.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: N.accent }],
};

const INK: Record<EventKind, { title: string; meta: string; glyph: string }> = {
  focus: { title: N.onInk, meta: N.onInkMuted, glyph: N.onInkMuted },
  event: { title: N.ink, meta: N.muted, glyph: N.faint },
  task: { title: N.ink2, meta: N.muted, glyph: N.ink2 },
  routine: { title: N.ink2, meta: N.muted, glyph: N.faint },
  break: { title: N.muted, meta: N.faint, glyph: N.faint },
  ai: { title: N.ink, meta: N.accentInk, glyph: N.accent },
};

/**
 * Resolve one event to its drawing. Grid tiles, the all-day lane, the legend
 * swatches and the detail popover all go through here, so a kind can never
 * look like one thing in one place and another elsewhere.
 */
export function paint(ev: Pick<CalEvent, 'kind'>): Paint {
  const spec = specOf(ev);
  const ink = INK[spec.key];
  return {
    spec,
    box: BOX[spec.key],
    title: { color: ink.title },
    meta: { color: ink.meta },
    glyph: ink.glyph,
    dark: spec.key === 'focus',
  };
}

/** Meta line under a tile's title: what the shape means, in words. */
export function metaLine(ev: CalEvent, catLabel: string, times: string): string {
  if (ev.kind === 'ai') return `${times} · proposed · needs OK`;
  if (ev.kind === 'focus') return `${times} · protected`;
  return `${times} · ${catLabel.toLowerCase()}`;
}
