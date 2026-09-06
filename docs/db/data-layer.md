# find_time — data layer

_How the 15 entities in `src/lib/types/` get out of `globalThis` and into Neon Postgres,
and what the code that reads them looks like afterwards._

> **Status:** schema + code written, **nothing applied**. There is no `DATABASE_URL` yet.
> Operator steps are in [README.md](README.md).

---

## 0. What we are replacing

`src/server/store/db.ts` holds a `Store` of 15 `Map<string, T>`s on `globalThis`,
reseeded by `src/server/store/seed.ts` on every boot. Every route handler starts with

```ts
seed();
const store = getStore();
const events = listBy(store.events, DEMO_USER_ID);
```

That shape is why the app works at all today, and it is also the whole problem: a
`next build` invalidates every event a user created, the scheduler's cross-entity read
(`events` + `tasks` + `schedulerProfile` together) is only coherent because it is one
process's memory, and there is nowhere to put a recurrence rule, a Google `etag`, or a
reminder-dispatch ledger.

---

## 1. The decision: raw `pg` + numbered `.sql` migrations

**Recommended: a `pg` `Pool`, hand-written SQL in a repository layer, and numbered
`db/00N_*.sql` migrations with a canonical `db/schema.sql`.** Not Drizzle.

This is not the reflexive answer — Drizzle is genuinely the better default for a
15-entity strict-TypeScript app, and it was the leading candidate. It loses here on four
specific properties of *this* codebase.

### 1.1 The domain types already exist, are hand-authored, and are the API contract

`src/lib/types/` is not a set of DB row shapes that happen to be typed. It is the wire
format: `useEvents()` gets `CalendarEvent[]` straight out of `GET /api/events`,
`EventBlock.tsx` renders that object, `src/lib/scheduler/` takes `CalendarEvent[]` and
`SchedulerProfile` as its pure-function input, and `src/lib/scheduler/__tests__/` builds
them as literals. They are camelCase, dates are **ISO strings**, and several fields are
JSON-shaped (`SchedulerProfile.workHours`, `NotificationPrefs.channels`,
`AIMessage.parsed`, `PlanDraft.conflicts`).

Drizzle's value proposition is that `InferSelectModel<typeof events>` *becomes* your type.
Here it cannot — it would produce a second, snake-case, `Date`-typed shape sitting beside
the one 40 components already import. You would then either

* refactor every component and the scheduler onto the Drizzle-inferred shape (a large,
  high-risk diff for zero user-visible change, and it drags `Date` objects into
  `JSON.stringify` responses where they silently become strings), or
* keep both and write a mapper between them —

and the moment you write the mapper, Drizzle's headline benefit is gone and you are
paying its costs for a query builder. **We need a mapper layer either way**
(`src/server/db/rows.ts`), so we should pick the option where the mapper is the *only*
indirection rather than one of two.

### 1.2 The hard queries are the ones an ORM makes you escape from

The calendar work in this branch needs, specifically:

| Query | Drizzle equivalent |
|---|---|
| series + their override rows in one round trip (`union all` over a CTE) | `db.execute(sql\`…\`)` |
| `insert … on conflict (reminder_id, occurrence_start) do nothing returning id` — the exactly-once reminder claim | supported, but the "winning the insert is the lock" semantics are the point, and they read better in SQL |
| `exdates = array_append(exdates, $2)` on a `timestamptz[]` | raw `sql` |
| partial indexes (`where deleted_at is null`) and the `series_end_at is null or …` range predicate | schema-level; expressible but verbose |
| `select … for update` inside the draft apply/undo transaction | supported |

Roughly the most interesting half of the new data access drops to `sql` template literals
anyway. An ORM that you escape from for the queries that matter is a dependency you are
carrying for the boring ones.

### 1.3 Migration tooling is a liability here, not an asset

`drizzle-kit generate` diffs schema-as-code into SQL you then review. That is excellent
when many people evolve a schema over years. Right now: one developer, one schema, zero
production rows, and **the schema cannot be applied to anything** — there is no Neon
project yet. Numbered `.sql` files are reviewable as-written, apply with `psql -f`, need
no extra CLI, and are exactly what the operator (who already runs this pattern on Lexora,
`db/001…012`) knows how to drive. Adding `drizzle-orm` + `drizzle-kit` + `drizzle.config.ts`
+ a `drizzle/meta/` journal to get a `psql -f` equivalent is not a trade that pays.

