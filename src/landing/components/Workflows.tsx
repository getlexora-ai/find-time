import { Fragment, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useReducedMotion } from '@/design/useReducedMotion';
import { useResponsive } from '@/design/useResponsive';

import { type Connector, type ConnectorKey, CONNECTORS, type FlowStep, WORKFLOWS } from '../copy';
import { RAMP } from '../ramp';
import { DemoVideo } from './DemoVideo';
import { SectionHead } from './SectionHead';

const BY_KEY = Object.fromEntries(CONNECTORS.items.map((c) => [c.key, c])) as Record<ConnectorKey, Connector>;
const BEAT_MS = 380;

/**
 * What it can do, as flowcharts: one sentence from you, the chain of connector
 * steps it takes, and the result. Tabs switch between four example jobs; picking
 * one replays the chain a step at a time (instant under reduced motion). The row
 * runs left-to-right ≥1180 and top-to-bottom below. The planner walkthrough video
 * sits underneath as the part that is live today.
 */
export function Workflows() {
  const { width } = useResponsive();
  const wide = width >= 1180;
  const reduced = useReducedMotion();
  const [tab, setTab] = useState(0);
  const flow = WORKFLOWS.flows[tab];
  const beats = flow.steps.length + 1;
  // Fully lit at rest, so SSR and the first client render match; a tab press
  // rewinds to 0 and the effect walks it forward.
  const [lit, setLit] = useState(beats);

  useEffect(() => {
    if (lit >= beats) return;
    const t = setTimeout(() => setLit((n) => n + 1), BEAT_MS);
    return () => clearTimeout(t);
  }, [lit, beats]);

  const pick = (i: number) => {
    setTab(i);
    setLit(reduced ? WORKFLOWS.flows[i].steps.length + 1 : 0);
  };
  const uses = Array.from(new Set(flow.steps.map((s) => s.c)));

  return (
    <View>
      <SectionHead eyebrow={WORKFLOWS.eyebrow} title={WORKFLOWS.title} body={WORKFLOWS.body} />

      <View style={[styles.panel, width >= 768 ? styles.panelWide : null]}>
        <View style={styles.tabs} role="tablist">
          {WORKFLOWS.flows.map((f, i) => (
            <Pressable
              key={f.tab}
              onPress={() => pick(i)}
              accessibilityRole="tab"
              accessibilityState={{ selected: i === tab }}
              style={[styles.tab, i === tab ? styles.tabOn : null]}>
              <Txt style={[styles.tabTxt, i === tab ? styles.tabTxtOn : null]}>{f.tab}</Txt>
            </Pressable>
          ))}
        </View>

        <View style={styles.ask}>
          <View style={styles.askHead}>
            <Txt style={styles.askLabel}>{WORKFLOWS.askLabel}</Txt>
            <View style={styles.uses}>
              <Txt style={styles.askLabel}>{WORKFLOWS.uses}</Txt>
              {uses.map((k) => (
                <View key={k} style={styles.usesIcon}>
                  <Icon name={BY_KEY[k].icon} size={14} color={C.lime} />
                </View>
              ))}
            </View>
          </View>
          <Txt style={styles.askTxt}>“{flow.ask}”</Txt>
        </View>

        <Arrow down lit style={styles.askArrow} />

        <View style={[styles.chain, { flexDirection: wide ? 'row' : 'column' }]}>
          {flow.steps.map((s, i) => (
            <Fragment key={`${tab}-${i}`}>
              {i > 0 ? <Arrow down={!wide} lit={i < lit} /> : null}
              <Step step={s} n={i + 1} lit={i < lit} grow={wide} />
            </Fragment>
          ))}
          <Arrow down={!wide} lit={lit >= beats} />
          <View style={[styles.result, wide ? styles.resultWide : null, lit >= beats ? null : styles.dim]}>
            <Icon name="check-bold" size={20} color={C.surface} />
            <Txt style={styles.resultTxt}>{flow.result}</Txt>
          </View>
        </View>
      </View>

      <View style={[styles.video, width >= 1024 ? styles.videoWide : null]}>
        <View style={width >= 1024 ? { flex: 1.4 } : null}>
          <DemoVideo />
        </View>
        <View style={[styles.videoCopy, width >= 1024 ? { flex: 1 } : null]}>
          <View style={styles.liveChip}>
            <View style={styles.liveDot} />
            <Txt style={styles.liveTxt}>{WORKFLOWS.videoTag}</Txt>
          </View>
          <Txt style={styles.videoTitle}>{WORKFLOWS.videoTitle}</Txt>
        </View>
      </View>
    </View>
  );
}

