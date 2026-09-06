import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../Icon';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import { CHROME_BLUR, Press, Txt } from '../ui';
import { useToast } from './Toast';

/**
 * The fixed 5-item bottom nav `calendar.html` shows below `lg` (lines 277-298).
 *
 * Today / Projects are the same out-of-scope stubs the prototype ships — they
 * toast rather than navigate, because the mockup is a single page. Calendar is
 * the active item and is inert; the lime ⊕ in the middle opens compose, and
 * Ask AI opens the same slide-over as the desktop header's "Plan with AI".
 */
export function MobileNav({
  onCompose,
  onOpenAI,
}: {
  onCompose: () => void;
  onOpenAI: () => void;
}) {
  const { theme } = useCalTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();

  const item = (label: string, icon: IconName, onPress: () => void, active = false) => (
    <Press
      key={label}
      onPress={onPress}
      hoverBg={w(0.06)}
      style={styles.item}
      accessibilityRole="button"
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
      aria-label="Mobile navigation">
      <View style={styles.inner}>
        {item('Today', 'sun', () => toast('Today is out of scope for this prototype'))}
        {item('Projects', 'folder', () => toast('Projects is out of scope for this prototype'))}

        <Press
          onPress={onCompose}
          style={styles.center}
          accessibilityRole="button"
          aria-label="New event">
          <View style={styles.centerDisc}>
            <Icon name="add" size={20} color={C.surface} />
          </View>
        </Press>

        {item('Calendar', 'calendar', () => {}, true)}
        {item('Ask AI', 'magic', onOpenAI)}
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
    paddingHorizontal: 12,
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
  label: { fontSize: 11, lineHeight: 15, color: w(0.45) },
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
