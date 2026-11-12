# Prism look + Plan with AI features — build plan

Written 2026-11-12 on branch `prism-ai` (off `origin/ai-loop` @ a5ea935). Every file
reference below was checked against that commit.

This plan turns two things into code in the real app, built together in slices (see "How UI and features ship together" at the end):

- **The design**: the Prism look the user picked — Prism colours, Instrument Serif /
  Inter Tight / JetBrains Mono, and the drawer | tasks | calendar | Plan with AI layout.
  Reference: https://claude.ai/artifact/GD4WVtPC7cQ2RUqZwShEXh (Dashboard tab).
- **The features**: the Plan with AI states — chat history, activity log, smart start,
  report status, usage. Spec: https://claude.ai/artifact/F1csAtUcXgwYE11K2EzjXy (v2).
  Read the spec text; the mockups there are rough, the user did not like the visuals.

## Ground rules

1. **Nothing here goes into the 13 Nov launch.** Never merge PR #28 or this branch to
   `main` without the user asking (merging deploys Railway production).
2. **One visible step at a time.** Each step below ends in something the user can see
   in the running app. Show it, get a reaction, then start the next step. Several earlier
   rounds failed by redesigning every state at once.
3. **Verify in the running app**, not only with `tsc`. Check which worktree the Expo
   server is serving before saying it works. Use `/preview` (canned data, no account) for
   screenshots, and a real signed-in account for anything that reads or writes data.
4. **Per step checks**: `npx tsc --noEmit`, `npx expo lint`, `npx expo export --platform web`,
   the relevant `*.check.mjs`, and `npx npm@10 ci --dry-run` if a dependency changed.
5. **Commit and push after every step.**
6. **Product rules that stay**: grid tiles show title + time only; tool icons/labels come
   from the tool registry (`GET /api/ai/tools`), never hard-coded; never say "added" unless
   a tool ran this turn; ask before placing when day or length is missing; never store
   Google event content (`src/server/ai/scrub.ts` already scrubs stored replies).
7. **Fonts stay self-hosted** in `public/fonts` (see `src/app/+html.tsx:51` — loading from
   Google would leak visitor IPs). No `fonts.googleapis.com`.
8. **No new dependencies unless unavoidable.** There is no gradient library; gradients
   are CSS on web and a solid fallback on native.

## Decisions needed from the user

Each one blocks only the step named. Recommendations in bold.

| # | Decision | Blocks | Recommendation |
|---|----------|--------|----------------|
| D1 | Repaint the whole app in Prism on this branch (not just the AI panel)? | Phase A | **Yes** — the panel in Prism next to a Nexus calendar would look broken |
| D2 | Proposals on the grid: pale peach fill + dashed orange edge (Prism), or outline only (old "no orange fills" rule)? | A5 | **Pale fill `#fff4ec` + dashed `#ff6a00`** as in the Prism page |
| D3 | Native (iOS/Android) at the same time as web? | A | **Web first**; native gets the same tokens and fonts, a solid colour instead of the mesh |
| D4 | Greet by first name in Plan with AI? | C3 | **Yes, first name only** |
| D5 | Pinned chats now (needs a one-column migration) or later? | C1 | **Later** — ship the list without pins first |
| D6 | How long chats are kept | C1 | **90 days** |
| D7 | How long Undo lasts in the activity log | C2 | **Until the block starts, and only if not edited in Google since** |
| D8 | Monthly Plan with AI limit (a real number) and whether every message counts as one | C6 | **Needs your number**; count each message sent |
| D9 | Show report status to users? | C5 | **Yes, once the admin review queue exists** |

---

## Phase A — Prism foundation (design only, no new features)

Goal: the existing app, same features, now looks like the Prism Dashboard. This comes
first because every feature after it is built directly in the new look, so nothing is
styled twice.

### A1. Fonts — small

- Add `InstrumentSerif-Regular.woff2`, `InstrumentSerif-Italic.woff2`, and
  `InterTight-{400,500,600}.woff2` to `public/fonts/` (OFL licence, add to the licence
  file next to them) and `@font-face` rules in `public/fonts/fonts.css`. JetBrains Mono
  is already there.
