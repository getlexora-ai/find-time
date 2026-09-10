import { lazy, Suspense } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

import { Frame } from '@/calendar/components/Frame';
import { Marquee } from '@/calendar/components/Marquee';
import { ToastProvider } from '@/calendar/components/Toast';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { FOOTER, MARQUEE, TELEMETRY } from './copy';
import { RAMP } from './ramp';
import { useAnchors } from './useAnchors';
import { CookieConsent } from './components/CookieConsent';
import { DemoVideo } from './components/DemoVideo';
import { FeatureGrid } from './components/FeatureGrid';
import { Hero } from './components/Hero';
import { LandingHeader } from './components/LandingHeader';
import { WaitlistSection } from './components/WaitlistSection';

/**
 * Composition root for the web landing page (plan §3.3). Pinned to the `electric`
 * ground; `Frame` and `Marquee` sit outside the `ScrollView` as static siblings
 * (landing.html has them `position: fixed` — RN can't, and the visible delta is
 * nil since both hug an edge). The hero's two mock cards are replaced by
 * `DemoVideo` — the pre-rendered German-learning walkthrough (a looping,
 * borderless <video> from public/find-time-walkthrough-hq.{webm,mp4}). The old
 * interactive mocks (MockPlannerCard / MockPhoneCard /
 * useDemoSequence) are kept in the tree but no longer mounted here.
 *
 * `FloatingWidgets` (drag + Animated + PanResponder, purely decorative and
 * off-screen on phone) is `React.lazy`'d so its chunk isn't in the `/` first
 * load. Everything above the fold stays eager.
 */
const FloatingWidgets = lazy(() =>
  import('./components/FloatingWidgets').then((m) => ({ default: m.FloatingWidgets })),
);

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

  const pad = width >= 640 ? 40 : 24;
  const onHeroLayout = (e: LayoutChangeEvent) => {
    register('planner')(e);
  };
  const onFeaturesLayout = (e: LayoutChangeEvent) => {
    register('features')(e);
    register('focus')(e);
  };
  const toWaitlist = () => scrollTo('waitlist');

  return (
    <View style={styles.root}>
      <Frame />
      <Marquee copy={MARQUEE} />

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingHorizontal: pad }]}>
        <LandingHeader onNav={scrollTo} onCta={toWaitlist} />

        <View
          onLayout={onHeroLayout}
          style={[styles.hero, { minHeight: isDesktop ? 960 : 940, paddingTop: isDesktop ? 64 : 40 }]}>
          <Hero onPrimary={toWaitlist} onSecondary={() => scrollTo('planner')} />

          {is2xl && (
            <View style={styles.telemetry} pointerEvents="none">
              {TELEMETRY.map((t) => (
                <Txt key={t} style={styles.telemetryTxt}>
                  {t}
                </Txt>
              ))}
            </View>
          )}

          <View style={[styles.cards, isDesktop ? styles.cardsDesktop : styles.cardsStacked]}>
            <DemoVideo />
          </View>

          <Suspense fallback={null}>
            <FloatingWidgets />
          </Suspense>
        </View>

        <View onLayout={onFeaturesLayout} style={styles.features}>
          <FeatureGrid />
        </View>

        <View onLayout={register('waitlist')}>
          <WaitlistSection />
        </View>

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
  hero: { width: '100%', maxWidth: 1280, alignSelf: 'center', position: 'relative' },
  telemetry: {
    position: 'absolute',
    // in the left gutter of the centred 1280 hero — only mounted at is2xl, where
    // there is >=128px of gutter, so it never collides with the ml-56 headline
    // (landing.html hides this behind text-white/35; the a11y contrast bump in
    // ramp.ts makes it too loud to sit under the H1). See HANDOFF-landing.md.
    left: -32,
    top: 96,
    bottom: 64,
    justifyContent: 'space-between',
  },
  telemetryTxt: { color: RAMP.onBlueFaint, fontSize: 12 },
  cards: { gap: 20 },
  cardsStacked: { marginTop: 48 },
  cardsDesktop: {
    position: 'absolute',
    left: '31%',
    top: '34%',
    width: '69%',
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  phoneSlot: { flex: 0.72, marginTop: 48, marginLeft: -20, zIndex: 20 },
  features: { marginTop: 64, width: '100%' },
  footer: {
    marginTop: 64,
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    paddingTop: 32,
  },
  footerBrand: { color: '#fff', fontSize: 14, fontWeight: '500', letterSpacing: -0.3 },
  footerTagline: { color: RAMP.onBlueMuted, fontSize: 12, letterSpacing: 1 },
  footerLinks: { flexDirection: 'row', gap: 24, marginTop: 8 },
  footerLink: {
    color: RAMP.onBlueMuted,
    fontSize: 12,
    letterSpacing: 1,
    fontFamily: 'monospace',
  },
  footerCopy: { color: RAMP.onBlueFaint, fontSize: 12, marginTop: 8 },
});
