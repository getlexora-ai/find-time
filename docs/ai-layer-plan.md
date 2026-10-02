# Find time — AI layer plan

How a model goes on top of the deterministic planner without making it less
accurate: single-step turns, multi-step turns, the context layer that holds
everything the user has told us, learning from what happens on the calendar,
and how we prove **≥ 95 % planning accuracy** before shipping.

Written 2026-10-02 against branch `landing-fresh` at `c5cb59f`. Nothing in
this document is built yet unless it says "today".

Supersedes, for the AI layer only: §4, §5, §9, §11 and §13 of
[planning-agent-plan.md](planning-agent-plan.md) (written when the agent ran
on Gemini and before the rule parser, tool registry and planning engine
existed). §0–§3, §6–§8, §10, §12 there still stand.

Related: [ai-learning.md](ai-learning.md) (the learner's contract — still
binding), [fluidcalendar-lessons.md](fluidcalendar-lessons.md).

---

## 0. The one-paragraph version

The model **reads**; code **decides, places, checks and writes**. Every turn,
code builds one `PlanningContext`. The model gets a small, title-free
projection of it plus the sentence, and returns either one tool call or a
short list of steps, filled with what the user *said* (phrases, not computed
dates). Code resolves the phrases to times with the existing date reader,
fills gaps from the context layer in a fixed precedence order, asks when a
required field is still missing, runs the deterministic engine, validates
every result against the hard rules, and shows a preview. Nothing is written
until accepted (direct commands excepted, with undo). Learning stays numeric
and visible; the model never learns, it only reports what the user stated.
Accuracy is measured on a ≥ 400-case golden set run against the real
pipeline, gated per category, before and after every prompt or model change.

---

## 1. What is true today (verified 2026-10-02)

| Piece | State | Where |
|---|---|---|
| Turn pipeline | load → `understand()` → one handler → reply + draft | `src/server/ai/turn.ts` |
| Reader | Rule parser `r4`, English only, never guesses day/length/am-pm, carries a `Draft` between turns | `understand.ts` (1514 lines), `understand.check.mjs` passes |
| Date/length reader | `readFacets(text, nowMs)` — days, ranges, parts of day, clock times, lengths, counts | `understand.ts:328` |
| Tools | 17, one handler each, `Record<ToolName, ToolHandler>` | `tools/index.ts`, `tools/names.ts` |
| Model client | OpenAI Responses API, forced tool call, `store:false`, one retry. **Not called by anything.** | `llm.ts` (`chatWithTools`) |
| Slot engine | enumerate legal 15-min slots → 7-feature score → greedy select + 2 runners-up | `find-time.ts`, `scoring.ts` |
| Week engine | habits → EDF tasks → bumps → extras, 3 packing passes, `verifyPlan` | `plan-week.ts`; puzzles: 152 — 120 PASS, 0 FAIL, 10 DIFF, 22 N/A |
| Validation | `verifyPlan` only on `plan_week`. `propose`/`place_at` check inline; `block_time_off`, task/habit tools write straight to the DB | `tools/*.ts` |
| Preview | proposals render as dashed "tap to accept" blocks; outcome → `/api/ai/feedback` → `learnFrom` | `cal-store.ts:444`, `feedback+api.ts` |
| Profile | work hours, weights, energy curve, duration bias, buffer, focus budget, travel, hard-work, rules, learned | `preferences.ts` `AgentProfile`, `repo.ts loadProfile` |
| Rules | `constraints` (hard filters): work-hours, protected, no-meetings, leave-by, buffer, hard-bound | `db/001`, `scoring.ts ruleBlocks` |
| Learned | `learned_preferences` (soft, evidence ≥ 5 or confirmed), visible via `GET /api/ai/preferences` | `db/015`, `learn.ts` |
| Event content | imported events store **times only**; titles fetched live per request | `google/live-details.ts`, db/023 |
| Turn log | `ai_turns` and the capture tables were dropped (db/024) | — |

Two gaps that matter for this plan:

1. **Two context shapes.** `TurnCtx` (`tools/context.ts`) for the turn and
   `PlanInput` (`plan-week.ts`), rebuilt separately in `tools/backlog.ts`.
2. **No accuracy number.** `understand.check.mjs` asserts cases one by one; it
   reports "ok", not a rate, and it isn't split by category.

---

## 2. Principles (the ones this plan adds or sharpens)

1. **The model extracts, code computes.** The model never outputs an ISO
   date it worked out itself as the value we use; it outputs the phrase
   ("next Thursday afternoon") and the structure around it. Date arithmetic is
   the single largest source of LLM calendar errors, and we already have a
   tested reader for it.
2. **Every model field maps to an existing engine knob.** A hint with no knob
   is dropped, not "taken into account".
3. **Every field has a source** — `said` · `context` · `default` · `missing`.
   `missing` on a required field is a question, never a guess
   (memory: *ask before placing*).
