import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * `false` on the server and for the first client render, `true` from hydration
 * onwards.
 *
 * Under `web.output: "server"` every route is rendered in Node first, where
 * `useWindowDimensions()` has no window to measure and reports 0×0 — i.e. the phone
 * layout. On a desktop viewport the client's first paint would then disagree with
 * the server's HTML and React would warn about (and discard) the hydration.
 *
 * Gating a width-dependent subtree on this hook makes the first client render match
 * the server's exactly, and the real layout lands one commit later.
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect`: the two snapshot
 * functions *are* the client/server distinction, so there is no state to set inside
 * an effect (which the React Compiler's lint rules reject).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
