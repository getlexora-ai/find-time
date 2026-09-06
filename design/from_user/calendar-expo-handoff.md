# Find Time — Calendar → Expo handoff

**Goal:** take the working HTML calendar prototype and build it as a real app with Expo,
targeting **Android**, **Web**, and **macOS**. Interaction model, layout, tokens, and the
seven background themes are already designed and settled — this doc maps them onto an
Expo/React Native codebase and calls out the decisions the implementer needs to make.

Owner of the prototype: design. Owner of this build: whoever picks it up next.
Date: 2026-09-06.

---

## 1. What already exists (source of truth)

All in `~/Downloads/Find-time/`:

| File | Role in the build |
|---|---|
| `calendar.html` | **The interaction spec.** Every view, every gesture, every state, working. Read the JS — the calendar math (`monthCells`, `startOfWeek`, `laidOut` overlap layout, drag snapping) ports almost verbatim. Now also contains the **theme switcher** (header palette button → menu, persisted to `localStorage['ft-theme']`). |
| `calendar-design-spec.md` | **The token + component spec.** §1 is the design tokens. §2 is every component's class recipe. §4 the responsive rules. §6 accessibility (contrast ratios are computed, not guessed). |
| `calendar-design-board.html` | Static annotated mockups of every surface, web + mobile side by side. Use as the visual acceptance reference. |
| `calendar-background-options.html` | The seven grounds, each with a keeps/trades note and an adoption read. The `OPTS` array in its script = the canonical theme values. Mirrored into `calendar.html`'s `THEMES` array and `:root` / `body[data-theme=…]` CSS. |

**Do not redesign.** If something is ambiguous, the answer is in `calendar.html` first, then
`calendar-design-spec.md`. New visual decisions go back to design, not into the implementation.

---

## 2. Platform reality — read this before scaffolding

Expo targets **iOS, Android, and Web** as first-class platforms. It has **no macOS target.**
So the three requested platforms split into two tracks:

### Track A — Android + Web (Expo, straightforward)
One Expo project. Android via EAS Build, Web via the Expo web build (Metro bundler +
`react-native-web`). This is the bulk of the work and where you start.

### Track B — macOS (needs a decision)

| Option | What it is | Cost | When it's right |
|---|---|---|---|
| **Tauri wrapper around the web build** *(recommended for v1)* | Ship the Expo **web** bundle inside a Tauri shell. One Rust-side binary, tiny footprint, native window chrome, auto-update. | Low. A few days of shell config + a build step. | You want macOS parity fast and the calendar is basically a responsive web app anyway. |
| **`react-native-macos`** (Microsoft) | A real native macOS RN target. Add via bare workflow / Expo prebuild + config plugin. | High. It lags mainline RN by 1–2 minors, is **not** Expo-supported, breaks on SDK bumps, and many Expo modules have no macOS impl. | You need deep native macOS integration — EventKit calendar store, menu-bar app, rich notifications, widgets. |
| **Electron wrapper** | Same idea as Tauri, heavier runtime. | Low–medium. | Your team already knows Electron and the ~120 MB baseline is acceptable. |
| **Mac Catalyst** | Run the iOS build on macOS. Requires adding an iOS target you otherwise don't need. | Medium. Pulls iOS into scope. | You later decide you want iOS too. |

**Recommendation:** build Track A on Expo managed. For macOS, wrap the web build in **Tauri**
for v1. Only move to `react-native-macos` if a concrete native requirement forces it —
and budget it as its own project if so.

---

