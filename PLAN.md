# find_time — Build Plan
### A ground-up React application in the "Torch Genesis Broadcast" design language
**Target repo:** `/Users/ajayvaidhyanathan/Enterprise/find-time`
**Status:** plan complete — build in progress (see STATUS.md for live phase tracking)

---

## 0. Sources, and what was taken from each

| Source | Read | Used for | Explicitly NOT used for |
|---|---|---|---|
| `~/Downloads/Find-time/new dashboard.html` | full | **Primary** app skin: sidebar, marquee, stat cards, AI panel, insight card, upcoming list, task modal, toast, mobile tab bar, bracket frame, palette | — |
| `~/Downloads/Find-time/landing.html` | full | **Primary** marketing skin: hero, browser-chrome card, phone-mockup AI panel, draggable widget chips, axis markers, HUD gauge, focus-timer pill, feature triptych | — |
| `~/Downloads/Find-time/torch genesis.html` | full | Motion vocabulary (GSAP: marquee loop, float-slow/fast, pulse-ring, holo shimmer, masked reveal, Draggable), grain overlay, crosshair frame, widget-collage idea | Its literal collage layout (too editorial for an app) |
| `~/Downloads/Find-time/torch-genesis-broadcast-2-DESIGN (1).md` | full | Token spec + guardrails (mono-only, don't flatten to generic card grid, preserve radius/border language) | — |
| `~/Coding/find_time/PLAN.md`, `STATUS.md`, `USER_GUIDE.md`, `specs/00–19`, `apps/` tree | read-only | **Functional requirements inventory only** (see §1) | Layout, IA, navigation, screen structure, `designs/` — deliberately not opened |

Note: `~/Downloads/Designs/generated-page - find time.html` is byte-identical (md5) to `new dashboard.html` — not an alternate variant, no extra ideas there.

### 1. Capability inventory carried over from the prior app (requirements, not layouts)

From the prior app's `PLAN.md`, `STATUS.md` and `specs/00–19`, these are real, already-validated requirements the new app must not drop:

**Calendar** — Day / Week / Month views plus Quarter and Year (spec 08/09); `EventBlock` as a positioned primitive (spec 10); drag-to-create tile lifecycle with 15-min grid snapping (spec 11); resize-to-change-duration (`useResizeEvent`); view item read-only card (spec 14); full edit form with unschedule (spec 15); three item types — `event` / `task` / `deepwork` (spec 12 `TypeChipGroup`); mini-calendar navigator (spec 02); project-grouped task list (spec 03); top bar with date nav + view segment (spec 04); profile menu with signed-in/guest states (spec 16).

**Projects** — shared project store with color assignment, inline creation, color-swatch override (spec 13).

**AI / scheduling** — the deepest asset. Spec 17 defines: a 7-intent NL taxonomy (`book`, `plan`, `edit`, `constraint`, `recurrence`, `query`, `preference`); an SSR contract (`ScheduleRequest` / `ScheduleItem` / `Constraint` / `Ambiguity` / `CalendarQuery` / `PreferenceUpdate`); "smart guess + confirm" mini-grill capped at ≤3 questions/turn that never asks what the profile can infer; a 5-step reference-resolution chain (explicit ID → LLM → fuzzy token overlap → grill → validation); a **pure deterministic scheduler** (`schedule(calendar, profile, request) → {plan, conflicts}`) doing request expansion → capacity scan → slot generation on a 15-min grid → most-constrained-first placement with backtracking → weighted soft-constraint scoring (preferred-window match, focus alignment, priority weight, fragmentation penalty); **pack-only** (never silently split a task); hard `dueBy` vs soft `preferBy`; soft focus windows that a hard deadline may displace *with a recorded note*; negotiate-then-fallback on infeasibility; **review-draft → apply-all**, never block-by-block confirmation; incremental re-plan of only the affected neighborhood. Spec 19 adds a chat panel with bubbles, suggestion chips, a pinned draft tray, and a composer.

**Platform** — Google Calendar OAuth with push-watch sync, token refresh, work hours + protected time, Stripe 14-day trial + Checkout/Portal, Sentry, Vitest + RTL + Playwright.

**Genuinely new in this version (no prior implementation exists):** multi-account Gmail/SMTP connection, email-derived scheduling context, and external to-do list ingestion.

**Deliberately deferred out of day one:** Stripe billing, Quarter/Year views, mobile Flutter/Expo apps, Firebase, OpenAPI codegen, Style Dictionary.

---

## 1. Product IA / sitemap

### 1.1 Marketing site — route group `(marketing)`

| Route | Screen | Purpose |
|---|---|---|
| `/` | **Home / Landing** | Marquee → Nav → Hero → BrowserChromeCard planner + PhoneAskPanel pair → floating widget chips → HowItWorks → FeatureTriptych → MultiAccountBand → PlanAccuracyGauge + social proof → PricingPreview → FinalCTA → Footer |
| `/how-it-works` | **How It Works** | 4 numbered stations: CONNECT → EXTRACT → PROPOSE → PROTECT |
| `/features/ai-scheduling` | **AI Scheduling** | Scheduler explainer, before/after strip, conflict-report sample |
| `/features/inbox-context` | **Inbox Context** | Multi-Gmail story, signal taxonomy, scope table |
| `/features/tasks` | **Tasks & To-dos** | Native tasks, import, duration/deadline model |
| `/pricing` | **Pricing** | SOLO/PRO/TEAM cards, FAQ |
| `/security` | **Security & Data** | Scope table, encryption, retention, subprocessors |
| `/changelog` | **Changelog** | Reverse-chron entries, telemetry numbering |
| `/legal/privacy`, `/legal/terms` | **Legal** | |
| `/demo` | **40-second demo** | |
| `/404` | **Not Found** | |

### 1.2 Auth & onboarding — route group `(auth)`

`/login`, `/signup`, `/auth/callback`, `/onboarding/welcome` (Step 01/05), `/onboarding/accounts` (Step 02 — the multi-Gmail flow, most important onboarding screen), `/onboarding/schedule` (Step 03 — working hours), `/onboarding/tasks` (Step 04), `/onboarding/first-plan` (Step 05 — runs the scheduler live, ends in draft-review).

### 1.3 Authenticated app — route group `(app)`, shell `AppShell`

`/app/today` (dashboard home), `/app/calendar/{day,week,month}`, `/app/plan` + `/app/plan/:sessionId` (AI Sessions), `/app/tasks` + `/app/tasks/:taskId`, `/app/projects` + `/app/projects/:projectId`, `/app/signals` + `/app/signals/:signalId`, `/app/notifications`, `/app/settings/{accounts,calendars,ai,schedule,notifications,profile,appearance,billing}`.

**Global overlays:** `CommandPalette` (⌘K), `QuickAddModal` (⌘N), `AIDock` (⌘J), `ToastStack`, `NotificationPopover`, `AccountSwitcherPopover`, `KeyboardShortcutsSheet` (?).

---

## 2. Design system — "Torch Genesis Broadcast"

### 2.1 Color tokens

```
lime            #CCFF00   primary action, active, accents, marquee text
lime-hi         #D7FF33   hover on lime surfaces
ink             #121212   secondary/ink surfaces, dark cards, text on lime
ink-raised      #1D1D1D   select/menu bg on ink
ink-hover       #252525
ember           #FF4400   accent, alerts, unread dot, conflict, live/record
ember-400/300/200  #FF7040 / #FF9B78 / #FFB39A
amber           #FFD600   traffic-light middle dot, accents
blue            #2047E6   background / electric blue — the app's field
blue-700/750/800/950  #1739BC / #173ABF / #142D99 / #07123F
periwinkle      #C8C8FF   surface — AI insight card, avatar, project dot
paper / paper-hi / paper-sunk   #F4F4F4 / #FAFAFA / #ECECEC
white           #FFFFFF
```

Alpha ladders on blue: `white/5 …/25`; text-on-blue: `white, white/70…white/25`; borders: `white/10` default, `white/20` raised, `#121212/10` on paper.

**Semantic role map:** `bg.canvas` = `#2047E6` + dot-grid + gradient; `bg.rail` = `#173ABF`@30%+blur; `bg.bar` = `#2047E6`@80%+blur; `bg.surface` = `white/[0.07]`+blur; `bg.inverse` = `#121212`; `bg.paper` = `#F4F4F4`; `bg.highlight` = `#C8C8FF`; `action.primary` = lime bg/ink fg; `status.live` = lime+glow; `status.alert` = ember; `status.pending` = amber.

### 2.2 Event-category palette

| Category | On-paper chip | On-blue block | Icon |
|---|---|---|---|
| Deep work | `#CCFF00`/70 | `#CCFF00`/10 + border/20 | `solar:bolt-linear` |
| Design | `#C8C8FF` | `white/[0.06]` + periwinkle tile | `solar:pallete-2-linear` |
| Research | `#FFB39A` | `white/[0.06]` + ember tile | `solar:notebook-linear` |
| Meeting | white + border | `white/[0.06]` + periwinkle tile | `solar:users-group-rounded-linear` |
| Admin batch | `#FFD600` | `white/[0.06]` + amber tile | `solar:inbox-line-linear` |
| Learning/habit | `#CCFF00` | `#CCFF00`/10 | `solar:book-2-linear` |
| Break/recovery | `#ECECEC` dashed | dashed divider | `solar:cup-hot-linear` |
| AI proposed (draft) | dashed lime, 8% fill, 88% opacity | same | `solar:magic-stick-3-linear` |
| Protected | transparent + 1.5px white/18 | same | `solar:shield-check-linear` |
| Conflict | ember border + 10% fill | same | `solar:danger-triangle-linear` |

### 2.3 Typography

**One family: JetBrains Mono** (400/500/600/700, `next/font/google`, `--font-mono`). **Base font size is 12px on `<body>`** — do not "correct" to 16px; this density is the defining trait.

| Token | px/lh | Use |
|---|---|---|
| `text-micro` | 10/1.2 | URL pill, phone status bar |
| `text-xs` (base) | 12/1.6 | body, nav, labels, chips — the default |
| `text-sm` | 14/1.6 | task titles, inputs |
| `text-base` | 16/1.6 | feature headings |
| `text-lg`/`xl` | 18–20 | panel/modal headings |
| `text-2xl`/`3xl` | 24–30 | stat numbers, dashboard h1 |
| `text-4xl`–`6xl` | 36–60 | landing hero |

**Label convention (non-negotiable):** every eyebrow/section-label/telemetry marker is `uppercase` at `text-xs`/`text-micro` with letter-spacing (`tracking-widest`=0.1em sidebar headers, `0.16rem` dashboard eyebrow, `0.18rem` marquee, `tracking-wider`=0.05em URL pill). Content (task titles, descriptions) is sentence case. Numbers are zero-padded (`04`, `NN.605`). Landing is more uppercase-heavy than dashboard — intentional.

### 2.4 Spacing, radii, sizing

8px base spacing scale. Radii: `rounded-lg`(8) = CONTROL radius (buttons/inputs/nav), `rounded-2xl`(16) = CARD radius (major panels), `rounded-full` = pills/avatars/dots. Sidebar 256px, topbar 64px, control heights 36/40/44, card padding 20 (app) / 24 (marketing), section padding 80.

### 2.5 Borders, shadows, effects

Hairline `white/10` default, raised `white/20`, focus `lime/50-60`. Shadows: `shadow.panel` = `0 25px 50px -12px rgba(0,0,0,.25)` on all major panels; `shadow.limeGlow`/`limeLift` on lime elements. Blur tiers: `xl`(24px) bars, `md`(12px) glass cards, `sm`(4px) scrims. `bg.dotGrid` (20px radial dots), `bg.grain` (2.5% diagonal repeating-gradient, 9px pitch), `bg.fieldGradient`. Global text selection = lime bg / ink text.

### 2.6 Motion

`marquee` (rAF translateX, −0.35 to −0.45px/frame), `hover-lift` (`-translate-y-0.5`, 150ms), `float-slow`/`float-fast` (widget chips), `pulse-ring` (live/OAuth pending), `holo-shimmer` (premium badge), `mask-reveal` (marketing headlines), `stagger-in` (lists), `toast-in`, `spin-once` (refresh), `ai-thinking`. All motion respects `prefers-reduced-motion` (marquee freezes, floats stop, opacity-only transitions).

### 2.7 Iconography

**Iconify Solar Linear only**, stroke-width 1.5, via `@iconify/react` + `@iconify-json/solar` (local, no CDN), wrapped in a single `<Icon>` component. Reuse exact names already in the mockups (see full list in the planning transcript) — `solar:sun-2-linear` (Today), `solar:folder-with-files-linear` (Projects), `solar:calendar-minimalistic-linear` (Calendar), `solar:magic-stick-3-linear` (AI), `solar:checklist-minimalistic-linear` (Tasks), `solar:inbox-line-linear` (Signals), `solar:bell-linear`, `solar:shield-check-linear`, `solar:bolt-linear`, `solar:letter-linear` (email account), etc.

### 2.8 Copy voice — two registers, don't blend

- **Marketing/chrome/telemetry:** ALL-CAPS, terse, slash-delimited. `FIND TIME FOR WHAT MATTERS.` / `APP.FINDTIME.AI / DASHBOARD` / `DAY.247 WK.36 CAP.08H FOC.04`. Zero-padded numbers.
- **In-app/AI:** calm, warm, sentence case, second person, no exclamation marks. `Make room for the work that matters.` / `I moved email review to your admin batch and reserved 08:00–08:35 for Spanish, when your energy is strongest.`

`src/content/voice.ts` holds marquee phrase pools, empty-state copy, AI response templates.

### 2.9 Tailwind config

**Tailwind v3.4 with TS config** (not v4) — every mockup uses v3 arbitrary-value syntax (`bg-white/[0.07]`, `shadow-[0_8px_24px_rgba(204,255,0,0.16)]`), so classes transcribe near-verbatim. Full token shape for `theme.extend` (colors, fontFamily, fontSize, letterSpacing, borderRadius, boxShadow, backgroundImage, keyframes) is in the planning transcript / to be written directly into `tailwind.config.ts` in P1. Plus `src/styles/tokens.css` exporting the same values as CSS custom properties for runtime-adjustable calendar geometry (`--ft-hour-height`).

### 2.10 Reusable primitives (full one-line specs in transcript — build in P1/P6)

**Chrome/motif:** `BracketFrame`, `GrainOverlay`, `DotGridField`, `MarqueeTicker`, `BrowserChromeCard`, `PhoneMockupCard`, `AxisMarkers`, `TelemetryRow`, `CornerRings`, `HoloBadge`.
**UI:** `Button`, `IconButton`, `Chip`, `Badge`, `StatusDot`, `Field`/`Input`/`Textarea`/`Select`/`Switch`/`Slider`, `Card`, `StatCard`, `Panel`, `Modal`/`Sheet`, `Popover`/`DropdownMenu`/`Tooltip`, `Tabs`/`SegmentedControl`, `ToastStack`, `EmptyState`, `SkeletonBlock`, `ProgressMeter`, `HUDGauge`, `DraggableWidgetChip`, `FocusTimerPill`, `CommandPalette`, `AIAskPanel`, `AIResponseCard`, `InsightCard`.
**Calendar:** `TimeGutter`, `HourGrid`, `DayColumn`, `DayHeaderCell`, `AllDayRow`, `NowIndicator`, `EventBlock` (+ ghost), `useEventLayout`, `useDragToReschedule`, `useDragToCreate`, `useResizeEvent`, `MonthCell`, `MiniMonth`, `ViewSwitcher`, `DateNavigator`, `ScheduleTimelineRow`.

---

## 3. Core features & user flows (summary — full detail in planning transcript)

### 3.1 Onboarding, login & multi-account connection

**Critical architectural rule:** identity login (Auth.js, one session) and connected accounts (N mailboxes, hand-rolled OAuth route handlers, never NextAuth) are separate systems — conflating them means adding account #2 overwrites the session.

`/onboarding/accounts` is the most important new screen: `AccountConnectCard` grid (Google, Microsoft-disabled/SOON, IMAP/SMTP, Todoist, Google Tasks, Notion) → `OAuthConsentDialog` previewing exact scopes before redirect (day one: simulated) → `ConnectedAccountRow` (avatar, email, auto-assigned accent color lime→periwinkle→ember→amber→white, sync StatusDot, overflow menu) → prominent dashed "Add another account" row → lime callout after 2nd account connects.

App never "switches mailbox" — all accounts always merge; `AccountFilterChipRow` in TopBar filters by account, tinting sourced events with a 3px accent bar. This distinction is what prevents multi-account confusion.

### 3.2 Dashboard — `/app/today`

Follows `new dashboard.html` closely: `MarqueeTicker` (live content) → `AppSidebar` (nav + `WeeklyFocusCard` + profile) → `AppTopBar` (search/⌘K, notifications, `Plan with AI` CTA) → `TodayHeroSection` → `TodayStatsRow` (3 StatCards) → main grid: left `TodayScheduleCard` (paper panel, `ScheduleTimelineRow`s, checkbox completion with undo toast), right column `AIAskPanel` + `InsightCard` + `UpcomingCard` + `SignalsPreviewCard`. `MobileTabBar` on <lg. Everything from live store data, no static numbers.

### 3.3 Calendar views — `/app/calendar/{day,week,month}`

**Standing principle:** grid mechanics are conventional/universal (real hour rows, real day/date columns, time-proportional event blocks, live now-line) — never replace with a stylized abstraction. Only the skin (palette, chrome, icons) is Torch.

Day/Week/Month views built on `TimeGutter`+`HourGrid`+`DayColumn`+`EventBlock` w/ `useEventLayout` overlap-column resolution; `NowIndicator` lime hairline+dot, refreshed per minute. Full CRUD: press-drag create → `QuickAddModal`; click → `EventDetailPopover`; edit → `EventEditDrawer`; delete = immediate + 6s undo toast (no confirm dialog); drag-to-reschedule with 15-min snap + conflict ember ghost; resize via top/bottom handles. Keyboard: d/w/m/t/←/→/n/Enter/Delete/⌘Z.

### 3.4 AI-assisted scheduling — the core loop

Five-stage pipeline, each with a UI surface:
1. **Ingest** — background poller per `ConnectedAccount` (mocked day one; Gmail `users.watch`+History API / IMAP IDLE later).
2. **Extract → `EmailSignal`** — LLM classifies into commitment/deadline/meeting-request/task/follow-up/travel/ignore, surfaced on `/app/signals` as `SignalCard`s (source quote highlighted in lime, Make a task / Schedule it / Ignore).
3. **Propose → `PlanDraft`** — triggered by "Plan with AI", the ask panel, a daily auto-plan, or accepting a signal. Two-part engine: **Parse** (LLM → `ScheduleRequest` SSR, spec-17 shape, with a deterministic fallback parser) + **Schedule** (pure TS, zero-cost, fully unit-testable: expand → capacity scan → 15-min slot generation → most-constrained-first placement with backtracking → weighted scoring → conflict report). Pack-only — never silently splits a task.
4. **Review — draft mode** (the most important interaction, built once, reused everywhere): `DraftModeBanner` (`DRAFT PLAN · 4 CHANGES · 0 CONFLICTS`, Apply all / Discard / Regenerate); proposed blocks render dashed-lime `EventBlock variant="draft"` with numeric index; `SuggestionReviewList` mirrors with rationale + confidence + Accept/Edit/Reject/Try-another-time; editing a draft item triggers *incremental* re-plan of only the affected neighborhood; Apply all commits in one transaction with one undo. Infeasibility surfaces as a `ConflictReportCard` with concrete one-tap fallbacks, never silent.
5. **Protect & re-plan** — flexible blocks auto-defend against new collisions (re-plan just that block + notify); protected blocks never auto-move, instead raise a conflict.

**Ask AI** shares one component/state-machine across `AIAskPanel` (dashboard), `AIDock` (⌘J, every screen), and `/app/plan` (full session view). Response shapes: Plan (periwinkle `AIResponseCard` → draft mode), Question (mini-grill, ≤3 `ConfirmChipRow`s, always leads with its own guess), Answer (read-only query response), Conflict (fallback menu). Voice input via Web Speech API.

**AI autonomy setting** (`/app/settings/ai`): Suggest only → Draft daily (**default**) → Auto-protect → Full auto.

### 3.5 Tasks & to-dos — `/app/tasks`

Sources: native, signal-converted, imported (Todoist/Google Tasks/Notion/paste). Views: List (grouped Today/This week/Later/No date/Done), Board, Backlog (unscheduled — the scheduler's feedstock, with a persistent `Find time for all` bar). Schedulable-task contract: `durationMin`, `dueBy` (hard) vs `preferBy` (soft), `priority`, `requiresFocus`, `preferredWindow`, `splittable` (default false), `minChunkMin`. Completing a scheduled task records actual-vs-estimated duration back onto the `SchedulerProfile` (the learning seam). `/app/projects` grid + detail with `Plan this project` AI decomposition action.

### 3.6 Notifications & reminders

Types: event.reminder, plan.ready, plan.applied, conflict.detected, task.overdue, signal.new, account.error, focus.complete. Surfaces: `NotificationBell`→popover→`/app/notifications` full history; `ToastStack` for transient events; browser `Notification` API for reminders (Web Push is phase 2). Preferences: per-type channel matrix, quiet hours (also suppresses AI auto-actions), daily-plan delivery time.

### 3.7 Settings

Tabs: Accounts (the multi-Gmail manager + scope table + disconnect), Calendars (read/write switches + single write-target radio per calendar), AI preferences (autonomy level, energy curve, tone, BYO model key), Schedule (`WorkHoursGrid`, timezone, standing constraints as mono rule rows), Notifications (channel matrix, quiet hours), Profile (avatar, export data, delete account), Appearance (density, grain/marquee toggles, reduced motion, floating-widget reset), Billing (stub day one).

---

## 4. Data model (full TypeScript shapes in planning transcript — implement in P3)

Core entities: `User`, `ConnectedAccount` (the multi-Gmail core: provider/kind/authType, encrypted tokens server-only, syncStatus, accentColor), `Calendar`, `CalendarEvent` (itemType, category, origin, flexibility, isDraft/draftBatchId), `Task` (durationMin, dueBy/preferBy split, splittable=false default, sourceType/sourceAccountId provenance), `Project`, `EmailSignal` (email→schedulable context, confidence, status), `AISession`/`AIMessage` (carries the parsed SSR), `PlanDraft` (batch) → `AISuggestion` (index, rationale, confidence, displacedFocus), `Constraint`, `SchedulerProfile` (the learning seam: workHours, energyCurve, weights, durationBias, autonomy), `Notification`, `FocusSession`.

Key relationships: `User 1—N ConnectedAccount 1—N Calendar 1—N CalendarEvent`; `User 1—N Task 0..1—1 CalendarEvent`; `ConnectedAccount 1—N EmailSignal 0..1—1 Task`; `PlanDraft 1—N AISuggestion`; `User 1—1 SchedulerProfile`. Every event/task traces to its origin — this provenance chain is what makes AI proposals explainable and must never be dropped.

---

## 5. Tech stack

**Next.js 15 (App Router) + React 19 + TypeScript** — chosen over Vite specifically because Gmail OAuth token exchange needs a server with a client secret that must never reach the browser; Next Route Handlers give that for free in one deploy target, one repo, one Tailwind config.

| Layer | Choice |
|---|---|
| Framework | Next.js 15, TS 5.6 strict, `(marketing)`/`(auth)`/`(app)` route groups |
| Styling | Tailwind CSS 3.4 + `tailwindcss-animate` + `@tailwindcss/typography` |
| Fonts | `next/font/google` → JetBrains Mono, self-hosted |
| Icons | `@iconify/react` + `@iconify-json/solar`, local |
| Headless primitives | Radix UI (Dialog, Popover, DropdownMenu, Tabs, Switch, Slider, Tooltip) |
| Server state | TanStack Query v5, optimistic mutations for calendar edits |
| Client state | Zustand + persist (`useUIStore`, `useCalendarStore`, `useDraftStore`, `useWidgetStore`) |
| URL state | `nuqs` (calendar date/view/filters shareable) |
| Forms | React Hook Form + Zod |
| Dates | `date-fns` v4 + `date-fns-tz` |
| Drag | Custom pointer-event hooks; `@dnd-kit/core` for task↔calendar cross-container drag |
| Mock data/API | Route handlers backed by `src/server/store/` (seeded in-memory + localStorage mirror) — **components only ever call `/api/*`**, swapping in a real DB later touches zero UI |
| Auth (identity) | Auth.js v5, Google + magic-link; mock cookie session day one |
| Auth (connections) | Hand-rolled per-provider route handlers, AES-256-GCM encrypted tokens — never NextAuth |
| AI | `/api/ai/parse` + `/api/ai/plan` → provider adapter (Anthropic/OpenAI/Gemini); scheduler itself is always real, non-LLM |
| Testing | Vitest + RTL, Playwright (5 core flows); scheduler gets a dedicated table-driven suite |
| Deploy | Vercel |

Real-integration notes (Gmail verification takes weeks, `users.watch`+Pub/Sub push sync, IMAP via `imapflow`/`nodemailer`, Google Calendar `syncToken`/`events.watch`) are deferred but the architecture above accommodates them without UI changes.

---

## 6. Component breakdown

Full per-screen component trees (marketing, auth/onboarding, app shell, today, calendar, AI sessions, tasks/projects, signals, settings) are captured in the planning transcript and will be authored directly as components during each build phase — not re-typed here to avoid drift between this doc and the code.

---

## 7. Folder structure

```
/Users/ajayvaidhyanathan/Enterprise/find-time/
├── README.md · PLAN.md (this file) · STATUS.md
├── package.json · next.config.ts · tsconfig.json
├── tailwind.config.ts · postcss.config.mjs
├── .env.example · .env.local (gitignored)
├── vitest.config.ts · playwright.config.ts
├── public/ (favicon, og images, brand marks)
└── src/
    ├── app/
    │   ├── (marketing)/  — landing + marketing pages
    │   ├── (auth)/       — login/signup/onboarding
    │   ├── (app)/app/    — today/calendar/plan/tasks/projects/signals/notifications/settings
    │   └── api/          — connections, events, tasks, ai, drafts, notifications, settings
    ├── components/
    │   ├── motif/  ui/  layout/  calendar/  ai/  tasks/  signals/  accounts/  settings/  marketing/
    ├── lib/
    │   ├── types/  scheduler/  calendar/  ai/  api/  stores/  hooks/  utils/
    ├── server/
    │   ├── store/  ai/  connections/  auth/
    ├── content/  (voice.ts, changelog, pricing, legal)
    ├── styles/   (tokens.css, base.css, motion.css)
    └── test/
```

---

## 8. Phased build plan (one working day)

| # | Phase | Deliverable |
|---|---|---|
| **P0** | Scaffold | create-next-app (TS, App Router, Tailwind), deps, fonts, icons, route-group skeleton, git init |
| **P1** | Tokens & theme | `tailwind.config.ts` + tokens.css + motion.css; all base UI primitives; `/dev/kitchen-sink` |
| ⛳ QA-1 | Token & primitive review | |
| **P2** | Landing page | Full `/` build vs `landing.html`, responsive, OG/metadata |
| ⛳ QA-2 | Landing design review | |
| **P3** | Data layer & mocks | All types, seeded store (2 Gmail + 1 IMAP account, 35 events, 18 tasks, 3 projects, 12 signals), all `/api/*` routes, TanStack hooks |
| **P4** | App shell + auth stub | AppShell, sidebar, topbar, mobile nav, mock session, login/signup |
| ⛳ QA-3 | Shell review | |
| **P5** | Dashboard `/app/today` | Full build against live seeded data |
| ⛳ QA-4 | Dashboard review | |
| **P6** | Calendar grid mechanics | geometry/layout libs + tests, Day/Week/Month, now-indicator, URL state |
| **P7** | Calendar CRUD & drag | create/reschedule/resize hooks, detail popover, edit drawer, undo |
| ⛳ QA-5 | Calendar review (standing-principle gate) | |
| **P8** | Scheduler engine | Pure TS deterministic scheduler + table-driven test suite, no UI |
| **P9** | AI flow end to end | parse→SSR→plan, draft mode, review panel, mini-grill, conflict fallbacks, AI Sessions screen |
| ⛳ QA-6 | AI flow review | |
| **P10** | Tasks, projects, signals | List/board/backlog, project detail, signal→task→schedule chain |
| **P11** | Accounts & settings | Onboarding 01–05, all 8 settings tabs, account filter chips |
| ⛳ QA-7 | Onboarding/settings review | |
| **P12** | Notifications & reminders | Full history, popover, generation triggers, browser reminders |
| **P13** | Polish & QA | Loading/empty/error states, a11y sweep, responsive sweep, tests, Sentry, deploy |
| ⛳ QA-8 | Final holistic review | |

**Cut order if short on time:** changelog/demo → Month view → project detail → task board view → notifications full page → Appearance settings. **Never cut:** calendar grid mechanics (P6/P7), scheduler (P8), draft review loop (P9) — those three are the product.

---

## 9. UI-quality checkpoints — "Torch QA"

Eight review points (after P1, P2, P4, P5, P7, P9, P11, P13), each checking 8 axes against **this app's own design system** (this file + the source mockups) — never the old app, never generic best practice:

1. **Palette fidelity** — every color resolves to a §2.1 token; lime reserved for primary/active/live only
2. **Typographic discipline** — mono only, base 12px, uppercase+tracking on all labels, zero-padded numbers, sentence-case content vs uppercase chrome never mixed within one component
3. **Chrome & motif presence** — BracketFrame, grain, dot grid, live marquee content, correct blur tiers, full BrowserChromeCard treatment
4. **Geometry** — radii (control-8/card-16/pill), control heights 36/40/44, 8px spacing grid
5. **Calendar correctness** (gate at QA-5/QA-8) — hour rows real & even, event top/height strictly proportional to real time (hand-verify 3 events), now-indicator accurate, 15-min snap exact — **never replace the grid with a stylized abstraction**
6. **Motion** — hover-lift exactly `-translate-y-0.5`, correct marquee speed/durations, reduced-motion honored
7. **State completeness** — loading/empty/error/disabled on every surface, destructive actions get undo not confirm (except account disconnect/deletion)
8. **Accessibility** — AA contrast (flag `white/30`/`/35` on blue for real content), visible lime focus rings, `aria-label` on icon buttons, full keyboard traversal

Findings reported as `SEVERITY · AXIS · LOCATION · EXPECTED vs ACTUAL`. Blockers fixed before next phase; majors before next checkpoint; minors batched into P13.

---

### Critical files

- `tailwind.config.ts` — the design system made executable, everything depends on it
- `src/lib/scheduler/index.ts` — the pure deterministic scheduler, highest-value/most-testable code
- `src/components/calendar/EventBlock.tsx` — where the standing principle lives
- `src/components/ai/DraftReviewPanel.tsx` — the review→accept/edit/reject→apply-all loop that defines the product
- `src/components/accounts/ConnectedAccountRow.tsx` — the multi-Gmail differentiator
- `src/server/store/seed.ts` — every screen's realism depends on this dataset

Reference sources (read-only): `~/Downloads/Find-time/new dashboard.html`, `~/Downloads/Find-time/landing.html`, `~/Downloads/Find-time/torch genesis.html`, `~/Downloads/Find-time/torch-genesis-broadcast-2-DESIGN (1).md`, `~/Coding/find_time/specs/17-nl-scheduling-and-algorithm.md` (requirements only).
