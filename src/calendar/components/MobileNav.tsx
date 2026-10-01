import { Platform, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../Icon';
import type { Page, ViewKind } from '../state';
import { N, R, SANS, SHADOW } from '../tokens';
import { Press, Txt } from '../ui';

export const NAV_H = 64;

const BLUR = Platform.select({
  web: { backdropFilter: 'blur(16px)' } as unknown as ViewStyle,
  default: undefined,
});

/** Phone bottom bar: the two views, New, Ask, and Insights. "Show" is in the top bar. */
export function MobileNav({
  view,
  page,
  onSetView,
  onCompose,
  onOpenAI,
  onInsights,
}: {
  view: ViewKind;
  page: Page;
  onSetView: (v: ViewKind) => void;
  onCompose: () => void;
  onOpenAI: () => void;
  onInsights: () => void;
}) {
  const planner = page === 'planner';
  const insets = useSafeAreaInsets();

  const item = (label: string, icon: IconName, onPress: () => void, active = false, role: 'tab' | 'button' = 'button') => (
    <Press
      key={label}
      onPress={onPress}
      hoverBg={N.hover}
      style={styles.item}
      accessibilityRole={role}
      aria-selected={role === 'tab' ? active : undefined}
      aria-label={label}>
      <Icon name={icon} size={20} color={active ? N.ink : N.faint} />
      <Txt style={[styles.label, active && styles.labelOn]}>{label}</Txt>
    </Press>
  );

  return (
    <View style={[styles.bar, BLUR, { paddingBottom: Math.max(10, insets.bottom) }]} aria-label="Calendar navigation">
      <View style={styles.inner}>
        {item('Week', 'calendar', () => onSetView('week'), planner && view === 'week', 'tab')}
        {item('Day', 'calendar-mark', () => onSetView('day'), planner && view === 'day', 'tab')}
        <Press onPress={onCompose} style={styles.center} accessibilityRole="button" aria-label="New block">
          <View style={[styles.centerDisc, SHADOW.md]}>
            <Icon name="add" size={20} color={N.onInk} />
          </View>
        </Press>
        {item('Ask', 'magic', onOpenAI)}
        {item('Insights', 'chart', onInsights, !planner, 'tab')}
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
    borderTopColor: N.line,
    backgroundColor: N.glass,
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  inner: { width: '100%', maxWidth: 512, alignSelf: 'center', flexDirection: 'row' },
  item: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, height: 48, borderRadius: R.md },
  label: { fontFamily: SANS, fontSize: 11, lineHeight: 14, color: N.muted },
  labelOn: { color: N.ink, fontWeight: '500' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 48 },
  centerDisc: { width: 44, height: 44, borderRadius: R.lg, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
});
