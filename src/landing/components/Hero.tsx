import { StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, w } from '@/design/tokens';
import { CHROME_BLUR, Press, Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { HERO } from '../copy';
import { RAMP } from '../ramp';

/**
 * Lime dot + eyebrow, the two-line H1, the sub-paragraph, and the two hero CTAs —
 * ported from landing.html's `.max-w-2xl` block. The CTAs are inert in M1 (plan
 * §9 / §10 Q2 — their destinations are still the user's call); `onSecondary`
 * carries landing.html's `watchDemo` behaviour: scroll to the planner mock.
 */
export function Hero({ onPrimary, onSecondary }: { onPrimary: () => void; onSecondary: () => void }) {
  const { width } = useResponsive();
  const h1 = width >= 1024 ? 60 : width >= 640 ? 48 : 36;

  return (
    <View style={[styles.wrap, width >= 1024 ? { marginLeft: 56 } : null]}>
      <View style={styles.eyebrow}>
        <View style={styles.dot} />
        <Txt style={styles.eyebrowTxt}>{HERO.eyebrow}</Txt>
      </View>

      <Txt style={[styles.h1, { fontSize: h1, lineHeight: h1 }]}>
        {HERO.headlineTop}
        {'\n'}
        <Txt style={[styles.h1, { fontSize: h1, lineHeight: h1, color: C.lime }]}>{HERO.headlineAccent}</Txt>
      </Txt>

      <Txt style={styles.body}>{HERO.body}</Txt>

      <View style={styles.ctaRow}>
        <Press
          onPress={onPrimary}
          accessibilityRole="button"
          hoverTransform={{ translateY: -2 }}
          style={styles.primary}>
          <Icon name="magic" size={18} color={C.lime} />
          <Txt style={styles.primaryTxt}>{HERO.primaryCta}</Txt>
          <Txt style={styles.primaryArrow}>→</Txt>
        </Press>

        <Press
          onPress={onSecondary}
          accessibilityRole="button"
          hoverBg={w(0.15)}
          style={styles.secondary}>
          <Icon name="play-circle" size={18} color={RAMP.onBlue} />
          <Txt style={styles.secondaryTxt}>{HERO.secondaryCta}</Txt>
        </Press>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: 672, zIndex: 20 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: C.lime,
    // shadow-[0_0_16px_rgba(204,255,0,.8)]
    shadowColor: C.lime,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrowTxt: { color: C.lime, letterSpacing: 2, fontSize: 12 },
  h1: {
    maxWidth: 672,
    fontWeight: '500',
    letterSpacing: -0.5,
    color: '#fff',
  },
  body: {
    marginTop: 24,
    maxWidth: 512,
    fontSize: 14,
    lineHeight: 22,
    color: RAMP.onBlue,
  },
  ctaRow: { marginTop: 28, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    backgroundColor: C.surface,
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: 'center',
    // shadow-2xl
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  primaryTxt: { color: '#fff', fontWeight: '500', fontSize: 12 },
  primaryArrow: { color: w(0.3), fontSize: 12 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: w(0.1),
    paddingHorizontal: 20,
    minHeight: 44,
    justifyContent: 'center',
    ...(CHROME_BLUR ?? {}),
  },
  secondaryTxt: { color: RAMP.onBlue, fontSize: 12 },
});
