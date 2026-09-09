import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import { CHROME_BLUR, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { AccountButton } from './AccountButton';
import { useToast } from './Toast';

/** Sticky top bar. bg is the theme "chrome" colour (calendar.html `ft-chrome`). */
export function Header({
  onOpenTheme,
  onOpenAI,
}: {
  onOpenTheme: (anchor: { x: number; y: number }) => void;
  onOpenAI: () => void;
}) {
  const { theme } = useCalTheme();
  const { width, isDesktop, isPhone } = useResponsive();
  const toast = useToast();
  const themeBtn = useRef<View>(null);

  return (
    <View style={[styles.bar, CHROME_BLUR, { backgroundColor: theme.chrome }]}>
      {isDesktop ? (
        <View style={styles.left}>
          <Txt style={styles.crumbMuted}>Workspace</Txt>
          <Txt style={styles.crumbMuted}>/</Txt>
          <Txt style={styles.crumb}>Calendar</Txt>
          <View style={styles.syncPill}>
            <Txt style={styles.syncTxt}>SYNC 2M AGO</Txt>
          </View>
        </View>
      ) : (
        <View style={styles.left}>
          <View style={styles.logo}>
            <Txt style={styles.logoTxt}>FT</Txt>
          </View>
          <Txt style={styles.appName}>Calendar</Txt>
        </View>
      )}

      <View style={styles.right}>
        <Press
          onPress={() => toast('Search events, projects, and free windows')}
          hoverBg={w(0.1)}
          style={styles.searchBtn}
          accessibilityRole="button"
          aria-label="Search">
          <Icon name="search" size={16} color={w(0.5)} />
          {!isPhone && <Txt style={styles.searchTxt}>Search</Txt>}
          {/* calendar.html shows the shortcut badge from md (768), not lg */}
          {width >= 768 && (
            <View style={styles.kbd}>
              <Txt style={styles.kbdTxt}>⌘ K</Txt>
            </View>
          )}
        </Press>

        <Press
          ref={themeBtn}
          hoverBg={w(0.1)}
          style={styles.iconBtn}
          accessibilityRole="button"
          aria-label="Change background theme"
          onPress={() => {
            themeBtn.current?.measureInWindow((x, y) => onOpenTheme({ x, y }));
          }}>
          <Icon name="palette" size={18} color={w(0.6)} />
        </Press>

        <Press
          hoverBg={w(0.1)}
          style={styles.iconBtn}
          accessibilityRole="button"
          aria-label="Notifications"
          onPress={() => toast('1 clash and 2 AI suggestions waiting')}>
          <Icon name="bell" size={18} color={w(0.6)} />
          <View style={styles.bellDot} />
        </Press>

        {!isPhone && (
          <Press onPress={onOpenAI} hoverBg={C.limeHover} style={styles.aiBtn} accessibilityRole="button">
            <Icon name="magic" size={16} color={C.surface} />
            <Txt style={styles.aiTxt}>Plan with AI</Txt>
          </Press>
        )}

        {/* Desktop puts the account control in the sidebar; here it covers mobile. */}
        {!isDesktop && <AccountButton />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
    paddingHorizontal: 16,
    zIndex: 40,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: {
    height: 36,
    width: 36,
    borderRadius: R.lg,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoTxt: { color: C.surface, fontSize: 14, fontWeight: '600', letterSpacing: -0.5 },
  appName: { fontSize: 14, fontWeight: '500' },
  crumb: { color: '#fff', fontSize: 12 },
  crumbMuted: { color: w(0.45), fontSize: 12 },
  syncPill: {
    marginLeft: 8,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  syncTxt: { fontSize: 10, lineHeight: 14, color: w(0.4), letterSpacing: 1, textTransform: 'uppercase' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 12,
  },
  searchTxt: { color: w(0.5), fontSize: 12 },
  kbd: { borderRadius: R.sm, borderWidth: 1, borderColor: w(0.1), paddingHorizontal: 6, paddingVertical: 2 },
  kbdTxt: { color: w(0.3), fontSize: 12 },
  iconBtn: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
  },
  bellDot: {
    position: 'absolute',
    right: 8,
    top: 8,
    height: 6,
    width: 6,
    borderRadius: 3,
    backgroundColor: C.orange,
  },
  aiBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    backgroundColor: C.lime,
    paddingHorizontal: 16,
    shadowColor: C.lime,
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  aiTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
});