- `src/calendar/tokens.ts:103` — `SANS` becomes `'Inter Tight', system-ui, …`. Add
  `SERIF = "'Instrument Serif', Georgia, serif"` (web) / `undefined` (native for now).
- `T` (type roles, `tokens.ts` ~line 116): add a `display` role (Instrument Serif, weight
  400, sizes 22 / 28 / 44, letter-spacing −0.02em). Use it **only** for: page titles,
  the header band title, panel titles, day numbers in the week header, and big numbers
  (KPIs, snapshot). Everything else stays Inter Tight.
- Emphasis words in serif titles use the italic (`Plan with AI, <em>every state</em>`).
- **See it**: `/preview` — every label in Inter Tight, the week title in serif.

### A2. Colour tokens — small, biggest visible change

Change the values in `N` (`src/calendar/tokens.ts:17`) in place. Do not build a theming
layer: 25 files import `N` statically and only need new values.

| token | now (Nexus) | Prism |
|---|---|---|
| ground | `#FAFAFA` | `#eef0fb` |
| surface | `#FFFFFF` | `#ffffff` |
| sunken | `#F5F5F5` | `#f6f7fb` |
| ink | `#171717` | `#0b1020` |
| ink2 | `#525252` | `#2e3550` |
| muted | `#737373` | `#5d6584` |
| faint | `#A3A3A3` | `#98a0bb` |
| line / lineSoft / lineStrong | greys | `#e6e9f2` / `#eff1f7` / `#c9d3ea` |
| accent / accentInk | `#EA580C` / `#C2410C` | `#ff6a00` / `#a84300` |
| hover, pressed, inkHover | ink rgba | recompute from new ink `rgba(11,16,32,…)` |

Add new tokens (one meaning each, comment them like the existing ones):

- brand: `blue #1d6bff`, `cyan #22d3ee`, `violet #8b5cf6`, `pink #ff3d8b`, `orange #ff6a00`
- `aiGrad: ['#ff6a00', '#ff3d8b']` — the Plan with AI gradient (strip, primary AI button,
  avatar)
- `now: '#ff3d8b'` — the now-line
- rail: `railBg #141a4f`, `railInk #aab2cc`, `railMuted #6f7896`,
  `railLine rgba(255,255,255,.1)`, `railHover rgba(255,255,255,.07)`
- kinds: `eventBg #ffe5f0 / eventBd #ff9cc4 / eventFg #a3124f`,
  `aiBg #fff4ec / aiBd #ff6a00 / aiFg #a84300`, `routineBg #f3f5fb`,
  `routineHatch rgba(29,107,255,.09)`, `ok #0f7b4a / okBg #e7f8ef`,
  `warn #b42318 / warnBg #fdecec`, `amber #8a5300 / amberBg #fff4dc`
- `SHADOW` (`tokens.ts:84`): replace with the Prism layered shadow
  (`0 0 0 1px rgba(0,0,0,.05), 0 1px 1px -.5px …, 0 24px 24px -12px rgba(0,0,0,.06)`).
- `R` radii: Prism uses 8 (tiles), 10–14 (cards, inputs), 18–22 (panels), full (pills).
  Map `R.lg → 10`, `R.xl → 14`, add `R.panel = 20`.
- `CATS` (`tokens.ts:224`): retune to sit with Prism — deep `#1d6bff`, sync `#8b5cf6`,
  design `#ff3d8b`, research `#0e9fb8`, admin `#b7791f`. Keep white text ≥ 4.5:1;
  run `design:accessibility-review` on the result.
- Update the header comment in `tokens.ts` (it still says "monochrome Nexus"; the
  "accent never an area" rule changes per D2).

New helper `src/calendar/Gradient.tsx`: a `View` that on web sets
`backgroundImage: linear-gradient(…)` via a web-only style, and on native falls back to
the first colour. Used by the strip, the AI button and the avatar.

- **See it**: `/preview` planner, Tasks, Insights — blue-tinted ground, navy ink.
  Screenshot before/after for the user.

### A3. App shell: drawer + header band — medium

Today desktop is `CommandBar` across the top, pages switched with `setPage`
(`CalendarScreen.tsx:246`), AI panel docked right (`:414–423`). Mobile uses `MobileNav`.

