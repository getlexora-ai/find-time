import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, R, w } from '@/design/tokens';
import { CHROME_BLUR, Press, Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { HEADER } from '../copy';
import { RAMP } from '../ramp';
import type { AnchorId } from '../useAnchors';

/** Logo + `FIND TIME` + the `md`-and-up nav + the primary CTA. */
export function LandingHeader({
  onNav,
  onCta,
}: {
  onNav: (id: AnchorId) => void;
  onCta: () => void;
}) {
  const { width } = useResponsive();
  const isMd = width >= 768; // landing.html `md:flex` on the nav
  const isSm = width >= 640;

  return (
    <View style={[styles.bar, { paddingHorizontal: isSm ? 40 : 24 }]}>
      <Pressable
        onPress={() => onNav('planner')}
        accessibilityRole="link"
        aria-label={HEADER.homeLabel}
        style={styles.brand}>
        {({ hovered }: { hovered?: boolean }) => (
          <>
            <View style={[styles.logo, hovered ? { borderColor: C.lime } : null]}>
              <Icon name="clock" size={20} color={C.lime} />
            </View>
            <Txt style={styles.brandTxt}>{HEADER.brand}</Txt>
          </>
        )}
      </Pressable>

      {isMd && (
        <View style={styles.nav} role="navigation">
          {HEADER.nav.map((item) => (
            <NavLink key={item.anchor} label={item.label} onPress={() => onNav(item.anchor)} />
          ))}
        </View>
      )}

      <Press
        onPress={onCta}
        accessibilityRole="button"
        hoverBg={C.limeHover}
        hoverTransform={{ translateY: -2 }}
        style={styles.cta}>
        <Txt style={styles.ctaTxt}>{HEADER.cta}</Txt>
        <Icon name="arrow-right-up" size={16} color={C.surface} />
      </Press>
    </View>
  );
}

/** `hover:text-white` needs the hover flag inside the child, which `Press` can't
 *  forward — so the nav link drives `Pressable` directly. */
function NavLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.navHit}>
      {({ hovered }: { hovered?: boolean }) => (
        <Txt style={[styles.navTxt, hovered ? { color: '#fff' } : null]}>{label}</Txt>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    width: '100%',
    maxWidth: 1280,
    alignSelf: 'center',
    marginTop: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 20,
    gap: 16,
    zIndex: 40,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logo: {
    height: 40,
    width: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.25),
    backgroundColor: w(0.1),
    ...(CHROME_BLUR ?? {}),
  },
  brandTxt: { fontSize: 14, fontWeight: '500', letterSpacing: -0.3 },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 28 },
  // ≥44px touch target (spec §6); the mockup's bare <a> is ~16px tall.
  navHit: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 2 },
  navTxt: { color: RAMP.onBlueMuted, fontSize: 12 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: 'rgba(204,255,0,0.5)',
    backgroundColor: C.lime,
    paddingHorizontal: 16,
    // landing.html is py-2.5 (~38px tall); raised to clear 44px (spec §6).
    minHeight: 44,
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  ctaTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
});
