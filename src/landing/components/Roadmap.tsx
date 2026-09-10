import { StyleSheet, type TextStyle, View, type ViewStyle } from 'react-native';

import { C, R, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { type PhaseState, ROADMAP } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

/** Pill fill per phase state: live = lime (the product's "yours now" colour),
 *  next = white, planned = the quiet translucent chip. */
const STATE: Record<PhaseState, { box: ViewStyle; txt: TextStyle }> = {
  live: { box: { backgroundColor: C.lime }, txt: { color: C.surface } },
  next: { box: { backgroundColor: '#fff' }, txt: { color: C.canvas } },
  planned: { box: { backgroundColor: w(0.12) }, txt: { color: '#fff' } },
};

/**
 * The four phases, in order — the privacy boundary ships before anything that can
 * send, pay or share. A real sequence, so the phase numbers carry information.
 * Mirrors the future-scope list agreed for the agent pivot (HANDOFF-landing.md §9).
 */
export function Roadmap() {
  const { width } = useResponsive();
  const wide = width >= 860;

  return (
    <View>
      <SectionHead eyebrow={ROADMAP.eyebrow} title={ROADMAP.title} body={ROADMAP.body} />
      <View style={styles.list}>
        {ROADMAP.phases.map((p) => (
          <View key={p.n} style={[styles.phase, { flexDirection: wide ? 'row' : 'column' }]}>
            <View style={[styles.meta, wide ? { width: 160 } : null]}>
              <Txt style={styles.n}>{p.n}</Txt>
              <View style={[styles.state, STATE[p.state].box]}>
                <Txt style={[styles.stateTxt, STATE[p.state].txt]}>{ROADMAP.stateLabel[p.state]}</Txt>
              </View>
            </View>
            <Txt style={[styles.title, { fontSize: wide ? 20 : 18 }, wide ? { flex: 1 } : null]}>{p.title}</Txt>
            <View style={[styles.points, wide ? { flex: 1.4 } : null]}>
              {p.points.map((pt) => (
                <View key={pt} style={styles.point}>
                  <Txt style={styles.bullet}>·</Txt>
                  <Txt style={styles.pointTxt}>{pt}</Txt>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderTopWidth: 1, borderTopColor: w(0.15) },
  phase: { gap: 16, paddingVertical: 24, borderBottomWidth: 1, borderBottomColor: w(0.15) },
  meta: { gap: 10, alignItems: 'flex-start' },
  n: { color: RAMP.onBlue, fontSize: 11, letterSpacing: 1.5 },
  state: { borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4 },
  stateTxt: { fontSize: 10, lineHeight: 14, letterSpacing: 1, fontWeight: '600' },
  title: { color: '#fff', lineHeight: 26, fontWeight: '500' },
  points: { gap: 6 },
  point: { flexDirection: 'row', gap: 10 },
  bullet: { color: C.lime, fontSize: 13, lineHeight: 21 },
  pointTxt: { flex: 1, color: RAMP.onBlue, fontSize: 13, lineHeight: 21 },
});
