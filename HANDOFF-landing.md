# HANDOFF — Landing page (M1: visual port, static)

Companion to `HANDOFF.md`. Same rule (§3 there): **port what exists, don't
redesign.** This file logs every place the RN port of
`design/from_user/landing.html` deviates from the reference, and why.

Branch `landing-page`. M1 = the visual port with the mockup's own mock
interactions. A **working waitlist** was then added on top at the user's
request (§7 below) — that's the M2/M3 slice, built minimal. The mock cards'
CTAs still don't submit anything; `START PLANNING` / `PLAN MY DAY` now scroll
to the waitlist.

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

## 7. Waitlist (added after M1, at the user's request — the M2/M3 slice, minimal)

**Not in landing.html.** A dark-panel section (`#waitlist`) between the feature
grid and footer: eyebrow, `JOIN THE WAITLIST`, one email field + `REQUEST ACCESS`.
`START PLANNING` (header) and `PLAN MY DAY` (hero) scroll to it.

| File | What |
|---|---|
| `src/signup/waitlist.ts` | shared contract: `WaitlistRequest/Response`, `validateEmail` (permissive — one `@`, dotted domain, ≤254), `normalizeEmail`, `joinWaitlist` (POST `/api/waitlist`). Zero RN/Node imports. |
| `src/signup/waitlist.check.ts` | runnable check for `validateEmail`/`normalizeEmail` — `npx tsx src/signup/waitlist.check.ts` → `waitlist.check: ok`. |
| `src/app/api/waitlist+api.ts` | `POST` handler: 4 KB body cap → honeypot (200, silent) → `validateEmail` (400) → store (201 `added`/`already`) → 500 on throw. No rate-limit yet. |
| `src/server/waitlist-store.ts` | **in-memory `Map`, process-lifetime** (plan §6.5). `ponytail:` seam — swap the 3 functions for queries against `db/001_waitlist.sql` once a host/DB is picked (§10 Q1). |
| `src/landing/components/WaitlistForm.tsx` | `idle → submitting → success \| error`. Client-validates first. Honeypot `company` field parked offscreen + `aria-hidden`. Error = orange border + `danger-triangle` glyph + text; success = lime check + text; submit `aria-busy`. |
| `src/landing/components/WaitlistSection.tsx` | the panel + copy (`WAITLIST` in `copy.ts`). |
| `db/001_waitlist.sql` | DDL (plan §6.3, trimmed). **Not applied anywhere** — the endpoint uses the in-memory store. |

**Verified:**
- `npx expo export --platform web` — `/api/waitlist` bundles (5 KB); `/` SSR is
  now 87 KB with the section server-rendered.
- `curl` against `npx expo serve` (production `dist/`): valid → `201 added`,
  same email again (case/space-insensitive) → `201 already`, `nope` →
  `400 invalid_email`, honeypot filled → `200` (no store write), non-JSON →
  `400`.
- Chrome (`expo serve`, ~1280 px): section renders on the dark-panel language;
  submitting a valid email collapses the form to "✓ You're on the list…";
  `broken@@nope` + Enter shows the inline orange error with the glyph, no
  network call.
- `tsc --noEmit` · `expo lint` — green (the check file is plain TS, no `node:`
  imports, so it type-checks in-tree).

**Deliberately not built (needs the user — plan §10):**
- **Double opt-in / confirmation email** — single opt-in only. EU/DE targeting
  reverses this (§10 Q4) and needs an email vendor (§10 Q8). `confirm_token` /
  `confirmed_at` columns exist in the SQL for the flip.
- **Rate-limiting** (§6.3 `signup_rate_limit`) — honeypot + body cap only for now.
- **Real persistence** — see `waitlist-store.ts`; the dev server (`expo start`)
  re-evaluates the API module per request so `already` never fires there; it
  works under `expo serve`. Both go away with a real DB.
- **Beta-request flow** (the richer qualifying form, plan §5 flow 2) — not built;
  this is waitlist-only.
- **`analytics.ts` events** (§5.1) — not wired.
- Footer `PRIVACY` / `TERMS` still inert — those pages are §10 Q5.

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

## 8. German-learning walkthrough (added after M1, at the user's request)

**Not in landing.html** — a sanctioned deviation. The user asked for the mock
dashboard to demonstrate the product: a user asks AI to plan German learning and
the sessions land on the calendar.

| File | What |
|---|---|
| `src/landing/useDemoSequence.ts` | Owns the timeline. Snapshot is `REWOUND` at rest (SSR + first client render); `onEnterViewport` — wired to the hero `onLayout` — plays it forward once to `DONE` and stops. `started` ref guards re-entry. |
| `src/landing/copy.ts` | `SCHEDULE[0]` re-themed `Spanish practice` → `German practice`. New `SCHEDULE_AI` (2 lime rows: Vocabulary drill 14:15, Speaking practice 16:00). New `AiResponseState` type + `DEMO` (`prompt`, `aiRows`). `PHONE.askValue` / `responseBody` / `answeredBody` / `changes` re-themed to the German flow. |
| `src/landing/components/MockPlannerCard.tsx` | New `aiPlaced?: number` prop (default = all rows). Renders `SCHEDULE_AI.slice(0, aiPlaced)`; each `AiScheduleRow` fades + slides in on mount. |
| `src/landing/components/MockPhoneCard.tsx` | New optional `demo` prop. When present the card is driven — prompt value + response state come from the sequence, the input is `editable={false}`, the send button pulses on `sendPulse`. Manual ask path is kept for when `demo` is absent. Added a `placeholder` on the ask input so the no-JS frame still shows the request. |
| `src/landing/LandingScreen.tsx` | `useDemoSequence()`; hero `onLayout` merged (`onHeroLayout`); `aiPlaced` + `demo` passed to the two cards. |