## 3. Recommended stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | **Expo SDK 54+** (latest), managed workflow | `npx create-expo-app@latest` |
| Routing / shell | **Expo Router** (file-based) | Works on web; gives you the tab navigator for the `<lg` bottom nav for free |
| Language | **TypeScript**, strict | |
| Styling | **NativeWind v4** | Tailwind for RN + web. The spec's class recipes port with minimal change. Arbitrary values (`bg-[#121212]`, `min-h-[8.75rem]`) are supported — verify coverage early against a few of the spec's gnarlier recipes. |
| Theme state | **Zustand** store + `useTheme()` hook, persisted with `AsyncStorage` (`@react-native-async-storage/async-storage`) | Mirrors the `localStorage['ft-theme']` behaviour already in `calendar.html`. Expose the 7 themes as a typed map; drive NativeWind via CSS vars on web and a context value on native. |
| App/event state | **Zustand** store, seeded with the prototype's fixtures | Design the store API (`events`, `addEvent`, `moveEvent`, `deleteEvent`, `setProtected`) so a backend or device calendar can slot behind it later. |
| Dates | **`date-fns`** | Replaces the prototype's hand-rolled helpers; keep the week-start-Monday and ISO-week logic identical. |
| Gestures | **`react-native-gesture-handler`** + **`react-native-reanimated`** | Drag-to-create in the week grid; marquee loop (`withRepeat`, respect reduced-motion). |
| Bottom sheets | **`@gorhom/bottom-sheet`** | Event sheet, compose sheet, Find-time sheet, month-picker sheet — all the `<lg` modals. |
| Icons | **See §6** | The prototype uses Iconify `solar:*`. That web component is web-only. |
| Fonts | **`@expo-google-fonts/jetbrains-mono`** via `expo-font` | Weights 400/500/700. It's the whole typographic identity — load it before first paint (`SplashScreen.preventAutoHideAsync`). |
| SVG | **`react-native-svg`** | For icons and the current-time line / grid rules. |

---

## 4. Tokens → code

Turn `calendar-design-spec.md` §1 into `theme/tokens.ts`. Structure:

```
theme/
  tokens.ts        // colour, type scale, spacing, radius, ROW, day window, snap
  categories.ts    // 5 categories: deep #ccff00 · design #c8c8ff · research #ffb39a
                   //   · sync #ffd600 · admin #ff7040.  #ff4400 is RESERVED for conflict.
  backgrounds.ts    // the 7 themes — copy values verbatim from calendar.html :root / body[data-theme]
  ThemeProvider.tsx // provides { key, ground, grad, dot, chrome, rail } + setTheme(); persists
  useTheme.ts
```

Fixed numbers from the spec that must not drift:

- Time grid: **`ROW = 56px` per hour**, day window **`07:00–21:00`**, snap **15 min**.
- Breakpoint: **1024px** (`useWindowDimensions().width >= 1024` → desktop shell).
- Text ramps: dark surface `white → /85 → /55 → /45 → /35 → /25`; light surface (day agenda
  only) `#121212 → /70 → /60`. The `/60` on light is a deliberate AA fix — keep it.

The 7 backgrounds (from `backgrounds.ts`), for reference — `chrome` tints the marquee /
header / bottom nav, `rail` tints the sidebar:

| key | ground | dot | tag |
|---|---|---|---|
| `electric` | `#2047e6` + `linear-gradient(135deg,#091a66_12%,#2047e6_96%)` | 14% | current |
| `ink` | `#0b0b0d` radial | 5.5% | safe |
| `navy` | `#0a1126` → `#07091c` | 7% | **recommended default** |
| `slate` | `#161a22` → `#111419` | 7% | safe |
| `eclipse` | `#111a4d` → `#0d1340` | 9% | brand-forward |
| `carbon` | `#141110` radial | 5% | character |
| `graphite` | `#141416`, blue only in the frame + top wash | 5.5% | balanced |

**Panel lift on dark grounds:** on every non-`electric` theme, raise the `#121212` panels to
~`#17181d` with a `rgba(255,255,255,.12)` border and a real shadow, or they merge into the
canvas. `electric` is the only ground where `#121212` separates on its own. (In the HTML
prototype the grid seams + wrapper border carry it; in RN give panels an explicit token that
varies by theme.)

---

## 5. Component / screen inventory

Map from prototype → RN component. **S** = shared across platforms, **P** = platform-specific.

