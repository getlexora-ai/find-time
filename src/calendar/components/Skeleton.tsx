import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { WD } from '../cal-date';
import { Icon } from '../Icon';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import { Txt } from '../ui';

/** 280ms period-nav skeleton. Keeps tile geometry so nothing reflows (spec §5). */
export function Skeleton() {
  const { theme } = useCalTheme();
  const [pulse] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.8, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [pulse]);

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder, backgroundColor: theme.panelBorder }]} aria-busy>
      <View style={styles.row}>
        {WD.map((d) => (
          <View key={d} style={[styles.head, { backgroundColor: theme.recessed }]}>
            <Txt style={styles.headTxt}>{d}</Txt>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: 28 }).map((_, i) => (
          <View key={i} style={[styles.cell, { backgroundColor: theme.panel }]}>
            <Animated.View style={[styles.skBox, { opacity: pulse }]} />
            <Animated.View style={[styles.skLine, { opacity: pulse }]} />
            <Animated.View style={[styles.skLine, { width: '80%', opacity: pulse }]} />
          </View>
        ))}
      </View>
      <View style={[styles.foot, { backgroundColor: theme.recessed }]}>
        <Icon name="refresh" size={16} color={C.lime} />
        <Txt style={styles.footTxt}>Loading calendar…</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    gap: 1,
  },
  row: { flexDirection: 'row', gap: 1 },
  head: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  headTxt: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 2.56, color: w(0.25) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  cell: { width: `${100 / 7}%`, minHeight: 140, padding: 8 },
  skBox: { height: 24, width: 24, borderRadius: R.md, backgroundColor: w(0.1) },
  skLine: { marginTop: 12, height: 20, borderRadius: R.sm, backgroundColor: w(0.07) },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  footTxt: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
});
