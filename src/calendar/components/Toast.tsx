import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
// Animated.Value instances are created via lazy useState so their `.current` is
// never read during render (react-hooks/refs).

import type { ToastAction } from '../state';
import { MONO, N, R, SANS, SHADOW, T } from '../tokens';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

type Show = (msg: string, action?: ToastAction) => void;
const ToastCtx = createContext<Show>(() => {});
export const useToast = () => useContext(ToastCtx);

/**
 * Every change confirms in one line. A toast with an action (Undo) stays for
 * 5s instead of 2.4s — long enough to read, reach and press it.
 *
 * Ink on the light page: the one dark surface that is not a focus tile, so it
 * reads as "system speaking", not as part of the calendar.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { isDesktop } = useResponsive();
  const [msg, setMsg] = useState('');
  const [action, setAction] = useState<ToastAction | null>(null);
  const [op] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(16));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.parallel([
      Animated.timing(op, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(ty, { toValue: 16, duration: 200, useNativeDriver: true }),
    ]).start(() => setAction(null));
  }, [op, ty]);

  const show = useCallback<Show>(
    (m, a) => {
      setMsg(m);
      setAction(a ?? null);
      if (timer.current) clearTimeout(timer.current);
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(hide, a ? 5000 : 2400);
    },
    [op, ty, hide],
  );

  useEffect(
    () => () => {
      if (timer.current != null) clearTimeout(timer.current);
    },
    [],
  );

  return (
    <ToastCtx.Provider value={show}>
      {children}
      <View pointerEvents="box-none" style={[styles.wrap, { bottom: isDesktop ? 28 : 104 }]}>
        <Animated.View
          pointerEvents={msg ? 'auto' : 'none'}
          accessibilityRole="alert"
          aria-live="polite"
          style={[styles.toast, SHADOW.lg, { opacity: op, transform: [{ translateY: ty }] }]}>
          <Txt style={styles.text}>{msg}</Txt>
          {action && (
            <Press
              accessibilityRole="button"
              hoverBg={N.hoverOnInk}
              onPress={() => {
                if (timer.current) clearTimeout(timer.current);
                action.run();
                hide();
              }}
              style={styles.action}>
              <Txt style={styles.actionTxt}>{action.label}</Txt>
            </Press>
          )}
        </Animated.View>
      </View>
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center', zIndex: 90 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: 480,
    borderRadius: R.lg,
    backgroundColor: N.ink,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 40,
  },
  text: { flexShrink: 1, fontFamily: SANS, ...T.body, fontWeight: '400', color: N.onInk, paddingVertical: 4, paddingRight: 8 },
  action: { borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 6 },
  actionTxt: { fontFamily: MONO, fontSize: 11, lineHeight: 14, color: N.onInk, textTransform: 'uppercase', letterSpacing: 0.6 },
});
