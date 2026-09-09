import { SvgXml } from 'react-native-svg';

import { type IconName, SOLAR_BODY } from './solar-icons';

export { type IconName, SOLAR_ID } from './solar-icons';

/**
 * The real Solar glyphs from `calendar.html`.
 *
 * The reference loads them over the wire (`<iconify-icon icon="solar:NAME">` via
 * cdn.iconify.design). We can't do that in RN, so `scripts/gen-solar-icons.mjs`
 * bakes the same 33 glyph bodies out of `@iconify-json/solar` into
 * `solar-icons.ts` and this renders them with `SvgXml` — identical artwork, no
 * network, works on web and native.
 *
 * Solar `*-linear` bodies carry their own `stroke-width="1.5"` and paint with
 * `currentColor`, which `SvgXml` resolves from the `color` prop. There is no
 * `strokeWidth` prop any more: the weight is part of the glyph.
 */
type Props = { name: IconName; size?: number; color?: string };

/** `${name}@${size}` → wrapped svg source. The bodies are static, so the wrapper
 *  string is worth building once rather than on every render. */
const cache = new Map<string, string>();

function xmlFor(name: IconName, size: number) {
  const key = `${name}@${size}`;
  let xml = cache.get(key);
  if (xml === undefined) {
    xml =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ` +
      `width="${size}" height="${size}" fill="currentColor">${SOLAR_BODY[name]}</svg>`;
    cache.set(key, xml);
  }
  return xml;
}

export function Icon({ name, size = 16, color = 'currentColor' }: Props) {
  // Every glyph in this app is decorative: the accessible name comes from the
  // adjacent <Txt> or the wrapping <Press aria-label>, never the icon itself.
  // Hide it from the a11y tree so screen readers don't announce "image".
  return (
    <SvgXml
      xml={xmlFor(name, size)}
      width={size}
      height={size}
      color={color}
      aria-hidden
      focusable={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
