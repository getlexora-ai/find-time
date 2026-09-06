import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform } from 'react-native';

/**
 * The mockup's `[data-drag]` widgets — pointer-drag to reposition, no snapping, no
 * persistence, position lost on reload. Exactly as landing.html behaves.
 *
 * Web only, deliberately: all three draggable widgets are `lg:block`/`xl:block`, so
 * they never render on a phone in the first place, and a pan responder on native
 * would only fight the ScrollView. On native this returns inert handlers and a
 * fixed transform (HANDOFF-landing.md).
 */
export function useDraggable() {
  const [pos] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const offset = useRef({ x: 0, y: 0 });

  const responder = useMemo(() => {
    if (Platform.OS !== 'web') return null;
    // offset.current is only touched inside gesture callbacks, never during render.
    // eslint-disable-next-line react-hooks/refs
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderGrant: () => {
        pos.setOffset({ ...offset.current });
        pos.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pos.x, dy: pos.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: (_e, g) => {
        offset.current = { x: offset.current.x + g.dx, y: offset.current.y + g.dy };
        pos.flattenOffset();
      },
      onPanResponderTerminate: () => pos.flattenOffset(),
    });
  }, [pos]);

  return {
    handlers: responder ? responder.panHandlers : {},
    style: { transform: pos.getTranslateTransform() },
    /** `cursor: grab` is web-only styling; RN types don't know the property. */
    cursor:
      Platform.OS === 'web'
        ? ({ cursor: 'grab' } as unknown as Record<string, never>)
        : undefined,
  };
}
