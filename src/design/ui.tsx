import { forwardRef } from 'react';
import {
  Platform,
  Pressable,
  type PressableProps,
  type StyleProp,
  StyleSheet,
  Text,
  type TextProps,
  View,
  type ViewStyle,
} from 'react-native';

import { C, R, w } from './tokens';

/** Platform monospace — the reference loads no webfont; platform mono is the
 *  intended face (spec "Stack"). */
export const MONO = Platform.select({
  web: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

/**
 * The reference puts `backdrop-blur-xl` on all three chrome surfaces (marquee,
 * header, mobile nav) — it is what stops content reading through the ~90%-opaque
 * bar. `backdrop-filter` is CSS-only, so this applies on web and is a no-op on
 * native, where the chrome colour just renders unblurred.
 */
export const CHROME_BLUR = Platform.select({
  web: { backdropFilter: 'blur(24px)' } as unknown as ViewStyle,
  default: undefined,
});

/** Every line of text in the app is monospace and, by default, white. */
export function Txt({ style, ...rest }: TextProps) {
  return <Text {...rest} style={[styles.txt, style]} />;
}

type PressProps = Omit<PressableProps, 'style'> & {
  /** background when hovered (web) / pressed */
  hoverBg?: string;
  style?: StyleProp<ViewStyle>;
};

/** Pressable with the reference's hover-fill behaviour on web and press feedback
 *  on native. The global focus ring comes from global.css on web. */
export const Press = forwardRef<View, PressProps>(function Press(
  { hoverBg, style, children, ...rest },
  ref,
) {
  return (
    <Pressable
      ref={ref}
      {...rest}
      style={({ hovered, pressed }: { hovered?: boolean; pressed?: boolean }) => [
        style,
        (hovered || pressed) && hoverBg ? { backgroundColor: hoverBg } : null,
        pressed && !hoverBg ? { opacity: 0.85 } : null,
      ]}>
      {children as React.ReactNode}
    </Pressable>
  );
});

/** 6px category dot. */
export function Dot({ color, size = 6 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}

/** A rounded chip/pill label. */
export function Pill({
  children,
  bg,
  color = C.surface,
  border,
}: {
  children: React.ReactNode;
  bg?: string;
  color?: string;
  border?: string;
}) {
  return (
    <View
      style={[
        styles.pill,
        bg ? { backgroundColor: bg } : null,
        border ? { borderWidth: 1, borderColor: border } : null,
      ]}>
      <Txt style={{ fontSize: 10, lineHeight: 14, color, textTransform: 'uppercase', letterSpacing: 1 }}>
        {children}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  txt: { fontFamily: MONO, color: '#fff', fontSize: 12, lineHeight: 16 },
  pill: {
    borderRadius: R.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    backgroundColor: w(0.06),
  },
});