4. **Nothing reaches the calendar unchecked.** One validator for every path.
5. **The model never sees event titles.** References to events are resolved
   in code against live titles. Better privacy and less prompt noise.
6. **Measure before changing.** The golden set exists before the model is
   wired, and the rule parser gets a baseline score first.

---

## 3. The context layer

### 3.1 One `PlanningContext` per turn

Replaces `TurnCtx`'s data fields and is the only input `PlanInput` is derived
from. Built once by `loadPlanningContext(userId, now)` in a new
`src/server/ai/context.ts`; pure projections live beside it.

```ts
type PlanningContext = {
  now: { iso: string; ms: number; zone: string; weekday: Weekday };
  horizon: { iso: string; days: number };          // 21 for turns, task horizon for plan_week

  // who the user is — the context layer (§3.2)
  settings: {
    workHours: AgentProfile['workHours'];
    bufferMin: number; travelMin: number;
    maxDailyFocusMin: number; minFocusBlockMin: number;
    hardWork: 'spread' | 'cluster';
  };
  rules: HardRule[];                 // hard, user-stated, unexpired
  preferences: StatedPref[];         // soft, user-stated, unexpired (new, §3.3)
  learned: LearnedPref[];            // soft, inferred, evidence-gated (existing)
  weights: Weights; energyCurve: ...; durationBias: ...;

  // what the calendar holds
  events: ApiEvent[];                // live titles, never persisted, never sent to the model
  busy: Span[];                      // blocksTime
  shown: Span[];                     // visible, for place_at overlap questions
  away: Span[];                      // item_type = 'away' + imported all-day busy
  travel: Span[];                    // travelPadding(events, travelMin)
  existing: ExistingBlock[];         // blocks linked to a task or habit

  // the backlog
  tasks: ApiTask[]; habits: ApiHabit[];

  // the conversation
  draft: Draft | null;               // what the last turn left open
  pending: Step[];                   // multi-step: steps not run yet (§5.5)
  lastProposals: ChatProposal[];
  history: { role; text }[];         // last 8 turns, user + assistant text only
};
```

Projections (pure, unit-tested):

| Function | Produces | Used by |
|---|---|---|
| `toPlanInput(ctx)` | `PlanInput` for `planWeek` / `verifyPlan` | `plan_week`, validator |
| `toFindSpec(ctx, args)` | `FindSpec` for `rankFreeSlots` | `propose_blocks` |
| `toModelContext(ctx)` | the title-free card the model sees (§3.4) | model call |
| `toUnderstandContext(ctx)` | what `understand()` takes today | rule parser (fallback) |

Done when `tools/backlog.ts` no longer assembles busy/away/travel itself and
`TurnCtx` is `PlanningContext` + `begin`/`step`.

### 3.2 What the user has told us — five kinds, one page

Everything below already has a home except **stated preferences** and
**expiry**.

| Kind | Example | Store | Effect in the engine | Written by |
|---|---|---|---|---|
| Setting | "I work 10–18", "buffer 10 min", "max 4h deep work a day" | `scheduler_profiles` | bounds and knobs | `plan_settings`, settings screen |
| Rule (hard) | "never before 10", "keep Friday afternoons free" | `constraints` | **filter** — candidates removed | `record_rule` |
| Stated preference (soft) | "I write better in the mornings", "gym in the evenings" | `learned_preferences`, `source='stated'`, verdict `confirmed` | **weight** — reorders only | `record_rule` with `strength:'prefer'` (§3.3) |
| Learned preference | "design 14–16" after 5 edits | `learned_preferences`, `source='inferred'` | weight, after evidence gate | `learnFrom` |
| Calendar suggestion | "you usually start at 9:30 — use that?" | `learned_preferences`, `source='calendar'`, verdict `null` until confirmed | **none** until confirmed, then becomes a setting/pref | rhythm job (§6.4) |

Facts like "I start at 10" are work hours, "gym Mon/Wed/Fri" is a habit,
"I'm away next week" is an away block. There is **no free-text memory blob**:
it would leak, accrete contradictions and can't be enforced
(ai-learning.md §8 still holds).

**Expiry.** "Just this week" is common ("no meetings this week, I'm writing").
Both rules and stated preferences get `expires_at` (null = always).
`loadPlanningContext` drops expired rows; they stay visible on the page as
"expired" for a week, then are deleted.

**Schema — `db/025_context_layer.sql`:**

```sql
alter table constraints add column if not exists expires_at timestamptz;
alter table learned_preferences add column if not exists source text not null default 'inferred';
alter table learned_preferences add constraint learned_preferences_source_ck
  check (source in ('inferred', 'stated', 'calendar'));
alter table learned_preferences add column if not exists expires_at timestamptz;
alter table learned_preferences add column if not exists origin_message_id text;
```

### 3.3 Saying a preference in chat

`record_rule` gains two arguments; no new tool.