New desktop shell (from the Prism Dashboard):

```
┌──────┬───────────────────────────────────────────────────────────┐
│drawer│ header band: mesh · "Week of 16 Nov" (serif) · stats · CTA │
│ 64px ├──────────┬──────────────────────────────┬────────────────┤
│ /224 │ tasks    │ week grid (CommandBar tools  │ Plan with AI   │
│      │ 256px    │ row on top: ‹ › Today, view) │ 330px          │
└──────┴──────────┴──────────────────────────────┴────────────────┘
```

- **`components/Drawer.tsx`** (new): navy rail. Collapsed 64px (icons + pink dot badge),
  open 224px (labels + counts). Items: Planner, Tasks, Insights, About you, Settings.
  "Calendars" section (the existing Google calendar toggles from `GoogleCalendars.tsx`)
  only when open. Account at the foot (move `AccountButton` here). Open/closed remembered
  in `localStorage` (try/catch). Width animates 280ms; respect reduced motion.
- **`components/HeaderBand.tsx`** (new): mesh gradient band (web: 5 blurred blobs drifting
  slowly, CSS only; native: solid `blue`). Title in serif with mono eyebrow, the 2–3
  KPI numbers from `kpi.ts` on the right, and "Plan with AI" button that opens the panel.
  Readability: add the dark scrim from the Prism page (`.band::after`) so white text passes
  contrast. Motion must settle and never start from opacity 0 (memory: readable motion).
- **`CommandBar.tsx`**: drops page switching (moved to the drawer); keeps date nav, Today,
  week/day toggle, search. Sits as a thin toolbar above the grid.
- **`CalendarScreen.tsx`** desktop branch: render `Drawer | (HeaderBand / work row)`.
  Work row = tasks column (planner page only) | grid | AI panel when open.
- Mobile: keep `MobileNav`, recolour only. The drawer becomes the existing sheet.
- **See it**: real app, desktop width — drawer opens/closes, pages switch from it.

### A4. Tasks column on the Planner — medium

- New `components/TaskColumn.tsx`, reading `tasks-store.ts`: serif "Tasks" heading,
  quick-add input (same call as the Tasks page add), groups **Due soon / To plan /
  Needs a length**, row = checkbox, title, length (mono), small pills (`aiBg` "proposed",
  `eventBg` "on calendar", sunken "needs length").
- "Place" button on hover/focus opens the existing compose flow with `autoPlace`
  (`CalendarScreen.tsx:201` `openCompose`). The click-then-gap placing from the tasks
  redesign artifact does **not** exist yet — leave it for later, don't fake it.
- "Fits this week" summary card at the bottom (free hours vs task hours from `insights.ts`).
- **See it**: Planner with real tasks on the left.

### A5. Grid tiles — small

`src/calendar/kinds.tsx` (`boxOf`, line 112) and `EventBlock.tsx`:

