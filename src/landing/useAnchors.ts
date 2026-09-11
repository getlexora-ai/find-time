import { useCallback, useRef } from 'react';
import { Platform, type LayoutChangeEvent, type ScrollView } from 'react-native';

import { useReducedMotion } from '@/design/useReducedMotion';

export type AnchorId = 'top' | 'problem' | 'workflows' | 'connectors' | 'privacy' | 'waitlist';

/**
 * `href="#connectors"` in RN.
 *
 * There is no document to scroll to, so each section reports its own offset with
 * `onLayout` and the nav scrolls the root `ScrollView` there. On web the hash is
 * also written so the URL matches what the user sees and the link is copyable.
 *
 * Known delta from landing.html (HANDOFF-landing.md): the browser's back button
 * does not restore the previous scroll position, because the hash is replaced
 * rather than pushed — pushing would put a history entry between the visitor and
 * the page they arrived from.
 */
export function useAnchors() {
  const scrollRef = useRef<ScrollView | null>(null);
  const offsets = useRef<Partial<Record<AnchorId, number>>>({});
  const reduced = useReducedMotion();

  /** Attach to the section: `onLayout={register('planner')}`. */
  const register = useCallback(
    (id: AnchorId) => (e: LayoutChangeEvent) => {
      offsets.current[id] = e.nativeEvent.layout.y;
    },
    [],
  );

  const scrollTo = useCallback(
    (id: AnchorId) => {
      const y = offsets.current[id];
      if (y == null) return;
      // clear the fixed marquee bar so the heading isn't hidden under it
      scrollRef.current?.scrollTo({ y: Math.max(0, y - 72), animated: !reduced });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#${id}`);
      }
    },
    [reduced],
  );

  return { scrollRef, register, scrollTo };
}
