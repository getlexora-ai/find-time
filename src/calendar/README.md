# Calendar — build notes

Port of `design/from_user/calendar.html` to Expo (iOS / Android / Web), one codebase.

`calendar.html` is a **single page**, so the app is a single route. `src/app/_layout.tsx`
is a `<Stack>` with `headerShown: false` rendering only `index` — there is no router-level
tab bar, because an Expo Router `<Tabs>` renders its bar on web and desktop too and the
mockup has none there. The old `src/app/plan.tsx` route is deleted: **"Plan with AI" is not
a screen**, it is the `AiPanel` slide-over, opened from the desktop header button and from
the mobile nav's "Ask AI". `src/lib/*` is now unreferenced but left on disk.

## What's here

| Area | Files |
|---|---|
| Tokens / themes / dates / seed | `tokens.ts`, `themes.ts`, `cal-date.ts`, `seed.ts`, `types.ts` |
| State + store | `state.ts`, `cal-store.ts` (in-memory, `useSyncExternalStore`), `theme-context.tsx` (AsyncStorage, key `ft-theme`) |
| Geometry | `layout.ts` (`monthCells`, `laidOut` overlap split, block px), `useResponsive.ts` (1024px breakpoint) |
| Icons | `Icon.tsx` + `solar-icons.ts` — the **real** Solar glyphs, rendered with `SvgXml` |
| Screen | `CalendarScreen.tsx` (orchestrator: state, nav model, derived toolbar copy, web keyboard shortcuts) |
| Surfaces | `components/` — Frame, Marquee, Header, MobileNav, Toolbar, ConflictBanner, Sidebar, TelemetryColumn, MiniMonth, MonthView, WeekView, DayView, TimeGrid, EventBlock, EventChip, Agenda, DayPillStrip, EventDetail, ComposeSheet, AiPanel, PickerSheet, ThemeMenu, Toast, Skeleton |

`src/app/index.tsx` wraps `CalendarScreen` in `CalendarThemeProvider` + `ToastProvider`.

## Icons

`calendar.html` pulls 33 Solar glyphs off the Iconify CDN as
`<iconify-icon icon="solar:NAME">`. RN can't do that, so `scripts/gen-solar-icons.mjs`
reads `@iconify-json/solar` (devDependency) and bakes those exact 33 glyph bodies into the
generated `solar-icons.ts`; `Icon.tsx` wraps a body in a 24×24 `<svg>` and renders it with
`react-native-svg`'s `SvgXml`. Same artwork as the mockup, no network, web + native.

Regenerate with `node scripts/gen-solar-icons.mjs` — the generator resolves Iconify aliases
(`magic-stick-3-linear` → `magic-wand-3-linear`) and hard-fails on a missing icon, a
non-24×24 icon, or one that isn't `currentColor`.

Solar `*-linear` bodies carry their own `stroke-width="1.5"`, so `Icon` has no
`strokeWidth` prop — weight is part of the glyph. Colour is passed via `SvgXml`'s `color`,
which resolves the bodies' `currentColor`.

## Fidelity approach

StyleSheet + a typed token module (not NativeWind) — the spec values are all explicit
numbers, and this keeps `typecheck` / `lint` / `expo export --platform web` deterministic
(HANDOFF.md §5 fallback). Every value is lifted from `calendar.html` / the spec; the JS
calendar math (`laidOut`, `monthCells`, `isoWeek`, drag-snap helpers, block geometry) is a
near-verbatim port. `TODAY = 2026-09-09`, `NOW = 14:22`, and the ~55-event `EVENTS`
fixture are ported exactly so the board mockups line up.

## Deliberate RN adaptations (not redesigns)

- **No CSS grid.** Month/week columns are flex rows of equal-basis columns; the 1px
  hairline seams are `gap: 1` over a `panelBorder` background.
- **Panel-lift is a theme token.** On every non-`electric` ground the `#121212` panels
  lift to `#17181d` with a lighter border (`themes.ts` `LIFT`), or they vanish.
- **`<select>` / native date+time pickers** don't exist in RN. Duration / Repeats /
  Project are chip rows; Date / Start are text inputs (`YYYY-MM-DD`, `HH:MM`). Same
  values, same save behaviour.
- **Bottom nav** is `components/MobileNav.tsx`, the mockup's own 5-item bar
  (Today · Projects · lime ⊕ · Calendar · Ask AI), rendered by `CalendarScreen` only when
  `!isDesktop` — matching `lg:hidden`. Today / Projects are the same out-of-scope toast
  stubs the prototype ships. There is no floating FAB: the ⊕ lives in the nav.
- **`backdrop-blur-xl`** on the three chrome surfaces (Marquee / Header / MobileNav) is
  `CHROME_BLUR` in `ui.tsx` — a web-only `backdropFilter`, since `backdrop-filter` is
  CSS. On native the ~90%-opaque chrome colour renders unblurred.
- **Sticky agenda date header** is rendered as a normal block (RN nested-scroll sticky is
  unreliable). Everything else — anchored popover vs. bottom sheet, centred modal vs.
  sheet, the 280ms nav skeleton, the marquee, `prefers-reduced-motion` — matches.
- `app.json` web output switched `static` → `single` (SPA): this is an interactive app
  with no SSR/SEO need, and it removes the static-render hydration mismatch.

## Status

- `npm run typecheck`, `npm run lint`, `npx expo export --platform web` all pass.
- Verified in a browser at <1024 and ≥1024: Month / Week / Day both layouts, 7-theme
  switch + reload persistence, event create (AI slot-find toast), pointer-anchored
  popover, compose modal, theme menu, conflict banner.
- Verified against the export at 1440 (no bottom bar; sidebar + header; "Plan with AI"
  opens the drawer) and at 414 (FT logo tile + "Calendar" in the header, 5-item nav,
  "Ask AI" opens the sheet). Rendered `<path d>` values were diffed against the Solar
  source to confirm the real glyphs ship, not look-alikes.
- **Not yet run on an iOS/Android simulator** (unavailable in the build environment).
  No web-only APIs are used except the `Platform.OS === 'web'`-guarded keyboard listener
  and `CHROME_BLUR`'s `backdropFilter`, which simply no-ops off web.

## Not built (C3, only if asked — HANDOFF.md §6)

Drag-to-create on the week grid. `AiPanel` ships the mocked propose→apply
(`applyFindTime()` in `cal-store.ts`) so the primary CTA isn't a dead end, but the
pan-to-draw ghost is not implemented.
