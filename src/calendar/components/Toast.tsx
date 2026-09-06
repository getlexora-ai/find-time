import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
// Animated.Value instances are created via lazy useState so their `.current` is
// never read during render (react-hooks/refs).

import { Icon } from '../Icon';
import { useCalTheme } from '../theme-context';
import { C } from '../tokens';
import { Txt } from '../ui';
import { useResponsive } from '../useResponsive';

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

/** Every mutation confirms in the plan's own vocabulary (spec §2.14). */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useCalTheme();
  const { isDesktop } = useResponsive();
  const [msg, setMsg] = useState('');
  const [op] = useState(() => new Animated.Value(0));
  const [ty] = useState(() => new Animated.Value(24));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(
    (m: string) => {
      setMsg(m);
      if (timer.current) clearTimeout(timer.current);
      Animated.parallel([
        Animated.timing(op, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
      timer.current = setTimeout(() => {
        Animated.parallel([
          Animated.timing(op, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.timing(ty, { toValue: 24, duration: 300, useNativeDriver: true }),
        ]).start();
      }, 2400);
    },
    [op, ty],
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
      <View pointerEvents="none" style={[styles.wrap, { bottom: isDesktop ? 32 : 112 }]}>
        <Animated.View
          accessibilityRole="alert"
          aria-live="polite"
          style={[
            styles.toast,
            {
              backgroundColor: theme.panel,
              borderColor: theme.panelBorder,
              opacity: op,
              transform: [{ translateY: ty }],
            },
          ]}>
          <Icon name="check" size={18} color={C.lime} />
          <Txt style={styles.text}>{msg}</Txt>
        </Animated.View>
      </View>
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 90 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    // shadow-2xl
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  text: { fontSize: 12, lineHeight: 16 },
});
