import { SvgXml } from 'react-native-svg';

/**
 * The Find Time mark — "O · hex aperture" (`assets/logo-main/logo/mark.svg`).
 *
 * Single `fill-rule="evenodd"` path that paints with `currentColor`, which
 * `SvgXml` resolves from the `color` prop — same pattern as `Icon.tsx`. Inlined
 * rather than imported as an asset so it renders identically on web and native
 * and can take a theme colour.
 */
type Props = { size?: number; color?: string };

const BODY = '<path fill-rule="evenodd" d="M59.77 104.03 L 50.43 86.86 L 48.33 85.49 L 46.72 85.79 L 44.5 88.04 L 36.92 102.1 L 35.5 103.09 L 34.12 102.46 L 14.61 69.59 L 10.06 59.69 L 20.15 41.95 L 22.4 39.6 L 25.5 38.2 L 44.75 38.1 L 46.01 36.75 L 46.3 35.38 L 45.12 33.02 L 36.57 18.94 L 36.58 16.2 L 84.59 16.35 L 86.91 17.5 L 98.13 37.97 L 95.75 44.25 L 88.39 56.11 L 88.37 60 L 108.67 60.14 L 110.21 62.86 L 91.34 96.04 L 85.51 104.21 Z M68.47 82.73 L 73.19 82.06 L 74.6 80.89 L 84.77 63.03 L 84.77 58.34 L 73.45 39.43 L 69.95 38.17 L 49.09 38.1 L 44.42 43.97 L 41.75 49.75 L 36.65 57.3 L 35.43 59.63 L 35.53 61.88 L 47.97 82.18 Z"/>';

/** `${size}` → wrapped svg source. The body is static, so build the wrapper
 *  string once per size rather than on every render. */
const cache = new Map<number, string>();

function xmlFor(size: number) {
  let xml = cache.get(size);
  if (xml === undefined) {
    xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" ` +
      `width="${size}" height="${size}" fill="currentColor">${BODY}</svg>`;
    cache.set(size, xml);
  }
  return xml;
}

/** The brand mark. Decorative — the accessible name comes from the adjacent
 *  wordmark <Txt> or the wrapping <Press aria-label>, never the mark itself. */
export function Logo({ size = 20, color = 'currentColor' }: Props) {
  return (
    <SvgXml
      xml={xmlFor(size)}
      width={size}
      height={size}
      color={color}
      aria-hidden
      focusable={false}
    />
  );
}
