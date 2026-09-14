import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../Icon';
import type { ViewKind } from '../state';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import { CHROME_BLUR, Press, Txt } from '../ui';

/** Height of the bar above the home indicator. The grid pads by this so the
 *  last hour of the day is never parked underneath the nav. */
export const NAV_H = 64;

/**
 * The fixed bottom nav shown below 1024px.
 *
 * It now carries everything the desktop chrome has room for and a phone does
 * not: the Week / Day tabs that used to crowd the command bar into two ragged
 * rows, the "New" and "Find time" buttons that were simply hidden on a phone,
 * and the kind filters that only ever existed in the desktop sidebar.
 *
 * So the rule below the breakpoint is: the bar at the top is identity, period
 * and navigation; this bar is everything you *do*.
 */
export function MobileNav({
  view,
  onSetView,
  onCompose,
  onOpenAI,
  onOpenFilters,
}: {
  view: ViewKind;
  onSetView: (v: ViewKind) => void;
  onCompose: () => void;
  onOpenAI: () => void;
  onOpenFilters: () => void;
}) {
  const { theme } = useCalTheme();
  const insets = useSafeAreaInsets();

  const item = (
    label: string,
    icon: IconName,
    onPress: () => void,
    active = false,
    role: 'tab' | 'button' = 'button',
  ) => (
    <Press
      key={label}
      onPress={onPress}
      hoverBg={w(0.06)}
      style={styles.item}
      accessibilityRole={role}
      aria-selected={role === 'tab' ? active : undefined}
      aria-label={label}>
      <Icon name={icon} size={20} color={active ? C.lime : w(0.45)} />
      <Txt style={[styles.label, active && styles.labelOn]}>{label}</Txt>
    </Press>
  );

  return (
    <View
      style={[
        styles.bar,
        CHROME_BLUR,
        { backgroundColor: theme.chrome, paddingBottom: Math.max(12, insets.bottom) },
      ]}
      accessibilityRole="tablist"
      aria-label="Calendar navigation">
      <View style={styles.inner}>
        {item('Week', 'calendar', () => onSetView('week'), view === 'week', 'tab')}
        {item('Day', 'calendar-mark', () => onSetView('day'), view === 'day', 'tab')}

        <Press
          onPress={onCompose}
          style={styles.center}
          accessibilityRole="button"
          aria-label="New block">
          <View style={styles.centerDisc}>
            <Icon name="add" size={20} color={C.surface} />
          </View>
        </Press>

        {item('Find time', 'magic', onOpenAI)}
        {item('Show', 'eye', onOpenFilters)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  inner: { width: '100%', maxWidth: 512, alignSelf: 'center', flexDirection: 'row' },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: R.lg,
    paddingVertical: 8,
  },
  label: { fontSize: 10, lineHeight: 14, color: w(0.45) },
  labelOn: { color: C.lime },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 4 },
  centerDisc: {
    height: 44,
    width: 44,
    borderRadius: R.full,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.lime,
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 8,
  },
});
