# Find time — planning agent plan

Where the scheduling agent stands, what is missing, and the order to build it
in. Written 2026-09-14 after the vacation bug ("I'm on vacation 17th–22nd" was
understood, answered "noted", and saved nowhere). Nothing below Phase 0 is
built yet.

Related: [ai-learning.md](ai-learning.md) (how the agent learns),
[training-capture.md](training-capture.md) (what every turn logs),
[db/calendar-schema.md](db/calendar-schema.md).

---

## 1. Where Find time should stand

Checked against the market on 2026-09-14 (sources at the end; several are
competitor blog posts, and none tests plain-language understanding).

| Product | What it does well | What it does not do |
|---|---|---|
| Motion | Tasks with deadline + estimate, auto-placed, split into chunks, re-planned as the calendar changes, over-capacity warnings | Mostly form-driven; you fill fields |
| Reclaim | Tasks with total duration, min/max session, due date, earliest start, hours; flexible habits; Google + Outlook | Same: structured input |
| Morgen | AI planner that suggests an editable day | Suggests, you approve |
| Akiflow / Sunsama | Manual daily planning (Akiflow has a small assistant, Sunsama no AI) | Little automation |
| Gemini in Google Calendar | Chat creates events, suggests meeting times across your calendars | No task planning over days, no triggers |
| Copilot in Outlook | Books meetings, rooms, invites; rules for RSVPs and focus time | Meetings and rules, not multi-day task plans |
| Clockwise | Shut down 2026-03-27 | — |

**The pattern the leaders share is the one Find time already uses:** the user
(or AI) describes the work and a deterministic scheduler places it. The model
never picking the time is right; keep it.

**The gap is the planning model, not the AI:** tasks with totals, session
limits, deadlines and splitting across days; write-back; continuous re-planning.

**The open position:** nobody combines *just say it in plain language* +
*a scheduler that plans work across days* + *learns from your corrections* +
*privacy-first*. Motion and Reclaim want fields; Gemini and Copilot understand
language but don't plan tasks over days. That is the product to build.

---

## 2. What is true today (verified in code and data)

**Events are single-day.** `CalEvent` is a date plus start/end clock times
(`src/calendar/types.ts`, `api-adapter.ts` `isoToParts`), and length everywhere
is `toMin(end) - toMin(start)`. A Google all-day event renders as 00:00–00:00
(0 min); a 17th–22nd trip shows only on the 17th; an overnight event goes
negative and is clamped. `calendar_events.all_day` exists (db/003) but
`events-repo.ts` never selects it.

**Time off is split per day as a workaround** — `src/server/ai/time-off.ts`
`splitByDay` (commit `c315dd3`).

**The agent is one-shot.** Each message is one forced function call
(`gemini.ts`, `functionCallingConfig.mode: 'ANY'`). It cannot look, then act,
then confirm, so every tool description has to carry all the guidance up
front — which is why the prompt is long.

**Planning is narrow.** `propose_blocks` takes one title and category, 1–5
blocks, 15–480 min each, each inside one day, within 21 days
(`chat+api.ts` `HORIZON_DAYS`). No total-hours split, several tasks at once,
deadlines, or bulk moves.

**Memory is thin.** The last 16 messages of the open conversation; hard rules
(`constraints`, weekday/hour windows only); learned preferences
(`learned_preferences`, only after ≥3 pieces of evidence). Nothing from earlier
conversations. As of 2026-09-14 the database has 0 rules, 0 learned
preferences, 0 recorded decisions.

**Every new action needs a migration.** `ai_turns.action` has a CHECK
(db/016, widened by db/018 for `time_off`).

**Google is read-only, and not importing.** Sync is pull-only
(`google/sync.ts`); all calendars have `write_enabled = false`; events Find time
creates get no `calendar_id` and never reach Google. The one connected account
reports `sync_status = 'live'` with 5 calendars and no errors, yet
`calendar_events` holds **0 imported rows** — not yet investigated.

---

## 3. Build order

Each phase ships on its own. Phases 1–3 are architecture changes and get their
own branch; Phase 0 goes straight on `mvp-beta`.

### Phase 0 — Fix what is already broken (small)

- Find out why Google sync imports 0 events while reporting healthy. Until this
  works, the agent plans against an empty calendar.
- Apply `db/018_time_off_turns.sql`; push the calendar merge + time-off work.

**Done when:** a real Google event appears in the app and in the agent's busy
list.

### Phase 1 — Multi-day events

- Carry full start/end datetimes and `allDay` end to end: `events-repo` selects
  `all_day`; `ApiEvent`, `CalEvent`, `api-adapter` stop assuming one date.
- Week view: an all-day / multi-day strip above the grid (as Google does).
  Day and week grids split an event across days **only when drawing**, never
  in storage.
- KPI hours clip each event to the day being measured.
- Compose sheet: date range and an all-day toggle.
- Remove `splitByDay`: time off becomes one event (all-day when whole days).

**Done when:** a Google all-day event, the 17th–22nd trip and a 22:00–06:00
event all render correctly on desktop and mobile; `api-adapter.check.mjs`
covers them.

### Phase 2 — Agent loop and general tools

