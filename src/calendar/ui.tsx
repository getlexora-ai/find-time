import { forwardRef } from 'react';
import {
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';

import { MONO, N, R, SANS, SHADOW, T, TRANSITION } from './tokens';

export { MONO, SANS };

/**
 * The calendar's primitives, drawn only from `tokens.ts`.
 *
 * (The landing page keeps `@/design/ui`, whose `Txt` is white mono on the old
 * dark ground. Nothing here imports it.)
 */

/**
 * Spread on the root of anything that renders in a portal (Modal): it marks
 * the subtree as calendar UI, so global.css gives it the ink focus ring rather
 * than the landing's lime one. `dataSet` becomes `data-nexus` on web.
 */
export const NEXUS_SURFACE = { dataSet: { nexus: '' } } as object;

/** Readable text: Google Sans Flex, ink, 13px. */
export function Txt({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[styles.txt, style]} />;
}

/** Times, dates, counts: sans with tabular figures (was JetBrains Mono). */
export function Mono({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[styles.mono, style]} />;
}

/** The small label above a value ("Planned", "Kind"). */
export function Label({ style, children, ...rest }: TextProps) {
  return (
    <Text {...rest} style={[styles.label, style]}>
      {children}
    </Text>
  );
}

type PressProps = Omit<PressableProps, 'style'> & {
  /** background while hovered (web) or pressed */
  hoverBg?: string;
  /** lift 1px and step the shadow up while hovered */
  lift?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Pressable with hover/press feedback and the Nexus transition. */
export const Press = forwardRef<View, PressProps>(function Press(
  { hoverBg, lift, style, children, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
        TRANSITION,
        style,
        (hovered || pressed) && hoverBg ? { backgroundColor: hoverBg } : null,
        hovered && lift ? [{ transform: [{ translateY: -1 }] }, SHADOW.md] : null,
        pressed && !hoverBg ? { opacity: 0.85 } : null,
        rest.disabled ? { opacity: 0.4 } : null,
      ]}>
      {children as React.ReactNode}
    </Pressable>
  );
});

/**
 * Buttons. Three, and only three:
 *   primary   ink fill, white text, md shadow — one per surface
 *   secondary white, sm shadow
 *   ghost     no fill until hovered
 */
export function Button({
  label,
  onPress,
  variant = 'secondary',
  icon,
  disabled,
  style,
  accessibilityLabel,
}: {
  label?: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const v = BTN[variant];
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      hoverBg={v.hover}
      accessibilityRole="button"
      aria-label={accessibilityLabel ?? label}
      style={[styles.btn, !label && styles.btnIcon, v.box, style]}>
      {icon}
      {!!label && <Txt style={[styles.btnTxt, { color: v.ink }]}>{label}</Txt>}
    </Press>
  );
}

const BTN = {
  primary: { box: [{ backgroundColor: N.ink }, SHADOW.md], hover: N.inkHover, ink: N.onInk },
  secondary: { box: [{ backgroundColor: N.surface }, SHADOW.sm], hover: N.sunken, ink: N.ink },
  ghost: { box: [{ backgroundColor: 'transparent' }], hover: N.hover, ink: N.ink2 },
} as const;

/**
 * L-shaped corner brackets — the Nexus frame mark. Outer frame only (14px,
 * `faint`) and the KPI strip (8px, `ghost`); never on every panel.
 */
export function Brackets({ size = 14, color = N.faint }: { size?: number; color?: string }) {
  const b = { position: 'absolute' as const, width: size, height: size, borderColor: color, zIndex: 5 };
  return (
    <>
      <View pointerEvents="none" style={[b, { top: 0, left: 0, borderTopWidth: 1, borderLeftWidth: 1 }]} />
      <View pointerEvents="none" style={[b, { top: 0, right: 0, borderTopWidth: 1, borderRightWidth: 1 }]} />
      <View pointerEvents="none" style={[b, { bottom: 0, left: 0, borderBottomWidth: 1, borderLeftWidth: 1 }]} />
      <View pointerEvents="none" style={[b, { bottom: 0, right: 0, borderBottomWidth: 1, borderRightWidth: 1 }]} />
    </>
  );
}

/** One small top-left bracket, for an inner frame (the KPI strip). */
export function MiniBracket() {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: -1,
        left: -1,
        width: 8,
        height: 8,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderColor: N.ghost,
      }}
    />
  );
}

/** A calendar's own colour, as a 6px square (spec §4, decided A). */
export function CalSwatch({ color, size = 6 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: 1, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  txt: { fontFamily: SANS, color: N.ink, ...T.body, fontWeight: '400' },
  // Quiet calendar: numbers and small labels are the sans face too (tabular
  // figures keep times aligned). The name stays so call sites need not change.
  mono: { fontFamily: SANS, color: N.muted, fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  label: { fontFamily: SANS, color: N.muted, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  btn: {
    height: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: R.md,
    paddingHorizontal: 14,
  },
  btnIcon: { width: 34, paddingHorizontal: 0 },
  btnTxt: { fontFamily: SANS, ...T.body },
});
