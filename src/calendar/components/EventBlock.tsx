import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { KindGlyph, KindRail, paint } from '../kinds';
import { blockGeometry } from '../layout';
import type { PointAnchor } from '../state';
import { CATS, C, R, w } from '../tokens';
import type { LaidBlock } from '../types';
import { MONO, Press, Txt } from '../ui';

const at = (e: GestureResponderEvent): PointAnchor => ({
  x: e.nativeEvent.pageX,
  y: e.nativeEvent.pageY,
});

/**
 * Week / day time-grid block.
 *
 * One code path for all six kinds — the kind decides the left rail, the fill
 * weight and the glyph, and `paint()` in kinds.tsx is the only thing that
 * knows how.
 *
 * Three height bands, because a block has to stay legible at 22px and use the
 * room at 120px:
 *
 *   < 30px  title only, no glyph — the rail is the sole kind signal
 *   < 46px  title + glyph
 *   ≥ 58px  title wraps to two lines, so a long one reads instead of eliding
 *
 * The meta line names the category rather than the project. The category is
 * what the block's hue encodes, so printing it is what teaches the colour code:
 * after a day of reading "· Deep work" next to the same lime, the legend in the
 * rail stops being necessary.
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
  const tall = height >= 58;

  return (
    <View
      style={[styles.wrap, { top, height, left: `${leftPct}%` as const, width: `${widthPct}%` as const }]}
      pointerEvents="box-none">
      <Press
        onPress={(e) => onPress(at(e))}
        hoverBg={w(0.08)}
        hoverTransform={{ translateY: -1 }}
        style={[
          styles.block,
          { backgroundColor: p.fill, borderColor: p.border, borderStyle: p.borderStyle },
          // A task is the one kind you are meant to close, so it gets its own
          // silhouette: softer corners than the rectangles around it, readable
          // as "chip" at a glance without relying on the colour or the glyph.
          ev.kind === 'task' && styles.task,
          ev.conflict && styles.clash,
          p.spec.ring ? { borderColor: p.spec.ring } : null,
        ]}>
        <KindRail p={p} radius={ev.kind === 'task' ? R.lg : R.md} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            {!cramped && <KindGlyph p={p} size={11} />}
            <Txt numberOfLines={tall ? 2 : 1} style={[styles.title, { color: p.title }]}>
              {ev.title}
            </Txt>
            {ev.conflict && <Icon name="triangle" size={11} color={C.orange} />}
          </View>
          {!tight && (
            <Txt numberOfLines={1} style={[styles.meta, { color: p.meta }]}>
              {ev.start}–{ev.end}
              {ev.kind === 'ai' ? ' · tap to accept' : ` · ${CATS[ev.cat].label}`}
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
    // 3px each side, so neighbouring columns never touch and a packed day still
    // reads as separate tiles rather than one striped mass.
    marginHorizontal: 3,
    overflow: 'hidden',
    borderRadius: R.md,
    borderWidth: 1,
    padding: 5,
  },
  task: { borderRadius: R.lg },
  clash: { borderColor: C.orange },
  body: { flex: 1, minWidth: 0, justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  title: { flex: 1, fontSize: 11, lineHeight: 15, fontWeight: '500' },
  // Mono on the meta line only: it is all times and short labels, and the
  // tabular figures stop 09:00 and 11:30 from jittering column to column.
  meta: { fontFamily: MONO, marginTop: 2, fontSize: 10, lineHeight: 13 },
});
