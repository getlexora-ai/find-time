# find_time — calendar schema

_Recurrence, reminders, and Google Calendar two-way sync for `calendar_events`.
Companion to [data-layer.md](data-layer.md); the SQL is `db/003_calendar_events.sql`,
the expander is `src/lib/calendar/recurrence.ts`._

> **Status:** written, **not applied**. See [README.md](README.md).

This adapts a design written for Lexora
(`Lexora/lexora/.claude/worktrees/calendar-events/docs/calendar/design.md`). What carries
over: the recurrence-model options analysis, the wall-clock/DST expansion, the RFC 5545
this / this-and-future / all edit model, and the claim-insert reminder ledger. What does
**not** carry over: everything about the `.ics` subscription feed. find_time's delivery
is **two-way Google Calendar OAuth sync with push-watch channels** (PLAN.md §5), which is
the case Lexora explicitly rejected — so §5 here is new work, not an adaptation.

---

## 1. Recurrence model

### 1.1 The three options, scored for find_time

| | A. RRULE + expand at read | B. Materialise every occurrence | C. Hybrid (rule + rolling window) |
|---|---|---|---|
| Storage | 1 row/series | 1 row/occurrence, forever | 1 row/series + N in a window |
| "Move all future ones" | 1 UPDATE | rewrite N rows | 1 UPDATE + window rebuild |
| Infinite series | free | impossible | needs a horizon |
| Range query (week view) | index scan + CPU expansion | pure index scan | pure index scan |
| Scheduler capacity scan | expand, then subtract | trivial | trivial |
| Google push (one row changed) | 1 patch on the master | N patches, or diff the window | 1 patch |
| Google pull (`syncToken` gives instances) | must re-collapse to a rule | direct row-per-instance write | ambiguous |
| Failure mode | CPU on a hostile rule | silent drift when the window lapses | both, plus a rebuild job |

### 1.2 Recommendation: **A — one row per series, expanded at read**

find_time is a *personal* calendar, not a deadline list, so the reasoning differs from
Lexora's in one important way — it has no `.ics` feed that would let a client do the
expansion. The read path really does expand server-side. It still wins:

1. **The volume is small and the range is bounded.** A heavy user has O(10³) events; a
   week view asks for 7 days, a month view for ~6 weeks, and the scheduler for
   `planningHorizonDays` (default 7). Expansion is over the handful of series that
   overlap that window, not the table.
2. **Google Calendar is itself model A.** Its API stores a master event carrying `RRULE`
   plus `EXDATE`, and instance overrides carrying `recurringEventId` + `originalStartTime`.
   Choosing B here would mean collapsing Google's rules into rows on pull and
   reconstructing rules from rows on push — inventing a lossy translation in the middle
   of a two-way sync. **Matching the provider's model is the single biggest correctness
   win available**, and it is why this decision is not close.
3. **B's failure mode is disqualifying for a scheduler.** If the materialised window
   lapses, the scheduler sees free time that is not free and books over a standing
   meeting. "Silently drifts" is the worst possible property for the thing whose whole
   job is capacity.
4. **The one real cost is bounded in code.** `expandOccurrences` caps at 20 000
   iterations / 3 000 occurrences; `GET /api/events?expand=…` caps the requested range at
   366 days; `parseRRule` **rejects** unsupported parts rather than mis-expanding.

C stays available as a pure derived table if the scheduler's capacity scan ever
dominates a profile. Nothing in `calendar_events` would change.

### 1.3 `rrule`

`calendar_events.rrule text` holds an RFC 5545 RRULE **body with no `RRULE:` prefix**
(`FREQ=WEEKLY;BYDAY=MO,WE`, `FREQ=MONTHLY;BYMONTHDAY=-1`). `NULL` = one-off. Storing the
standard string rather than decomposed columns means the value we store is the value we
hand Google, byte for byte, in `recurrence: ["RRULE:" + rrule]`.

