import { type ReactNode, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { Logo } from '@/design/Logo';
import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { CONNECTORS, ECOSYSTEM } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

/**
 * The privacy story as one diagram and no prose: your tools ⇄ Find Time ⇄ you,
 * all inside a dashed "your ecosystem" boundary. Every route out (ad networks,
 * data brokers, model training, other companies) is cut by a ✕ sitting on the
 * boundary line, and the things it never connects to hang off a broken line
 * below. ≥1024 the exits sit to the right, their badges overlapping the
 * boundary's edge (the exit column is sized to the measured boundary height);
 * below that everything stacks.
 */
export function Ecosystem() {
  const { width } = useResponsive();
  const wide = width >= 1024;
  const [boxH, setBoxH] = useState<number | null>(null);
  const onBox = (e: LayoutChangeEvent) => setBoxH(Math.round(e.nativeEvent.layout.height));

  return (
    <View style={[styles.panel, width >= 768 ? styles.panelWide : null]}>
      <SectionHead eyebrow={ECOSYSTEM.eyebrow} title={ECOSYSTEM.title} onPanel />

      <View role="img" aria-label={ECOSYSTEM.label}>
        <View style={wide ? styles.rowWide : null}>
          <View style={wide ? { flex: 1 } : null}>
            <View style={styles.boundary} onLayout={onBox}>
              <View style={styles.boundaryTag}>
                <Txt style={styles.boundaryTagTxt}>{ECOSYSTEM.inside}</Txt>
              </View>
              <View style={[styles.inside, wide ? styles.insideWide : null]}>
                <View style={[styles.tools, wide ? styles.toolsWide : null]}>
                  <Txt style={styles.colLabel}>{ECOSYSTEM.tools}</Txt>
                  <View style={styles.toolGrid}>
                    {CONNECTORS.items.map((c) => (
                      <View key={c.key} style={styles.tool}>
                        <Icon name={c.icon} size={14} color={C.lime} />
                        <Txt style={styles.toolTxt} numberOfLines={1}>
                          {c.name}
                        </Txt>
                      </View>
                    ))}
                  </View>
                </View>
                <Wire vertical={!wide} />
                <View style={styles.core}>
                  <Logo size={32} color={C.surface} />
                  <Txt style={styles.coreTxt}>{ECOSYSTEM.core}</Txt>
                </View>
                <Wire vertical={!wide} />
                <View style={styles.you}>
                  <View style={styles.youIcon}>
                    <Icon name="user" size={22} color={C.lime} />
                  </View>
                  <Txt style={styles.youTxt}>{ECOSYSTEM.you}</Txt>
                  <Txt style={styles.youSub}>{ECOSYSTEM.youSub}</Txt>
                </View>
              </View>
            </View>

            <View style={styles.offLink}>
              <View style={styles.dashV} />
              <View style={styles.badge}>
                <Icon name="forbidden" size={20} color={C.orange} />
              </View>
              <View style={styles.dashV} />
            </View>
            <View style={styles.off}>
              <Txt style={styles.offTitle}>{ECOSYSTEM.blockedTitle}</Txt>
              <View style={styles.offRow}>
                {CONNECTORS.blocked.map((b) => (
                  <View key={b.name} style={styles.offChip}>
                    <Icon name={b.icon} size={16} color={w(0.5)} />
                    <Txt style={styles.offTxt}>{b.name}</Txt>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={[styles.outside, wide ? styles.outsideWide : null, wide && boxH ? { height: boxH } : null]}>
            <Txt style={[styles.colLabel, wide ? styles.outsideLabelWide : null]}>{ECOSYSTEM.outsideTitle}</Txt>
            {ECOSYSTEM.outside.map((o) => (
              <View key={o} style={styles.exit}>
                <View style={styles.badge}>
                  <Icon name="close" size={20} color={C.orange} />
                </View>
                <View style={styles.dashH} />
                <View style={styles.dest}>
                  <Txt style={styles.destTxt}>{o}</Txt>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.legend}>
          <Legend mark={<View style={styles.legendLine} />} label={ECOSYSTEM.legend.stays} />
          <Legend mark={<Icon name="close" size={16} color={C.orange} />} label={ECOSYSTEM.legend.blocked} />
          <Legend mark={<Icon name="forbidden" size={16} color={C.orange} />} label={ECOSYSTEM.legend.never} />
        </View>
      </View>
    </View>
  );
}

/** A two-way wire: dot, lime line, dot. */
function Wire({ vertical }: { vertical: boolean }) {
  return (
    <View aria-hidden style={vertical ? styles.wireV : styles.wireH}>
      <View style={styles.wireDot} />
      <View style={vertical ? styles.wireLineV : styles.wireLineH} />
      <View style={styles.wireDot} />
    </View>
  );
}

function Legend({ mark, label }: { mark: ReactNode; label: string }) {
  return (
    <View style={styles.legendItem}>
      {mark}
      <Txt style={styles.legendTxt}>{label}</Txt>
    </View>
  );
}

const BADGE = 30;
const DASH = rgba(C.orange, 0.7);

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.2),
    // solid, so the boundary tag and the ✕ badges can mask the lines they sit on
    backgroundColor: C.surface,
    padding: 24,
  },
  panelWide: { padding: 40 },
  rowWide: { flexDirection: 'row', alignItems: 'flex-start' },
  boundary: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: rgba(C.lime, 0.6),
    borderRadius: 24,
    padding: 24,
    paddingTop: 36,
    backgroundColor: rgba(C.lime, 0.03),
  },
  boundaryTag: {
    position: 'absolute',
    top: -9,
    left: 20,
    paddingHorizontal: 8,
    backgroundColor: C.surface,
  },
  boundaryTagTxt: { color: C.lime, fontSize: 10, lineHeight: 16, letterSpacing: 1.5 },
  inside: { alignItems: 'center' },
  insideWide: { flexDirection: 'row' },
  tools: { width: '100%', gap: 10 },
  toolsWide: { width: 320 },
  colLabel: { color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
  toolGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tool: {
    flexBasis: '46%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: rgba(C.lime, 0.3),
    backgroundColor: '#161616',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  toolTxt: { flexShrink: 1, color: '#fff', fontSize: 11, letterSpacing: 1 },
  core: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: C.lime,
    shadowOpacity: 0.45,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  coreTxt: { color: C.surface, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  you: { width: 160, alignItems: 'center', gap: 6 },
  youIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: rgba(C.lime, 0.5),
    backgroundColor: '#161616',
    alignItems: 'center',
    justifyContent: 'center',
  },
  youTxt: { color: '#fff', fontSize: 13, fontWeight: '600', letterSpacing: 1.5 },
  youSub: { color: RAMP.onPanel, fontSize: 10, lineHeight: 15, letterSpacing: 1, textAlign: 'center' },
  wireH: { flex: 1, minWidth: 32, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  wireLineH: { flex: 1, height: 2, backgroundColor: C.lime },
  wireV: { height: 48, alignItems: 'center', paddingVertical: 4 },
  wireLineV: { flex: 1, width: 2, backgroundColor: C.lime },
  wireDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.lime },
  offLink: { alignSelf: 'flex-start', marginLeft: 48, alignItems: 'center' },
  dashV: { height: 14, width: 0, borderLeftWidth: 1.5, borderStyle: 'dashed', borderColor: DASH },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  off: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: rgba(C.orange, 0.55),
    borderRadius: R.xl2,
    padding: 18,
    gap: 12,
    backgroundColor: rgba(C.orange, 0.04),
  },
  offTitle: { color: C.orange, fontSize: 10, letterSpacing: 1.5 },
  offRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  offChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.15),
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  offTxt: { color: w(0.6), fontSize: 11, letterSpacing: 1, textDecorationLine: 'line-through' },
  outside: { marginTop: 28, gap: 12 },
  // pulled left by half a badge so each ✕ sits on the boundary's dashed edge
  outsideWide: { width: 260, marginTop: 0, marginLeft: -BADGE / 2, justifyContent: 'center', zIndex: 2 },
  outsideLabelWide: { marginLeft: BADGE + 36 },
  exit: { flexDirection: 'row', alignItems: 'center' },
  dashH: { width: 36, height: 0, borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: DASH },
  dest: {
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: w(0.03),
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  destTxt: { color: RAMP.onPanel, fontSize: 11, letterSpacing: 1 },
  legend: {
    marginTop: 28,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendLine: { width: 24, height: 2, backgroundColor: C.lime },
  legendTxt: { color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
});
