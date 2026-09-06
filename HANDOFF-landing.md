# HANDOFF — Landing page (M1: visual port, static)

Companion to `HANDOFF.md`. Same rule (§3 there): **port what exists, don't
redesign.** This file logs every place the RN port of
`design/from_user/landing.html` deviates from the reference, and why.

Branch `landing-page`. M1 = the visual port with the mockup's own mock
interactions; **no signup forms** (M2+), and every real CTA is inert pending
plan §10 Q2. This is the plan's "STOP AND SHOW THE USER" checkpoint.

---

## 1. What's built

| Piece | File | Notes |
|---|---|---|
| Composition root | `src/landing/LandingScreen.tsx` | `CalendarThemeProvider forceTheme="electric"` → `ToastProvider` → `Frame` + `Marquee` + `ScrollView`. Telemetry rail + footer inline. Owns the `capacity` state the two cards share. |
| Header | `src/landing/components/LandingHeader.tsx` | (M1 WIP commit) logo, `FIND TIME`, `md`+ nav, START PLANNING pill. |
| Hero | `src/landing/components/Hero.tsx` | eyebrow + lime dot, 2-line H1, body, `PLAN MY DAY` / `SEE 40 SEC DEMO`. |
| Planner mock | `src/landing/components/MockPlannerCard.tsx` | chrome / date+regenerate / gutter+schedule / recovery divider / buffer+add-task. `ScheduleRow` folded in. |
| Phone mock | `src/landing/components/MockPhoneCard.tsx` | status bar+notch, SVG crosshair, capacity panel, ASK FIND TIME, AI response, APPLY PLAN. |
| Floating widgets | `src/landing/components/FloatingWidgets.tsx` | WeeklyGoal, Comment, FocusTimer (real 25:00 countdown), AccuracyDial. Positioning + breakpoint gating + drag. |
| Feature grid | `src/landing/components/FeatureGrid.tsx` | 3-up, `gap:1` seam on `bg-white/15`. |
| Anchors / ramp / copy / drag | `src/landing/{useAnchors,ramp,copy}.ts`, `components/useDraggable.ts` | (M1 WIP commit) |

