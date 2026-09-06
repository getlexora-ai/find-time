import { useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, View } from 'react-native';

import { Frame } from '@/calendar/components/Frame';
import { Marquee } from '@/calendar/components/Marquee';
import { ToastProvider } from '@/calendar/components/Toast';
import { CalendarThemeProvider } from '@/calendar/theme-context';
import { w } from '@/design/tokens';
import { Press, Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { FOOTER, MARQUEE, TELEMETRY } from './copy';
import { RAMP } from './ramp';
import { useAnchors } from './useAnchors';
import { FeatureGrid } from './components/FeatureGrid';
import { FloatingWidgets } from './components/FloatingWidgets';
import { Hero } from './components/Hero';
import { LandingHeader } from './components/LandingHeader';
import { MockPhoneCard } from './components/MockPhoneCard';
import { MockPlannerCard } from './components/MockPlannerCard';

/**
 * Composition root for the web landing page (plan §3.3). Pinned to the `electric`
 * ground; `Frame` and `Marquee` sit outside the `ScrollView` as static siblings
 * (landing.html has them `position: fixed` — RN can't, and the visible delta is
 * nil since both hug an edge). The mock cards' interactions are self-contained
 * except capacity, which the planner's regenerate drops on the phone card.
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
  const { width, isDesktop, isWide } = useResponsive();
  const { scrollRef, register, scrollTo } = useAnchors();
  const [capacity, setCapacity] = useState(78);

  const pad = width >= 640 ? 40 : 24;
  const onFeaturesLayout = (e: LayoutChangeEvent) => {
    register('features')(e);
    register('focus')(e);
  };

  return (
    <View style={styles.root}>
      <Frame />
      <Marquee copy={MARQUEE} />

      <ScrollView ref={scrollRef} contentContainerStyle={[styles.content, { paddingHorizontal: pad }]}>
        <LandingHeader onNav={scrollTo} onCta={noop} />

        <View
          onLayout={register('planner')}
          style={[styles.hero, { minHeight: isDesktop ? 860 : 940, paddingTop: isDesktop ? 64 : 40 }]}>
          <Hero onPrimary={noop} onSecondary={() => scrollTo('planner')} />

          {isWide && (
            <View style={styles.telemetry} pointerEvents="none">
              {TELEMETRY.map((t) => (
                <Txt key={t} style={styles.telemetryTxt}>
                  {t}
                </Txt>
              ))}
            </View>
          )}

          <View style={[styles.cards, isDesktop ? styles.cardsDesktop : styles.cardsStacked]}>
            <View style={isDesktop ? { flex: 1.2 } : undefined}>
              <MockPlannerCard onAddTask={noop} onRegenerate={() => setCapacity(72)} />
            </View>
            <View style={isDesktop ? styles.phoneSlot : undefined}>
              <MockPhoneCard capacity={capacity} />
            </View>
          </View>

          <FloatingWidgets />
        </View>

        <View onLayout={onFeaturesLayout} style={styles.features}>
          <FeatureGrid />
        </View>

        <View style={styles.footer}>
          <Txt style={styles.footerBrand}>{FOOTER.brand}</Txt>
          <Txt style={styles.footerTagline}>{FOOTER.tagline}</Txt>
          <View style={styles.footerLinks}>
            {FOOTER.links.map((l) => (
              <Press key={l.href} onPress={noop} accessibilityRole="link">
                <Txt style={styles.footerLink}>{l.label}</Txt>
              </Press>
            ))}
          </View>
          <Txt style={styles.footerCopy}>{FOOTER.copyright}</Txt>
        </View>
      </ScrollView>
    </View>
  );
}

const noop = () => {};

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { maxWidth: 1440, width: '100%', alignSelf: 'center', paddingBottom: 80 },
  hero: { width: '100%', maxWidth: 1280, alignSelf: 'center', position: 'relative' },
  telemetry: {
    position: 'absolute',
    left: 16,
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
  footerLink: { color: RAMP.onBlueMuted, fontSize: 12, letterSpacing: 1 },
  footerCopy: { color: RAMP.onBlueFaint, fontSize: 12, marginTop: 8 },
});
