-- find_time — 003 calendar events, reminders, the dispatch ledger, per-calendar
-- Google sync bookkeeping.
--
-- Replaces the `events` Map in src/server/store/db.ts and adds everything the
-- CalendarEvent domain type has no room for: an RRULE, EXDATEs, override rows,
-- a Google etag, and a fire-exactly-once reminder ledger.
--
-- Full rationale in docs/db/calendar-schema.md. Columns with no counterpart in
-- src/lib/types/event.ts (rrule, sync_state, deleted_at, …) are mapped in
-- src/server/db/rows.ts and are NOT in API responses until a route opts in.
--
-- calendar_events.task_id / .draft_batch_id / .suggestion_id are circular FKs,
-- added in db/006_cross_refs.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/003_calendar_events.sql

-- ── calendar_events ─────────────────────────────────────────────────────────
-- One row per series. A one-off event is a series with rrule = null. Recurring
-- occurrences are expanded at read time (src/lib/calendar/recurrence.ts), never
-- materialised — docs/db/calendar-schema.md §1.
create table if not exists calendar_events (
  id                          text primary key,
  user_id                     text not null references users (id) on delete cascade,
  calendar_id                 text references calendars (id) on delete set null,
  connected_account_id        text references connected_accounts (id) on delete set null,

  title                       text not null,
  description                 text,
  location                    text,

  -- Absolute instants for the FIRST occurrence. end_at is EXCLUSIVE (RFC 5545
  -- DTEND / Google end.dateTime). An all-day event is [local midnight, next
  -- local midnight) in time_zone.
  start_at                    timestamptz not null,
  end_at                      timestamptz not null,
  all_day                     boolean not null default false,
  time_zone                   text not null default 'Europe/Berlin',

  item_type                   text not null default 'event',
  category                    text not null default 'other',
  project_id                  text references projects (id) on delete set null,
  task_id                     text,                 -- FK added in 006 (circular)
  status                      text not null default 'confirmed',

  -- Provenance: who created it. Load-bearing for AI explainability (PLAN.md §4)
  -- and orthogonal to sync_state (which side last wrote the row).
  origin                      text not null default 'manual',
  is_draft                    boolean not null default false,
  draft_batch_id              text,                 -- FK added in 006 (plan_drafts)
  suggestion_id               text,                 -- FK added in 006 (ai_suggestions)

  flexibility                 text not null default 'flexible',
  requires_focus              boolean not null default false,

  -- ── recurrence (calendar-schema.md §1) ──
  rrule                       text,                 -- RFC 5545 body, no "RRULE:" prefix. null = one-off.
  recurrence_unsupported      boolean not null default false,   -- §1.3: a rule we stored from Google but cannot expand
  series_end_at               timestamptz,          -- §1.7: denormalised. null = never ends.
  exdates                     timestamptz[] not null default '{}',  -- §1.8: cancelled occurrences, keyed by original start
  recurrence_parent_id        text references calendar_events (id) on delete cascade,  -- override row / split child -> the series
  recurrence_id               timestamptz,          -- the overridden occurrence's ORIGINAL start (RECURRENCE-ID)
  split_from_id               text references calendar_events (id) on delete set null, -- §2 this_and_future provenance

  -- ── Google Calendar two-way sync (calendar-schema.md §5) ──
  -- Schema + invariants only; no OAuth client / worker in this branch.
  provider_event_id           text,                 -- Google event.id
  provider_recurring_event_id text,                 -- Google recurringEventId (master id when this is an instance override)
  provider_etag               text,                 -- sent as If-Match on push
  provider_sequence           int,                  -- Google sequence, monotonic per event
  sync_state                  text not null default 'local',
  sync_error                  text,
  remote_updated_at           timestamptz,          -- Google `updated`; never compared directly to updated_at
  deleted_at                  timestamptz,          -- soft-delete tombstone (§5.6), reaped at 90 days

  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

do $$ begin
  alter table calendar_events add constraint calendar_events_item_type_ck
    check (item_type in ('event', 'task', 'deepwork', 'break'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_category_ck
    check (category in ('deep-work', 'design', 'research', 'meeting', 'admin', 'learning', 'break', 'other'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_status_ck
    check (status in ('confirmed', 'tentative', 'cancelled'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_origin_ck
    check (origin in ('manual', 'ai', 'imported', 'signal'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_flexibility_ck
    check (flexibility in ('fixed', 'flexible', 'protected'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_sync_state_ck
    check (sync_state in ('local', 'synced', 'pending_push', 'pending_delete', 'push_failed', 'conflict'));
exception when duplicate_object then null; end $$;

-- Range query behind day/week/month AND the scheduler's capacity read.
create index if not exists calendar_events_user_range_idx
  on calendar_events (user_id, start_at) where deleted_at is null;

-- Draft apply/discard/undo touches every event in a batch.
create index if not exists calendar_events_user_draft_idx
  on calendar_events (user_id, draft_batch_id)
  where draft_batch_id is not null and deleted_at is null;

-- Folding overrides in; the scope=this upsert target; two overrides of one
-- occurrence become impossible.
create unique index if not exists calendar_events_override_idx
  on calendar_events (recurrence_parent_id, recurrence_id)
  where recurrence_parent_id is not null;

-- Pull: "do we already have this Google event?" — one probe per incoming item.
create unique index if not exists calendar_events_provider_idx
  on calendar_events (calendar_id, provider_event_id)
  where provider_event_id is not null and deleted_at is null;

-- The push job's entire worklist in one partial-index scan.
create index if not exists calendar_events_push_idx
  on calendar_events (updated_at)
  where sync_state in ('pending_push', 'pending_delete') and is_draft = false;

-- Cross-user reminder scan — deliberately leads on start_at, NOT user_id.
create index if not exists calendar_events_due_scan_idx
  on calendar_events (start_at)
  where deleted_at is null and recurrence_parent_id is null;

-- task <-> scheduled event.
create index if not exists calendar_events_task_idx
  on calendar_events (task_id) where task_id is not null;

drop trigger if exists calendar_events_updated_at on calendar_events;
create trigger calendar_events_updated_at before update on calendar_events
  for each row execute function set_updated_at();


-- ── calendar_event_reminders ────────────────────────────────────────────────
-- A child table, not a jsonb column: the exactly-once dispatch ledger needs a
-- stable reminder_id to key on. On the wire this is still
-- CalendarEvent.reminders: { minutesBefore, channel }[] — the mapper converts
-- (minutesBefore = -offset_seconds / 60). calendar-schema.md §3.
create table if not exists calendar_event_reminders (
  id              text primary key,
  event_id        text not null references calendar_events (id) on delete cascade,
  offset_iso      text not null,        -- RFC 5545 TRIGGER, e.g. '-PT10M', '-P1D'
  offset_seconds  int  not null,        -- same value, normalised + signed, for the due-scan
  channel         text not null,
  created_at      timestamptz not null default now()
);

do $$ begin
  alter table calendar_event_reminders add constraint calendar_event_reminders_channel_ck
    check (channel in ('in-app', 'browser', 'email'));
exception when duplicate_object then null; end $$;

-- Years and months are rejected at write time (a month's lead is a different
-- event). Cap: one year = 31536000 seconds.
do $$ begin
  alter table calendar_event_reminders add constraint calendar_event_reminders_offset_ck
    check (offset_seconds between -31536000 and 31536000);
exception when duplicate_object then null; end $$;

create index if not exists calendar_event_reminders_event_idx
  on calendar_event_reminders (event_id);


-- ── reminder_dispatches ─────────────────────────────────────────────────────
-- The fire-exactly-once ledger. No pre-materialised queue: a worker calls
-- dueReminders() -> claimReminderDispatch() -> markReminderDispatched().
-- Winning the (reminder_id, occurrence_start) insert IS the lock.
-- calendar-schema.md §3.1. The worker itself is PLAN.md P12, not this branch.
create table if not exists reminder_dispatches (
  id                text primary key,
  reminder_id       text not null references calendar_event_reminders (id) on delete cascade,
  event_id          text not null references calendar_events (id) on delete cascade,
  occurrence_start  timestamptz not null,   -- RECURRENCE-ID: moving occurrence #7 does not re-fire #1-6
  fire_at           timestamptz not null,
  status            text not null default 'pending',
  attempts          int  not null default 0,
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$ begin
  alter table reminder_dispatches add constraint reminder_dispatches_status_ck
    check (status in ('pending', 'sent', 'failed'));
exception when duplicate_object then null; end $$;

create unique index if not exists reminder_dispatches_once_idx
  on reminder_dispatches (reminder_id, occurrence_start);

create index if not exists reminder_dispatches_pending_idx
  on reminder_dispatches (fire_at) where status in ('pending', 'failed');

drop trigger if exists reminder_dispatches_updated_at on reminder_dispatches;
create trigger reminder_dispatches_updated_at before update on reminder_dispatches
  for each row execute function set_updated_at();


-- ── calendar_sync_state ─────────────────────────────────────────────────────
-- Per-calendar Google sync machinery. Separate from `calendars` because that is
-- a wire type the settings UI renders and none of this belongs in it. The
-- user-facing rollup stays on connected_accounts (syncStatus/syncError/
-- lastSyncAt). calendar-schema.md §5.2. OAuth tokens are deliberately NOT here
-- (PLAN.md §5 wants AES-256-GCM at rest first).
create table if not exists calendar_sync_state (
  calendar_id          text primary key references calendars (id) on delete cascade,
  sync_token           text,
  sync_token_at        timestamptz,
  channel_id           text,           -- events.watch channel (a uuid we generate)
  channel_resource_id  text,           -- Google's id for the watched resource
  channel_expires_at   timestamptz,
  last_full_sync_at    timestamptz,
  last_incremental_at  timestamptz,
  last_error           text,
  consecutive_errors   int not null default 0
);
