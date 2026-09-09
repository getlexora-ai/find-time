import Head from 'expo-router/head';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Frame } from '@/calendar/components/Frame';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { C, w } from '@/design/tokens';
import { Txt } from '@/design/ui';

import { LEGAL_UPDATED, type LegalSection } from './legal-copy';
import { RAMP } from './ramp';

/**
 * Shared shell for /privacy and /terms. Same `electric` ground and `Frame` as
 * `+not-found.tsx` — a public surface that must not read or write the calendar's
 * stored background theme. Plain scrollable prose; content comes from
 * `legal-copy.ts`.
 */
export function LegalScreen({
  title,
  description,
  intro,
  sections,
}: {
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}) {
  return (
    <CalendarThemeProvider forceTheme="electric">
      <Head>
        <title>{`${title} — Find Time`}</title>
        <meta name="description" content={description} />
      </Head>
      <View style={styles.root}>
        <Frame />
        <ScrollView contentContainerStyle={styles.content}>
          <Link href="/" style={styles.back}>
            ← FIND TIME
          </Link>
          <Txt style={styles.h1}>{title}</Txt>
          <Txt style={styles.updated}>LAST UPDATED {LEGAL_UPDATED.toUpperCase()}</Txt>
          <Txt style={styles.intro}>{intro}</Txt>

          {sections.map((s) => (
            <View key={s.heading} style={styles.section}>
              <Txt style={styles.h2}>{s.heading}</Txt>
              {s.body.map((p, i) => (
                <Txt key={i} style={styles.p}>
                  {p}
                </Txt>
              ))}
            </View>
          ))}

          <View style={styles.footerLinks}>
            <Link href="/privacy" style={styles.footerLink}>
              PRIVACY
            </Link>
            <Link href="/terms" style={styles.footerLink}>
              TERMS
            </Link>
          </View>
        </ScrollView>
      </View>
    </CalendarThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  content: {
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 96,
    gap: 8,
  },
  back: { color: RAMP.onBlueMuted, fontSize: 12, letterSpacing: 1, fontFamily: 'monospace', marginBottom: 16 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '500', letterSpacing: -0.5 },
  updated: { color: C.lime, fontSize: 11, letterSpacing: 2, marginTop: 4 },
  intro: { color: RAMP.onBlue, fontSize: 13, lineHeight: 20, marginTop: 16 },
  section: { marginTop: 24, gap: 8 },
  h2: { fontSize: 13, fontWeight: '500', letterSpacing: 0.3 },
  p: { color: w(0.78), fontSize: 12, lineHeight: 19 },
  footerLinks: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 48,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
  },
  footerLink: { color: RAMP.onBlueMuted, fontSize: 12, letterSpacing: 1, fontFamily: 'monospace' },
});
