import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, w } from '@/design/tokens';
import { CHROME_BLUR, Press, Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { HERO } from '../copy';
import { RAMP } from '../ramp';

/**
 * Lime dot + eyebrow, the two-line H1 across the full width, then the body, CTAs
 * and the three stats beside `aside` (the WeekBoard diagram) on ≥1024, stacked
 * below. The H1 spans the width so the long accent line holds to two lines on
 * desktop rather than breaking word-by-word in a half column.
 */
export function Hero({
  onPrimary,
  onSecondary,
  aside,
}: {
  onPrimary: () => void;
  onSecondary: () => void;
  aside?: ReactNode;
}) {
  const { width } = useResponsive();
  const wide = width >= 1024;
  const h1 = width >= 1280 ? 64 : width >= 1024 ? 56 : width >= 640 ? 44 : 30;
  const lh = Math.round(h1 * 1.05);

  return (
    <View style={styles.wrap}>
      <View style={styles.eyebrow}>
        <View style={styles.dot} />
        <Txt style={styles.eyebrowTxt}>{HERO.eyebrow}</Txt>
      </View>

      <Txt accessibilityRole="header" style={[styles.h1, { fontSize: h1, lineHeight: lh }]}>
        {HERO.headlineTop}
        {'\n'}
        <Txt style={[styles.h1, { fontSize: h1, lineHeight: lh, color: C.lime }]}>{HERO.headlineAccent}</Txt>
      </Txt>

      <View style={[styles.split, wide ? styles.splitWide : null]}>
        <View style={[styles.copy, wide ? { flex: 1 } : null]}>
          <Txt style={styles.body}>{HERO.body}</Txt>

          <View style={styles.ctaRow}>
            <Press
              onPress={onPrimary}
              accessibilityRole="button"
              hoverBg={C.limeHover}
              hoverTransform={{ translateY: -2 }}
              style={styles.primary}>
              <Txt style={styles.primaryTxt}>{HERO.primaryCta}</Txt>
              <Txt style={styles.primaryArrow}>→</Txt>
            </Press>

            <Press onPress={onSecondary} accessibilityRole="button" hoverBg={w(0.15)} style={styles.secondary}>
              <Icon name="play-circle" size={18} color={RAMP.onBlue} />
              <Txt style={styles.secondaryTxt}>{HERO.secondaryCta}</Txt>
            </Press>
          </View>

          <View style={styles.stats}>
            {HERO.stats.map((s) => (
              <View key={s.label} style={styles.stat}>
                <Txt style={styles.statValue}>{s.value}</Txt>
                <Txt style={styles.statLabel}>{s.label}</Txt>
              </View>
            ))}
          </View>
        </View>

        {aside ? <View style={[styles.aside, wide ? { flex: 1.1 } : null]}>{aside}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', zIndex: 20 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 24 },
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
  eyebrowTxt: { flexShrink: 1, color: C.lime, letterSpacing: 2, fontSize: 12 },
  h1: { maxWidth: 1120, fontWeight: '500', letterSpacing: -1, color: '#fff' },
  split: { marginTop: 48, gap: 48 },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start', gap: 64 },
  copy: { gap: 28 },
  body: { maxWidth: 520, fontSize: 15, lineHeight: 24, color: RAMP.onBlue },
  ctaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 8,
    backgroundColor: C.lime,
    paddingHorizontal: 20,
    minHeight: 48,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  primaryTxt: { color: C.surface, fontWeight: '600', fontSize: 12, letterSpacing: 1 },
  primaryArrow: { color: C.surface, fontSize: 12 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: w(0.1),
    paddingHorizontal: 20,
    minHeight: 48,
    justifyContent: 'center',
    ...(CHROME_BLUR ?? {}),
  },
  secondaryTxt: { color: RAMP.onBlue, fontSize: 12, letterSpacing: 1 },
  stats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: w(0.18),
  },
  stat: { minWidth: 120, flexShrink: 1, gap: 4 },
  statValue: { color: C.lime, fontSize: 28, lineHeight: 32, fontWeight: '500', fontVariant: ['tabular-nums'] },
  statLabel: { maxWidth: 160, color: RAMP.onBlue, fontSize: 10, lineHeight: 14, letterSpacing: 1.5 },
  aside: { width: '100%' },
});