Supported subset (`src/lib/calendar/recurrence.ts`): `FREQ` (DAILY/WEEKLY/MONTHLY/YEARLY),
`INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (with ordinals for MONTHLY/YEARLY), `BYMONTHDAY`
(negatives included, `-1` = last day), `BYMONTH`, `WKST` (accepted, ignored). Everything
else — `BYSETPOS`, `BYYEARDAY`, `BYWEEKNO`, sub-daily frequencies — **throws at write
time**, surfaced as `422`.

That subset is a deliberate risk in a *two-way* sync that Lexora's one-way feed did not
carry: **Google can hand us a rule we cannot parse.** So the pull path does not throw. It
stores the rule string verbatim, sets `recurrence_unsupported = true`, and treats the
series as a single occurrence locally until a human or a later parser version deals with
it. A rule we cannot expand must not become a rule we silently drop — but it also must
not fail an entire sync batch.

### 1.4 Why no `rrule` npm package

Same reasoning as Lexora, and it applies harder here. `rrule.js` expands in a floating
pseudo-UTC and pushes IANA-zone handling back to the caller or a `luxon` peer dep;
find_time's users have a `timezone` on `User` *and* on `SchedulerProfile` *and* on each
`Calendar`, and the entire difficulty is keeping a 09:00 standup at 09:00 across the
Europe/Berlin March and October switches. We would write the hard half ourselves anyway.
`src/lib/calendar/recurrence.ts` is dependency-free, pure (no `next`, no `pg`, no
`date-fns`), and therefore unit-testable under the repo's existing `vitest` runner with
no environment.

### 1.5 Time zone and DST

* `start_at` / `end_at` are `timestamptz` — absolute instants for the **first**
  occurrence. `end_at` is **exclusive**, matching RFC 5545 `DTEND` and Google's
  `end.dateTime`.
* `time_zone text not null default 'Europe/Berlin'` is the zone the recurrence
  **expands in**, and it is the same string Google wants in
  `start.timeZone` / `end.timeZone`.

A weekly standup at 09:00 Berlin must stay at 09:00 across the switch. Adding
milliseconds to an instant drifts it to 08:00 or 10:00 and, for an all-day event, onto
the wrong day. So `expandOccurrences` converts `start_at` to a **wall-clock struct** in
`time_zone` (`Intl.DateTimeFormat.formatToParts`), does all calendar arithmetic there, and
converts back with a two-pass offset solve. Duration is carried as a **civil delta**, not
milliseconds, so an all-day event spanning the switch still ends at midnight.

The two-pass solve is exact except *inside* a transition: an ambiguous wall time (the
repeated hour) resolves to the first occurrence, a non-existent one (the skipped hour)
lands just after the jump. Both are documented at `fromWall()`. Neither is reachable from
the UI, which snaps to 15 minutes inside working hours.

### 1.6 `all_day`

One flag, no separate `date` column. An all-day event is the half-open instant range
`[local midnight, next local midnight)` in `time_zone`. One uniform `timestamptz`
predicate serves every query, and Google's `start.date` / `end.date` form is derived by
formatting the instant in `time_zone`. `CalendarEvent.allDay` already exists and this
does not change its meaning.

### 1.7 `series_end_at`

The range query must not have to expand a rule to know whether a series can reach the
window. `series_end_at timestamptz` is denormalised at write time by `seriesEndAt()`:

* no rrule → `end_at`
* `UNTIL` → `until + duration` (deliberately generous — it only ever *excludes* rows, so
  erring late costs a wasted expansion, never a missing event)
* `COUNT` → the COUNT-th occurrence's end (bounded; `COUNT` caps at 3 000 at parse)
* neither → **`NULL`, meaning "never ends"**

`NULL` rather than `'infinity'::timestamptz`, because node-postgres decodes `infinity` to
the JS number `Infinity` rather than a `Date` — a type wart in every consumer. The
predicate is `(series_end_at is null or series_end_at > $from)`.

### 1.8 `exdates`

`exdates timestamptz[] not null default '{}'`, keyed by each cancelled occurrence's
**original** start — the RFC 5545 `RECURRENCE-ID`, and exactly Google's
`originalStartTime`. Deleting one occurrence appends; the expander skips any occurrence
whose `recurrenceId` is in the set; the push job emits them as `EXDATE`.

An array rather than a child table: cardinality is a handful, it is always read with its
parent row, and it maps 1:1 onto both wire formats.

---

## 2. Editing: this / this-and-future / all

`PATCH|DELETE /api/events/[id]?scope=this|this_and_future|all&occurrence=<iso>`.

`occurrence` is the occurrence's **original** start, not wherever a previous edit moved
it. That is what keeps its identity stable across repeated edits, and it is the value
Google round-trips as `originalStartTime`.

| Scope | Mechanism |
|---|---|
| `all` (default) | UPDATE the series row; `series_end_at` recomputed. Every occurrence follows. Overrides survive unless the patch moves the series' time-of-day, in which case they keep their own explicit times — same as Google. |
| `this` | Insert an **override row**: same table, `recurrence_parent_id` = the series, `recurrence_id` = the original start. Upserted on the unique partial index `(recurrence_parent_id, recurrence_id)`. The expander prefers it over the generated occurrence. |
| `this_and_future` | **Split.** `boundRRule()` caps the original with `UNTIL` just before the occurrence; a new series row starts at the occurrence with the patch applied. `split_from_id` records provenance. Reminders are copied to the new half, later overrides re-parented, and a `COUNT` is divided so the two halves still total the original. |

Deleting mirrors it: `all` soft-deletes the series and its overrides, `this` appends to
`exdates`, `this_and_future` caps with `UNTIL`.

This is RFC 5545's own model, which is why it round-trips through Google without a
translation layer. `scope` is validated with `zod` and defaults to `all`; a `scope=this`
or `this_and_future` with no `occurrence` is a `400`, never a silent series-wide edit.

**Non-recurring events ignore `scope` entirely** — a plain event has one occurrence, and
`?scope=this` on it is the same UPDATE as `?scope=all`. That keeps the existing
`useUpdateEvent()` mutation (which sends no `scope`) working with no client change.

---

## 3. Reminders

`CalendarEvent.reminders` stays on the wire exactly as it is today:

```ts
reminders: { minutesBefore: number; channel: "in-app" | "browser" | "email" }[]
```

Behind it is a child table `calendar_event_reminders`, not a `jsonb` column, for one
reason: **the exactly-once dispatch ledger needs a stable `reminder_id` to key on.** A
JSON array element has no identity — edit the array and every "have we already fired
this?" record is orphaned.

| Column | Why |
|---|---|
| `offset_iso` | the RFC 5545 `TRIGGER` value (`-PT10M`, `-P1D`) — what Google's `reminders.overrides` and any future `VALARM` want |
| `offset_seconds` | the same value normalised and signed, for the due-scan's arithmetic |
| `channel` | `in-app` \| `browser` \| `email` — matches the existing union exactly |

Both columns exist because only one is useful for each job. Consistency is enforced by
**rejecting years and months**: `-P1M` throws. That is not a limitation — a month's lead
time is a different event, not a lead time on one. Lead times are days, hours, minutes.
Cap: one year.

The mapper converts on read (`minutesBefore = -offset_seconds / 60`) and on write
(`offset_seconds = -minutesBefore * 60`, `offset_iso = -PT<n>M`). Only non-negative
`minutesBefore` values round-trip, which is all the UI can produce.

### 3.1 Firing exactly once — `reminder_dispatches`

There is **no pre-materialised queue.** A queue needs a horizon, a backfill job, and
invalidation on every event edit — the same trap as materialised occurrences. Instead:

1. `dueReminders(now, graceSeconds)` — SQL narrows to reminders on series that could
   plausibly have an occurrence in the window (one index range scan on
   `calendar_events_due_scan_idx`, which leads on `start_at`, **not** `user_id`, because
   the scan is cross-user), then each `(reminder, occurrence)` pair is expanded exactly in
   JS. `fire_at = occurrence.start + offset`. `graceSeconds` (default 1 h — shorter than
   Lexora's 6 h, because a meeting reminder that arrives after the meeting is noise)
   bounds how late a reminder may still be sent after a worker outage.
2. `claimReminderDispatch(due)` —
   ```sql
   insert into reminder_dispatches (reminder_id, event_id, occurrence_start, fire_at)
   values (…) on conflict (reminder_id, occurrence_start) do nothing returning id
   ```
   **Winning the insert is the lock.** Two workers racing the same occurrence, or a retry
   after a crash, cannot both fire. Returns `null` for the loser.
3. deliver
4. `markReminderDispatched(id, error?)` → `sent` or `failed` (with `attempts`), so
   `reminder_dispatches_pending_idx` (`where status in ('pending','failed')`) is the retry
   sweep.

`occurrence_start` is the RECURRENCE-ID, so moving occurrence #7 of a series does not
re-fire occurrences #1–6.

### 3.2 What is not built

The **worker** — the loop that calls the three functions above and actually delivers.
`in-app` delivery is an insert into `notifications` (type `event.reminder`, which already
exists in `NotificationType`); `browser` is the Notification API from the client, which
means a `GET /api/notifications` poll is enough for day one; `email` needs a transport
that does not exist yet. The three repository functions are the whole surface a worker
needs. PLAN.md P12 owns this.

---

## 4. `origin`, drafts, and the scheduler

`CalendarEvent.origin` (`manual` | `ai` | `imported` | `signal`) already exists and is
load-bearing for provenance (PLAN.md §4: "this provenance chain is what makes AI
proposals explainable and must never be dropped"). Sync adds a second, orthogonal axis —
*which side last wrote this row* — and that must **not** be crammed into `origin`.
An AI-created event that then syncs to Google is still `origin = 'ai'`.

So sync state is its own column, `sync_state` (§5.3), and `origin = 'imported'` means
specifically "this row was first seen on the provider", i.e. Google created it.

Draft events (`is_draft = true`) are **never pushed to Google**. They are a proposal, not
a commitment; the push job's predicate excludes them, and applying a draft
(`POST /api/drafts/[id]/apply`) is what flips `is_draft = false` **and** marks the row
dirty for push, in the same transaction.

---

## 5. Google Calendar two-way sync

This section is new relative to the Lexora design, which chose a one-way `.ics` feed
precisely to avoid it. None of the feed/ETag/token material transfers.

The sync itself is **not implemented in this branch** — there is no OAuth client and no
worker. What is implemented is the schema and the invariants, so that adding the jobs
later is additive.

### 5.1 Columns on `calendar_events`

| Column | Purpose |
|---|---|
| `provider_event_id text` | Google's `event.id`. Unique per calendar: `unique (calendar_id, provider_event_id) where provider_event_id is not null and deleted_at is null`. |
| `provider_recurring_event_id text` | Google's `recurringEventId` — the provider's id for the *master* when this row is an instance override. Lets us reconstruct the parent link on pull before we have seen the master. |
| `provider_etag text` | Google's `etag`. Sent back as `If-Match` on push so a concurrent remote edit produces a `412` instead of a lost update. |
| `provider_sequence int` | Google's `sequence`. Monotonic per event; a cheap "is our copy older?" test that survives etag format changes. |
| `sync_state` | enum `local` \| `synced` \| `pending_push` \| `pending_delete` \| `push_failed` \| `conflict` — see §5.3 |
| `sync_error text` | last push failure, surfaced on the event detail popover |
| `remote_updated_at timestamptz` | Google's `updated`. The right-hand side of the conflict comparison; **never** compared against our `updated_at` directly (clock skew) — see §5.5. |
| `deleted_at timestamptz` | the tombstone. §5.6. |

### 5.2 Columns on `calendars` / a new `calendar_sync_state` table

Per-calendar sync bookkeeping lives in its own table rather than on `calendars`, because
`Calendar` is a wire type the settings UI renders and none of this belongs in it:

```
calendar_sync_state
  calendar_id        pk, → calendars(id) on delete cascade
  sync_token         text    -- Google's incremental syncToken
  sync_token_at      timestamptz
  channel_id         text    -- push watch channel (a uuid we generate)
  channel_resource_id text   -- Google's id for the watched resource
  channel_expires_at timestamptz
  last_full_sync_at  timestamptz
  last_incremental_at timestamptz
  last_error         text
  consecutive_errors int
