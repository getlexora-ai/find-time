import { StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, LANDING, R, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { FEATURES } from '../copy';
import { RAMP } from '../ramp';

/**
 * The three "how it works" cards. `gap: 1` on a `bg-white/15` container is the
 * same hairline-seam trick `MonthView.tsx` uses (landing.html `gap-px`). Row on
 * `md`+, stacked below.
 */
export function FeatureGrid() {
  const { width } = useResponsive();
  const row = width >= 768;

  return (
    <View style={[styles.grid, { flexDirection: row ? 'row' : 'column' }]}>
      {FEATURES.map((f) => (
        <View key={f.title} style={[styles.card, row ? { flex: 1 } : null]}>
          <Icon name={f.icon} size={24} color={C.lime} />
          <Txt style={styles.title}>{f.title}</Txt>
          <Txt style={styles.body}>{f.body}</Txt>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    maxWidth: 1152,
    width: '100%',
    alignSelf: 'center',
    gap: 1,
    overflow: 'hidden',
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: w(0.15),
  },
  card: { backgroundColor: LANDING.featureCard, padding: 24 },
  title: { marginTop: 20, fontSize: 16, fontWeight: '500', color: '#fff' },
  body: { marginTop: 12, fontSize: 12, lineHeight: 20, color: RAMP.onFeature },
});
