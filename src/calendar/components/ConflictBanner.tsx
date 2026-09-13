import { StyleSheet, View } from 'react-native';

import { fromIso, toMin, wdIndex, WD_LONG } from '../cal-date';
import { Icon } from '../Icon';
import { C, durLabel, R, rgba, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/** Describes a real overlap found by `overlapping()` in CalendarScreen. The copy
 *  used to be two hardcoded sentences about a fixture double-book ("Product team
 *  sync overlaps Roadmap review with Maya"), shown to every user. */
export function ConflictBanner({ a, b, onResolve }: { a: CalEvent; b: CalEvent; onResolve: () => void }) {
  const { isPhone } = useResponsive();
  const overlapMin = Math.max(0, Math.min(toMin(a.end), toMin(b.end)) - toMin(b.start));
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name="triangle" size={18} color={C.surface} />
      </View>
      <View style={styles.body}>
        <Txt style={styles.title}>
          Double-booked {WD_LONG[wdIndex(fromIso(a.date))]} {b.start}
        </Txt>
        <Txt style={styles.sub}>
          {a.title} overlaps {b.title} by {durLabel(overlapMin)}.
        </Txt>
      </View>
      {!isPhone && (
        <Press onPress={onResolve} hoverBg="#ff5a1f" style={styles.resolve} accessibilityRole="button">
          <Txt style={styles.resolveTxt}>Resolve</Txt>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: rgba('#ff4400', 0.4),
    backgroundColor: rgba('#ff4400', 0.1),
    padding: 16,
  },
  badge: {
    height: 36,
    width: 36,
    borderRadius: R.lg,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 12, lineHeight: 16 },
  sub: { marginTop: 4, color: w(0.5), fontSize: 12, lineHeight: 16 },
  resolve: { borderRadius: R.lg, backgroundColor: C.orange, paddingHorizontal: 12, paddingVertical: 8 },
  resolveTxt: { color: C.surface, fontSize: 12 },
});