```

`ConnectedAccount` keeps `syncStatus` / `syncError` / `lastSyncAt` as the *user-facing
rollup* (the `ConnectedAccountRow` StatusDot reads it) — this table is the machinery
underneath.

OAuth tokens are **not** in this schema. `ConnectedAccount` has no token columns today
and it should not get them casually: PLAN.md §5 specifies AES-256-GCM encryption at rest
and a hand-rolled per-provider handler, and inventing the column shape without the
encryption is how tokens end up in plaintext. That is a deliberate gap, listed in §8.

### 5.3 `sync_state` — the state machine

```
local ──(calendar has a write target)──▶ pending_push ──push ok──▶ synced
                                              │                      │
                                              │ push fails           │ local edit
                                              ▼                      ▼
                                         push_failed ◀──retry── pending_push
                                              
synced ──remote edit arrives, no local edit pending──▶ synced (values replaced)
synced ──remote edit arrives while pending_push──────▶ conflict
any ──local delete──▶ pending_delete ──delete ok──▶ (row keeps deleted_at, sync_state=synced)
```

* `local` — lives only here. Every event on a calendar with no write target, and every
  draft.
* `pending_push` — **the dirty flag.** The push job's query is
  `where sync_state in ('pending_push','pending_delete') and is_draft = false`, ordered by
  `updated_at`, with a partial index to match. A boolean `dirty` column would need a
  second column to distinguish "dirty because deleted"; one enum does both.
* `conflict` — both sides changed since the last successful sync. Not resolved silently;
  see §5.5.

### 5.4 Pull — incremental, `syncToken`

1. **First sync** for a calendar: `events.list` with `singleEvents=false` (we want the
   masters and their rules, per §1.2), `showDeleted=true`, paging on `pageToken`. The
   final page returns `nextSyncToken` → `calendar_sync_state.sync_token`.
2. **Every sync after:** `events.list?syncToken=…`. Google returns only what changed,
   including cancellations (`status: "cancelled"`).
3. **`410 Gone`** means the token expired (Google keeps them for a bounded period, and
   invalidates on some calendar changes). Handle it, do not retry it: clear
   `sync_token`, run a full sync, and reconcile — see §5.6 for why the tombstone matters
   here.
4. **Push notifications** (`events.watch`) tell us *that* something changed, never
   *what*. The channel POSTs to `/api/connections/google/webhook` with
   `X-Goog-Channel-ID` / `X-Goog-Resource-State`; the handler validates the channel id
   against `calendar_sync_state`, enqueues an incremental pull, and returns `200` fast.
   Never trust the notification body — it has none. Channels expire (a week, typically),
   so `channel_expires_at` drives a renewal sweep, and a **polling fallback** (every
   N minutes for calendars whose channel has lapsed) is mandatory: a missed renewal must
   degrade to slow, not to silent.

Mapping on pull:

| Google | find_time |
|---|---|
| `id` | `provider_event_id` |
| `recurringEventId` | `provider_recurring_event_id` → resolved to `recurrence_parent_id` |
| `originalStartTime` | `recurrence_id` |
| `recurrence: ["RRULE:…", "EXDATE;…"]` | `rrule` + `exdates` |
| `start.dateTime` / `start.date` | `start_at` + `all_day` |
| `start.timeZone` | `time_zone` |
| `status: "cancelled"` | `deleted_at = now()` (§5.6) |
| `etag`, `sequence`, `updated` | `provider_etag`, `provider_sequence`, `remote_updated_at` |
| — | `origin = 'imported'`, `sync_state = 'synced'` |

`category`, `flexibility`, `requires_focus`, `item_type`, `project_id` and `task_id` have
no Google counterpart. On pull they are **defaults on insert and preserved on update** —
a remote edit must never reset a user's "this is protected deep work" to `flexible`. That
one rule is the difference between the sync being useful and it being hostile.

### 5.5 Conflict resolution

The comparison is **not** `local.updated_at vs remote.updated_at`. Those clocks are not
the same clock. It is:

> Has the remote copy changed since the version we last successfully synced?
> `incoming.etag !== row.provider_etag` (equivalently `incoming.sequence > provider_sequence`).

Combined with our own dirty flag:

| Local | Remote changed | Resolution |
|---|---|---|
| `synced` | yes | **Remote wins.** Overwrite the provider-owned fields, keep find_time-only fields (§5.4), stay `synced`. |
| `pending_push` | no | **Local wins.** Push with `If-Match: provider_etag`. |
| `pending_push` | yes | **`conflict`.** Do not overwrite either side. |
| `pending_delete` | yes | `conflict` — someone edited what we were deleting. |

A `conflict` row keeps the local values, records the remote ones in `sync_error` as a
short human-readable diff, and surfaces in the UI. Last-write-wins is tempting and wrong:
this is a calendar, and the event a user silently lost is a meeting they miss.

Push uses `If-Match`; a `412` is Google telling us the same thing, and it transitions the
row to `conflict` rather than retrying with force.

### 5.6 Deletes and tombstones

A hard `DELETE` cannot be synced. If we drop the row and the push then fails, the event
lives forever on Google with nothing left to reference it. Worse, on a `410 Gone` full
resync it comes back — a deleted event resurrecting is the single most-reported class of
calendar-sync bug.

So: `calendar_events.deleted_at timestamptz`, and

* every read filters `deleted_at is null`;
* deleting locally sets `deleted_at` + `sync_state = 'pending_delete'`;
* the push job issues `events.delete`, then leaves the row (tombstone) with
  `sync_state = 'synced'`;
* a pull that sees `status: "cancelled"` sets `deleted_at` and stays `synced`;
* the full-resync reconciler treats "row has `deleted_at` and Google does not list it" as
  agreement, not as a missing event to re-create.

Tombstones are reaped on a schedule — `delete from calendar_events where deleted_at <
now() - interval '90 days'` — long after any `syncToken` could still reference them, and
long enough to be an "undo" backstop for the 6-second undo toast the calendar UI already
has (PLAN.md §3.3).

Recurring deletes: `scope=this` is an `exdates` append (which pushes as an `EXDATE` on
the master, or a cancelled instance), **not** a tombstone row.

---

## 6. Efficiency checklist

**Indexes** (`db/003_calendar_events.sql`):

| Index | Serves |
|---|---|
| `calendar_events_user_range_idx (user_id, start_at) where deleted_at is null` | the range query behind day/week/month **and** the scheduler's capacity read |
| `calendar_events_user_draft_idx (user_id, draft_batch_id) where draft_batch_id is not null and deleted_at is null` | draft apply/discard/undo — the flow touches every event in a batch |
| `calendar_events_override_idx (recurrence_parent_id, recurrence_id) where recurrence_parent_id is not null` **unique** | folding overrides in; the `scope=this` upsert target; makes two overrides of one occurrence impossible |
| `calendar_events_provider_idx (calendar_id, provider_event_id) where … not null and deleted_at is null` **unique** | pull: "do we already have this Google event?" — one probe per incoming item |
| `calendar_events_push_idx (updated_at) where sync_state in ('pending_push','pending_delete') and is_draft = false` | the push job's whole worklist, in one partial-index scan |
| `calendar_events_due_scan_idx (start_at) where deleted_at is null and recurrence_parent_id is null` | cross-user reminder scan — **must not** lead on `user_id` |
| `calendar_events_task_idx (task_id) where task_id is not null` | task ⇄ scheduled event |
| `calendar_event_reminders_event_idx (event_id)` | the batched reminder hydrate |
| `reminder_dispatches_once_idx (reminder_id, occurrence_start)` **unique** | the exactly-once claim |
| `reminder_dispatches_pending_idx (fire_at) where status in ('pending','failed')` | retry sweep |

**Query shapes:**

* The range predicate is always
  `user_id = $1 and deleted_at is null and start_at < $to and (series_end_at is null or series_end_at > $from)`
  — index-led on `(user_id, start_at)`, with `series_end_at` a filter on the few rows that
  survive.
* Masters and their overrides come back in **one** round trip (a CTE + `union all`), never
  N+1. `listForRange()` then folds overrides into the expansion in memory.
* Reminders for a page of events are one `= any($1::text[])`, not N queries.
* The reminder scan is one range scan, then per-pair expansion in JS — never
  expand-then-filter over the table.
* Expansion fast-forwards its period index to the range start whenever the rule has no
  `COUNT`, so a three-year-old daily standup costs the same as a fresh one.
* `GET /api/events` with no `expand` returns **series rows**, unchanged from today, so
  every existing caller keeps its current cost. Expansion is opt-in per request.

**The scheduler's cross-entity read.** `POST /api/ai/plan` needs events + tasks + profile.
Three independent indexed reads issued with `Promise.all` — not a join, because the
scheduler wants three arrays and they share nothing but `user_id`. The events read is the
**expanded** one over `[now, now + planningHorizonDays)`: a weekly standup must occupy
capacity on every day it recurs, or the scheduler books over it. That is the single most
important consequence of adding recurrence, and it is why
`src/lib/scheduler/expand.ts` (which expands *`ScheduleItem`s*, an unrelated meaning of
the word) is left alone and `src/lib/calendar/recurrence.ts` is called **before** the
scheduler, at the repository boundary.

**Escalation path if it ever gets slow:** a GiST index over
`(user_id, tstzrange(start_at, series_end_at))` (needs `btree_gist`) turns the range
predicate into a true overlap operator. At this cardinality plain btree wins on size and
planning cost, so it is documented rather than built.

---

## 7. Top-5 decisions, condensed

1. **One row per series, RRULE expanded at read** — because Google Calendar's own model is
   the same, so a two-way sync needs no lossy translation, and because a lapsed
   materialised window would make the scheduler book over standing meetings.
2. **Recurrence expands in wall-clock time in the event's `time_zone`**, with duration as a
   civil delta — a 09:00 Berlin standup stays at 09:00 across both DST switches, and an
   all-day event spanning one still ends at midnight.
3. **RFC 5545's own edit model** — override rows keyed `(recurrence_parent_id,
   recurrence_id)` for `this`, an `UNTIL` split with `split_from_id` for
   `this_and_future` — because it round-trips through Google as `recurringEventId` /
   `originalStartTime` with no translation.
4. **`sync_state` is an enum, separate from `origin`** — `origin` is provenance (who
   created it: manual/ai/imported/signal) and the AI's explainability depends on it;
   `sync_state` is "which side last wrote this row". Conflict is decided by
   `incoming.etag !== provider_etag`, never by comparing two machines' clocks, and an
   unresolvable conflict is surfaced, not silently resolved last-write-wins.
5. **Soft delete with tombstones on `calendar_events`** — a hard delete cannot be synced,
   and it is what makes a deleted event resurrect on the next `410 Gone` full resync.
   Reaped at 90 days.

---

## 8. Deliberately not built

* **The Google sync jobs themselves** — OAuth client, token storage/refresh, the pull
  worker, the push worker, `events.watch` registration and renewal, the webhook route.
  The schema, the state machine and the conflict rule are here; the I/O is not.
  `/api/connections/mock-connect` still fabricates accounts.
* **OAuth token columns.** Deliberate: PLAN.md §5 requires AES-256-GCM at rest, and
  inventing the column shape without the encryption is how tokens end up in plaintext.
* **The reminder worker.** `dueReminders` → `claimReminderDispatch` →
  `markReminderDispatched` is the whole interface it needs.
* **A recurrence editor in the UI.** `EventEditModal` has no RRULE control yet; the API
  accepts one. `?expand=` is likewise available and unused by the current calendar views,
  which still read series rows.