| Prototype surface | RN component | S/P | Notes |
|---|---|---|---|
| App frame (blue bg, dot grid, hatch, lime corner brackets) | `AppBackground` | S | Corner brackets = 4 absolutely-positioned `View`s. Dot grid = a tiled `react-native-svg` pattern or a repeated background image. |
| Marquee ticker | `MarqueeBar` | S | Reanimated `withRepeat` translateX; **pause when reduced-motion**. |
| Sidebar (≥1024) | `SideNav` | S | Logo, nav, mini-month, calendar list, focus card, account. |
| Telemetry column (≥1280) | `TelemetryRail` | S | Decorative; `aria-hidden` / not focusable. |
| Top header (search, **theme**, bell, Plan with AI) | `TopBar` | S | The **theme palette button + menu** ports here — reuse the `THEMES` array. |
| Bottom nav + FAB (<1024) | Expo Router `Tabs` + custom center button | S | `pb` = safe-area inset. |
| Toolbar: view switch, date nav, Find time | `CalendarToolbar` | S | Segmented control = 3 buttons. `‹ Today ›` steps month/week/day by current grain. |
| Month grid | `MonthGrid` | S | 7-col grid, hairline seams, today = glowing lime chip, `+N more` overflow, dashed-lime AI windows. Desktop = full tiles; mobile = dot grid + agenda below. |
| Week time grid | `WeekGrid` | S | Hour gutter, all-day row, overlap column-split (`laidOut`), red now-line, **drag-to-create** (gesture-handler pan → snap 15min → open compose). |
| Day view | `DayView` | S | Energy band + dark time grid + light `#f4f4f4` agenda with labelled `free — 30m` gap rows + right rail. |
| Event popover (desktop) | `EventPopover` | P | Anchored overlay. Web/desktop only. |
| Event sheet (mobile) | `EventSheet` | P | `@gorhom/bottom-sheet`. |
| Compose modal / sheet | `ComposeSheet` | S | Centered dialog ≥640, bottom sheet below. Category chips, recurrence, "let AI place it" switch. |
| Find time (AI) drawer | `FindTimeSheet` | S | Ask → skeleton → "3 changes · 0 conflicts" proposal → Apply. **Mocked** — see §7. |
| Mini-month (sidebar) + month-picker sheet | `MiniMonth` | S | |
| Conflict banner | `ConflictBanner` | S | Orange. The seeded Wed 11:00 double-book. |
| Toast | `Toast` | S | |
| Empty / loading-skeleton states | per view | S | Skeleton = the `.skel` pulse; gate on reduced-motion. |

---

## 6. Icons — decision needed

The prototype uses Iconify's `solar:*` line set via a web component that **does not run on
native**. Options:

1. **Port the exact Solar icons** used (there are ~30) as individual SVGs into
   `react-native-svg` components. Preserves the look 1:1. One afternoon of extraction.
2. **Swap to `lucide-react-native`** — closest line-icon set with a native package. Faster,
   but the glyphs differ (weights, corners, some metaphors). Design should sign off on the delta.

Recommendation: **option 1** for the ~30 icons actually in use; the identity leans on them.

---

## 7. Data layer + the AI feature

- The prototype keeps an in-memory `EVENTS` array and helper `byDate`. Port the **fixtures**
  (≈55 events across three September weeks, incl. the deliberate Wed 11:00 clash, a 6-event
  day → `+3 more`, protected focus blocks, an AI-suggested Friday window) into the Zustand
  store as seed data so the app opens in a realistic working state.
- Keep the store API backend-agnostic. A later integration path: **`expo-calendar`** for
  read/write against the OS calendar on Android (and iOS if added) — not available on
  web or the macOS web-wrapper, so it's an enhancement, not a dependency.
- **Find time / AI** is fully mocked in the prototype (`setTimeout` + a canned change list).
  Keep it behind one interface so a real implementation drops in without touching UI:

  ```ts
  interface FindTime {
    propose(query: string, events: Event[]): Promise<{
      adds: Event[]; moves: { id: string; from: Slot; to: Slot }[]; conflicts: number;
    }>;
  }
  ```

  v1 ships `MockFindTime` returning the prototype's canned proposal. Provider for the real
  one is an open choice (server-side call; do not embed a key in the app).