function Step({ step, n, lit, grow }: { step: FlowStep; n: number; lit: boolean; grow: boolean }) {
  const c = BY_KEY[step.c];
  return (
    <View style={[styles.step, grow ? { flex: 1 } : null, lit ? styles.stepLit : styles.dim]}>
      <View style={styles.stepTop}>
        <View style={styles.stepTile}>
          <Icon name={c.icon} size={18} color={C.lime} />
        </View>
        <Txt style={styles.stepTag}>{c.name}</Txt>
        <Txt style={styles.stepN}>{String(n).padStart(2, '0')}</Txt>
      </View>
      <Txt style={styles.stepTxt}>{step.text}</Txt>
    </View>
  );
}

function Arrow({ down, lit, style }: { down?: boolean; lit: boolean; style?: ViewStyle }) {
  return (
    <View aria-hidden style={[styles.arrow, down ? styles.arrowDown : null, lit ? null : styles.dim, style]}>
      <Icon name="arrow-forward" size={18} color={C.lime} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: rgba('#121212', 0.9),
    padding: 20,
  },
  panelWide: { padding: 32 },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  tab: {
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.2),
    paddingHorizontal: 16,
    minHeight: 36,
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: C.lime, borderColor: C.lime },
  tabTxt: { color: '#fff', fontSize: 11, letterSpacing: 1.5 },
  tabTxtOn: { color: C.surface, fontWeight: '600' },
  ask: { maxWidth: 720, backgroundColor: '#fff', borderRadius: R.xl, padding: 20, gap: 10 },
  askHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  askLabel: { color: RAMP.onLight, fontSize: 10, letterSpacing: 1.5 },
  uses: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  usesIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  askTxt: { color: C.surface, fontSize: 16, lineHeight: 24, fontWeight: '500' },
  askArrow: { alignSelf: 'flex-start', marginLeft: 18, marginVertical: 6 },
  chain: { alignItems: 'stretch', gap: 6 },
  step: {
    backgroundColor: C.recessed,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.12),
    padding: 16,
    gap: 12,
  },
  stepLit: { borderColor: rgba(C.lime, 0.5) },
  dim: { opacity: 0.3 },
  stepTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepTile: {
    width: 32,
    height: 32,
    borderRadius: R.lg,
    backgroundColor: rgba(C.lime, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTag: { flex: 1, color: '#fff', fontSize: 11, letterSpacing: 1.5 },
  stepN: { color: RAMP.onPanel, fontSize: 10, letterSpacing: 1 },
  stepTxt: { color: w(0.8), fontSize: 13, lineHeight: 20 },
  arrow: { width: 28, height: 28, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  arrowDown: { transform: [{ rotate: '90deg' }] },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: C.lime,
    borderRadius: R.xl,
    padding: 18,
  },
  resultWide: { width: 180 },
  resultTxt: { color: C.surface, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  video: { marginTop: 48, gap: 24 },
  videoWide: { flexDirection: 'row', alignItems: 'center', gap: 48 },
  videoCopy: { gap: 14 },
  liveChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.full,
    backgroundColor: rgba(C.lime, 0.14),
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  liveTxt: { color: C.lime, fontSize: 10, letterSpacing: 1.5 },
  videoTitle: { maxWidth: 420, color: '#fff', fontSize: 22, lineHeight: 28, fontWeight: '500' },
});