**Beats** (~5.3s): type the request (~42ms/char) → send pulse → `thinking`
(1.2s) → `answered` → row 1 slides in → row 2 slides in → rest.

**Reduced motion**: `onEnterViewport` snaps straight to `DONE`, no timers, no
row animation. The reduced→finished jump happens in the layout callback (post
-hydration), not in render, so SSR and first client render stay identical.

**Trigger**: `onLayout`, not an IntersectionObserver — for an above-the-fold
hero it fires ~immediately. `ponytail:` note in the hook; swap in an IO on the
hero ref if it must wait for a real scroll.

**Verified**: `tsc --noEmit` · `expo lint` green. `npx expo export --platform
web` green — `/` SSR still 87 KB, contains `German practice` / `Deep work` /
`Admin batch`, and correctly omits the two `German · …` rows (client-only).

**Not done**: not eyeballed in a browser this pass; no breakpoint sweep of the
taller schedule column against the widgets; no replay control (plays once).

## 9. Replaced by the 3D calendar landing (2026-09-11)

**§1–§8 above describe the old RN landing, which is deleted.** `/` on web now
renders `src/landing/dom/LandingPage.tsx` — the approved 3D artifact
(week board · connectors orbit · privacy dome), ported on `calendar-landing`
and copied here unchanged apart from real Privacy / Terms links in the form's
consent line and the footer. Only the landing changed; `/app`, `/login`,
`/privacy`, `/terms`, auth and the API are untouched.

| Change | Files |
|---|---|
| New page (plain React DOM + three.js, CSS scoped under `.ft-landing`) | `src/landing/dom/**`, `three` in `package.json` |
| `/` mounts it + the existing `CookieConsent` | `src/app/index.web.tsx` |
| Waitlist: the page's email form → `joinWaitlist({ email, source: 'landing' })` → `POST /api/waitlist` → `waitlist-store` (Neon, in-memory fallback). Backend unchanged. | `index.web.tsx` |
| `/waitlist` page removed (route, `Stack.Screen`, robots, sitemap) | `src/app/waitlist.tsx`, `WaitlistScreen.tsx`, `_layout.tsx`, `public/robots.txt`, `public/sitemap.xml` |
| Old landing removed | `LandingScreen`, `Hero`, `LandingHeader`, `FeatureGrid`, `FloatingWidgets`, `DemoVideo`, `Mock*Card`, `Waitlist{Form,Section}`, `useAnchors`, `useDemoSequence`, `useDraggable`, `public/find-time-walkthrough-*` |
| `copy.ts` cut to `META` (calendar wording) + `COOKIES`; the page keeps its copy inline | `src/landing/copy.ts` |

Kept: `LegalScreen`, `legal-copy`, `ramp`, `CookieConsent`. The API still
accepts `name` / `reason` (db/014) though nothing sends them now.

**Known:** The page loads JetBrains Mono from Google Fonts for its 3D labels
(artifact HANDOFF §5) — a third-party request on `/`.

## 10. Clarity pass — one animation, plain content (2026-09-11)

User feedback on §9: "I couldn't read anything that tells me what I'm looking
at." Content first, then animations.

| Change | Where |
|---|---|
| All page copy moved into `LANDING` (review/edit here); the 4 worked examples stay next to their animation in `weekBoard.js` | `src/landing/copy.ts` |
| Hero says what the product is (eyebrow `AI CALENDAR PLANNER`, h1, lede). Marquee removed. | `LandingPage.tsx` |
| Week board = the only animation. Now labelled `EXAMPLE`, has a colour legend, and a visible numbered step list (the `steps` data existed but was never rendered) that ticks through as it plays. Plays once on first view; no more auto-advancing between examples. | `weekBoard.js`, `LandingPage.tsx` |
| New static sections: **How it works** (3 steps), **Why** (problem → what Find Time does, wording from `calendar-landing`'s PROBLEM) | `LandingPage.tsx` |
| Connectors orbit → static cards (name, apps, what it's used for, REQUIRED/OPTIONAL) + "can't be connected" strip. Fake switches removed. | `connectorsOrbit.js` deleted |
| Privacy dome → static labelled diagram (your tools ⇄ Find Time ⇄ you inside the boundary; ad networks / brokers / training / other companies outside, blocked) + the 3 pledges | `privacyDome.js` deleted |
| Readability: sentence-case headings, body copy in system sans at 15–18px, muted text raised to .84/.64 alpha | `landing.css` |

Left alone: `shared.js` still exports `panelGeo`, `glowSprite`, `pointsMat`,
`projectTo`, now unused (only the deleted scenes used them).

**Follow-up (same day, user):** removed the hero's "What Find Time does" step
list and the Why section. Privacy no longer lists blocked parties (ad networks,
brokers, model training, other companies) or never-connected items (wallets,
contacts, passwords, cards) — the connectors "can't be connected" strip went
too. The one message is now: *your data never leaves your ecosystem, not even
to Find Time*. Diagram: your tools ⇄ Find Time ⇄ you inside the boundary;
"Find Time's servers" outside, receiving none of your data.

Open for the user: that claim is ahead of the current build — `google/sync.ts`
caches calendar events server-side and planning calls go to the Anthropic API
(agent roadmap items 4 and 12). Ship the copy together with those, or soften it.
