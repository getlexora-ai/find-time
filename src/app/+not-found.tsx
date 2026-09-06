import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Frame } from '@/calendar/components/Frame';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { Icon } from '@/design/Icon';
import { C, R, w } from '@/design/tokens';
import { Txt } from '@/design/ui';

/**
 * 404, on the landing's own ground so a mistyped URL still looks like the product.
 * Pinned to `electric` for the same reason the landing is: this is a public surface
 * and must not depend on (or write) the calendar's stored background theme.
 */
export default function NotFound() {
  return (
    <CalendarThemeProvider forceTheme="electric">
      <View style={styles.root}>
        <Frame />
        <View style={styles.center}>
          <View style={styles.badge}>
            <Icon name="triangle" size={22} color={C.lime} />
          </View>
          <Txt style={styles.code}>404</Txt>
          <Txt style={styles.title}>THIS PAGE ISN&apos;T ON THE CALENDAR.</Txt>
          <Txt style={styles.body}>
            The link may be out of date, or the page may have moved.
          </Txt>
          <View style={styles.actions}>
            <Link href="/" style={styles.primary}>
              <Txt style={styles.primaryTxt}>BACK TO HOME</Txt>
            </Link>
            <Link href="/app" style={styles.secondary}>
              <Txt style={styles.secondaryTxt}>OPEN THE PLANNER</Txt>
            </Link>
          </View>
        </View>
      </View>
    </CalendarThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  badge: {
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.25),
    backgroundColor: w(0.1),
    marginBottom: 4,
  },
  code: { color: C.lime, fontSize: 12, letterSpacing: 2.4 },
  title: { fontSize: 24, lineHeight: 30, fontWeight: '500', letterSpacing: -0.5, textAlign: 'center' },
  body: { color: w(0.75), fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 420 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12, justifyContent: 'center' },
  primary: {
    borderRadius: R.lg,
    backgroundColor: C.lime,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  primaryTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  secondary: {
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: w(0.1),
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  secondaryTxt: { color: w(0.75), fontSize: 12 },
});
