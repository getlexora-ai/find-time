import { StyleSheet, View } from 'react-native';

import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { LIMITS } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

/** "What we won't promise" — the three honest limits, set plain on the blue so
 *  they read as a statement rather than a feature. 3-up ≥900, stacked below. */
export function Limits() {
  const { width } = useResponsive();
  const row = width >= 900;

  return (
    <View>
      <SectionHead eyebrow={LIMITS.eyebrow} title={LIMITS.title} />
      <View style={[styles.grid, { flexDirection: row ? 'row' : 'column' }]}>
        {LIMITS.items.map((l) => (
          <View key={l.title} style={[styles.item, row ? { flex: 1 } : null]}>
            <Txt style={styles.title}>{l.title}</Txt>
            <Txt style={styles.body}>{l.body}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 32 },
  item: { gap: 10, paddingTop: 16, borderTopWidth: 2, borderTopColor: '#fff' },
  title: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  body: { color: RAMP.onBlue, fontSize: 13, lineHeight: 21 },
});
