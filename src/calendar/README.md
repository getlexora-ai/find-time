# Calendar — build notes

Port of `design/from_user/calendar.html` to Expo (iOS / Android / Web), one codebase.
Scope: calendar only (HANDOFF.md). Plan tab and `src/lib/*` are untouched.

## What's here

| Area | Files |
|---|---|
| Tokens / themes / dates / seed | `tokens.ts`, `themes.ts`, `cal-date.ts`, `seed.ts`, `types.ts` |
| State + store | `state.ts`, `cal-store.ts` (in-memory, `useSyncExternalStore`), `theme-context.tsx` (AsyncStorage, key `ft-theme`) |
| Geometry | `layout.ts` (`monthCells`, `laidOut` overlap split, block px), `useResponsive.ts` (1024px breakpoint) |
| Icons | `Icon.tsx` — the ~30 Solar `*-linear` glyphs as `react-native-svg`, stroke 1.5 |
| Screen | `CalendarScreen.tsx` (orchestrator: state, nav model, derived toolbar copy, web keyboard shortcuts) |
| Surfaces | `components/` — Frame, Marquee, Header, Toolbar, ConflictBanner, Sidebar, TelemetryColumn, MiniMonth, MonthView, WeekView, DayView, TimeGrid, EventBlock, EventChip, Agenda, DayPillStrip, EventDetail, ComposeSheet, AiPanel, PickerSheet, ThemeMenu, Toast, Skeleton |

`src/app/index.tsx` wraps `CalendarScreen` in `CalendarThemeProvider` + `ToastProvider`.

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
- **Bottom nav** = the Expo Router tab bar (Calendar + Plan), restyled to the spec's
  `#142d99` chrome with a lime active tint. The prototype's 5-item decorative nav
  (Today / Projects / Ask AI → out-of-scope stubs) is not reproduced; mobile compose is
  a FAB.
- **Sticky agenda date header** is rendered as a normal block (RN nested-scroll sticky is
  unreliable). Everything else — anchored popover vs. bottom sheet, centred modal vs.
  sheet, the 280ms nav skeleton, the marquee, `prefers-reduced-motion` — matches.
- `app.json` web output switched `static` → `single` (SPA): this is an interactive app
  with no SSR/SEO need, and it removes the static-render hydration mismatch.

## Status

- `npm run typecheck`, `npm run lint`, `npx expo export --platform web` all pass.
- Verified in a browser at <1024 and ≥1024: Month / Week / Day both layouts, 7-theme
  switch + reload persistence, event create (AI slot-find toast), pointer-anchored
  popover, compose modal, theme menu, conflict banner. Plan tab still loads.
- **Not yet run on an iOS/Android simulator** (unavailable in the build environment).
  No web-only APIs are used except the `Platform.OS === 'web'`-guarded keyboard listener.

## Not built (C3, only if asked — HANDOFF.md §6)

Drag-to-create on the week grid. `AiPanel` ships the mocked propose→apply
(`applyFindTime()` in `cal-store.ts`) so the primary CTA isn't a dead end, but the
pan-to-draw ghost is not implemented.
