import type { TextStyle, ViewStyle } from 'react-native';

import type { IconName } from './Icon';
import { BREAK_COLOR, CATS, type CatKey, HATCH, N, SHADOW } from './tokens';
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
  /** drawn as the solid (focus, routine, break) */
  solid: boolean;
};

/** The kinds drawn as a solid category colour (they used to be black / grey). */
const SOLID = new Set<EventKind>(['focus', 'routine', 'break']);

const DEFAULT_CAT: Record<EventKind, CatKey> = {
  focus: 'deep',
  event: 'sync',
  task: 'admin',
  routine: 'admin',
  break: 'admin',
  ai: 'deep',
};

function boxOf(kind: EventKind, color: string): ViewStyle[] {
  switch (kind) {
    case 'focus':
      return [{ backgroundColor: color }];
    case 'routine':
      return [{ backgroundColor: color }, HATCH.onSolid];
    case 'break':
      return [{ backgroundColor: BREAK_COLOR }];
    case 'event':
      return [{ backgroundColor: N.surface }, SHADOW.sm];
    case 'task':
      return [{ backgroundColor: N.surface, borderWidth: 1, borderColor: N.lineStrong }];
    case 'ai':
      return [{ backgroundColor: N.surface, borderWidth: 1, borderStyle: 'dashed', borderColor: N.accent }];
  }
}

const WHITE_INK: Record<'event' | 'task' | 'ai', { title: string; meta: string; glyph: string }> = {
  event: { title: N.ink, meta: N.muted, glyph: N.faint },
  task: { title: N.ink2, meta: N.muted, glyph: N.ink2 },
  ai: { title: N.ink, meta: N.accentInk, glyph: N.accent },
};
// Meta is full white: at 78% the 10px mono line was 3.7–4.1:1 on the solids.
const SOLID_INK = { title: N.onInk, meta: N.onInk, glyph: N.onSolidSoft };

/**
 * Resolve one event to its drawing. Grid tiles, the all-day lane, the legend
 * swatches and the detail popover all go through here, so a kind can never
 * look like one thing in one place and another elsewhere.
 */
export function paint(ev: Pick<CalEvent, 'kind'> & { cat?: CatKey }): Paint {
  const spec = specOf(ev);
  const cat = ev.cat ?? DEFAULT_CAT[spec.key];
  const color = spec.key === 'break' ? BREAK_COLOR : CATS[cat].color;
  const solid = SOLID.has(spec.key);
  const ink = solid ? SOLID_INK : WHITE_INK[spec.key as 'event' | 'task' | 'ai'];
  return {
    spec,
    box: boxOf(spec.key, color),
    title: { color: ink.title },
    meta: { color: ink.meta },
    glyph: ink.glyph,
    dark: solid,
    color,
    solid,
  };
}

/** Meta line under a tile's title: what the shape means, in words. */
export function metaLine(ev: CalEvent, catLabel: string, times: string): string {
  if (ev.kind === 'ai') return `${times} · proposed · needs OK`;
  if (ev.kind === 'focus') return `${times} · protected`;
  return `${times} · ${catLabel.toLowerCase()}`;
}
