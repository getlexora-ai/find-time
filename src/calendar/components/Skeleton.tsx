import { StyleSheet, View } from 'react-native';

import { N, R } from '../tokens';
import { Mono } from '../ui';

/**
 * Between periods: the hour grid with three grey blocks per day, no shimmer
 * (spec §9). Same geometry as the grid so nothing reflows when it lands.
 */
export function Skeleton() {
  return (
    <View style={styles.wrap} aria-busy>
      <View style={styles.head}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.headCell}>
            <View style={styles.bar} />
          </View>
        ))}
      </View>
      <View style={styles.body}>
        {Array.from({ length: 7 }).map((_, i) => (
          <View key={i} style={styles.col}>
            <View style={[styles.block, { top: 40 + ((i * 37) % 90), height: 72 }]} />
            <View style={[styles.block, { top: 190 + ((i * 53) % 70), height: 44 }]} />
            <View style={[styles.block, { top: 320 + ((i * 29) % 80), height: 96 }]} />
          </View>
        ))}
      </View>
      <Mono style={styles.note}>Loading…</Mono>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0, backgroundColor: N.surface },
  head: { flexDirection: 'row', height: 40, borderBottomWidth: 1, borderBottomColor: N.line, paddingLeft: 56 },
  headCell: { flex: 1, borderLeftWidth: 1, borderLeftColor: N.line, justifyContent: 'center', paddingHorizontal: 10 },
  bar: { width: 44, height: 10, borderRadius: R.xs, backgroundColor: N.sunken },
  body: { flex: 1, flexDirection: 'row', paddingLeft: 56 },
  col: { flex: 1, borderLeftWidth: 1, borderLeftColor: N.line },
  block: { position: 'absolute', left: 4, right: 4, borderRadius: R.md, backgroundColor: N.sunken },
  note: { position: 'absolute', bottom: 12, alignSelf: 'center' },
});
