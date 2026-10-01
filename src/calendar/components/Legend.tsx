import { StyleSheet, View } from 'react-native';

import { KIND_KEYS, KINDS, paint } from '../kinds';
import { N, R, SANS, T } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { Label, Mono, Press, Txt } from '../ui';

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
}: {
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  touch?: boolean;
}) {
  return (
    <View style={styles.section}>
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
              <Mono>{off ? 'hidden' : n}</Mono>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: N.line },
  list: { marginTop: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.sm, paddingVertical: 5, paddingHorizontal: 2 },
  rowTouch: { paddingVertical: 10 },
  swatch: { width: 16, height: 12, borderRadius: R.xs },
  swatchOff: { opacity: 0.3 },
  label: { flex: 1, fontFamily: SANS, ...T.caption, color: N.ink },
  labelOff: { color: N.faint, textDecorationLine: 'line-through' },
});
