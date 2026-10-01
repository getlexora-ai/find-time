import type { TextStyle, ViewStyle } from 'react-native';

import type { IconName } from './Icon';
import { BREAK_COLOR, CATS, type CatKey, N, tint, TINT } from './tokens';
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
  /** the category colour */
  color: string;
  /** drawn as a solid fill (none are, in the quiet calendar; kept for the selected tile) */
  solid: boolean;
};

const DEFAULT_CAT: Record<EventKind, CatKey> = {
  focus: 'deep',
  event: 'sync',
  task: 'admin',
  routine: 'admin',
  break: 'admin',
  ai: 'deep',
};

/**
 * Quiet calendar (2026-10-01): one soft tint per category, ink text. Colour
 * says what it is; the kind only changes the edge — a task is outlined, a
 * proposal is dashed and white because it is not booked yet. The solid
 * category colour is kept for the one tile you have selected.
 */
function boxOf(kind: EventKind, color: string): ViewStyle[] {
  switch (kind) {
    case 'task':
      return [{ backgroundColor: N.surface, borderWidth: 1, borderColor: tint(color, 0.45) }];
    case 'ai':
      return [{ backgroundColor: N.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: N.accent }];
    default:
      return [{ backgroundColor: tint(color, TINT) }];
  }
}

/**
 * Resolve one event to its drawing. Grid tiles, the all-day lane, the legend
 * swatches and the detail popover all go through here, so a kind can never
 * look like one thing in one place and another elsewhere.
 */
export function paint(ev: Pick<CalEvent, 'kind'> & { cat?: CatKey }): Paint {
  const spec = specOf(ev);
  const cat = ev.cat ?? DEFAULT_CAT[spec.key];
  const color = spec.key === 'break' ? BREAK_COLOR : CATS[cat].color;
  return {
    spec,
    box: boxOf(spec.key, color),
    title: { color: N.ink },
    meta: { color: spec.key === 'ai' ? N.accentInk : N.ink2 },
    glyph: spec.key === 'ai' ? N.accent : N.ink2,
    dark: false,
    color,
    solid: false,
  };
}

/** Meta line under a tile's title: what the shape means, in words. */
export function metaLine(ev: CalEvent, catLabel: string, times: string): string {
  if (ev.kind === 'ai') return `${times} · proposed · needs OK`;
  if (ev.kind === 'focus') return `${times} · protected`;
  return `${times} · ${catLabel.toLowerCase()}`;
}
