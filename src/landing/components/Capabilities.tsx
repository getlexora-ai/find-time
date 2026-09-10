import { StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, LANDING, R, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { CAPABILITIES } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

type Item = (typeof CAPABILITIES.items)[number];

/**
 * What the agent does, one card per surface (inbox, calendar, accounts, tasks),
 * each ending on when it checks with you. Replaces FeatureGrid; keeps its
 * `gap: 1` hairline-seam grid on the feature-card blue. 4-up ≥1024, 2×2 ≥640,
 * stacked below — rows are built explicitly so the seams stay 1px at every width.
 */
export function Capabilities() {
  const { width } = useResponsive();
  const cols = width >= 1024 ? 4 : width >= 640 ? 2 : 1;
  const rows: Item[][] = [];
  for (let i = 0; i < CAPABILITIES.items.length; i += cols) rows.push(CAPABILITIES.items.slice(i, i + cols));

  return (
    <View>
      <SectionHead eyebrow={CAPABILITIES.eyebrow} title={CAPABILITIES.title} body={CAPABILITIES.body} />
      <View style={styles.grid}>
        {rows.map((row) => (
          <View key={row[0].tag} style={[styles.row, { flexDirection: cols > 1 ? 'row' : 'column' }]}>
            {row.map((c) => (
              <View key={c.tag} style={[styles.card, cols > 1 ? { flex: 1 } : null]}>
                <Icon name={c.icon} size={24} color={C.lime} />
                <Txt style={styles.tag}>{c.tag}</Txt>
                <Txt style={styles.title}>{c.title}</Txt>
                <View style={styles.points}>
                  {c.points.map((p) => (
                    <View key={p} style={styles.point}>
                      <Txt style={styles.arrow}>→</Txt>
                      <Txt style={styles.pointTxt}>{p}</Txt>
                    </View>
                  ))}
                </View>
                <View style={styles.ask}>
                  <Txt style={styles.askLabel}>{CAPABILITIES.askLabel}</Txt>
                  <Txt style={styles.askTxt}>{c.ask}</Txt>
                </View>
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    gap: 1,
    overflow: 'hidden',
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: w(0.15),
  },
  row: { gap: 1 },
  card: { backgroundColor: LANDING.featureCard, padding: 24, gap: 12 },
  tag: { marginTop: 8, color: RAMP.onFeature, fontSize: 11, letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 16, fontWeight: '500' },
  points: { gap: 6 },
  point: { flexDirection: 'row', gap: 8 },
  arrow: { color: C.lime, fontSize: 12, lineHeight: 20 },
  pointTxt: { flex: 1, color: RAMP.onFeature, fontSize: 12, lineHeight: 20 },
  ask: {
    marginTop: 'auto',
    paddingTop: 14,
    gap: 4,
    borderTopWidth: 1,
    borderTopColor: w(0.18),
    borderStyle: 'dashed',
  },
  askLabel: { color: C.lime, fontSize: 10, letterSpacing: 1.5 },
  askTxt: { color: RAMP.onFeature, fontSize: 12, lineHeight: 18 },
});