---

## 8. Scaffold

```bash
npx create-expo-app@latest find-time-calendar -t expo-template-blank-typescript
cd find-time-calendar
npx expo install expo-router react-native-safe-area-context react-native-screens \
  react-native-gesture-handler react-native-reanimated react-native-svg \
  @react-native-async-storage/async-storage expo-font @expo-google-fonts/jetbrains-mono
npm i nativewind@^4 zustand date-fns @gorhom/bottom-sheet
npm i -D tailwindcss@^3
```

`app.json`: `name` "Find Time", `scheme` "findtime", `android.package`
`com.findtime.calendar`, `web.bundler` "metro".

```
app/
  _layout.tsx            // ThemeProvider + fonts + gesture root
  (tabs)/_layout.tsx     // <lg bottom nav; hidden ≥lg (SideNav takes over)
  (tabs)/calendar.tsx    // hosts CalendarToolbar + the active view
  (tabs)/today.tsx  projects.tsx  ai.tsx
components/  calendar/  chrome/  sheets/
theme/  store/  data/seed.ts  lib/findtime.ts
```

Run: `npx expo start` → `w` web, `a` Android. Android release: `eas build -p android`.
macOS: `npm run build:web` → feed `dist/` to the Tauri shell (`src-tauri/`), `cargo tauri build`.

---

## 9. Milestones

| # | Deliverable | Done when |
|---|---|---|
| **M1** | Shell + Month view + theme switch | `npx expo start` shows the month grid with the 7-theme menu working and persisting, on web **and** Android emulator. Tokens ported from the spec. |
| **M2** | Week + Day views, event CRUD | All three views render the seed data correctly (overlaps, `+N more`, protected blocks). Compose sheet creates/edits/deletes. |
| **M3** | Drag-to-create, Find time (mock), conflict flow | Pan in the week grid opens compose at a snapped slot. Find-time sheet runs the mocked propose→apply. Conflict banner + resolve. |
| **M4** | macOS (Tauri wrap) + a11y pass | macOS build runs the same UI. Focus rings, hit targets ≥44px, reduced-motion, contrast per spec §6. |
| **M5** | Real data (optional) | `expo-calendar` read/write on Android behind the store API; real Find-time behind the interface. |

---

## 10. Open decisions / risks

1. **macOS approach** — Tauri wrap (recommended) vs `react-native-macos` (only if native
   EventKit/menu-bar/widgets are required). Decide before M4.
2. **Icons** — port Solar SVGs (recommended) vs swap to `lucide-react-native`. Decide at M1.
3. **NativeWind arbitrary-value coverage** — validate against the spec's harder recipes
   (`grid-template-columns:2.25rem repeat(7,minmax(0,1fr))`, `min-h-[8.75rem]`,
   `shadow-[0_0_16px_rgba(204,255,0,.55)]`) in the first day. Fallback is a `StyleSheet`
   token layer.
4. **CSS Grid** — RN has no grid. The month/week layouts become flexbox rows of equal-basis
   columns; the hairline "seams" become 1px gap `View`s with a `white/10` background behind.
5. **Reanimated drag perf on web** — test early; the week-grid pan + live ghost is the most
   demanding interaction.
6. **Marquee** — cheap, but must pause under `prefers-reduced-motion` / `AccessibilityInfo
   .isReduceMotionEnabled()`.
7. **Panel-lift tokens** — the `#121212 → #17181d` bump on dark themes (§4) needs to be a
   real token, not a one-off, or half the surfaces will vanish on `ink`/`carbon`.

---

## 11. Definition of done (for the whole handoff)

A running Expo app where: all three calendar views match `calendar-design-board.html`; the
seven backgrounds switch live and persist; event create/edit/delete and the mocked Find-time
flow work; it builds and runs on **Web**, **Android**, and **macOS** (via the chosen Track B
path); and it passes the accessibility checks in `calendar-design-spec.md` §6.
