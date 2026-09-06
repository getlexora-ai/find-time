# Find Time mark — "O · hex aperture"

Straightened from the `combos.html` trace. Regenerate everything with
`node scripts/gen-icon.mjs` (source outline: `mark-raw.svg`).

## Which file where

| file | fill | use on |
|---|---|---|
| `mark.svg` | `currentColor` | **in-app** — render with `SvgXml` and pass the theme foreground as `color` (same pattern as `src/design/Icon.tsx`) |
| `mark-white.svg` | `#ffffff` | every dark theme ground — all 7 in `src/design/themes.ts` (`electric` `ink` `navy` `slate` `eclipse` `carbon` `graphite`) are dark, so one white mark covers them all |
| `mark-ink.svg` | `#121212` | light agenda surface (`tokens.ts` `light` `#f4f4f4` / `lightCard` `#fff`) |
| `mark-lime.svg` | `#ccff00` | accent contexts only — do **not** use as the mark on `navy` / `eclipse`, contrast is too low |
| `mark-adaptive.svg` | auto | standalone contexts with no `color` prop — web favicon, `<img>`, README badges. Swaps ink ⇄ white on `prefers-color-scheme` |

## Named colourways (tiles, from `combos.html` captions)

| file | mark / ground | caption |
|---|---|---|
| `hex-white-on-blue.svg` | `#fff` / `#2047e6` | app icon · white on blue |
| `hex-ink-on-lime.svg` | `#121212` / `#ccff00` | app icon · ink on lime |
| `hex-white-on-ink.svg` | `#fff` / `#121212` | 64/32/16 px cell |
| `hex-lime-on-ink.svg` | `#ccff00` / `#121212` | horizontal lockup · ink |

Tiles keep `combos.html`'s rounded-rect (`rx 26`) and 66 % mark inset.

## Not generated on purpose

Per-theme tiles (`theme-electric.svg` … `theme-graphite.svg`) — 6 of the 7
grounds are near-black, so those tiles would be visually identical to
`mark-white.svg` on a dark rectangle. Use `mark-white.svg` over the ground
colour from `themes.ts` instead.
