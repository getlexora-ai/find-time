import { ScrollView, StyleSheet, View } from 'react-native';
import { Link, useRouter } from 'expo-router';

import { Frame } from '@/calendar/components/Frame';
import { Marquee } from '@/calendar/components/Marquee';
import { ToastProvider } from '@/calendar/components/Toast';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { FOOTER, MARQUEE, TELEMETRY } from './copy';
import { RAMP } from './ramp';
import { type AnchorId, useAnchors } from './useAnchors';
import { Connectors } from './components/Connectors';
import { CookieConsent } from './components/CookieConsent';
import { Ecosystem } from './components/Ecosystem';
import { Hero } from './components/Hero';
import { LandingHeader } from './components/LandingHeader';
import { PainPoints } from './components/PainPoints';
import { WaitlistSection } from './components/WaitlistSection';
import { WeekBoard } from './components/WeekBoard';
import { Workflows } from './components/Workflows';

/**
 * Composition root for the web landing page, positioned as an AI calendar
 * planner with the agent's connectors behind it (HANDOFF-landing.md §11). Pinned
 * to the `electric` ground; `Frame` and `Marquee` sit outside the `ScrollView` as
 * static siblings.
 *
 * The page shows, it doesn't explain: hero + a week getting planned → the pain,
 * as four small pictures → flowcharts of calendar jobs (with the live walkthrough
 * video) → the Connections screen → the ecosystem diagram → waitlist.
 * ConnectorHub and the landing.html mocks (MockPlannerCard / MockPhoneCard /
 * FloatingWidgets / useDemoSequence) stay in the tree, unmounted.
 */
export function LandingScreen() {
  return (
    <CalendarThemeProvider forceTheme="electric">
      <ToastProvider>
        <Body />
      </ToastProvider>
    </CalendarThemeProvider>
  );
}

function Body() {
  const { width, isDesktop, is2xl } = useResponsive();
  const { scrollRef, register, scrollTo } = useAnchors();
  const router = useRouter();

  const pad = width >= 640 ? 40 : 24;
  const sectionGap = { marginTop: isDesktop ? 128 : 80 };
  const toWaitlist = () => router.push('/waitlist');
  /** A page section: shared width + rhythm, and an anchor when it has one. */
  const section = (id?: AnchorId) => ({
    style: [styles.section, sectionGap],
    onLayout: id ? register(id) : undefined,
  });

  return (
    <View style={styles.root}>
      <Frame />
      <Marquee copy={MARQUEE} />

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingHorizontal: pad }]}>
        <LandingHeader onNav={scrollTo} onCta={toWaitlist} />

        <View onLayout={register('top')} style={[styles.section, { paddingTop: isDesktop ? 64 : 40 }]}>
          <Hero onPrimary={toWaitlist} onSecondary={() => scrollTo('workflows')} aside={<WeekBoard />} />

          {is2xl && (
            <View style={styles.telemetry} pointerEvents="none">
              {TELEMETRY.map((t) => (
                <Txt key={t} style={styles.telemetryTxt}>
                  {t}
                </Txt>
              ))}
            </View>
          )}
        </View>

        <View {...section('problem')}>
          <PainPoints />
        </View>

        <View {...section('workflows')}>
          <Workflows />
        </View>

        <View {...section('connectors')}>
          <Connectors />
        </View>

        <View {...section('privacy')}>
          <Ecosystem />
        </View>

        <WaitlistSection />

        <View style={styles.footer}>
          <Txt style={styles.footerBrand}>{FOOTER.brand}</Txt>
          <Txt style={styles.footerTagline}>{FOOTER.tagline}</Txt>
          <View style={styles.footerLinks}>
            {FOOTER.links.map((l) => (
              <Link key={l.href} href={l.href} style={styles.footerLink}>
                {l.label}
              </Link>
            ))}
          </View>
          <Txt style={styles.footerCopy}>{FOOTER.copyright}</Txt>
        </View>
      </ScrollView>

      <CookieConsent />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { maxWidth: 1440, width: '100%', alignSelf: 'center', paddingBottom: 80 },
  // 1200 = the header bar's 1280 minus its 40px side padding, so every section's
  // left edge lines up with the logo.
  section: { width: '100%', maxWidth: 1200, alignSelf: 'center', position: 'relative' },
  telemetry: {
    position: 'absolute',
    // in the left gutter — only mounted at is2xl, where there is room beside the
    // 1200 column (see HANDOFF-landing.md §4.1).
    left: -72,
    top: 96,
    bottom: 0,
    justifyContent: 'space-between',
  },
  telemetryTxt: { color: RAMP.onBlueFaint, fontSize: 12 },
  footer: {
    marginTop: 64,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    paddingTop: 32,
  },
  footerBrand: { color: '#fff', fontSize: 14, fontWeight: '500', letterSpacing: -0.3 },
  footerTagline: { color: RAMP.onBlueMuted, fontSize: 12, letterSpacing: 1, textAlign: 'center' },
  footerLinks: { flexDirection: 'row', gap: 24, marginTop: 8 },
  footerLink: {
    color: RAMP.onBlueMuted,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  footerCopy: { color: RAMP.onBlueFaint, fontSize: 12, marginTop: 8 },
});
