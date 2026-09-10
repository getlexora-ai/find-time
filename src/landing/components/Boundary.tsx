import { Fragment, useState } from 'react';
import { StyleSheet, type TextStyle, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, LANDING, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { BOUNDARY, type BoundaryKey, type Seg } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

/**
 * The centrepiece: one request shown three times — as the visitor types it, as the
 * model sees it (tokens only), and as it leaves after approval. Every value is
 * tappable; tapping one lights the same value in all three lanes, so the swap
 * across the boundary is something you follow rather than read about. Opens with
 * the wallet selected so the linking is visible at rest.
 *
 * Tap, not hover: nested <Text> can't host a Pressable, and tap also works on
 * phones. Sits on the WaitlistSection dark-panel language (`#121212/90`).
 */
export function Boundary() {
  const { width } = useResponsive();
  const wide = width >= 1024;
  const [active, setActive] = useState<BoundaryKey | null>('wallet');
  const pick = (k: BoundaryKey) => setActive((a) => (a === k ? null : k));

  return (
    <View style={[styles.panel, width >= 768 ? styles.panelWide : null]}>
      <SectionHead eyebrow={BOUNDARY.eyebrow} title={BOUNDARY.title} body={BOUNDARY.body} onPanel />

      <View style={[styles.lanes, { flexDirection: wide ? 'row' : 'column' }]}>
        {BOUNDARY.lanes.map((lane, i) => (
          <Fragment key={lane.step}>
            {i > 0 ? (
              <Txt aria-hidden style={styles.connector}>
                {wide ? '→' : '↓'}
              </Txt>
            ) : null}
            <View style={[styles.lane, lane.kind === 'token' ? styles.laneModel : null, wide ? { flex: 1 } : null]}>
              <View style={styles.laneTop}>
                <Txt style={styles.step}>{lane.step}</Txt>
                <Txt style={styles.where}>{lane.where}</Txt>
              </View>
              <Txt style={styles.laneTitle}>{lane.title}</Txt>
              <Segments segs={lane.body} kind={lane.kind} active={active} onPick={pick} base={styles.body} />
              {lane.code ? (
                <View style={styles.code}>
                  <Segments segs={lane.code} kind="token" active={active} onPick={pick} base={styles.codeTxt} />
                </View>
              ) : null}
              <View style={styles.chips}>
                {lane.chips.map((c) => (
                  <View key={c} style={styles.chip}>
                    <Txt style={styles.chipTxt}>{c}</Txt>
                  </View>
                ))}
              </View>
            </View>
          </Fragment>
        ))}
      </View>

      <Txt style={styles.hint}>{BOUNDARY.hint}</Txt>

      <View style={styles.vault}>
        <View style={styles.vaultIcon}>
          <Icon name="shield" size={22} color={C.lime} />
        </View>
        <View style={styles.vaultCopy}>
          <Txt style={styles.vaultTitle}>{BOUNDARY.vaultTitle}</Txt>
          <Txt style={styles.vaultBody}>{BOUNDARY.vaultBody}</Txt>
        </View>
      </View>
    </View>
  );
}

/** One run of text whose values are tappable marks. Nested spans restate `base`
 *  because `Txt` resets every span to its own 12px default. */
function Segments({
  segs,
  kind,
  active,
  onPick,
  base,
}: {
  segs: Seg[];
  kind: 'real' | 'token';
  active: BoundaryKey | null;
  onPick: (k: BoundaryKey) => void;
  base: TextStyle;
}) {
  return (
    <Txt style={base}>
      {segs.map((s, i) =>
        typeof s === 'string' ? (
          <Fragment key={i}>{s}</Fragment>
        ) : (
          <Txt
            key={i}
            onPress={() => onPick(s.k)}
            accessibilityRole="button"
            accessibilityState={{ selected: active === s.k }}
            style={[base, kind === 'token' ? styles.tok : styles.real, active === s.k ? styles.hot : null]}>
            {s.v}
          </Txt>
        ),
      )}
    </Txt>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: rgba('#121212', 0.9),
    padding: 24,
  },
  panelWide: { padding: 40 },
  lanes: { gap: 12, alignItems: 'stretch' },
  connector: { alignSelf: 'center', color: C.lime, fontSize: 16, lineHeight: 20 },
  lane: {
    backgroundColor: C.recessed,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.12),
    padding: 20,
    gap: 12,
  },
  laneModel: { backgroundColor: '#070707', borderColor: rgba(C.lime, 0.45) },
  laneTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  step: { color: LANDING.aiResponse, fontSize: 10, letterSpacing: 1.5 },
  where: { flexShrink: 1, color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5, textAlign: 'right' },
  laneTitle: { color: '#fff', fontSize: 15, fontWeight: '500' },
  body: { color: w(0.8), fontSize: 13, lineHeight: 24 },
  real: { backgroundColor: rgba(C.lime, 0.16), color: '#fff' },
  tok: { backgroundColor: rgba(C.lime, 0.08), color: C.lime },
  hot: { backgroundColor: C.lime, color: C.surface },
  code: { backgroundColor: w(0.04), borderRadius: R.lg, padding: 12 },
  codeTxt: { color: w(0.7), fontSize: 11, lineHeight: 20 },
  chips: { marginTop: 'auto', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: rgba(C.lime, 0.12) },
  chipTxt: { color: C.lime, fontSize: 10, lineHeight: 14, letterSpacing: 1 },
  hint: { marginTop: 16, color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
  vault: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: w(0.12),
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 16,
  },
  vaultIcon: {
    width: 44,
    height: 44,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: rgba(C.lime, 0.5),
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaultCopy: { flex: 1, gap: 6 },
  vaultTitle: { color: '#fff', fontSize: 13, fontWeight: '500', letterSpacing: 0.5 },
  vaultBody: { maxWidth: 640, color: RAMP.onPanel, fontSize: 13, lineHeight: 21 },
});