### 1.4 The install is already fragile

`npm install pg @types/pg` in this repo fails on a **pre-existing** peer conflict
(`@types/node@26` vs `vitest@5`'s `^22 || >=24` peer) and needs `--legacy-peer-deps`.
`pg` is 1 runtime dep with no build step. `drizzle-orm` + `drizzle-kit` is a larger
surface to force through the same resolver, plus `drizzle-kit`'s own esbuild toolchain.

### 1.5 When to revisit

Switch to Drizzle if any of these become true: a second developer starts changing the
schema; multi-tenancy arrives and you want a compile-time guarantee that every query
carries `user_id`; or the entity count roughly doubles. The repository layer in §4 is the
seam — it is the only module that knows SQL exists, so swapping its internals is a
contained change.

---

## 2. Driver and pooling

### `pg` (node-postgres), not `@neondatabase/serverless`

`@neondatabase/serverless` exists to make Postgres reachable from an environment with no
TCP sockets and no connection reuse — Cloudflare Workers, Vercel Edge. It pays for that
with an HTTP round trip per query in `neon()` mode (no multi-statement transactions) or a
WebSocket proxy in `Pool` mode.

The deploy target is **not decided**. What *is* decided is that this app has route
handlers doing Gmail/Google-Calendar OAuth token exchange with a client secret
(`PLAN.md` §5), which rules out the Edge runtime for the parts that matter, and the
build already assumes a Node server (`next start`). Under Node, `pg` keeps warm TCP
connections and gives real transactions — which the draft apply/undo flow needs.

**If the target later becomes Vercel Edge or Cloudflare**, the swap is one file:
`src/server/db/pool.ts` exports `query` / `queryOne` / `tx`, and nothing else in the app
imports `pg`. `@neondatabase/serverless`'s `Pool` is API-compatible with `pg`'s; the only
real work is that HTTP-mode `neon()` cannot do interactive transactions, so `tx()` would
need `neon`'s batch form.

### Pooling

* **App connections go through Neon's pooler** — `DATABASE_URL` with `-pooler` in the
  host. Neon's PgBouncer sits in front of the compute, so a serverless deployment that
  spins up many instances does not exhaust the compute's `max_connections`.
* **Migrations go through the direct (unpooled) URL** — `DATABASE_URL_UNPOOLED`. DDL,
  `create type`, and advisory locks do not behave through a transaction-mode pooler.
* Local `pg.Pool` is capped at `max: 10` and **stashed on `globalThis` in development**,
  because Next's hot reload re-evaluates the module on every edit and would otherwise
  leak a pool per change until Neon starts refusing connections.
* Neon **scales to zero**. The first query after an idle period pays a cold start
  (hundreds of ms). `connectionTimeoutMillis` is set generously (10 s) so a cold start is
  not reported to the user as an error.

---

## 3. Where the connection module lives

```
src/server/db/
  pool.ts     the Pool, query(), queryOne(), tx()  — the ONLY module importing "pg"
  rows.ts     row ⇄ domain mappers for all 15 entities (snake_case+Date ⇄ camelCase+ISO)
  ids.ts      the id-prefix generators (evt_, task_, acct_…) the seed and routes already use
```

`src/server/db/pool.ts` mirrors `src/lib/db.ts` in Lexora, deliberately — same
`globalThis` pool trick, same `ssl: { rejectUnauthorized: false }` (Neon terminates TLS;
we encrypt without pinning a CA chain), same stripping of `sslmode`/`channel_binding`
from the URL to silence `pg-connection-string`'s v3 deprecation warning.

Two additions over Lexora's version:

```ts
export async function tx<T>(fn: (c: TxClient) => Promise<T>): Promise<T>
```

a real `BEGIN`/`COMMIT`/`ROLLBACK` helper that checks a client out of the pool and always
releases it, and

```ts
export function isConfigured(): boolean   // DATABASE_URL present?
```

so a missing `DATABASE_URL` produces one clear error at the API boundary
(`503 { error: "Database not configured…" }`) instead of a `pg` connection stack trace on
every route in the app.

### Text primary keys, not `uuid`

Ids are `text`, not `uuid`, everywhere. The existing ids are `u1`, `evt_<uuid>`,
`acct_1`, `task_5` — human-readable prefixed strings that the seed, the API responses,
the query keys and the tests all already contain. `DEMO_USER_ID` is literally `"u1"`.
Moving to `uuid` columns would mean rewriting the fixtures, invalidating every hard-coded
id, and gaining nothing: at this cardinality the 8-byte difference between `uuid` and a
short `text` is noise, and ids are still generated in app code (`src/server/db/ids.ts`),
exactly as today. **This keeps every API response byte-identical**, which is the
constraint the task is under.

---

## 4. The repository layer — `repo.events.listByUser(userId)`

`getStore()` returns `Map`s **synchronously**. Postgres does not. A `getStore()`-shaped
facade over the DB has only two possible implementations and both are bad:

1. **Load every table into Maps per request.** A full table scan of 15 tables to serve
   `GET /api/events`, and it forecloses the range query, `on conflict`, `for update`, and
   partial indexes — i.e. everything the calendar design depends on.
2. **Make `getStore()` async and return Map-shaped proxies.** All the syntax of the old
   thing, none of its semantics, and a lie about atomicity.

So: a **repository layer**, `src/server/repo/`, one module per entity group, exported as
a single `repo` object.

```ts
// before
seed(); const store = getStore();
const events = listBy(store.events, DEMO_USER_ID);
return NextResponse.json({ events });

// after
await ensureSeeded();
const events = await repo.events.listByUser(DEMO_USER_ID);
return NextResponse.json({ events });
```

Route handlers stay one to five lines around the data access, the response shape is
unchanged, and the diff per route is mechanical. Ownership stays where it is today —
enforced in the handler, by passing `userId` into every repository call. Every method
that reads or writes a user-owned row takes `userId` as its **first** parameter and puts
it in the `where` clause; there is no `getById(id)` that skips it. That is the same
posture as Lexora's route-handler-enforced ownership, without RLS.

```
src/server/repo/
  index.ts          export const repo = { users, profiles, prefs, accounts, calendars,
                                          events, tasks, projects, signals, notifications,
                                          ai, drafts, constraints, reminders }
  users.ts          User, SchedulerProfile, NotificationPrefs
  accounts.ts       ConnectedAccount, Calendar
  events.ts         CalendarEvent  (+ recurrence, reminders, sync, edit scopes)
  tasks.ts          Task, Project
  signals.ts        EmailSignal
  notifications.ts  Notification
  ai.ts             AISession, AIMessage, PlanDraft, AISuggestion, Constraint
```

### Transactions

`tx()` wraps the multi-row writes that must be atomic:

| Flow | Why |
|---|---|
| `POST /api/drafts/[id]/apply` | flip N draft events to real **and** N suggestions to `applied` **and** the draft to `applied` — "apply all commits in one transaction with one undo" (PLAN.md §3.4) |
| `POST /api/drafts/[id]/discard` / `undo` | same set, reversed |
| `POST /api/ai/plan` | insert the draft, N events and N suggestions together — a half-written plan is worse than no plan |
| `PATCH /api/events/[id]?scope=this_and_future` | cap the old series with `UNTIL`, insert the new one, re-parent later overrides, copy reminders |
| `seed()` | one insert of the whole demo dataset, or none |

Everything else is a single statement and needs no explicit transaction.

---

## 5. `seed()` becomes an idempotent DB seed

`src/server/store/seed.ts` keeps its dataset **verbatim** — 3 connected accounts,
3 calendars, 3 projects, ~35 events, 18 tasks, 12 signals, 4 notifications; PLAN.md is
explicit that "every screen's realism depends on this dataset". What changes is where it
lands.

It splits in two:

* `buildSeedData(): SeedData` — pure, no I/O, returns plain domain objects. Unchanged
  logic, just returning instead of writing into Maps. Still usable in tests.
* `ensureSeeded(): Promise<void>` — the guard.

```
ensureSeeded()
  ├─ module-level promise on globalThis  → at most one attempt per process
  ├─ select 1 from users where id = 'u1' → already seeded? return
  └─ tx: insert every row with `on conflict (id) do nothing`
```

Two layers of idempotency on purpose. The `globalThis` promise means a burst of
concurrent requests on a cold boot does one DB probe, not thirty. The
`on conflict do nothing` means that even if two *processes* race (two serverless
instances, a dev server plus a script), the second one is a no-op rather than a
duplicate-key error. Dates in the dataset are computed relative to `new Date()`, so a
re-seed against a populated DB would otherwise shift every event.

**The seed is dev/demo scaffolding and it is opt-out.** Set `FT_SKIP_SEED=1` and
`ensureSeeded()` returns immediately — for the day the first real user exists.

### The `u1` demo user until real auth lands

Unchanged from today: `ft_session` is an httpOnly cookie whose value is the user id, and
`/api/auth/login` sets it to `DEMO_USER_ID`. The DB does not care — `users.id` is `text`
and `u1` is a perfectly good row. When Auth.js v5 lands (PLAN.md §5), the change is:

1. `currentUserId()` (a new `src/server/auth/session.ts`) reads the real session instead
   of trusting the cookie value, and every route calls it instead of importing
   `DEMO_USER_ID`. **Routes already pass a `userId` into every repo call**, so this is a
   one-line change per route, not a data-layer change.
2. `ensureSeeded()` gets switched off in production.

`DEMO_USER_ID` stays exported from `seed.ts` so nothing has to change twice.

---

## 6. Migration files

```
db/
  001_core.sql               extensions, set_updated_at(), users, scheduler_profiles,
                             notification_prefs, constraints, connected_accounts, calendars
  002_projects_tasks.sql     projects, tasks
  003_calendar_events.sql    calendar_events, calendar_event_reminders,
                             reminder_dispatches, calendar_sync_state
  004_ai.sql                 ai_sessions, ai_messages, plan_drafts, ai_suggestions
  005_signals_notifications.sql
  006_cross_refs.sql         the two circular FKs, added last
  schema.sql                 canonical full schema (001–006 concatenated); what a fresh
                             database gets
```

`006_cross_refs.sql` exists because `tasks.scheduled_event_id → calendar_events.id` and
`calendar_events.task_id → tasks.id` are mutually referential, as are
`calendar_events.draft_batch_id → plan_drafts.id` and
`ai_suggestions.event_id → calendar_events.id`. Rather than dropping FKs or using
`deferrable` in a circle, the tables are created in dependency order and the four
back-references are added with `alter table` at the end. Each file is idempotent
(`create table if not exists`, `do $$ … exception when duplicate_object`), so re-running
one is safe.

---

## 7. What each entity's JSON columns look like

Postgres `jsonb` for the shapes that are genuinely documents and are never queried
by their contents:

| Column | Type |
|---|---|
| `scheduler_profiles.work_hours` | `jsonb` — `Record<day, {start,end} \| null>` |
| `scheduler_profiles.focus_windows`, `.energy_curve`, `.weights`, `.duration_bias` | `jsonb` |
| `notification_prefs.channels` | `jsonb` |
| `ai_messages.parsed`, `.ambiguities` | `jsonb` — the parsed SSR, a versioned blob |
| `plan_drafts.conflicts` | `jsonb` — `ConflictReport[]` |
| `constraints.rule` | `jsonb` — `Record<string, unknown>` by definition |

Native arrays (`text[]`) where the elements are scalars and might one day be searched:
`connected_accounts.scopes`, `tasks.labels`, `ai_messages.suggestion_ids`,
`ai_suggestions.displaced_event_ids`, `calendar_events.exdates` (`timestamptz[]`).

Timestamps are `timestamptz` in the DB and **ISO strings across the mapper**, because
that is what the domain types say and what `JSON.stringify` would produce anyway. The
mapper is the single place that knows this, which avoids the classic bug where a value
is a `Date` on a cache miss and a `string` on a hit.

---

## 8. Efficiency notes that are not calendar-specific

* Every list endpoint is one indexed query on `(user_id, …)`. No N+1: events fetch their
  reminders in a single `= any($1::text[])` batch, drafts fetch their suggestions in one
  query.
* `POST /api/ai/plan` reads events + tasks + profile. That is three queries, issued with
  `Promise.all`, not a join — they have no relation to each other beyond `user_id`, and
  the scheduler wants three separate arrays.
* Deletes are **soft** on `calendar_events` only (`deleted_at`, needed as a sync
  tombstone — see [calendar-schema.md](calendar-schema.md) §6). Everywhere else a delete
  is a delete.
* `set_updated_at()` is a trigger, not application code, so `updated_at` cannot drift
  when a write path forgets it — and the Google push-sync job keys off it.
