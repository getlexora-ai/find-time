import { useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

import { Icon } from '@/design/Icon';
import { Logo } from '@/design/Logo';
import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';

import { CONNECTORS, HUB } from '../copy';
import { RAMP } from '../ramp';

/** The design canvas. Drawn once at this size, then scaled to the card. */
const S = 460;
const MID = S / 2;
const RING = 170;
const NODE_W = 120;
const NODE_H = 38;
const CORE = 108;

/** Connectors evenly round the ring from 12 o'clock. Rounded so SSR and the
 *  client agree on every style value. */
const NODES = CONNECTORS.items.map((c, i) => {
  const a = (i / CONNECTORS.items.length) * Math.PI * 2 - Math.PI / 2;
  return { ...c, x: Math.round(MID + RING * Math.cos(a)), y: Math.round(MID + RING * Math.sin(a)) };
});

/**
 * The hero diagram: Find Time at the centre, every connector wired to it, and the
 * two things it never connects to underneath. Drawn on a fixed 460 canvas — wires
 * in SVG, nodes as Views so labels stay in `Txt` mono — then scaled to the card's
 * width like an image, so nothing reflows or collides on a phone.
 */
export function ConnectorHub() {
  const [size, setSize] = useState(S);
  const onLayout = (e: LayoutChangeEvent) => setSize(Math.round(e.nativeEvent.layout.width));
  // scale is about the canvas centre, so centre the unscaled canvas in the stage
  const off = (size - S) / 2;

  return (
    <View style={styles.card} role="img" aria-label={HUB.label}>
      <View style={styles.head}>
        <Txt style={styles.headTxt}>{HUB.title}</Txt>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Txt style={styles.liveTxt}>{HUB.status}</Txt>
        </View>
      </View>

      <View style={styles.stage} onLayout={onLayout}>
        <View style={[styles.canvas, { left: off, top: off, transform: [{ scale: size / S }] }]}>
          <Svg width={S} height={S} style={StyleSheet.absoluteFill}>
            <Circle cx={MID} cy={MID} r={RING} fill="none" stroke={w(0.14)} strokeWidth={1} strokeDasharray="3 7" />
            <Circle cx={MID} cy={MID} r={CORE / 2 + 22} fill="none" stroke={rgba(C.lime, 0.22)} strokeWidth={1} />
            {NODES.map((n) => (
              <Line key={`l-${n.key}`} x1={MID} y1={MID} x2={n.x} y2={n.y} stroke={rgba(C.lime, 0.5)} strokeWidth={1.5} />
            ))}
            {NODES.map((n) => (
              <Circle
                key={`d-${n.key}`}
                cx={MID + (n.x - MID) * 0.62}
                cy={MID + (n.y - MID) * 0.62}
                r={3.5}
                fill={C.lime}
              />
            ))}
          </Svg>

          <View style={[styles.core, { left: MID - CORE / 2, top: MID - CORE / 2 }]}>
            <Logo size={36} color={C.surface} />
            <Txt style={styles.coreTxt}>{HUB.core}</Txt>
          </View>

          {NODES.map((n) => (
            <View key={n.key} style={[styles.node, { left: n.x - NODE_W / 2, top: n.y - NODE_H / 2 }]}>
              <Icon name={n.icon} size={16} color={C.lime} />
              <Txt style={styles.nodeTxt} numberOfLines={1}>
                {n.name}
              </Txt>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.foot}>
        <Txt style={styles.footLabel}>{HUB.never}</Txt>
        {CONNECTORS.blocked.slice(0, 2).map((b) => (
          <View key={b.name} style={styles.never}>
            <Icon name={b.icon} size={14} color={C.orange} />
            <Txt style={styles.neverTxt}>{b.name}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: rgba('#121212', 0.92),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
  },
  headTxt: { color: RAMP.onPanel, fontSize: 11, letterSpacing: 1.5 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  liveTxt: { color: C.lime, fontSize: 11, letterSpacing: 1.5 },
  stage: { width: '100%', maxWidth: 520, alignSelf: 'center', aspectRatio: 1, overflow: 'hidden' },
  canvas: { position: 'absolute', width: S, height: S },
  core: {
    position: 'absolute',
    width: CORE,
    height: CORE,
    borderRadius: CORE / 2,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: C.lime,
    shadowOpacity: 0.5,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  coreTxt: { color: C.surface, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  node: {
    position: 'absolute',
    width: NODE_W,
    height: NODE_H,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: rgba(C.lime, 0.4),
    backgroundColor: '#161616',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 10,
  },
  nodeTxt: { color: '#fff', fontSize: 11, letterSpacing: 1 },
  foot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
  },
  footLabel: { color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
  never: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.full,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: rgba(C.orange, 0.6),
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  neverTxt: { color: w(0.8), fontSize: 10, letterSpacing: 1, textDecorationLine: 'line-through' },
});
