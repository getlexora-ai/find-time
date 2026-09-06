import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

/**
 * `prefers-reduced-motion`, on both sides.
 *
 * `global.css` already collapses CSS animations/transitions on web (spec §5), but
 * every animation here is driven by JS (`Animated`, `setInterval`) where that media
 * query has no reach — so components ask this hook directly.
 *
 * The one deliberate exception is the marquee: spec §5 says it keeps translating.
 *
 * Modelled as an external store rather than `useState` + `useEffect`, so the server
 * snapshot is always `false` (no motion preference is knowable in Node) and the
 * client subscribes to the real signal. Reduced motion therefore only ever *removes*
 * animation after hydration — it can never cause a markup mismatch.
 */

/** ── web: matchMedia ─────────────────────────────────────────────────────── */

const QUERY = '(prefers-reduced-motion: reduce)';

function webSubscribe(onChange: () => void) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

function webSnapshot() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(QUERY).matches;
}

/** ── native: AccessibilityInfo ───────────────────────────────────────────────
 *  `isReduceMotionEnabled()` is async, so the current value is cached at module
 *  scope and refreshed on subscribe; `getSnapshot` stays synchronous as the API
 *  requires. */

let nativeReduced = false;

function nativeSubscribe(onChange: () => void) {
  let alive = true;
  AccessibilityInfo.isReduceMotionEnabled()
    .then((v) => {
      if (!alive || v === nativeReduced) return;
      nativeReduced = v;
      onChange();
    })
    .catch(() => {});
  const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
    nativeReduced = v;
    onChange();
  });
  return () => {
    alive = false;
    sub.remove();
  };
}

const nativeSnapshot = () => nativeReduced;
const serverSnapshot = () => false;

const subscribe = Platform.OS === 'web' ? webSubscribe : nativeSubscribe;
const snapshot = Platform.OS === 'web' ? webSnapshot : nativeSnapshot;

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
