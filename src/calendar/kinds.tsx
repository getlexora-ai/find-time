import { StyleSheet, View } from 'react-native';

import { Icon, type IconName } from './Icon';
import { CATS, C, R, rgba, w } from './tokens';
import type { CalEvent, EventKind } from './types';

/**
 * What a block *is*, as one table every surface reads.
 *
 * The calendar carries two orthogonal taxonomies and they were previously
 * collapsed into one flat "tinted rectangle" everywhere, so a standup, a
 * to-do and two hours of protected deep work were indistinguishable:
 *
 *   kind      → the SHAPE. Edge treatment, fill weight, glyph. Six values.
 *   category  → the HUE. Deep work / Design / Research / Meetings / Admin.
 *
 * Keeping them on separate channels is the whole point: you can read "this is
 * a routine" from the edge without decoding the colour, and "this is design
 * work" from the colour without reading the label. Each kind also differs in
 * *shape*, not only in colour, so the distinction survives greyscale, a
 * colour-vision deficiency, and a 22px-tall block in a packed week.
 */

/** Edge treatment — the primary, colour-independent channel. */
export type EdgeStyle =
  /** solid 3px rail: a real commitment */
  | 'rail'
  /** split rail with a gap: unfinished, yours to close */
  | 'split'
  /** dotted rail: repeats, background rhythm */
  | 'dotted'
  /** no rail; the whole outline is dashed: not yet real */
  | 'dashed';

export type KindSpec = {
  key: EventKind;
  /** singular noun shown in the detail popover and the legend */
  label: string;
  /** one line explaining what the kind means, for the legend */
  blurb: string;
  icon: IconName;
  edge: EdgeStyle;
  /**
   * How loudly it fills, 0–3. This is the second channel: a routine should sink
   * into the grid, a protected focus block should be the heaviest thing on it.
   */
  weight: 0 | 1 | 2 | 3;
  /** Fixed colour, for kinds whose meaning is not the category's. */
  accent?: string;
  /** Ring drawn around the whole block, on top of the kind's own edge. */
  ring?: string;
};

/** Kinds whose colour is the kind, not the category. */
const STEEL = C.steel;

export const KINDS: Record<EventKind, KindSpec> = {
  event: {
    key: 'event',
    label: 'Event',
    blurb: 'A commitment at a fixed time — usually with other people.',
    icon: 'calendar-mark',
    edge: 'rail',
    weight: 2,
  },
  task: {
    key: 'task',
    label: 'Task',
    blurb: 'Work you time-boxed for yourself. Hollow until it is done.',
    icon: 'check',
    edge: 'split',
    weight: 1,
  },
  routine: {
    key: 'routine',
    label: 'Routine',
    blurb: 'Repeats on a schedule. Deliberately quiet — it is the backdrop.',
    icon: 'refresh-plain',
    edge: 'dotted',
    weight: 0,
    accent: STEEL,
  },
  focus: {
    key: 'focus',
    label: 'Focus',
    blurb: 'Protected deep work. Find time will never move it.',
    icon: 'shield',
    edge: 'rail',
    weight: 3,
    ring: 'rgba(204,255,0,0.45)',
  },
  ai: {
    key: 'ai',
    label: 'Suggested',
    blurb: 'Proposed by Find time. Nothing is booked until you accept it.',
    icon: 'magic',
    edge: 'dashed',
    weight: 1,
    accent: C.lime,
  },
  break: {
    key: 'break',
    label: 'Break',
    blurb: 'Recovery time, held open on purpose.',
    icon: 'cup',
    edge: 'dotted',
    weight: 0,
    accent: STEEL,
  },
};

/** Legend / filter order: loudest commitment first, backdrop last. */
export const KIND_KEYS: EventKind[] = ['event', 'task', 'focus', 'routine', 'break', 'ai'];

export const specOf = (ev: Pick<CalEvent, 'kind'>): KindSpec => KINDS[ev.kind] ?? KINDS.event;

/** Fill alpha per weight — the second channel, tuned against the dark panels. */
const FILL: Record<KindSpec['weight'], number> = { 0: 0.05, 1: 0.06, 2: 0.14, 3: 0.22 };
/** Border alpha per weight. Task is the outlier: hollow fill, loud outline. */
const EDGE_ALPHA: Record<KindSpec['weight'], number> = { 0: 0.28, 1: 0.55, 2: 0.42, 3: 0.6 };

export type Paint = {
  spec: KindSpec;
  /** the solid colour the kind's marks are drawn in */
  tint: string;
  /** block / card background */
  fill: string;
  /** block / card border colour */
  border: string;
  borderStyle: 'solid' | 'dashed' | 'dotted';
  /** title ink */
  title: string;
  /** secondary ink (times, project, meta) */
  meta: string;
};

/**
 * Resolve one event to the colours every surface draws it with. Week blocks,
 * month chips and agenda cards all go through here, so a kind can never look
 * like one thing in the grid and another in the list.
 */
export function paint(ev: CalEvent, clash = false): Paint {
  const spec = specOf(ev);
  const tint = spec.accent ?? CATS[ev.cat].color;
  const quiet = spec.weight === 0;

  return {
    spec,
    tint,
    fill: quiet ? w(FILL[0]) : rgba(tint, FILL[spec.weight]),
    border: clash ? C.orange : quiet ? w(EDGE_ALPHA[0]) : rgba(tint, EDGE_ALPHA[spec.weight]),
    borderStyle: spec.edge === 'dashed' ? 'dashed' : spec.edge === 'dotted' ? 'dotted' : 'solid',
    title: quiet ? w(0.62) : spec.key === 'ai' ? C.lime : '#fff',
    meta: quiet ? w(0.34) : spec.key === 'ai' ? rgba(C.lime, 0.7) : w(0.5),
  };
}

/**
 * The left edge. `rail` / `split` / `dotted` render a 3px column; `dashed`
 * renders nothing because that kind's signal is the outline around the whole
 * block. Three visually distinct silhouettes at any block height.
 */
export function KindRail({ p, radius = R.md }: { p: Paint; radius?: number }) {
  if (p.spec.edge === 'dashed') return null;

  if (p.spec.edge === 'dotted') {
    return (
      <View style={[styles.rail, { borderRadius: radius }]}>
        {Array.from({ length: 24 }, (_, i) => (
          <View key={i} style={[styles.railDot, { backgroundColor: p.tint }]} />
        ))}
      </View>
    );
  }

  if (p.spec.edge === 'split') {
    return (
      <View style={[styles.rail, { borderRadius: radius }]}>
        <View style={[styles.railSeg, { backgroundColor: p.tint }]} />
        <View style={styles.railGap} />
        <View style={[styles.railSeg, { backgroundColor: rgba(p.tint, 0.45) }]} />
      </View>
    );
  }

  return <View style={[styles.rail, { backgroundColor: p.tint, borderRadius: radius }]} />;
}

/** The kind's glyph. The third, redundant channel — shape, weight, then icon. */
export function KindGlyph({ p, size = 12 }: { p: Paint; size?: number }) {
  return <Icon name={p.spec.icon} size={size} color={p.tint} />;
}

const styles = StyleSheet.create({
  rail: { width: 3, alignSelf: 'stretch', overflow: 'hidden' },
  railDot: { height: 2, width: 3, marginBottom: 3 },
  railSeg: { flex: 1, width: 3 },
  railGap: { height: 5 },
});