- focus → solid `blue`, white text
- event (Google, other people's time) → `eventBg` fill, `eventBd` edge, `eventFg` text
- task → white, `lineStrong` edge, small checkbox glyph before the title
- routine → pale `routineBg` with blue hatch
- ai (proposal) → per D2: `aiBg` fill + 1.5px dashed `aiBd`, `aiFg` text
- break → keep `BREAK_COLOR`
- now-line → `now` pink with a dot
- Week header day numbers in serif; today = ink pill.
- Title + time only, no change.
- **See it**: week with every kind visible (`/preview` has them).

### A6. Tasks and Insights pages — small each

Recolour to the approved Tasks board (4 lanes: Needs a length, To plan, On the calendar,
Done; sunken lanes, white cards) and Insights (big serif answer + day bars). Mostly
follows from A1–A2; fix whatever still looks Nexus.

**Checkpoint A** — show the user the whole app in Prism before any feature work.

---

## Phase B — Plan with AI panel in Prism (design only)

`AiPanel.tsx` is 1,200 lines. As each part is restyled, move it into its own file so the
panel shrinks rather than grows: `AiHeader.tsx`, `AiThread.tsx` (MessageRow, ProposalCard,
ChangesCard, ReportBox), `AiComposer.tsx`. `AiParts.tsx` keeps Trace / Working / StepIcon.

### B1. Panel chrome — small

- 3px `aiGrad` strip across the top of the header (`AiPanel.tsx:318`).
- Title "Plan with AI" in serif 22px; below it, in a chat, the chat title (mono eyebrow
  "Today").
- Replace the pen icon (`:322`) with a labelled **"+ New chat"** pill. Until C1 lands it
  still calls `startOver()`; the toast stays "Started a new conversation".
- Do **not** add History / Activity icons until those features exist (no dead buttons).

### B2. Thread — medium

- Your message: ink bubble, white text, `14 14 4 14` radius, right aligned.
- Reply: plain ink2 text with the gradient AI mark (22px rounded square) on the left.
- Steps (`Trace` in `AiParts.tsx`): left rule, green tick per finished step, spinner on
  the running one, dashed box for waiting. Collapsed to "4 steps · 2.1 s" after the turn.
- `ProposalCard` (`:760`): tray with rows = checkbox · date tile (mono weekday, serif
  day number) · title + time + day strip (busy in `eventBd`, proposal in `aiBd`); action
  row on `sunken`: **gradient** "Add 2 to calendar", line "Other times", ghost "Discard".
- Added: green `okBg` row "2 blocks added to Google Calendar" + Undo.
- Won't fit: `amberBg` card with real numbers and two ways out (already produced by the
  planner — restyle only).
- Error: `warnBg` card — what failed, that nothing changed, one retry button.
- Ask with options: question card with numbered options (`kbd` style), recommended one
  outlined in ink.
- Message meta row (Copy · Show steps · Report) in faint text, visible on hover/focus.

### B3. Composer + empty state — small

- Composer: `lineStrong` border, 14 radius, round ink send button.
- Shortcut chips from the registry (`:398`), restyled as pills with the tool colour square.
- Empty state (`:345`): serif "What should *we plan?*", one line of what it will and won't
  move, the 4 `STARTERS` as rows. (C3 replaces this with the real smart start.)

**Checkpoint B** — show the panel in all its existing states: use `/preview` to step
through working, asking, proposal, added, won't fit, error.

---

## Phase C — Features (each in Prism from day one)

### C1. Chat history — medium, no migration

Today every chat is saved (`ai_sessions`, `ai_messages`, `db/004_ai.sql`) and titled from
the first message (`turn.ts:101`), but the panel only reaches the open one
(`agent-store.ts` keeps one id under `ft.agent.session:<userId>`).

Server:

- `src/server/ai/repo.ts`: add
  - `listSessions(userId, { limit = 50, before? })` →
    `id, title, last_message_at, last_line` (last assistant message, already scrubbed,
    cut to 90 chars, via a lateral join on `ai_messages`), `has_pending_draft`
    (`active_draft_batch_id` joined to `plan_drafts.status = 'pending'`). Skip sessions
    with no messages.
  - `renameSession(userId, id, title)` and `deleteSession(userId, id)` — always
    `where id = $1 and user_id = $2`. Deleting cascades messages; `plan_drafts.session_id`
    is `on delete set null`, so applied blocks are untouched.
- New route `src/app/api/ai/sessions+api.ts`: `GET` (list), `PATCH {id, title}`
  (1–120 chars), `DELETE ?id=`. Same auth + `enforceRateLimit` pattern as
  `chat+api.ts`. 404 (not 403) for someone else's id.
- **Fix needed for reopening old chats**: `GET /api/ai/chat` (`chat+api.ts:28`) returns
  proposals without their outcome, so an old chat would show live "Add" buttons for
  proposals already accepted or past. Join `ai_suggestions.status` onto each proposal
  and return `decided: 'accepted'|'edited'|'rejected'` and `expired: true` when
  `proposed_start < now()`. The client shows those as done / struck through, no buttons.
- Retention per D6: a daily delete of sessions with `last_message_at < now() - 90 days`
  (add to the existing cleanup job if there is one; otherwise a note in `docs/db`).
- Types in `src/lib/api-types.ts`: `SessionSummary`, `SessionsResponse`.

Client:

