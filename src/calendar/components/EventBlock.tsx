import { type GestureResponderEvent, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { blockGeometry } from '../layout';
import type { PointAnchor } from '../state';
import { CATS, C, R, rgba, w } from '../tokens';
import type { LaidBlock } from '../types';
import { Press, Txt } from '../ui';

const at = (e: GestureResponderEvent): PointAnchor => ({
  x: e.nativeEvent.pageX,
  y: e.nativeEvent.pageY,
});

/** Week / day time-grid block (spec §2.6). Blocks < 46px tall drop the time line. */
export function EventBlock({ it, onPress }: { it: LaidBlock; onPress: (anchor: PointAnchor) => void }) {
  const { top, height, widthPct, leftPct, tight } = blockGeometry(it);
  const ev = it.ev;
  const c = CATS[ev.cat];

  const wrap = [styles.wrap, { top, height, left: `${leftPct}%` as const, width: `${widthPct}%` as const }];

  if (ev.kind === 'ai') {
    return (
      <View style={wrap} pointerEvents="box-none">
        <Press onPress={(e) => onPress(at(e))} hoverBg="rgba(204,255,0,0.2)" style={[styles.block, styles.ai]}>
          <View style={styles.titleRow}>
            <Icon name="magic" size={13} color={C.lime} />
            <Txt numberOfLines={1} style={[styles.title, { color: C.lime, flex: 1 }]}>
              {ev.title}
            </Txt>
          </View>
          {!tight && (
            <Txt style={[styles.meta, { color: 'rgba(204,255,0,0.7)' }]}>
              {ev.start}–{ev.end} · tap to accept
            </Txt>
          )}
        </Press>
      </View>
    );
  }

  if (ev.kind === 'break') {
    return (
      <View style={wrap} pointerEvents="box-none">
        <Press onPress={(e) => onPress(at(e))} hoverBg="rgba(255,255,255,0.07)" style={[styles.block, styles.brk]}>
          <View style={styles.titleRow}>
            <Icon name="cup" size={13} color={w(0.4)} />
            <Txt numberOfLines={1} style={[styles.title, { color: w(0.4), flex: 1 }]}>
              {ev.title}
            </Txt>
          </View>
        </Press>
      </View>
    );
  }

  const ring = ev.conflict
    ? { borderWidth: 1, borderColor: C.orange }
    : ev.kind === 'focus'
      ? { borderWidth: 1, borderColor: 'rgba(204,255,0,0.4)' }
      : null;

  return (
    <View style={wrap} pointerEvents="box-none">
      <Press
        onPress={(e) => onPress(at(e))}
        style={[
          styles.block,
          styles.evt,
          { backgroundColor: rgba(c.color, 0.16), borderLeftWidth: 2, borderLeftColor: c.color },
          ring,
        ]}>
        <View style={styles.titleRow}>
          <Txt numberOfLines={1} style={[styles.title, { color: '#fff', fontWeight: '500', flex: 1 }]}>
            {ev.title}
          </Txt>
          {ev.kind === 'focus' && <Icon name="shield" size={13} color={C.lime} />}
          {ev.conflict && <Icon name="triangle" size={13} color={C.orange} />}
        </View>
        {!tight && (
          <Txt numberOfLines={1} style={[styles.meta, { color: w(0.45) }]}>
            {ev.start}–{ev.end}
            {ev.project ? ` · ${ev.project}` : ''}
          </Txt>
        )}
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute' },
  block: {
    flex: 1,
    marginHorizontal: 2,
    overflow: 'hidden',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    padding: 8,
  },
  evt: {},
  ai: { borderColor: 'rgba(204,255,0,0.6)', borderStyle: 'dashed', backgroundColor: rgba('#ccff00', 0.1) },
  brk: { borderColor: w(0.15), borderStyle: 'dashed', backgroundColor: 'rgba(255,255,255,0.03)' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  title: { fontSize: 12, lineHeight: 16 },
  meta: { marginTop: 4, fontSize: 12, lineHeight: 16 },
});
