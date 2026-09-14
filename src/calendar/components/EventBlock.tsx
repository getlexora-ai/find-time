import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { KindGlyph, KindRail, paint } from '../kinds';
import { blockGeometry } from '../layout';
import type { PointAnchor } from '../state';
import { C, R, w } from '../tokens';
import type { LaidBlock } from '../types';
import { Press, Txt } from '../ui';

const at = (e: GestureResponderEvent): PointAnchor => ({
  x: e.nativeEvent.pageX,
  y: e.nativeEvent.pageY,
});

/**
 * Week / day time-grid block.
 *
 * One code path for all six kinds — the kind decides the left rail, the fill
 * weight and the glyph, and `paint()` in kinds.tsx is the only thing that
 * knows how. This used to be three hand-written branches (ai / break / the
 * rest) where everything that was not a proposal or a break came out as the
 * same tinted rectangle, so a task, a routine and a real meeting were
 * indistinguishable in the grid.
 *
 * Blocks under 46px tall drop the meta line; under 30px they drop the glyph
 * too, leaving the rail as the only kind signal — which is exactly why the
 * rail carries three distinct silhouettes rather than three colours.
 */
export function EventBlock({
  it,
  dayStart,
  onPress,
}: {
  it: LaidBlock;
  dayStart?: number;
  onPress: (anchor: PointAnchor) => void;
}) {
  const { top, height, widthPct, leftPct, tight } = blockGeometry(it, dayStart);
  const ev = it.ev;
  const p = paint(ev, ev.conflict);
  const cramped = height < 30;

  return (
    <View
      style={[styles.wrap, { top, height, left: `${leftPct}%` as const, width: `${widthPct}%` as const }]}
      pointerEvents="box-none">
      <Press
        onPress={(e) => onPress(at(e))}
        hoverBg={w(0.08)}
        style={[
          styles.block,
          { backgroundColor: p.fill, borderColor: p.border, borderStyle: p.borderStyle },
          ev.conflict && styles.clash,
          p.spec.ring ? { borderColor: p.spec.ring } : null,
        ]}>
        <KindRail p={p} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            {!cramped && <KindGlyph p={p} size={11} />}
            <Txt numberOfLines={1} style={[styles.title, { color: p.title }]}>
              {ev.title}
            </Txt>
            {ev.conflict && <Icon name="triangle" size={11} color={C.orange} />}
          </View>
          {!tight && (
            <Txt numberOfLines={1} style={[styles.meta, { color: p.meta }]}>
              {ev.start}–{ev.end}
              {ev.kind === 'ai' ? ' · tap to accept' : ev.project ? ` · ${ev.project}` : ''}
            </Txt>
          )}
        </View>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  block: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    marginHorizontal: 2,
    overflow: 'hidden',
    borderRadius: R.md,
    borderWidth: 1,
    padding: 5,
  },
  clash: { borderColor: C.orange },
  body: { flex: 1, minWidth: 0, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  meta: { marginTop: 2, fontSize: 10, lineHeight: 14 },
});