| Arg | Values | Default |
|---|---|---|
| `strength` | `rule` (hard filter) · `prefer` (soft weight) | from wording: "never/don't/no X before" → rule; "I prefer/better/like/usually" → prefer |
| `until` | phrase → resolved by `readFacets`; null = always | asked once when the sentence is about *this* week/day: `Always` `Just this week` |

A `prefer` lands as `learned_preferences` `{kind: 'preferred-hours' |
'avoid-hours' | 'preferred-weekday' | 'avoid-weekday', scope: category,
source: 'stated', userVerdict: 'confirmed', evidenceCount: MIN_EVIDENCE}`, so
the scorer uses it at once through the existing `activeLearned` path — no
scorer change.

### 3.4 What the model sees (`toModelContext`)

```
NOW        Thu 2026-10-01 09:00 Europe/Berlin
WORK HOURS Mon–Fri 09–17 · Sat, Sun off
RULES      [r1] nothing before 10:00 · [r2] Friday after 14:00 protected
PREFER     [p1] deep work in the morning · [p2] gym in the evening
SETTINGS   buffer 10m · travel 0 · daily focus ≤ 4h · hard work spread
TASKS      [t1] Thesis draft (due Thu 8 Oct, 6h left, high) · [t2] Tax forms (no due, low)
HABITS     [h1] Gym 3×/week 60m evening
LAST PLAN  2 blocks: Fri 09:00–11:00, Mon 09:00–11:00   (times only)
OPEN       asked: "How long for Gym?"   (from draft)
```

Not sent: event titles, attendees, locations, descriptions, the full busy
list. The model does not need the calendar to *understand* a sentence; the
engine needs it to *place* one. Calendar text is therefore never in the prompt,
which closes the injection path rather than fencing it.

The single exception is reference resolution (§4.4), done in code.

### 3.5 Precedence (deterministic, in code)

When two sources give a value for the same field, the first wins:

1. **This sentence** (`said`)
2. **Hard rule** — if the sentence contradicts one, **ask**:
   "That's before 10, which you said never — just this once?"
   `Yes, this once` `No, keep the rule`. A yes sets `overrideRuleIds` on
   that one call only.
