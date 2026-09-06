import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import type { PointAnchor } from '../state';
import { CATS, C, R, rgba, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

const at = (e: GestureResponderEvent): PointAnchor => ({
  x: e.nativeEvent.pageX,
  y: e.nativeEvent.pageY,
});

/** Month event chip (spec §2.3). Colour is a 6px dot, never a fill. */
export function EventChip({
  ev,
  show2xl,
  onPress,
}: {
  ev: CalEvent;
  show2xl?: boolean;
  onPress: (anchor: PointAnchor) => void;
}) {
  if (ev.kind === 'ai') {
    return (
      <Press onPress={(e) => onPress(at(e))} hoverBg="rgba(204,255,0,0.2)" style={[styles.base, styles.ai]}>
        <Icon name="magic" size={11} color={C.lime} />
        <Txt numberOfLines={1} style={[styles.title, { color: C.lime, flex: 1 }]}>
          {ev.title}
        </Txt>
        {show2xl && <Txt style={[styles.time, { color: 'rgba(204,255,0,0.6)' }]}>{ev.start}</Txt>}
      </Press>
    );
  }
  if (ev.kind === 'break') {
    return (
      <Press onPress={(e) => onPress(at(e))} hoverBg={w(0.05)} style={[styles.base, styles.brk]}>
        <Icon name="cup" size={11} color={w(0.35)} />
        <Txt numberOfLines={1} style={[styles.title, { color: w(0.35), flex: 1 }]}>
          {ev.title}
        </Txt>
      </Press>
    );
  }
  return (
    <Press
      onPress={(e) => onPress(at(e))}
      hoverBg="rgba(255,255,255,0.12)"
      style={[styles.base, styles.evt, ev.conflict && styles.clash]}>
      <View style={[styles.dot, { backgroundColor: CATS[ev.cat].color }]} />
      <Txt numberOfLines={1} style={[styles.title, { color: w(0.85), flex: 1 }]}>
        {ev.title}
      </Txt>
      {ev.kind === 'focus' && <Icon name="shield" size={11} color={C.lime} />}
      {show2xl && <Txt style={[styles.time, { color: w(0.35) }]}>{ev.start}</Txt>}
    </Press>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.md,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  evt: { backgroundColor: 'rgba(255,255,255,0.06)' },
  clash: { borderWidth: 1, borderColor: 'rgba(255,68,0,0.7)' },
  ai: { borderWidth: 1, borderColor: 'rgba(204,255,0,0.5)', borderStyle: 'dashed', backgroundColor: rgba('#ccff00', 0.1) },
  brk: { borderWidth: 1, borderColor: w(0.15), borderStyle: 'dashed' },
  dot: { height: 6, width: 6, borderRadius: 3 },
  title: { fontSize: 12, lineHeight: 16 },
  time: { fontSize: 10, lineHeight: 14 },
});
