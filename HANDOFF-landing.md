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

## 9. Personal-agent pivot (branch `agent-landing`, 2026-09-11)

The user is repositioning Find Time from an AI day planner to a **personal agent**
(email, calendar, tasks, accounts) whose model never sees personal data. The
landing now sells that. A sanctioned rewrite of the page's content, not a
restyle: same electric ground, lime accent, `Txt` mono, `RAMP` contrast values.

**Page order is the argument:** what it does → why it's safe → what it can't
promise → when → waitlist.

| Section | File | What |
|---|---|---|
| Hero | `components/Hero.tsx` | H1 now spans the full width (the long accent line holds to 2 lines); body, CTAs and three "00" stats sit beside an `aside` slot. Primary CTA is lime now. Secondary scrolls to `#boundary`. |
| Agent log | `components/AgentLog.tsx` | The hero card: 4 example actions, one payment **held for you**. Approve resolves it; Review shows what will be sent (IBAN only ever seen by the model as `<IBAN_1>`). |
| Capabilities | `components/Capabilities.tsx` | Replaces `FeatureGrid` (deleted). Same hairline-seam grid; 4 cards, each ending on when it checks with you. 4-up / 2×2 / stacked. |
| The boundary | `components/Boundary.tsx` | Centrepiece. One request in 3 lanes: as typed → as the model sees it (tokens) → as it leaves after approval. **Tap** a value to light it in all lanes (nested `<Text>` can't host a Pressable, and tap works on phones). Opens with the wallet selected so the linking shows at rest. |
| What we keep | `components/Storage.tsx` | The whole account drawn as one `users` row on the light-card language, beside 3 storage principles. Labelled **DESIGN SPEC · PHASE 2**. |
| Rules | `components/Rules.tsx` | "The model decides. Code does." 4 rules beside `DemoVideo` — the walkthrough moved here as proof the rule already ships (`findFreeSlots` places blocks, not the model). |
| Limits | `components/Limits.tsx` | Prompt injection, detection misses, data that has to be used. Deliberately plain. |
| Roadmap | `components/Roadmap.tsx` | Phase 1 live (find time) → 2 boundary → 3 email & tasks → 4 accounts. |
| Shared | `components/SectionHead.tsx` | Eyebrow + title + lede recipe used by every section. |
| Copy | `copy.ts` | META / MARQUEE / HEADER / HERO / TELEMETRY / FOOTER rewritten; AGENT_LOG … ROADMAP added; WAITLIST title + meta updated; FEATURES removed. Mock-only copy kept. |
| Anchors | `useAnchors.ts` | `top · capabilities · boundary · roadmap · waitlist` (was `planner · features · focus`). |

**Decisions made without asking (flag if wrong):**
1. **No new webfonts.** An editorial display face was considered, but `+html.tsx`
   records shipping webfonts as an open question, so the page stays in `Txt` mono.
2. **Unmounted:** `FloatingWidgets` (German-planner widgets no longer fit the
   story). Files kept, like the other landing.html mocks.
3. **Claims track the roadmap.** Phase 1 is stated as fact; the boundary and
   storage are future scope and say so (`DESIGN SPEC · PHASE 2`, roadmap states).
   The engineering to-do behind Phases 2–4 is the privacy/architecture list agreed
   with the user; it is not built.
4. Sections align to a 1200 column (= header 1280 − 2×40) so edges line up with
   the logo. `WaitlistSection` keeps its own 1152.

**Verified:** `tsc --noEmit` · `expo lint` green. `npx expo export --platform web`
green — `/` SSR 86 KB and contains every new section headline. Served with
`expo serve`, viewed in Chrome at 1440: header, hero and AgentLog render, no
console errors. One fix from that look: placeholder tokens were `⟨…⟩`, which the
platform mono draws like parentheses, so they are `<…>` now.

**Worktree gotcha:** a fresh worktree has no `.env.local` or `expo-env.d.ts` (both
gitignored). Without the Clerk key the client throws `Missing publishableKey` and
`/` renders blank blue; tsc also fails on untouched files. Copy both from the main
checkout, then export once with `--clear` — Metro otherwise reuses the key-less
client bundle.

**Not done:** only the hero was eyeballed. Below-the-fold sections, the
375 / 640 / 1024 widths, tap-to-follow in Boundary, and native were not viewed.

## 10. Productivity-agent repositioning (branch `agent-landing`, 2026-09-11)

User feedback on §9: it's a **productivity** agent, not a personal one. Drop
payments/accounts; don't show how it's built (token swap, `users` table, rules,
limits, roadmap); show what it can do, which connectors it has, and — by diagram,
not prose — that no text leaves the ecosystem and it never touches wallets or
contacts.

**Page order:** hero + connector hub → Connections screen → what it can do
(flowcharts + walkthrough video) → ecosystem diagram → waitlist.

| Section | File | What |
|---|---|---|
| Hero aside | `components/ConnectorHub.tsx` | Find Time core wired to 8 connectors on a ring; "never connects: wallets, contacts" strip. Fixed 460 canvas (SVG wires + View nodes) scaled to the card width, so it never reflows. |
| Connectors | `components/Connectors.tsx` | A Connections-screen preview: 8 tools with working switches (email/Slack/calendar on at rest), plus an off-limits row (wallets, contacts, passwords, payment cards) with no switch. 2-col ≥900. |
| What it can do | `components/Workflows.tsx` | Tabbed flowcharts (schedule / inbox / research / follow-up): your ask → 4 connector steps → result. A tab press replays the chain step by step (instant under reduced motion; fully lit at rest for SSR). `DemoVideo` beneath as "live in beta". |
| Privacy | `components/Ecosystem.tsx` | Tools ⇄ Find Time ⇄ you inside a dashed boundary; ✕ badges on the boundary edge cut routes to ad networks / data brokers / model training / other companies; never-connected items hang off a broken line. Title + diagram + legend only. |
| Copy | `copy.ts` | META/MARQUEE/HEADER/HERO/TELEMETRY/FOOTER rewritten; CONNECTORS, HUB, WORKFLOWS, ECOSYSTEM added; AGENT_LOG, CAPABILITIES, BOUNDARY, STORAGE, RULES, LIMITS, ROADMAP removed. WAITLIST title/meta/reason placeholder updated. |
| Anchors | `useAnchors.ts` | `top · connectors · workflows · privacy · waitlist`. |
| Icons | `scripts/gen-solar-icons.mjs` | +12 Solar glyphs: browser, card, checklist, cloud, contacts, forbidden, hashtag, key, notebook, user, video, wallet (regenerated `solar-icons.ts`). |

**Deleted:** AgentLog, Boundary, Capabilities, Storage, Rules, Limits, Roadmap
(in git history at `a0407df`).

**Claims to back before launch:** "no text leaves your ecosystem" and "model
training" as a blocked exit rely on a zero-retention agreement with the model
provider (roadmap memory item 12). Only Google Calendar is live today; the
Connections screen is labelled a preview.

**Verified:** `tsc --noEmit` · `expo lint` green; `expo export --platform web`
green, SSR contains every new headline and no payment copy. Viewed in Chrome at
1440 and 400 via `expo serve`: all sections, the switch toggles and the tab
replay; no console errors.
