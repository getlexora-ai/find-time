import Head from 'expo-router/head';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Frame } from '@/calendar/components/Frame';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { C, w } from '@/design/tokens';
import { Txt } from '@/design/ui';

import { WAITLIST } from './copy';
import { RAMP } from './ramp';
import { WaitlistForm } from './components/WaitlistForm';

/**
 * `/waitlist` — the dedicated early-access page the header + hero CTAs point to.
 * Same `electric` ground and `Frame` shell as `LegalScreen` (a public surface
 * that must not read or write the calendar's stored theme). The form is the
 * shared `WaitlistForm` in its `detailed` layout: email required, name + "why"
 * optional and skippable.
 */
export function WaitlistScreen() {
  return (
    <CalendarThemeProvider forceTheme="electric">
      <Head>
        <title>{`${WAITLIST.pageTitle} — Find Time`}</title>
        <meta name="description" content={WAITLIST.metaDescription} />
      </Head>
      <View style={styles.root}>
        <Frame />
        <ScrollView contentContainerStyle={styles.content}>
          <Link href="/" style={styles.back}>
            {WAITLIST.back}
          </Link>

          <View style={styles.eyebrow}>
            <View style={styles.dot} />
            <Txt style={styles.eyebrowTxt}>{WAITLIST.eyebrow}</Txt>
          </View>

          <Txt style={styles.h1}>{WAITLIST.pageTitle}</Txt>
          <Txt style={styles.body}>{WAITLIST.pageBody}</Txt>

          <View style={styles.form}>
            <WaitlistForm detailed source="waitlist_page" />
          </View>

          <Txt style={styles.consent}>
            {WAITLIST.consent}{' '}
            <Link href="/privacy" style={styles.consentLink}>
              {WAITLIST.consentPrivacy}
            </Link>{' '}
            {WAITLIST.consentAnd}{' '}
            <Link href="/terms" style={styles.consentLink}>
              {WAITLIST.consentTerms}
            </Link>
            .
          </Txt>
        </ScrollView>
      </View>
    </CalendarThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  content: {
    maxWidth: 620,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 96,
    gap: 8,
  },
  back: { color: RAMP.onBlueMuted, fontSize: 12, letterSpacing: 1, fontFamily: 'monospace', marginBottom: 24 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrowTxt: { color: C.lime, letterSpacing: 2, fontSize: 12 },
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '500', letterSpacing: -0.5 },
  body: { color: RAMP.onBlue, fontSize: 13, lineHeight: 21, marginTop: 14, maxWidth: 520 },
  form: { marginTop: 28, alignItems: 'flex-start' },
  consent: { marginTop: 20, color: w(0.5), fontSize: 11, lineHeight: 16 },
  consentLink: { color: w(0.7), fontSize: 11, fontFamily: 'monospace' },
});