- `agent-store.ts`: `listSessions()`, `openSession(id)` (= `rememberSession(id)` then
  `loadHistory()`), `renameSession`, `deleteSession`. `resetSession()` stays as "new chat";
  the old one now stays reachable.
- `AiPanel`: `view: 'chat' | 'history'` state. History icon appears in the header now.
- New `components/AiHistory.tsx`:
  - serif "Chats" title with count badge, search field (client-side filter over titles
    and last lines — no server search yet)
  - groups Today / Yesterday / This week / Earlier (pure function `groupSessions()` +
    `ai-history.check.mjs`)
  - row: title (600, one line), last line (muted, one line), time on the right, small
    "Waiting" pill if `has_pending_draft`
  - row menu (… button, keyboard reachable): Rename (inline input), Delete (inline
    confirm "Delete this chat? Blocks it added stay on your calendar." — no browser
    `confirm()` dialog)
  - empty: "No chats yet. Your conversations will show up here."
- `/preview`: add 6 canned sessions so the list can be screenshotted.

Checks: `security-review` on the new route (ownership on every query), `design:ux-copy`
for the empty/delete text. **Show the user before C2.**

### C2. Activity log — medium, one migration (`db/030_ai_actions.sql`)

Nothing today ties an applied block to the chat that made it, and undone actions leave no
trace.

