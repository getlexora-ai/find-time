import { type GestureResponderEvent, StyleSheet } from 'react-native';

import { KindGlyph, KindRail, paint } from '../kinds';
import type { PointAnchor } from '../state';
import { C, R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

const at = (e: GestureResponderEvent): PointAnchor => ({
  x: e.nativeEvent.pageX,
  y: e.nativeEvent.pageY,
});

/**
 * Month event chip. Same `paint()` table as the week block and the agenda
 * card, so a routine looks like a routine in every view.
 *
 * The colour was previously a 6px dot, which meant the month grid showed only
 * the category and dropped the kind entirely. The rail carries both now: its
 * hue is the category, its silhouette is the kind.
 */
export function EventChip({
  ev,
  show2xl,
  onPress,
}: {
  ev: CalEvent;
  show2xl?: boolean;
  onPress: (anchor: PointAnchor) => void;
}) {
  const p = paint(ev, ev.conflict);

  return (
    <Press
      onPress={(e) => onPress(at(e))}
      hoverBg={w(0.1)}
      style={[
        styles.base,
        { backgroundColor: p.fill, borderColor: p.border, borderStyle: p.borderStyle },
        ev.conflict && styles.clash,
      ]}>
      <KindRail p={p} radius={R.sm} />
      <KindGlyph p={p} size={10} />
      <Txt numberOfLines={1} style={[styles.title, { color: p.title }]}>
        {ev.title}
      </Txt>
      {show2xl && <Txt style={[styles.time, { color: p.meta }]}>{ev.start}</Txt>}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: R.sm,
    borderWidth: 1,
    paddingRight: 5,
    paddingVertical: 3,
    minHeight: 20,
  },
  clash: { borderColor: C.orange },
  title: { flex: 1, fontSize: 11, lineHeight: 15 },
  time: { fontSize: 10, lineHeight: 14 },
});