3. **Open draft** (the last turn's understood fields)
4. **Stated preference**
5. **Setting**
6. **Learned preference** (evidence-gated)
7. **Default** (category window, `durationOptions`, …)

Each filled field records its source; the reply's "I assumed" line lists every
`context`/`default` field the user didn't say, in one line.

### 3.6 The page — "What Find time knows"

Extends `GET /api/ai/preferences` (today: rules + learned). Sections, in this
order, every row with its source ("you said, 2 Oct" · "from 6 edits" · "from
your calendar"), an edit and a delete:

1. **Settings** — work hours per day, buffer, travel, focus budget, hard work.
2. **Rules** — hard, with expiry if any.
3. **Preferences** — stated, with expiry if any.
4. **Learned** — inferred, with evidence count; `Confirm` promotes to
   stated; delete marks `rejected` (existing anti-relearn).
5. **Suggestions** — calendar-rhythm proposals (§6.4) with `Use this`
   `Dismiss`.

Lives in the Insights page or a settings sheet — UI placement to be decided
with the calendar design (calendar-quiet).

---

## 4. Single-step turns

### 4.1 Flow

```
sentence + toModelContext(ctx)
        │
        ▼
model ── forced tool call ──▶ { tool, args (phrases + structure), sources }
        │                       on error/timeout (> 4 s) → understand() fallback
        ▼
normalise(tool, args, ctx)       ← code: resolve phrases, fill by precedence,
        │                          clamp, enum-check, reference-resolve
        ├─ missing required? ──▶ ask (clarify.ts options) — stop
        ├─ breaks a hard rule? ─▶ ask (§3.5) — stop
        ▼
handler (tools/*.ts)             ← unchanged engine calls
        ▼
validate(result, ctx)            ← one validator for every path (§7.2)
        ├─ fails ──▶ retry engine once with the violation as a constraint,
        │            else reply with what's wrong; never shown
        ▼
preview (dashed blocks) or direct write + undo
        ▼
reply — written from the result, never claims what didn't happen
```

### 4.2 Tool schemas for the model

One `ToolDef` per tool, JSON Schema with `strict: true`, `additionalProperties:
false`, enums for every closed set. Generated from one table in
`tools/schemas.ts`, typed against the handler's arg reader so a renamed field
fails to compile.

The shared **time shape** every timed tool uses:

```ts
type When = {
  text: string;                 // the user's words, verbatim: "next Thursday afternoon"
  day?: string;                 // "thursday" | "tomorrow" | "2026-10-17" | "17th"
  part?: 'morning' | 'afternoon' | 'evening' | 'night';
  at?: string;                  // "18:00" | "6pm" | "6"   (bare "6" → am/pm question)
  after?: string; before?: string;
  range?: { from: string; to: string };   // "the 17th" .. "the 22nd"
  excludeDays?: string[];       // "not Friday"
};
```

Code resolves `When` with `readFacets(text, nowMs)` first, then the
structured fields. If they disagree (the model's `day` says Thursday,
`readFacets` reads Friday from the text), **ask** with both as options —
that disagreement is exactly the case where one of them is wrong.

Per-tool fields (abridged; full table in `tools/schemas.ts`):

| Tool | Required | Optional (all map to existing knobs) |
|---|---|---|
| `propose_blocks` | title, category, `when`, length | count, oneBlockPerDay, weekends, earliest/latest via `when` |
| `place_at` | title, `when.at` + day, length | category, overlapOk (only after the clash question) |
| `block_time_off` | `when.range` or day | label |
| `delete_blocks` | target (§4.4) | — (always confirms) |
| `add_task` | title, length (total) | due, notBefore, priority, effort, splittable, preferredWindow, category |
| `update_task` / `task_done` / `postpone_task` | task ref | the changed field / until |
| `add_habit` | title, timesPerWeek, length | minPerWeek, window |
| `update_habit` | habit ref | timesPerWeek, length, stop |
| `plan_week` | — | scope (this/next week) |
| `record_rule` | kind, shape | strength, until (§3.3) |
| `plan_settings` / `set_travel` | the setting | — |
| `list_tasks` | — | — |
| `ask_clarification` | question, options ≤ 4 | — |
| `answer` | reply | — |

### 4.3 How the model adds context to the deterministic engine

This is the part the rule parser can't do and the reason to add a model. The
model reads *meaning*; each meaning becomes a value of a knob the engine
already has. The engine then decides.

| What the user says | Model output | Engine knob | Today |
|---|---|---|---|
| "big presentation Friday" | `add_task {title:"Presentation prep", due:"friday", effort:"hard", priority:"high"}` + offer, as a question, a prep length | task due/effort/priority | parser: no |
| "I'm wiped today" | `plan_settings {maxDailyFocusMin: 120, until:"today"}` | focus budget, expiring | no |
| "thesis matters more than admin" | `update_task {ref:t1, priority:"high"}` | EDF tiebreak + bump order | no |
| "squeeze it in before I leave Thursday" | `propose_blocks {when:{before:"thursday 18:00"}}` | `latestISO` (hard bound) | partly |
| "ideally by Wednesday, latest Friday" | `add_task {due:"friday", preferBy:"wednesday"}` | `dueByISO` hard, `preferBy` bonus | no |
| "gym, but not the day after leg day" | `add_habit` — `spread` already avoids adjacent days | habit spacing | yes (engine) |
| "short sessions, I lose focus" | `add_task {splittable:true}` + `record_rule {strength:"prefer", kind:"block-length", max:60}` | session size, stated pref | no |
| "something light after lunch" | `propose_blocks {category:"admin", when:{part:"afternoon", after:"13:00"}}` | category window | partly |

Rules for this mapping:

- **Only listed knobs.** A meaning with no knob ("make it nice") → the model
  says what it can do instead, via `answer`. A new knob is a code change with
  its own tests, not a prompt change.
- **Inferred knobs are visible.** Effort, priority and splittable the user
  didn't state carry `source:'context'` and appear in "I assumed: hard, high
  priority" with a one-tap fix.
- **Never a slot.** The model never chooses where a flexible block goes. For
  `propose_blocks` and `plan_week` it only narrows the search; the scorer picks.

### 4.4 References ("move my dentist", "the gym one", "that")

The model outputs `target: { text: "dentist", day?: "friday", kind?:
"event" | "task" | "habit" | "last-plan" }`. Code resolves:

1. `kind:'last-plan'` / "that" / "it" → `ctx.lastProposals` / draft.
2. task/habit → ids in the context card (`[t1]`, `[h1]`); the model may cite
   the id directly.
3. event → case-insensitive token match of `text` against **live titles** in
   `ctx.events`, narrowed by `day` if given.

One match → act. Several → ask with the matches as options (titles shown to
the user only). None → "I can't find 'dentist' on your calendar in the next
three weeks." Imported events are never moved or deleted (read-only scope) —
the reply says so.

### 4.5 Fallback and dual read

- Model unconfigured, errors twice, times out (4 s), or returns a schema-invalid
  call → `understand()` runs instead; the turn proceeds. The trace shows which
  reader ran.
- In **eval and beta**, both readers run on every turn; disagreements on tool
  or a required field are logged (tool name, field name, both values — no
  titles) to mine new golden cases. In production the parser result is used
  only as fallback, not as a vote: a second opinion that is wrong half the
  time on hard sentences adds questions without adding accuracy.
- Lever if below target (§8.4): for disagreements on `when` only, ask the user
  with both readings as options.

### 4.6 Prompt

Short system prompt (≤ 60 lines): role, the precedence order, "never invent a
time for a flexible block", "copy the user's time words into `when.text`
verbatim", "if a required field is missing, call `ask_clarification`", 12
worked examples (one per frequent tool, two multi-step). `PROMPT_VERSION` in
`llm.ts`, bumped on any change, recorded on each assistant message's `parsed`.

---

## 5. Multi-step turns

"Thesis due Thursday, 10 hours left, gym three times, and I'm in Copenhagen
from Thursday evening" is four actions. So is "move the gym to Friday and plan
my week."

### 5.1 Decision: one model call, a step list, code runs it

The model returns **one** call to an envelope tool:

```ts
type Steps = { steps: Step[] };             // 1..4; 1 step = a single-step turn
type Step  = { tool: ToolName; args: ...; dependsOn?: number[] };
```

Not a loop where the model sees each result and decides again. Reasons:

- **Testable**: the golden set asserts the step list; a loop's path depends on
  intermediate results and is much harder to pin.
- **Predictable cost and latency**: one model call per turn (~1.5–3 s).
- The steps users chain are independent facts, not search; the engine already
  does the search.

A loop is reconsidered only if multi-step golden cases fail because a later
step needed an earlier result the code couldn't pass on (none known today).

### 5.2 Canonical order (code, not the model)

Code sorts steps into a fixed order, whatever order the model wrote them in,
because something stated in the same sentence must constrain the plan:

1. `record_rule`, `plan_settings`, `set_travel` — the rules of the game
2. `block_time_off`, `place_at` — fixed time
3. `add_task`, `update_task`, `postpone_task`, `task_done`, `add_habit`, `update_habit` — the backlog
4. `delete_blocks`
5. `propose_blocks`, `plan_week` — placement, run last against everything above
6. `list_tasks`, `answer` — reported in the reply

`dependsOn` only matters inside a group (e.g. `update_task` on a task added in
the same turn). Two placement steps → merge into one `plan_week` if both are
backlog items; otherwise run in order with the first's proposals as busy time
for the second.

### 5.3 Staging: one preview, one accept

Every step runs against an in-memory overlay of `PlanningContext`, not the DB:

- Writes become a `ChangeSet`: `{ creates: Event[], updates: [...], deletes:
  [...], tasks: [...], habits: [...], rules: [...], settings: {...} }`.
- Each later step sees earlier steps' changes (the overlay), so a rule stated
  in step 1 filters step 5's placement.
- The whole `ChangeSet` passes the validator (§7.2) as one plan.
- One card: what will change, grouped ("Rule · Away Thu 18:00–Tue 18:00 ·
  Task: Thesis 10h · Habit: Gym 3× · 7 blocks placed · 1 gym session didn't
  fit — options"). Dashed blocks on the calendar.
- `Accept all` commits the `ChangeSet` in one DB transaction; `Undo` reverts
  it. `Accept some` per group.

Single-step direct commands (`block_time_off`, `add_task`, `record_rule`, …)
keep today's behaviour — act now, undo available — because a preview for "add
task: tax forms" is friction with no safety gain.

**Schema:** `ai_change_sets (id, user_id, session_id, message_id, changes jsonb,
status pending|committed|undone, created_at, committed_at)`. `changes` holds
ids and times only; titles of user-created items are the user's own data and
allowed, imported titles never appear.

### 5.4 Partial failure

- A step fails validation or its engine call → dependants are skipped; the rest
  still preview. The reply lists each skipped step and why ("I couldn't add the
  third gym session: Tuesday's calls run to 19:00 and you're away Thursday").
- A step that cannot be understood → it becomes the turn's one question; the
  rest wait (§5.5). The reply never says a skipped step was done.

### 5.5 Questions inside a chain

One question per turn (planning-agent-plan §6.2). The first step with a
missing required field asks; every not-yet-run step goes into `ctx.pending`
(stored on the draft, like today's `Draft`). The answer fills that field and
the chain resumes from where it stopped. Steps that needed no question and
come before the asking one in canonical order run immediately into the
overlay, so the user sees progress ("Copenhagen is blocked. How long is the
thesis left?"). Cap: 3 questions per chain; after that, the remaining steps
are dropped with "tell me the rest again when ready" — better than an
interrogation.

---

## 6. Learning from calendar items

All existing guardrails in [ai-learning.md](ai-learning.md) §3–§5 apply
unchanged: inference never writes hard rules, `MIN_EVIDENCE` = 5, `MAX_STEP`,
decay, rejected claims are never relearned, every claim describable in one
sentence. Added constraint: **no event content** — every signal below is
computed from times, categories, links and outcomes, never from titles.

### 6.1 Signals, ranked

| # | Signal | Strength | Source | Today |
|---|---|---|---|---|
| 1 | Edit of a proposal (moved before accepting) | 1.0 | `/api/ai/feedback` | built |
| 2 | **Post-hoc move** of an accepted AI/task/habit block | 0.7 | `events-repo.updateEvent` hook | no |
| 3 | Reject + reason | 0.6 | feedback | built |
| 4 | **Post-hoc delete** of an accepted block, before its start | 0.4 (no reason → claims only for hour/day, never duration) | `deleteEvent` hook | no |
| 5 | **Manual block** the user placed themselves (category + time) | 0.3 | `createEvent` with `origin='manual'`, not from a proposal | no |
| 6 | **Completion**: `done_at` vs planned end | duration bias only | tasks/events `done_at` | partly |
| 7 | Survival: reached start untouched | 0.1 positive | daily check on read | no |
| 8 | Accept | 0.15 | feedback | built |
| 9 | **Calendar rhythm** (imported times) | suggestion only, never a weight | §6.4 | no |

### 6.2 Post-hoc moves and deletes (#2, #4)

`ai_suggestions.event_id` already links a proposal to the block it became.
In `events-repo.updateEvent` / `deleteEvent`, when the event has a suggestion
row with status `accepted|edited`:

- Moved by ≥ 60 min (smaller moves are tidying — existing rule) and the new
  time is in the future → `learnFrom` as `edited` with weight 0.7, chosen =
  new slot (features recomputed with `slotFeatures` against today's busy),
  proposed = old slot. Recorded on the suggestion (`moved_at`, `moved_to`).
- Deleted before its start → `rejected` with reason `null`, weight 0.4,
  claims for hour/weekday only.
- Moves of pinned blocks after re-plans, and moves made by the planner itself,
  are excluded (the update carries `actor: 'user' | 'planner'`).

### 6.3 Manual blocks (#5)

A block the user drew themselves, with a category, at a time they chose, is a
revealed preference with no proposal bias. On `createEvent` with
`origin='manual'` and no suggestion link → `claimsFrom` with a synthetic
`accepted` at that slot, weight 0.3 (weaker than an edit: there was no
comparison). Scope = its category. Imported events are excluded — other people
schedule meetings; their times say nothing about this user's preferences.

### 6.4 Calendar rhythm suggestions (#9)

From imported + manual **busy times only**, over the last 4 weeks (needs at
least 3 weeks with ≥ 5 events):

| Pattern | Rule | Suggestion |
|---|---|---|
| Typical day start | median first busy start per weekday, if IQR ≤ 60 min and it differs from work hours by ≥ 30 min | "Your days usually start around 9:30 — use 9:30 as your start?" |
| Typical day end | median last busy end per weekday, same test | "…end around 17:30?" |
| Recurring lunch gap | ≥ 75 % of weekdays have no busy time in the same 45–60 min window between 11:30 and 14:00 | "Protect 12:30–13:15 for lunch?" (rule, `protected`) |
| Meeting-heavy weekday | weekday with ≥ 1.5× the mean busy minutes, 3 of 4 weeks | "Tuesdays are your meeting day — keep deep work off Tuesdays?" (stated pref) |

Computed lazily in `loadPlanningContext` when the cached result in
`scheduler_profiles.learning.rhythm` is older than 24 h (no background worker
needed yet). Each suggestion is a `learned_preferences` row with
`source='calendar'`, `userVerdict=null`, **no effect** until the user taps
`Use this`; then it becomes the setting/rule/preference it describes. Dismiss
→ `rejected`, never suggested again.

### 6.5 What the model contributes to learning

Only what the user **stated** in words: "I write better in the mornings" →
`record_rule {strength:'prefer'}` (§3.3), after "Remember that? `Always`
`Just this week`". The model never infers a preference from behaviour, never
writes `learned_preferences` with `source='inferred'`, and is not fine-tuned
(ai-learning.md §3).

### 6.6 Checks

- `learn.check.mjs`: post-hoc move updates weights at 0.7 of an edit; move
  < 60 min ignored; planner-actor moves ignored; delete makes no duration
  claim; manual block makes a claim scoped to its category; imported event
  makes none.
- `rhythm.check.mjs`: each pattern fires on a synthetic 4-week calendar and
  does not fire below the thresholds or with < 3 weeks.
- **Replay test** (`learning.replay.mjs`): a simulated user with hidden
  preferences (e.g. design 14–16, no Monday mornings) accepts/edits proposals
  for 8 simulated weeks; pass = top proposal inside the hidden window ≥ 80 %
  by week 4, and no hard rule ever created.

---

## 7. Engine work this depends on

From the earlier review; needed before the model goes live, because the model
will produce more varied requests than the parser and every one must land on
a checked path.

### 7.1 One context — §3.1.

### 7.2 One validator for every path

`validatePlacement(ctx, changeSet): Violation[]`, pure, built from
`verifyPlan`'s checks generalised to any block:

- inside the horizon, not in the past, end > start
- no overlap with `busy`, `away`, `travel`; buffer kept from busy
- inside the category's hours that day (`hoursOn`), no hard rule broken unless
  `overrideRuleIds` names it
- task blocks before `dueByISO`, after `notBeforeISO`
- daily focus budget (warn, not fail — going over is allowed for a deadline)
- no two new blocks overlap each other
- imported events untouched

Every handler's result and every `ChangeSet` passes through it. A violation
in a result the engine produced is a bug: logged, never shown, and the turn
replies "I couldn't make that fit without breaking X" rather than showing it.

### 7.3 Amount of change + bumping

- **Change cost** in `plan-week` scoring: a kept block moved costs
  `0.15 + 0.05 × hours moved`, so a re-plan prefers leaving things alone
  (today: kept unless broken — a rule, not a cost; the cost lets a small move
  beat an over-budget day).
- **Bump for a named time**: `place_at` on a time occupied by a *flexible*
  block of ours → offer "Move *Deep work* to 15:00 and put Gym here?" where
  15:00 is `rankFreeSlots` for the bumped block. Fixed, imported and pinned
  blocks are never bumped. This is the open **bump-vs-deadline** question from
  the robustness pass: proposed answer — a bump is never allowed to push a
  task block past its deadline; if it would, offer the other options only.

---

## 8. Measuring 95 %

### 8.1 What "95 % accurate" means here

A turn is **correct** only if all of these hold:

1. **Action** — the right tool(s) (the right step list for multi-step), or a
   question when one was required, and *no* question when the golden case says
   none was needed.
2. **Fields** — every required field matches the expected value (times
   resolved to the minute, lengths exact, ids exact); optional fields the user
   stated match too.
3. **Plan validity** — the result passes `validatePlacement` (must be 100 %;
   any failure is a bug, not an accuracy point).
4. **Plan obeys the case** — the case's own checks pass: "all thesis blocks
   before Thu 18:00", "no block before 10:00", "gym on 3 distinct days",
   "nothing on Friday".
5. **Reply truth** — the reply claims nothing that the result didn't do
   (checked by matching claimed counts/times against the result).

**Primary metric: turn accuracy = correct turns / all turns**, reported overall
and per category. Ship gate in §8.3.

Separately measured, not part of the 95 %: **plan preference fit** — whether
the user keeps the plan. That depends on taste the engine learns over time;
it is tracked in beta (§8.5), not gated offline.

### 8.2 The golden set

`src/server/ai/eval/golden.jsonl`, one case per line:

```json
{
  "id": "ms-014",
  "category": "multi-step",
  "now": "2026-10-05T08:00:00.000Z",
  "fixture": "week-busy-tue",
  "history": [],
  "say": "thesis due thursday, 10h left. gym 3x. copenhagen from thu 18:00 to tue",
  "expect": {
    "steps": [
      {"tool": "block_time_off", "args": {"startISO": "2026-10-08T18:00:00.000Z", "endISO": "2026-10-13T23:59:00.000Z"}},
      {"tool": "add_task", "args": {"title": "~thesis", "totalMin": 600, "dueByISO": "2026-10-09T00:00:00.000Z"}},
      {"tool": "add_habit", "args": {"title": "~gym", "timesPerWeek": 3, "durationMin": "?"}}
    ],
    "ask": "durationMin of add_habit"
  },
  "checks": ["thesis blocks end ≤ 2026-10-08T18:00", "no block overlaps away"]
}
```

`~` = fuzzy title match; `"?"` = must be asked, not filled. `fixture` names a
calendar + profile + tasks in `eval/fixtures/` (times and categories only).

**Composition (≥ 400 cases; test set held out):**

| Category | Cases | Sources |
|---|---|---|
| Single-step, per tool (17 × ~10) | 170 | the ~100 sentences in `understand.check.mjs` (converted), new paraphrases |
| Multi-step (2–4 steps) | 60 | written from real use; the §0 Copenhagen conversation |
| Follow-ups & references ("make it 90", "not Tuesday", "the gym one", "that") | 50 | `understand.check.mjs` `talk()` cases + new |
| Ask vs act (missing day/length, am/pm, ambiguous refs, rule conflicts) | 50 | SGD_Calendar (simple commands; strip the questions Find time shouldn't ask) + new |
| Context-dependent (same sentence, different rules/prefs → different result) | 40 | pairs over fixtures |
| Meaning → knob (§4.3) | 30 | new |
| Out of scope / injection / nonsense | 20 | "email Bob", "ignore your rules", event titles containing instructions |
| **Total** | **420** | |

Split 60/40: **dev** (252, used while writing prompts) and **test** (168,
never read while tuning; run only at gates). A failure found in test is fixed
by adding a *new* similar case to dev, never by tuning on the test case.

**Why ≥ 400:** at a true accuracy of 95 %, 400 cases give a 95 % confidence
interval of about ±2.1 points; 100 cases would give ±4.3, too wide to tell 93
from 97.

Planner-only correctness (no language) stays in `puzzles.check.mjs` (152) and
gets the ba-calendar slot puzzles (`microsoft/ba-calendar`, 2,000, validated
not string-matched) as a solver stress test.

### 8.3 Gates

| Gate | Requirement |
|---|---|
| Baseline (Phase A) | rule parser scored on the full set — the number to beat, whatever it is |
| Model single-step (Phase D) | test-set turn accuracy ≥ 95 % on single-step + follow-ups + ask/act; no category < 90 % |
| Model multi-step (Phase E) | ≥ 95 % overall on test; multi-step category ≥ 90 % |
| Always | validity 100 %; false claims 0; imported events never written; p95 latency ≤ 4 s simple, ≤ 8 s multi-step |
| Regression | every prompt or model change runs dev + test; any category dropping > 2 points blocks the change |

### 8.4 Levers, in the order to pull them if below target

1. Look at the failures by category — most misses cluster (dates, refs, one
   tool's args).
2. Move a failing computation from model to code (e.g. a phrase `readFacets`
   can't read → extend `readFacets`, with a check).
3. Tighten the schema (an enum instead of free text, a required field).
4. Add or fix worked examples in the prompt (dev cases only).
5. Disagreement-ask for `when` (§4.5).
6. A stronger/larger model for multi-step turns only, if 1–5 don't close it.

Fine-tuning is not on the list (privacy, data volume — ai-learning.md §3).

### 8.5 In production (beta)

Watched weekly, no titles logged:

| Metric | Target |
|---|---|
| Accept or pick a runner-up, first proposal | ≥ 80 % |
| Accepted within one revision | ≥ 95 % |
| Corrections within 2 turns ("no, I meant…") | ≤ 5 % of turns |
| Unnecessary questions (answer = the default we'd have used) | ≤ 10 % of questions |
| Reports (`/api/ai/report`) | each one becomes a golden case |
| Reader fallback rate (model failed → parser) | ≤ 2 % |

Logging needs a minimal turn log again (db/024 dropped `ai_turns`): `ai_turn_log
(id, user_id, session_id, reader 'model'|'rules', prompt_version, tools text[],
asked bool, disagreement jsonb, latency_ms, created_at)` — ids and enums only.

---

## 9. Phases

Each phase ends with its checks passing and is pushed. Sizes: S = days,
M = 1–2 weeks.

| # | Phase | Deliverables | Done when | Size |
|---|---|---|---|---|
| A | **Measure** | `eval/golden.jsonl` (420), fixtures, `eval/run.mjs` scoring turn accuracy per category against the real pipeline; pipeline split so it runs without the DB (`runPipeline(ctx, text)` pure-ish; `turn.ts` does I/O) | rule-parser baseline number recorded in this file | M |
| B | **Context layer** | `PlanningContext` + projections; `TurnCtx` slimmed; db/025; `record_rule` strength/until; expiry; precedence in code; "What Find time knows" API sections | `context.check.mjs`; backlog.ts builds nothing itself; baseline unchanged or better | M |
| C | **Engine gaps** | `validatePlacement` on every path; change cost; bump with deadline guard | puzzles 0 FAIL; new validator checks; every handler result validated | S–M |
| D | **Model, single-step** | `tools/schemas.ts` (strict); `When` resolution via `readFacets`; `normalise()`; references; fallback; prompt v1; dual-read logging; turn log | Gate D | M |
| E | **Multi-step** | `Steps` envelope; canonical order; overlay + `ChangeSet`; one preview; commit/undo; pending chain; `ai_change_sets` | Gate E; Copenhagen conversation end to end in the running app | M |
| F | **Calendar learning** | post-hoc move/delete hooks; manual-block claims; completion → duration bias; rhythm suggestions; page "Suggestions" section | `learn.check`, `rhythm.check`, replay test pass | M |
| G | **Beta watch** | weekly metrics (§8.5); reports → golden cases | 4 weeks of metrics at target | ongoing |

Order: A first (no number, no target). B and C can run in parallel. D needs
A–C. E needs D. F needs B only and can start any time after it.

---

## 10. Non-goals for this layer

- A model in the placement decision, or a model choosing slots.
- An agent loop (the model seeing tool results and calling again) — §5.1.
- Free-text memory, conversation summaries as memory, or embeddings/RAG over
  the calendar.
- Sending event titles, attendees or locations to the model.
- Fine-tuning.
- Write-back to Google (separate decision; read-only scope today).

---

## 11. Decisions needed from you

1. **Model name.** `llm.ts` defaults to `gpt-6-luna`; your diagram said
   GPT-5.6 Luna. Which one is the target? (Phase D evaluates whichever it is;
   switching later is one env var.)
2. **Multi-step staging.** Proposed: everything in a multi-step turn is staged
   and committed on one Accept, single direct commands still act at once. OK?
3. **"I prefer X" in chat** — saved as a soft preference (proposed), or asked
   "always, or a hard rule?" every time?
4. **German** in the golden set from the start, or English first?
5. **Bump vs deadline** — proposed answer in §7.3 (a bump never pushes a task
   past its deadline). OK?