- Migration (verify Neon columns first — prod schema is trimmed; apply this file alone,
  only after the user OKs it):

  ```sql
  create table if not exists ai_actions (
    id          text primary key,
    user_id     text not null references users (id) on delete cascade,
    session_id  text references ai_sessions (id) on delete set null,
    message_id  text,
    kind        text not null,            -- add | move | delete | rule | time_off | task
    event_id    text,
    rule_id     text,
    start_at    timestamptz,
    end_at      timestamptz,
    prev_start  timestamptz,
    prev_end    timestamptz,
    applied_at  timestamptz not null default now(),
    undone_at   timestamptz
  );
  create index if not exists ai_actions_user_idx on ai_actions (user_id, applied_at desc);
  ```

  Times and ids only, never titles. Labels are built at read time: our own blocks show
  their title (user's own data), Google events show "an event" plus times.
- Where rows are written:
  - accepted / edited proposal: the client creates the block (`acceptProposal` in
    `agent-store.ts`) and then calls `/api/ai/feedback`. Send the new `eventId` in that
    body and insert the action in the feedback route next to `recordOutcome`
    (`feedback+api.ts:82`); session comes from the suggestion.
  - change cards (`applyChanges`): one `POST /api/ai/actions` per applied item with
    `sessionId`, `messageId`, before/after times.
  - server-side tools (rules, time off, deletes) — insert in their tool handlers in
    `src/server/ai/tools/`, inside the same transaction as the write.
- API: `GET /api/ai/actions?before=` (paged) and `POST /api/ai/actions/:id/undo`
  (undo rule per D7; sets `undone_at`; returns 409 with a plain reason if too late or
  edited in Google).
- UI: Activity icon in the panel header → `components/AiActivity.tsx`: day headers,
  time on the left, vertical line, ticked dot = applied, hollow + struck = undone; card
  tinted by kind; "Undo" and "Open chat" (→ `openSession`). Undo also refreshes the
  calendar (`refresh()` in `cal-store`).
- Also show "Kept your rules" in the steps when the planner skipped something because of
  a rule (already in the trace detail — surface it).

### C3. Smart start — small, no migration, no model call

Replaces the fixed `STARTERS` with the user's actual week. Computed on the client from
data already loaded — no new endpoint.

- Greeting card: date + time-of-day greeting ("Good afternoon, *Ajay.*" per D4, first
  name from `account-store.ts`) on a small Prism scene (web: CSS gradient sunset by day,
  night after 20:00; native: solid).
- Snapshot: 3 numbers — free hours this week after meetings (`insights.ts`), tasks with no
  time (`tasks-store`), next deadline day.
- Suggestions (max 3, ranked): a pending draft from C1 (`has_pending_draft`, re-checked
  against current busy times — drop it if no longer free or older than 48h), deadlines
  within 3 days, tasks without time, an open afternoon worth protecting. Tapping one sends
  it as a normal sentence through `send()`.
- "Continue <last chat title>" row → `openSession`.
- First-ever visit (no sessions): show "Things I can do" — the six tools from the registry
  with one example sentence each.
- Pure ranking function `startSuggestions()` + `ai-start.check.mjs`.

### C4. Stop while working — small

`sendMessage` gets an `AbortSignal`; the send button becomes Stop while `sending`. The
server already saves the user message first, so a stopped turn keeps the thread. Show
"Stopped. Nothing was changed." only if no tool ran.

### C5. Report status — medium, blocked on admin queue (D9)

1. Admin queue first (shape agreed in memory `find-time-admin-review-panel-deferred`):
   `ADMIN_USER_IDS` env gate (does not exist in code yet), one list of `ai_corrections`
   with `source='report'`, set `label_status` and an optional `user_note`.
2. Then `GET /api/ai/reports` (own reports only) and "Your reports" in Settings:
   Received / Reviewed / Fixed + the note.
3. In the thread, after reporting: one line of thanks plus fix-it chips (Undo, Other times).

### C6. Usage meter — small, blocked on D8

`GET /api/ai/usage` reading `ai_user_spend.calls` (`db/028`). Shown in plans, never money.
Under the composer only past 80%; full view (month heatmap + counts by tool) in Settings.
At 100%: amber card saying what still works (calendar, tasks, placing by hand).

---

## How UI and features ship together: slices

Phases A–C above are the catalogue of work. They are **not** built in that order.
Only the foundation goes first, because it repaints every screen at once. After that,
every slice is a **vertical slice**: one area of the app gets its Prism design *and*
its new feature in the same step, so each demo shows both, and nothing is styled twice.

Each slice follows the same loop:

1. **Data/API** (if any): repo function, route, types, `.check.mjs`. Invisible, so keep it short.
2. **UI in Prism**: the component, built directly in the new tokens; canned data in `/preview`.
3. **Wire up**: real data, signed-in account, every state (loading, empty, error, full).
4. **Check**: tsc, lint, web export, the review skills listed on the slice.
5. **Show the user**: screenshots plus a short note on what's real and what's still canned.
   Commit, push, then wait for their reaction before the next slice.

| Slice | UI (design) | Feature | Needs | Size |
|---|---|---|---|---|
| **0. Foundation** | A1 fonts + A2 colour tokens + `Gradient` helper: the whole app turns Prism | none | D1 | S |
| **1. Panel + history** | B1 panel chrome, "New chat" pill, history view in Prism | C1 sessions API, open old chats, rename/delete, decided/expired proposals | D5, D6 | M |
| **2. Thread + activity** | B2 thread restyle (bubbles, steps, proposal tray, added/won't-fit/error cards) | C2 `ai_actions` + Activity timeline + Undo; "Kept your rules" step | D2, D7, migration OK | M |
| **3. Shell + tasks column** | A3 drawer + header band, A5 grid tiles | A4 tasks column with Place → compose | D3 | M |
| **4. Smart start + stop** | B3 composer and empty state | C3 snapshot/suggestions/continue; C4 Stop | D4 | S |
| **5. Pages** | A6 Tasks board + Insights repaint | none (polish) | none | S |
| **6. Reports** | Your reports in Settings, fix-it chips | C5 admin queue + report status | D9 | M |
| **7. Usage** | meter under composer + Settings view | C6 usage API | D8 | S |

Why this order: Slice 1 fixes the biggest real gap (every chat is saved but unreachable)
and is where the panel's new look first appears. Slice 2 restyles the thread at the same
time it gains its log. The shell (3) is the largest layout change, so it comes once the
panel inside it is settled. Slices 6–7 wait on decisions.

Rule for every slice: if a feature's API isn't ready, the UI still ships against
`/preview` data for the demo, but the real app never shows a button that does nothing.
Hide it until it's wired.

Skills to use along the way: `run` and `claude-in-chrome` (see it running),
`design:ux-copy` (empty states, confirmations), `design:accessibility-review` (after A2,
A3 and each panel state — contrast on the mesh band especially), `security-review`
(C1, C2), `code-review` and `simplify` before each checkpoint.