Live mock interactions (kept, plan §9 / §10 Q10): marquee scroll, nav +
`SEE 40 SEC DEMO` anchor-scroll, planner **regenerate** (spins the glyph,
drops the phone card's capacity 78→72, toast), phone **ask-AI**
(thinking→answered after 1.1s, toast), **apply-plan** (→ `APPLIED ✓` + toast),
**focus timer** (counts down, toast at 0). `START PLANNING` / `PLAN MY DAY` /
`ADD TASK` are inert `() => {}` — their destinations are plan §10 Q2/Q10.

---

## 2. Approximations (expected — from plan §4.2)

1. **`position: fixed`** (marquee, frame) → rendered as `ScrollView` siblings,
   not fixed. The marquee is a static top bar rather than pinned-on-scroll; the
   frame is `StyleSheet.absoluteFill`. No visible delta at rest; on scroll the
   marquee does not stay pinned (matches the calendar screen's own choice).
2. **`backdrop-blur`** → `CHROME_BLUR` in `ui.tsx` applies `backdropFilter` on
   web, no-ops on native. Landing is web-only, so this is web-real everywhere it
   ships.
3. **Draggable widgets** → `useDraggable` is web-only (`PanResponder` gated on
   `Platform.OS === 'web'`); the 3 draggable widgets only render at `lg`+ anyway.
4. **Anchor links** (`#planner`, `#features`, `#focus`) → `onLayout` offsets +
   `ScrollView.scrollTo`, hash written with `history.replaceState` on web.
   Deltas: browser back doesn't restore scroll; `#focus` resolves to the same
   offset as `#features` (landing.html hangs `#focus` on the 3rd feature card —
   measuring a nested child against the scroll container isn't worth the code).
5. **Phone crosshair overlay** (3 stacked CSS gradients) → one small
   `react-native-svg` layer (circle + 2 lines at 20%). Visually equivalent, not
   pixel-identical.
6. **`hover:` transforms** → `Press` `hoverTransform` on web; native gets press
   feedback only. (Native N/A here.)
7. **`selection:bg-[#ccff00]`** → already in `global.css`, web-only.
8. **`min-h-screen` / `min-h-[940px]`** → explicit `minHeight` on the hero
   section: `940` below `lg`, **`960`** at `lg`+ (see §4).

---

## 3. Contrast deviations (plan §7 — measured against the real ground, not §6's `#121212`)

Resolved through `src/landing/ramp.ts` (the WIP commit). Every landing string
that `landing.html` sets with a `white/xx` or `#121212/xx` alpha was re-measured
(WCAG 2.1, sRGB) on **blue `#2047e6`** and the **feature-card `#1739bc/95`**, and
raised where it fell below 4.5:1. Summary of what moved:

| landing.html | ground | measured | shipped as | now |
|---|---|---|---|---|
| body `text-white/65` | `#2047e6` | 3.74 | `w(0.78)` | 4.72 |
| nav / 2nd-CTA `white/60` | `#2047e6` | 3.41 | `w(0.78)` | 4.72 |
| telemetry `white/35` | `#2047e6` | 2.06 | `w(0.78)` | 4.72 |
| feature body `white/55` | `#1739bc/95` | 3.73 | `w(0.65)` | 4.61 |
| planner muted `/30–/45` | `#121212/90` | — | `w(0.5)` | 5.23 |
| phone muted `#121212/45` | `#f4f4f4` | 2.97 | `ink(0.6)` | 4.75 |

**Open call for the user:** the telemetry rail is decorative (per `copy.ts`,
"ambient telemetry — no interaction" — it conveys nothing the visitor needs).
`ramp.ts` still raised it to 4.72:1 to be safe, which makes it much louder than
`landing.html`'s near-invisible `white/35`. That is why it now needs its own
gutter (§4). If it's accepted as decorative under WCAG 1.4.3, it can drop back
to `~white/40` and the gutter special-case in §4 goes away.

Not yet re-checked: the light task **modal** error text (`#cc3600` vs `#ff4400`)
— the modal is M3, not built.

---

## 4. Known layout issues — for the user's review (plan §4.2: stop, don't re-tune)

The hero is `landing.html`'s hardest region: hero text with the two mock cards
absolutely positioned over it (`lg:left-[31%] lg:top-[34%] lg:w-[69%]`) plus 4
widgets at `%` offsets, all inside a fixed-height band. RN text metrics differ
from the browser, so the port drifts. Two spots exceed the plan's ~16px
tolerance and are left for a design decision rather than re-tuned:

1. **Telemetry rail vs. the H1.** With the contrast bump (§3) the rail is bright
   enough to visibly collide with `FIND TIME FOR / WHAT MATTERS.` when it sits at
   `landing.html`'s `left-4` inside the centred 1280 hero. Mitigations applied:
   gated to `is2xl` (≥1536, `landing.html` shows it at `xl`/1280) and moved into
   the left gutter (`left: -32`). Clean at ≥1536; absent 1280–1535. Proper fix
   depends on the §3 decision.
2. **Accuracy-dial widget vs. the phone card.** The RN phone card is taller than
   the mock's, so the dial (mock: `bottom-[2%]`) landed on top of `APPLY PLAN`.
   Nudged to `bottom: -32` so it hangs just under the hero band. It now clears
   the card but sits closer to the feature grid than the mock. The real fix is to
   drive the hero `minHeight` from a measured card height instead of the `960`
   constant — deferred; it's design-tuning the plan says to bring to you.

Also minor, matches mock intent: the Comment widget floats over the phone card's
top-right corner (mock: same). The phone card hugs the viewport's right edge
between ~1024 and ~1180 before the 1536 gutter opens up.

---

## 5. Verified

- `npm run typecheck` · `npm run lint` · `npx expo export --platform web` — all
  green. `/` SSR HTML is 84 KB with 2 server-rendered `<svg>` (the `Frame`
  canvas + the phone crosshair); Hero, both cards, feature grid, footer all
  present in the static markup.
- `npx expo export --platform ios` — green; `index.web.tsx` (the whole landing
  tree) is excluded from the native bundle.
- Rendered in Chrome via `expo start --web` at ~1440 and ~600 px:
  desktop shows the absolute-overlap layout with all 4 widgets; narrow stacks
  the cards, drops the widgets and the telemetry rail. No hydration errors in
  the console. `regenerate`, `ask-AI`, `apply`, `focus timer`, `nav scroll` all
  functioned.

## 6. Not done / next

- **Full breakpoint sweep** at 375 / 640 / 1024 / 1280 / 1536 against
  `design/from_user/calendar-design-board.html` — only ~1440 and ~600 eyeballed.
- **Native** iOS/Android simulator run (redirect + no landing flash) — export
  succeeds but not run.
- **Reduced-motion**: wired into the regenerate spin and the capacity-bar
  tween. The focus-timer countdown keeps ticking under reduced motion (it's a
  functional timer, not decorative) — deviation from plan §7's list, noted here.
- **`+html.tsx` / `generateMetadata` / OG** — M4. `<title>` is still empty in the
  SSR output by design.
- **`props.pointerEvents` / `shadow*`** deprecation warnings at bundle time come
  from existing calendar components (`Frame`, `Toast`) plus this port's parity
  use of the same prop form; harmless, not migrated to `style.pointerEvents` /
  `boxShadow` this pass.
- M2+ blocked on the 14 questions in the plan (§10).