Replace one-shot special-purpose tools with a small loop over a few general
ones. No framework — about 50 lines in `chat+api.ts`.

- Tools: `list_events(range)`, `create_event`, `update_event`, `delete_event`
  (times the user stated, including all-day and multi-day), `find_free_time`
  (the existing scheduler), `ask_clarification`, `answer`.
- Loop: up to ~5 tool calls per message, then a reply. The model can check the
  calendar before acting and confirm after.
- Guards stay in code, not prompt: imported events locked, delete asks first,
  horizon and span limits validated server-side.
- `block_time_off` folds into `create_event`.
- Slim the system prompt: behaviour moves from long tool descriptions into
  the loop and the guards.
- Logging: one row per step, action as free text or tool name; drop the CHECK
  so new tools need no migration.
- Commit the live sentence test (`nl.mjs` from 2026-09-14) as an opt-in check
  with a fixed set of real sentences and expected actions.

**Done when:** in one message each — "I'm in Copenhagen 17th–22nd", "cancel my
trip", "move everything from Wednesday to Thursday" — the calendar ends up right,
and the reply never claims something that did not happen.

### Phase 3 — The planning model (the differentiator)

- A task: title, total minutes *or* sessions × length, min/max session,
  earliest start, deadline, allowed days/hours, priority, category.
- `plan_tasks`: the scheduler spreads tasks across days, respects deadlines and
  capacity, and reports what did not fit instead of silently dropping it.
- From plain language: "10 hours on the thesis before Friday, 1–2 hour
  sessions", "plan my week: thesis, gym 3×, admin". The model fills the task;
  the scheduler places it.
- Re-plan when the calendar changes (sync, edit, new meeting) without breaking
  a deadline; horizon follows the deadline, not a fixed 21 days.
- Corrections to planned sessions feed the existing learner (ai-learning.md).

**Done when:** those sentences produce valid plans, and moving a meeting into a
planned session re-plans the rest before the deadline.

### Phase 4 — Write-back and continuous re-planning

- Push Find time's events to the user's chosen Google calendar
  (`pending_push` + `If-Match` etag, sketched in `sync.ts`).
- Background sync instead of sync-on-screen-open.

**Blocked on a decision** — see §5, question 1.

### Phase 5 — Memory across conversations

- A small table of facts about the user ("works 10–18", "gym Mon/Wed/Fri"),
  written by the agent, visible and editable on the preferences screen.
- A short summary of each finished conversation fed into the next.

---

## 4. Principles and non-goals

- **Plain language first.** The model turns what people say into structure;
  tools only store and validate it. No keyword parsing.
- **Model proposes, code disposes.** Placement, limits and locks are decided in
  code.
- **Never claim an action that did not happen.** Already a prompt rule (p2);
  in Phase 2 it becomes structural: the reply is written after the tools ran.
- **Not doing:** LangChain or UTCP. Both sit on the same function calling we
  already use and would not have prevented any bug found so far. UTCP/MCP may
  matter later for connectors (email, Slack, drive).
- **Model choice is secondary.** A stronger model needs less hand-holding, but
  Phases 1–2 remove the complexity with any model.

---

## 5. Open questions

1. **Sync or live fetch?** The pivot roadmap says to stop caching Google data
   and fetch live per request (privacy). Write-back and continuous re-planning
   (Phases 3–4) are much easier with a local copy. Decide before Phase 4.
2. **Privacy of what reaches the model.** Event titles go to Gemini today. The
   pivot's tokenization layer should land before connectors beyond calendar.
3. **Task sources.** Import tasks from Todoist / Google Tasks (both allowed in
   `connected_accounts.provider`), or plain-language only at first?
4. **Structured input too?** Plain language is the pitch, but a task form for
   editing what the model understood is probably still needed.

---

## Sources (market check, 2026-09-14)

- Motion — [auto-scheduling](https://www.usemotion.com/help/time-management/auto-scheduling), [AI task manager](https://www.usemotion.com/features/ai-task-manager), [review, Ellie](https://ellieplanner.com/comparisons/motion-app-review)
- Reclaim — [site](https://reclaim.ai/), [features, help center](https://help.reclaim.ai/en/articles/6210740-features-in-reclaim)
- Clockwise — [TechRadar](https://www.techradar.com/pro/salesforce-recuits-team-behind-calendar-app-clockwise-into-agentforce), [Doodle](https://doodle.com/en/clockwise-is-shutting-down-what-to-do-next-in-2026/)
- Gemini — [Sammy Fans](https://www.sammyfans.com/2026/01/29/gemini-ai-simplifies-multi-calendar-scheduling/), [Carly](https://www.usecarly.com/blog/can-gemini-schedule-meetings/)
- Copilot — [Microsoft](https://techcommunity.microsoft.com/blog/outlook/copilot-in-outlook-new-agentic-experiences-for-email-and-calendar/4514601), [Redmondmag](https://redmondmag.com/articles/2026/06/24/let-copilot-manage-your-outlook-calendar-1.aspx)
- Morgen / Akiflow / Sunsama — [Morgen vs Akiflow](https://www.morgen.so/morgen-vs-akiflow), [Sunsama vs Akiflow](https://www.morgen.so/blog-posts/sunsama-vs-akiflow)
