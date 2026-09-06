import { useWindowDimensions } from 'react-native';

import { DESKTOP_BP } from './tokens';
import { useMounted } from './useMounted';

/**
 * Responsive rules (spec §4). Breakpoint is 1024px. Both layouts stay mounted and
 * are toggled — never a width-driven re-render beyond this hook's boolean.
 *   < 640   : the mobile list world (week strip default, sheets, FAB)
 *   640-1023: same structure, wider agenda gutter, centred modal
 *   >= 1024 : sidebar + mini-month, month default, time grids, anchored popover
 *   >= 1280 : telemetry column + day-view right rail
 *
 * Under `web.output: "server"` the landing page hydrates un-gated (it needs the
 * SSR markup), so width is pinned to 0 until `useMounted()` flips — the hydration
 * render then matches the server's (both narrow) and the real breakpoint lands one
 * commit later. `/app` is already `useMounted`-gated at the route, so this is inert
 * there.
 */
export function useResponsive() {
  const dims = useWindowDimensions();
  const mounted = useMounted();
  const width = mounted ? dims.width : 0;
  const height = mounted ? dims.height : 0;
  return {
    width,
    height,
    isPhone: width < 640,
    isTablet: width >= 640 && width < DESKTOP_BP,
    isDesktop: width >= DESKTOP_BP,
    isWide: width >= 1280,
    is2xl: width >= 1536,
  };
}
