import { StyleSheet, View } from 'react-native';

import { KIND_KEYS, KINDS, paint } from '../kinds';
import { N, R, SANS } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { Label, Press, Txt } from '../ui';

/**
 * The legend, which is also the filter. Each row's swatch IS the tile — drawn
 * by the same `paint()` the grid uses — so the key cannot drift from the thing
 * it explains. Tap a row to hide that kind everywhere, KPIs included.
 */
export function Legend({
  events,
  hidden,
  onToggleKind,
  touch = false,
  first = false,
}: {
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  touch?: boolean;
  /** the first section of a sheet: no rule above it */
  first?: boolean;
}) {
  return (
    <View style={[styles.section, first && styles.first]}>
      <Label>Show</Label>
      <View style={styles.list}>
        {KIND_KEYS.map((k) => {
          const spec = KINDS[k];
          const off = hidden.has(k);
          const n = events.filter((e) => e.kind === k).length;
          return (
            <Press
              key={k}
              onPress={() => onToggleKind(k)}
              hoverBg={N.hover}
              accessibilityRole="switch"
              aria-checked={!off}
              aria-label={`${spec.label}: ${spec.blurb}`}
              style={[styles.row, touch && styles.rowTouch]}>
              <View style={[styles.swatch, ...paint({ kind: k }).box, off && styles.swatchOff]} />
              <Txt style={[styles.label, off && styles.labelOff]}>{spec.label}</Txt>
              <Txt style={styles.count}>{off ? 'hidden' : n}</Txt>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: N.line },
  first: { paddingTop: 0, borderTopWidth: 0 },
  list: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.md, paddingVertical: 7, paddingHorizontal: 6, marginHorizontal: -6 },
  rowTouch: { paddingVertical: 11 },
  swatch: { width: 16, height: 16, borderRadius: 5 },
  swatchOff: { opacity: 0.3 },
  label: { flex: 1, fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.ink },
  count: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted, fontVariant: ['tabular-nums'] },
  labelOff: { color: N.faint, textDecorationLine: 'line-through' },
});
