import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { type Connector, type ConnectorKey, CONNECTORS } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

const INITIAL = Object.fromEntries(CONNECTORS.items.map((c) => [c.key, c.on])) as Record<ConnectorKey, boolean>;

/**
 * A preview of the app's Connections screen: every tool the agent can work in,
 * each with a live switch the visitor can flip, and underneath the things that
 * can't be connected at all (wallets, contacts, passwords, cards) — present, but
 * with no switch. Two columns ≥900, one below.
 */
export function Connectors() {
  const { width } = useResponsive();
  const two = width >= 900;
  const [on, setOn] = useState(INITIAL);
  const count = CONNECTORS.items.filter((c) => on[c.key]).length;
  const flip = (k: ConnectorKey) => setOn((s) => ({ ...s, [k]: !s[k] }));

  return (
    <View>
      <SectionHead eyebrow={CONNECTORS.eyebrow} title={CONNECTORS.title} body={CONNECTORS.body} />

      <View style={styles.window}>
        <View style={styles.chrome}>
          <View style={styles.lights}>
            {[0, 1, 2].map((i) => (
              <View key={i} style={styles.light} />
            ))}
          </View>
          <Txt style={styles.url}>{CONNECTORS.windowUrl}</Txt>
        </View>

        <View style={styles.panelHead}>
          <Txt style={styles.panelTitle}>{CONNECTORS.panelTitle}</Txt>
          <Txt style={styles.count}>{CONNECTORS.count(count, CONNECTORS.items.length)}</Txt>
        </View>

        <View style={styles.grid}>
          {CONNECTORS.items.map((c, i) => (
            <Row key={c.key} c={c} on={on[c.key]} onToggle={() => flip(c.key)} half={two} left={two && i % 2 === 0} />
          ))}
        </View>

        <View style={styles.blocked}>
          <View style={styles.blockedHead}>
            <Icon name="forbidden" size={16} color={C.orange} />
            <Txt style={styles.blockedTitle}>{CONNECTORS.blockedTitle}</Txt>
          </View>
          <View style={styles.blockedRow}>
            {CONNECTORS.blocked.map((b) => (
              <View key={b.name} style={styles.blockedChip}>
                <Icon name={b.icon} size={18} color={w(0.5)} />
                <Txt style={styles.blockedName}>{b.name}</Txt>
                <View style={styles.neverTag}>
                  <Txt style={styles.neverTxt}>{CONNECTORS.blockedTag}</Txt>
                </View>
              </View>
            ))}
          </View>
        </View>
      </View>

      <Txt style={styles.caption}>{CONNECTORS.caption}</Txt>
    </View>
  );
}

function Row({
  c,
  on,
  onToggle,
  half,
  left,
}: {
  c: Connector;
  on: boolean;
  onToggle: () => void;
  half: boolean;
  left: boolean;
}) {
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      aria-label={`${c.name}: ${c.apps}`}
      style={[styles.row, half ? styles.rowHalf : null, left ? styles.rowLeft : null]}>
      <View style={[styles.tile, on ? styles.tileOn : null]}>
        <Icon name={c.icon} size={20} color={on ? C.surface : w(0.7)} />
      </View>
      <View style={styles.rowMain}>
        <Txt style={styles.name}>{c.name}</Txt>
        <Txt style={styles.apps}>{c.apps}</Txt>
        <Txt style={[styles.can, on ? styles.canOn : null]}>{c.can}</Txt>
      </View>
      <View style={[styles.track, on ? styles.trackOn : null]}>
        <View style={[styles.knob, on ? styles.knobOn : null]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  window: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: rgba('#121212', 0.92),
    overflow: 'hidden',
  },
  chrome: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
  },
  lights: { flexDirection: 'row', gap: 6 },
  light: { width: 10, height: 10, borderRadius: 5, backgroundColor: w(0.18) },
  url: { flexShrink: 1, color: RAMP.onPanel, fontSize: 11, letterSpacing: 1.5 },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 14,
  },
  panelTitle: { color: '#fff', fontSize: 15, fontWeight: '500', letterSpacing: 1 },
  count: { color: C.lime, fontSize: 11, letterSpacing: 1.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  row: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: w(0.08),
  },
  rowHalf: { width: '50%' },
  rowLeft: { borderRightWidth: 1, borderRightColor: w(0.08) },
  tile: {
    width: 44,
    height: 44,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.12),
    backgroundColor: w(0.06),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileOn: { backgroundColor: C.lime, borderColor: C.lime },
  rowMain: { flex: 1, minWidth: 0, gap: 3 },
  name: { color: '#fff', fontSize: 13, fontWeight: '500', letterSpacing: 1 },
  apps: { color: RAMP.onPanel, fontSize: 12 },
  can: { marginTop: 4, color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
  canOn: { color: C.lime },
  track: { width: 42, height: 24, borderRadius: R.full, backgroundColor: w(0.14), padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: C.lime },
  knob: { width: 18, height: 18, borderRadius: 9, backgroundColor: w(0.75), alignSelf: 'flex-start' },
  knobOn: { backgroundColor: C.surface, alignSelf: 'flex-end' },
  blocked: {
    gap: 14,
    paddingHorizontal: 24,
    paddingVertical: 22,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    backgroundColor: rgba(C.orange, 0.05),
  },
  blockedHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  blockedTitle: { color: C.orange, fontSize: 11, letterSpacing: 1.5 },
  blockedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  blockedChip: {
    flexGrow: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: w(0.18),
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  blockedName: { color: w(0.6), fontSize: 12, letterSpacing: 1, textDecorationLine: 'line-through' },
  neverTag: {
    marginLeft: 'auto',
    borderRadius: R.full,
    backgroundColor: rgba(C.orange, 0.16),
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  neverTxt: { color: C.orange, fontSize: 10, letterSpacing: 1, fontWeight: '600' },
  caption: { marginTop: 12, color: RAMP.onBlue, fontSize: 10, letterSpacing: 1.5 },
});
