# Find Time — Calendar build handoff

Read this file top to bottom before writing any code. It is self-contained: everything
you need is either here or in `design/from_user/`.

---

## 0. Mission

Rebuild the **Calendar** screen of this Expo app so it matches the settled design in
`design/from_user/`. One codebase, three targets: **iOS, Android, Web**.

**Scope of this phase: the calendar only.** Do not touch the Plan tab, do not add auth,
do not add a database, do not build the landing page. Those are later phases. Keep the
Plan tab working (don't break the build), but leave its code alone.

---

## 1. Where everything is

| Thing | Path |
|---|---|
| Repo (this worktree) | `/Users/ajayvaidhyanathan/Enterprise/find-time-expo` |
| Branch | `expo-mvp` |
| Remote | `github.com/getlexora-ai/find-time` |
| Design source of truth | `design/from_user/` (in this repo) |
| Prior web prototype (do not use) | branch `v1` |

The design docs sometimes reference `~/Downloads/Find-time/`. **Ignore that path.**
Every file it mentions is in `design/from_user/`:

| File | What it is |
|---|---|
| `calendar.html` | The **working interaction spec**. Every view, gesture, state — runnable. The JS calendar math ports almost verbatim (`monthCells`, `startOfWeek`, `laidOut` overlap layout, drag snapping, `isoWeek`). Also holds the 7-theme switcher (`THEMES` array, persisted to `localStorage['ft-theme']`). |
| `calendar-design-spec.md` | The **token + component spec**. §1 tokens, §2 every component's class recipe, §3 nav model, §4 responsive rules, §5 motion, §6 accessibility (contrast ratios are measured, not guessed), §7 judgment calls. |
| `calendar-design-board.html` | Static annotated mockups of every surface, web + mobile side by side. **This is the visual acceptance reference** — compare your build against it. |
| `calendar-background-options.html` | The 7 grounds, each with a keeps/trades note. Its `OPTS` array = canonical theme values (mirrored into `calendar.html`'s `THEMES` + `body[data-theme=…]` CSS). |
| `calendar-expo-handoff.md` | An earlier handoff written by design. Useful background (stack rationale, component inventory table in §5, risks in §10). Where it conflicts with **this** file, this file wins — see §2 and §7 below. |
| `torch genesis.html`, `torch-genesis-broadcast.md` | The parent **design system**. Reference only — see §3. |
| `landing.html` | Out of scope this phase. Context only. |

---

## 2. Deviations from `calendar-expo-handoff.md`

That doc is design's; it's mostly right, but a few things have moved:

1. **Platforms.** It says "Android, Web, macOS". The actual target is **iOS, Android,
   Web** — all three as native Expo targets. **macOS / Tauri / `react-native-macos` is
   out of scope** unless the user explicitly asks later. Skip its §2 and the Track B
   milestone.
2. **Scaffold already exists.** Do not run `create-expo-app`. This repo is already an
   Expo Router + TypeScript app (SDK 57). See §5 for current state.
3. **Scope.** That doc plans the whole product through M5. This phase is **M1–M2 of the
   calendar only** (shell + month/week/day views + theme switch + event CRUD against
   seed data). Stop there and report.

---

## 3. The rules (read carefully)

**Source-of-truth order when something is unclear:**

1. `calendar.html` — if the behaviour or value is in here, that's the answer.
2. `calendar-design-spec.md` — for tokens, recipes, ratios, responsive breakpoints.
3. `calendar-design-board.html` — for visual layout / spacing questions.
4. **Ask the user.** New visual decisions are theirs, not yours.

**Torch Genesis (`torch genesis.html` + `torch-genesis-broadcast.md`) is the parent
design system, and it is REFERENCE ONLY.** Use it **only** when *all* of these hold:
- something about the design is genuinely unclear, **and**
- the answer is not in any of the four calendar files above, **and**
- the user has explicitly asked you to consult it for that question.

Otherwise do not pull tokens, components, or layout from Torch Genesis. The calendar
files already encode everything needed; they were derived from Torch Genesis and the
landing/dashboard, so its palette (`#ccff00` / `#121212` / `#ff4400`, JetBrains Mono)
should already agree.

**Do not redesign.** Port what exists. If you think something is wrong or missing,
raise it with the user — don't "improve" it in the implementation.

---

## 4. What the calendar is (from the spec — orientation, not a substitute for reading it)

- **Ground:** a blue (`#2047e6`) canvas with a dot grid, 45° hatch, and four lime corner
  brackets. Near-black `#121212` panels *float* on that canvas. Grids stay black; only
  the day-agenda body is light (`#f4f4f4`).
- **Accent:** lime `#ccff00` = today / primary / AI / active / focus ring.
  Orange `#ff4400` = **conflict only** (held back from the category palette on purpose).
- **5 categories** (colour is a 6px dot or a 2px spine, never a full fill):
  `deep #ccff00` · `design #c8c8ff` · `research #ffb39a` · `sync #ffd600` · `admin #ff7040`.
- **Event kinds** (orthogonal to category, drawn with shape not hue): `event`, `focus`
  (lime ring + shield), `ai` (dashed lime), `break` (dashed muted). Conflict = orange ring.
- **Time rhythm (must not drift):** `ROW = 56px` per hour, day window `07:00–21:00`,
  snap `15 min`. Week starts **Monday**. ISO week numbers.
- **Three views:** Month (default ≥1024), Week, Day. Plus a mobile week-strip that is the
  default `<640px`.
- **7 switchable backgrounds**, persisted. Values are in `calendar.html`
  `body[data-theme=…]` CSS and the `THEMES` array: `electric` (current), `ink`, `navy`
  (recommended default), `slate`, `eclipse`, `carbon`, `graphite`. On every non-`electric`
  ground the `#121212` panels must lift to ~`#17181d` with a lighter border + shadow or
  they vanish — make that a real theme token, not a one-off.
- **Responsive:** breakpoint is **1024px**. Both layouts stay in the DOM/tree, toggled —
  never a width-driven re-render except the initial default view and popover-vs-sheet.
  Full rules in spec §4.
- **Free time is a component.** `free — 45m` rows and dashed AI windows are drawn,
  labelled, and clickable. Empty space is the product's whole point.

Accessibility (spec §6) is not optional: measured contrast pairs, "never colour alone"
(shield / triangle / magic-stick / cup glyphs), a single global focus ring
(`2px solid #ccff00`, offset 2px), hit targets (mobile month cell 56px, day pill 58px,
sheet controls 44px), and `prefers-reduced-motion` collapsing every animation.

---

## 5. Current state of this repo

Already an Expo Router app. Structure:

```
src/
  app/
    _layout.tsx      tab navigator — Calendar (index) + Plan with AI (plan)
    index.tsx        Calendar screen  ← PLACEHOLDER. Replace entirely.
    plan.tsx         Plan screen      ← leave alone this phase
  lib/
    store.ts         in-memory event store + useEvents() hook (useSyncExternalStore)
    planner.ts       deterministic planner stub (plan tab)
    sample-data.ts   seed events (generic — will be replaced by the spec fixtures)
    date.ts, types.ts
  components/         themed-text, themed-view (template primitives — keep or replace)
  constants/theme.ts  light/dark colours, Spacing, Fonts  ← extend into the real token set
  hooks/             use-color-scheme, use-theme
```

Installed already: `expo-router`, `react-native-gesture-handler`,
`react-native-reanimated`, `react-native-safe-area-context`, `react-native-screens`,
`react-native-web`, `react-native-worklets`, `expo-font`, `expo-splash-screen`.

Checks that must stay green (`npm run typecheck`, `npm run lint`) and the web bundle
that must keep building (`npx expo export --platform web`).

### Likely dependencies to add (per design's §3; confirm each before adding)

```
npx expo install react-native-svg @react-native-async-storage/async-storage \
  @expo-google-fonts/jetbrains-mono
npm i zustand date-fns @gorhom/bottom-sheet
```

- **NativeWind v4** is design's styling recommendation so the spec's Tailwind class
  recipes port directly. It's a real setup step (babel + metro + `tailwind.config` +
  `global.css`) and needs its arbitrary-value coverage validated early against the
  gnarlier recipes (`grid-template-columns:2.25rem repeat(7,minmax(0,1fr))`,
  `min-h-[8.75rem]`, `shadow-[0_0_16px_rgba(204,255,0,.55)]`). **If NativeWind fights
  you in the first hour, fall back to a `StyleSheet` + token module** — the spec values
  are all explicit numbers. Decide and tell the user which you're using.
- **RN has no CSS grid.** Month/week columns become flexbox rows of equal-basis columns;
  the 1px hairline "seams" become gap `View`s over a `white/10` background.
- **Icons:** the prototype uses Iconify `solar:*` (web-only). Port the ~30 Solar icons
  actually used as `react-native-svg` components (design's recommendation, keeps the
  identity), or propose `lucide-react-native` to the user and get sign-off on the delta.

---

## 6. Build order (calendar-only slice)

Port the seed fixtures from `calendar.html` `EVENTS` (≈55 events across three Sept 2026
weeks, including the deliberate **Wed 11:00 double-book**, a 6-event day → `+3 more`,
protected focus blocks, an AI-suggested Friday window) into the store as seed data, so
the app opens in a realistic state. `TODAY = 2026-09-09`, `NOW = 14:22` (matches the
telemetry string) — keep those constants so the board mockups line up.

| # | Deliverable | Done when |
|---|---|---|
| **C1** | Tokens + theme system + app frame + Month view | `npx expo start` shows the month grid (hairline seams, today = glowing lime chip, `+N more`, category dots) on **web and an iOS or Android simulator**. The 7-theme menu switches live and persists (AsyncStorage, mirroring `ft-theme`). Panel-lift token works on `ink`/`carbon`. |
| **C2** | Week + Day views + event CRUD | All three views render the seed data correctly: overlap column-split (`laidOut`), `07:00–21:00 @ 56px/hr`, red now-line **only in today's column**, `+N more`, protected/AI/break kinds, the Wed conflict ring. Day view has the light `#f4f4f4` agenda with labelled `free — Nm` gap rows. Compose sheet/modal creates, edits, deletes (centred dialog ≥640, bottom sheet below). |
| **C3** *(only if asked)* | Drag-to-create + mock Find-time + conflict flow | Pan on an empty week-grid slot → dashed lime ghost with live `HH:MM–HH:MM`, snap 15 min, release opens compose prefilled. Find-time sheet runs a **mocked** propose→apply behind a `FindTime` interface. Conflict banner + resolve. |

Stop after C2 (or C3 if the user asks) and report. Do not carry on into auth / DB / real AI.

---

## 7. Definition of done for this phase

- Month, Week, and Day match `calendar-design-board.html` at both `<1024` and `≥1024`.
- The 7 backgrounds switch live and persist across reloads.
- Event create / edit / delete works against the seeded store.
- `npm run typecheck` and `npm run lint` pass; `npx expo export --platform web` builds;
  the app runs on Web **and** at least one of iOS / Android simulator.
- Accessibility per spec §6: global lime focus ring, hit targets, `prefers-reduced-motion`
  collapses animation, no colour-only signalling.
- No changes to `src/app/plan.tsx` or its `lib/planner.ts`; Plan tab still loads.

---

## 8. First moves for the new session

```bash
cd /Users/ajayvaidhyanathan/Enterprise/find-time-expo
git status                      # confirm on branch expo-mvp, clean
git checkout -b calendar-build  # work on a fresh branch off expo-mvp

open design/from_user/calendar.html                 # run it, click every view/state
open design/from_user/calendar-design-board.html    # the acceptance reference
$EDITOR design/from_user/calendar-design-spec.md    # read §1–§7

npm install
npx expo start                  # w = web, i = iOS, a = Android
```

Then: build C1, show the user, iterate against the board, continue to C2.

Commit as you go on `calendar-build`. Push when the user asks. Do not push to `main`,
`v1`, or `expo-mvp` without being told.

When in doubt: `calendar.html` → `calendar-design-spec.md` → board → **ask the user**.
Torch Genesis only with the user's explicit go-ahead.
