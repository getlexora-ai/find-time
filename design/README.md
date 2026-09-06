# Design source — drop files here

Put the design files in the subfolders below. I read from this folder directly when
building screens and will match what's here as closely as Expo / React Native allows.
If something in the design can't be reproduced faithfully (a specific blur, blend mode,
font, etc.), I'll call it out instead of silently approximating.

## Where to put what

| Folder     | What goes in it                                                                 | Formats |
|------------|--------------------------------------------------------------------------------|---------|
| `screens/` | One image per screen / state. Name by screen + state.                          | PNG (preferred, @2x/@3x ok), JPG, PDF |
| `flows/`   | Multi-screen flows, ordered. One subfolder per flow, files numbered.           | PNG, JPG, PDF |
| `tokens/`  | Colors, typography, spacing, radii, shadows — the raw values.                  | JSON (Figma / Style Dictionary / Tokens Studio export), CSS vars, or a plain `.md` table |
| `assets/`  | Icons, logo, illustrations to ship in the app.                                 | SVG (preferred), PNG @2x/@3x |
| `spec/`    | Written notes, annotations, redlines, Figma links, interaction/animation specs. | MD, TXT, PDF, PNG |

## Naming

```
screens/calendar-default.png
screens/calendar-empty.png
screens/calendar-day-detail.png
screens/plan-input.png
screens/plan-result.png
screens/plan-loading.png
flows/first-plan/01-open.png
flows/first-plan/02-typing.png
flows/first-plan/03-proposed.png
flows/first-plan/04-added.png
```

Light and dark: suffix `-light` / `-dark` if both are designed
(`calendar-default-dark.png`). Default is assumed light.

## If you're using Figma

Best case: export a **Tokens Studio** or **Figma variables** JSON into `tokens/` plus
PNG frames into `screens/`. If you can only share a link, put it in `spec/figma.md`
with the file/frame URLs and note whether I have view access.

## Then

Tell me it's ready (and which screens are in scope for this pass). I'll:
1. Extract tokens into `src/constants/theme.ts`.
2. Rebuild the screens/components to match.
3. Show you the result on web + a note on any deviations.
