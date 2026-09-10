-- find_time — canonical full schema (db/001..007 concatenated).
-- GENERATED, do not edit by hand. Regenerate:
--   cat db/00[1-7]_*.sql > db/schema.sql   # then re-prepend this banner
-- What a fresh database gets:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/schema.sql

-- find_time — 001 core: identity, scheduling profile, notification prefs,
-- standing constraints, connected accounts, calendars.
--
-- Replaces the `users` / `schedulerProfiles` / `notificationPrefs` /
-- `constraints` / `connectedAccounts` / `calendars` Maps in
-- src/server/store/db.ts. See docs/db/data-layer.md.
--
-- IDs are `text`, not uuid: the app already generates readable prefixed ids
-- ("u1", "acct_1", "evt_<uuid>") and every API response, test fixture and
-- query key contains them. Generation stays in src/server/db/ids.ts.
--
-- Apply (direct/unpooled URL — DDL must not go through the pooler):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/001_core.sql

-- ── extensions + shared trigger ─────────────────────────────────────────────

create extension if not exists pgcrypto;

-- Keeps updated_at honest even when a write path forgets it. The Google push
-- job keys its worklist off updated_at, so this is load-bearing, not cosmetic.
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;


-- ── users ───────────────────────────────────────────────────────────────────
-- Identity only, and a thin mirror of Clerk (db/012): `id` is the Clerk user id
-- (`user_...`), `email` / `name` are backfilled lazily on first authed request.
-- Connected mailboxes/calendars are a SEPARATE system (connected_accounts).
create table if not exists users (
  id                      text primary key,          -- Clerk user id ("user_...")
  email                   text not null,
  name                    text not null default '',
  avatar_color            text not null default 'lime',
  timezone                text not null default 'Europe/Berlin',
  locale                  text not null default 'en',
  clock_12h               boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- Non-unique: Clerk owns email uniqueness; the lazy upsert must not fail on a clash.
create index if not exists users_email_idx on users (lower(email));

drop trigger if exists users_updated_at on users;
create trigger users_updated_at before update on users
  for each row execute function set_updated_at();


-- ── scheduler_profiles ──────────────────────────────────────────────────────
-- User 1—1 SchedulerProfile. THE learning seam (PLAN.md §4): work hours, energy
-- curve, scoring weights and per-category duration bias all live here, and the
-- deterministic scheduler in src/lib/scheduler/ takes this row as pure input.
--
-- The nested shapes stay jsonb: they are documents, they are always read whole
-- with the row, and nothing ever queries inside them.
create table if not exists scheduler_profiles (
  user_id               text primary key references users (id) on delete cascade,
  timezone              text not null default 'Europe/Berlin',

  -- Record<'mon'..'sun', {start,end} | null> — null = a non-working day.
  work_hours            jsonb not null default '{}'::jsonb,
  -- {day, start, end}[] — SOFT windows. A hard dueBy may displace one, but only
  -- with a recorded note (scheduler ScheduledBlock.displacedFocus).
  focus_windows         jsonb not null default '[]'::jsonb,

  default_buffer_min    int  not null default 10,
  min_focus_block_min   int  not null default 45,
  max_daily_focus_min   int  not null default 240,

  -- {hour, level}[] — 0..1 energy by hour of day.
  energy_curve          jsonb not null default '[]'::jsonb,
  -- {preferredWindow, focusAlignment, priority, fragmentation, deadlineUrgency}
  weights               jsonb not null default '{}'::jsonb,
  -- Record<category, multiplier> — learned actual-vs-estimated duration.
  duration_bias         jsonb not null default '{}'::jsonb,

  autonomy              text not null default 'draft-daily',
  daily_plan_at         text not null default '06:00',   -- local HH:mm
  planning_horizon_days int  not null default 7,

  updated_at            timestamptz not null default now()
);

do $$ begin
  alter table scheduler_profiles add constraint scheduler_profiles_autonomy_ck
    check (autonomy in ('suggest', 'draft-daily', 'auto-protect', 'full-auto'));
exception when duplicate_object then null; end $$;

drop trigger if exists scheduler_profiles_updated_at on scheduler_profiles;
create trigger scheduler_profiles_updated_at before update on scheduler_profiles
  for each row execute function set_updated_at();


-- ── notification_prefs ──────────────────────────────────────────────────────
-- Per-type channel matrix + quiet hours. Quiet hours also suppress AI
-- auto-actions (PLAN.md §3.6), which is why they live with the prefs and not
-- with the scheduler profile.
create table if not exists notification_prefs (
  user_id                   text primary key references users (id) on delete cascade,
  -- Record<NotificationType, {inApp, browser, email}>
  channels                  jsonb not null default '{}'::jsonb,
  default_reminder_minutes  int  not null default 10,
  quiet_hours_start         text,                       -- local HH:mm, null = none
  quiet_hours_end           text,
  daily_plan_delivery_time  text not null default '06:00',
  updated_at                timestamptz not null default now()
);

drop trigger if exists notification_prefs_updated_at on notification_prefs;
create trigger notification_prefs_updated_at before update on notification_prefs
  for each row execute function set_updated_at();


-- ── constraints ─────────────────────────────────────────────────────────────
-- Standing scheduling rules, from onboarding, settings, or parsed out of
-- natural language ("never book me before 9"). `rule` is jsonb because the
-- domain type is literally Record<string, unknown> — the shape varies by kind.
create table if not exists constraints (
  id          text primary key,
  user_id     text not null references users (id) on delete cascade,
  kind        text not null,
  rule        jsonb not null default '{}'::jsonb,
  hard        boolean not null default false,
  label       text not null default '',
  source      text not null default 'settings',
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table constraints add constraint constraints_kind_ck
    check (kind in ('work-hours', 'protected', 'no-meetings', 'leave-by', 'buffer', 'hard-bound'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table constraints add constraint constraints_source_ck
    check (source in ('onboarding', 'settings', 'nl'));
exception when duplicate_object then null; end $$;

create index if not exists constraints_user_idx on constraints (user_id, created_at);


-- ── connected_accounts ──────────────────────────────────────────────────────
-- The multi-Gmail core. N mailboxes/calendars per user; the app never "switches
-- mailbox", all accounts always merge and are filtered client-side by
-- accent-tinted chips (PLAN.md §3.1).
--
-- OAuth tokens are deliberately NOT here. PLAN.md §5 requires AES-256-GCM at
-- rest with a hand-rolled per-provider handler; inventing the column shape
-- without the encryption is how tokens end up in plaintext. See
-- docs/db/calendar-schema.md §8.
create table if not exists connected_accounts (
  id             text primary key,
  user_id        text not null references users (id) on delete cascade,
  provider       text not null,
  kind           text not null,
  auth_type      text not null,
  email          text not null,
  display_name   text not null default '',
  -- Auto-assigned in connect order: lime → periwinkle → ember → amber → white.
  accent_color   text not null default 'lime',
  is_primary     boolean not null default false,
  "order"        int not null default 0,
  scopes         text[] not null default '{}',
  sync_status    text not null default 'idle',
  sync_error     text,
  last_sync_at   timestamptz,
  message_count  int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

do $$ begin
  alter table connected_accounts add constraint connected_accounts_provider_ck
    check (provider in ('google', 'microsoft', 'imap', 'todoist', 'google-tasks', 'notion'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table connected_accounts add constraint connected_accounts_kind_ck
    check (kind in ('mail', 'calendar', 'tasks', 'mail+calendar'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table connected_accounts add constraint connected_accounts_auth_ck
    check (auth_type in ('oauth', 'password'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table connected_accounts add constraint connected_accounts_sync_ck
    check (sync_status in ('idle', 'syncing', 'live', 'error', 'paused'));
exception when duplicate_object then null; end $$;

-- The list is always rendered in connect order.
create index if not exists connected_accounts_user_idx
  on connected_accounts (user_id, "order");

-- The same mailbox twice is always a mistake.
create unique index if not exists connected_accounts_unique_idx
  on connected_accounts (user_id, provider, lower(email));

drop trigger if exists connected_accounts_updated_at on connected_accounts;
create trigger connected_accounts_updated_at before update on connected_accounts
  for each row execute function set_updated_at();


-- ── calendars ───────────────────────────────────────────────────────────────
-- ConnectedAccount 1—N Calendar. read_enabled / write_enabled are per-calendar
-- switches; is_write_target is the SINGLE calendar new events are created on
-- (Settings > Calendars, one radio per account).
create table if not exists calendars (
  id                    text primary key,
  user_id               text not null references users (id) on delete cascade,
  connected_account_id  text not null references connected_accounts (id) on delete cascade,
  provider_calendar_id  text not null,          -- Google's calendarId, e.g. 'primary'
  name                  text not null,
  color                 text not null default 'lime',
  is_primary            boolean not null default false,
  read_enabled          boolean not null default true,
  write_enabled         boolean not null default false,
  is_write_target       boolean not null default false,
  timezone              text not null default 'Europe/Berlin',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One row per remote calendar per account.
create unique index if not exists calendars_provider_idx
  on calendars (connected_account_id, provider_calendar_id);

create index if not exists calendars_user_idx on calendars (user_id);

-- At most one write target per user: new events have exactly one destination.
create unique index if not exists calendars_write_target_idx
  on calendars (user_id) where is_write_target;

drop trigger if exists calendars_updated_at on calendars;
create trigger calendars_updated_at before update on calendars
  for each row execute function set_updated_at();
-- find_time — 002 projects + tasks.
--
-- Replaces the `projects` / `tasks` Maps in src/server/store/db.ts.
-- See docs/db/data-layer.md §6.
--
-- tasks.scheduled_event_id -> calendar_events(id) is a circular FK and is
-- added in db/006_cross_refs.sql, after calendar_events exists.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/002_projects_tasks.sql

-- ── projects ────────────────────────────────────────────────────────────────
-- Project has no updatedAt in the domain type, so no set_updated_at trigger.
create table if not exists projects (
  id           text primary key,
  user_id      text not null references users (id) on delete cascade,
  name         text not null,
  color        text not null default 'lime',
  description  text,
  status       text not null default 'active',
  target_date  timestamptz,
  "order"      int  not null default 0,
  created_at   timestamptz not null default now()
);

do $$ begin
  alter table projects add constraint projects_status_ck
    check (status in ('active', 'paused', 'done'));
exception when duplicate_object then null; end $$;

create index if not exists projects_user_idx on projects (user_id, "order");


-- ── tasks ───────────────────────────────────────────────────────────────────
-- The scheduler's task input. dueBy/preferBy are ISO strings in the domain
-- type; stored as timestamptz, mapped back to ISO across src/server/db/rows.ts.
create table if not exists tasks (
  id                    text primary key,
  user_id               text not null references users (id) on delete cascade,
  project_id            text references projects (id) on delete set null,
  title                 text not null,
  notes                 text,
  status                text not null default 'backlog',
  duration_min          int  not null default 30,
  duration_is_estimate  boolean not null default true,
  actual_duration_min   int,
  due_by                timestamptz,
  prefer_by             timestamptz,
  priority              text not null default 'medium',
  requires_focus        boolean not null default false,
  preferred_window      text,                       -- null = no preference
  splittable            boolean not null default false,
  min_chunk_min         int  not null default 30,
  category              text not null default 'other',
  labels                text[] not null default '{}',
  scheduled_event_id    text,                       -- FK added in 006 (circular)
  source_type           text not null default 'native',
  source_account_id     text references connected_accounts (id) on delete set null,
  source_external_id    text,
  source_signal_id      text,                       -- FK added in 006 (email_signals)
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

do $$ begin
  alter table tasks add constraint tasks_status_ck
    check (status in ('backlog', 'scheduled', 'in-progress', 'done', 'archived'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint tasks_priority_ck
    check (priority in ('low', 'medium', 'high'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint tasks_preferred_window_ck
    check (preferred_window in ('morning', 'afternoon', 'evening'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint tasks_source_type_ck
    check (source_type in ('native', 'signal', 'todoist', 'google-tasks', 'notion', 'import'));
exception when duplicate_object then null; end $$;

create index if not exists tasks_user_idx on tasks (user_id, status);
create index if not exists tasks_project_idx on tasks (project_id) where project_id is not null;

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();
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
-- find_time — 004 AI conversation + planning.
--
-- Replaces the `aiSessions` / `aiMessages` / `planDrafts` / `aiSuggestions`
-- Maps in src/server/store/db.ts. See docs/db/data-layer.md §6.
--
-- ai_suggestions.event_id / .signal_id are circular / forward FKs, added in
-- db/006_cross_refs.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/004_ai.sql

-- ── ai_sessions ─────────────────────────────────────────────────────────────
-- active_draft_batch_id -> plan_drafts(id) is added at the end of this file,
-- once plan_drafts exists (the two reference each other).
create table if not exists ai_sessions (
  id                    text primary key,
  user_id               text not null references users (id) on delete cascade,
  title                 text not null default '',
  started_at            timestamptz not null default now(),
  last_message_at       timestamptz not null default now(),
  active_draft_batch_id text
);

create index if not exists ai_sessions_user_idx on ai_sessions (user_id, last_message_at);


-- ── ai_messages ─────────────────────────────────────────────────────────────
-- `parsed` is the ScheduleRequest SSR — a versioned blob, never queried by
-- contents, so jsonb.
create table if not exists ai_messages (
  id              text primary key,
  session_id      text not null references ai_sessions (id) on delete cascade,
  role            text not null,
  content         text not null default '',
  created_at      timestamptz not null default now(),
  kind            text not null default 'text',
  parsed          jsonb,
  ambiguities     jsonb not null default '[]'::jsonb,
  suggestion_ids  text[] not null default '{}'
);

do $$ begin
  alter table ai_messages add constraint ai_messages_role_ck
    check (role in ('user', 'assistant', 'system'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_messages add constraint ai_messages_kind_ck
    check (kind in ('text', 'plan', 'question', 'answer', 'conflict'));
exception when duplicate_object then null; end $$;

create index if not exists ai_messages_session_idx on ai_messages (session_id, created_at);


-- ── plan_drafts ─────────────────────────────────────────────────────────────
-- A batch of proposed changes with one atomic apply/undo. `conflicts` is
-- ConflictReport[] — jsonb.
create table if not exists plan_drafts (
  id             text primary key,
  user_id        text not null references users (id) on delete cascade,
  session_id     text references ai_sessions (id) on delete set null,
  created_at     timestamptz not null default now(),
  horizon_start  timestamptz not null,
  horizon_end    timestamptz not null,
  status         text not null default 'pending',
  change_count   int  not null default 0,
  conflict_count int  not null default 0,
  applied_at     timestamptz,
  undone_at      timestamptz,
  conflicts      jsonb not null default '[]'::jsonb
);

do $$ begin
  alter table plan_drafts add constraint plan_drafts_status_ck
    check (status in ('pending', 'applied', 'discarded', 'superseded'));
exception when duplicate_object then null; end $$;

create index if not exists plan_drafts_user_idx on plan_drafts (user_id, created_at);

-- The deferred back-reference from ai_sessions.
do $$ begin
  alter table ai_sessions add constraint ai_sessions_active_draft_fk
    foreign key (active_draft_batch_id) references plan_drafts (id) on delete set null;
exception when duplicate_object then null; end $$;


-- ── ai_suggestions ──────────────────────────────────────────────────────────
-- One proposed change inside a draft. task_id can reference tasks now (002);
-- event_id / signal_id FKs are added in 006.
create table if not exists ai_suggestions (
  id                   text primary key,
  draft_id             text not null references plan_drafts (id) on delete cascade,
  user_id              text not null references users (id) on delete cascade,
  "index"              int  not null default 0,   -- order within the draft
  kind                 text not null,
  task_id              text references tasks (id) on delete set null,
  event_id             text,                      -- FK added in 006 (calendar_events)
  signal_id            text,                      -- FK added in 006 (email_signals)
  title                text not null default '',
  proposed_start       timestamptz not null,
  proposed_end         timestamptz not null,
  previous_start       timestamptz,
  previous_end         timestamptz,
  rationale            text not null default '',
  confidence           double precision not null default 0,
  score                double precision not null default 0,
  displaced_focus      boolean not null default false,
  displaced_event_ids  text[] not null default '{}',
  status               text not null default 'pending'
);

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_kind_ck
    check (kind in ('create', 'move', 'resize', 'delete', 'protect'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_status_ck
    check (status in ('pending', 'accepted', 'edited', 'rejected', 'applied'));
exception when duplicate_object then null; end $$;

create index if not exists ai_suggestions_draft_idx on ai_suggestions (draft_id, "index");
-- find_time — 005 email signals + notifications.
--
-- Replaces the `signals` / `notifications` Maps in src/server/store/db.ts.
-- See docs/db/data-layer.md §6. Table is `email_signals` to match the
-- EmailSignal domain type; the API route stays /api/signals.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/005_signals_notifications.sql

-- ── email_signals ───────────────────────────────────────────────────────────
-- A commitment/deadline/etc. extracted from an email. created_task_id /
-- created_event_id point at what a user made from it — both targets exist by
-- now (002 / 003), so the FKs are inline.
create table if not exists email_signals (
  id                     text primary key,
  user_id                text not null references users (id) on delete cascade,
  connected_account_id   text not null references connected_accounts (id) on delete cascade,
  message_id             text not null,
  thread_id              text not null,
  "from"                 text not null default '',
  from_name              text not null default '',
  subject                text not null default '',
  received_at            timestamptz not null,
  snippet                text not null default '',
  source_quote           text not null default '',
  kind                   text not null,
  extracted_title        text not null default '',
  suggested_duration_min int,
  due_by                 timestamptz,
  confidence             double precision not null default 0,
  status                 text not null default 'new',
  created_task_id        text references tasks (id) on delete set null,
  created_event_id       text references calendar_events (id) on delete set null,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now()
);

do $$ begin
  alter table email_signals add constraint email_signals_kind_ck
    check (kind in ('commitment', 'deadline', 'meeting-request', 'task', 'follow-up', 'travel', 'ignore'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table email_signals add constraint email_signals_status_ck
    check (status in ('new', 'accepted', 'converted', 'ignored', 'snoozed'));
exception when duplicate_object then null; end $$;

create index if not exists email_signals_user_idx on email_signals (user_id, created_at);

-- The same email surfaces one signal per account, not one per sync.
create unique index if not exists email_signals_message_idx
  on email_signals (connected_account_id, message_id);

-- Now that email_signals exists, close the two deferred references to it.
do $$ begin
  alter table tasks add constraint tasks_source_signal_fk
    foreign key (source_signal_id) references email_signals (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_signal_fk
    foreign key (signal_id) references email_signals (id) on delete set null;
exception when duplicate_object then null; end $$;


-- ── notifications ───────────────────────────────────────────────────────────
-- type reuses NotificationType verbatim; event.reminder is what the reminder
-- worker (PLAN.md P12) inserts for in-app delivery.
create table if not exists notifications (
  id            text primary key,
  user_id       text not null references users (id) on delete cascade,
  type          text not null,
  title         text not null default '',
  body          text not null default '',
  read          boolean not null default false,
  read_at       timestamptz,
  action_label  text,
  action_href   text,
  created_at    timestamptz not null default now()
);

do $$ begin
  alter table notifications add constraint notifications_type_ck
    check (type in ('event.reminder', 'plan.ready', 'plan.applied', 'conflict.detected',
                    'task.overdue', 'signal.new', 'account.error', 'focus.complete'));
exception when duplicate_object then null; end $$;

create index if not exists notifications_user_idx on notifications (user_id, created_at);
create index if not exists notifications_unread_idx
  on notifications (user_id) where not read;
-- find_time — 006 circular foreign keys, added last.
--
-- These four (five, counting the two halves of each cycle) references form
-- cycles, so the tables are created without them in 002-005 and the
-- back-references are bolted on here. See docs/db/data-layer.md §6.
--
--   tasks.scheduled_event_id      <-> calendar_events.task_id
--   calendar_events.draft_batch_id -> plan_drafts.id
--   calendar_events.suggestion_id  -> ai_suggestions.id  (<-> ai_suggestions.event_id)
--
-- Idempotent: re-running is a no-op.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/006_cross_refs.sql

do $$ begin
  alter table tasks add constraint tasks_scheduled_event_fk
    foreign key (scheduled_event_id) references calendar_events (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_task_fk
    foreign key (task_id) references tasks (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_draft_batch_fk
    foreign key (draft_batch_id) references plan_drafts (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_suggestion_fk
    foreign key (suggestion_id) references ai_suggestions (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_event_fk
    foreign key (event_id) references calendar_events (id) on delete set null;
exception when duplicate_object then null; end $$;
-- find_time — 007 Expo calendar compatibility.
--
-- The React Native calendar (src/calendar/) carries `project` as free text
-- ('Mobile launch'), not a projects(id) FK — it has no project entities yet.
-- One nullable column holds that label until real projects arrive, at which
-- point it migrates to project_id.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/007_expo_calendar_compat.sql

alter table calendar_events add column if not exists project_label text;
-- find_time — 001 waitlist: landing-page email capture (db/001_waitlist.sql).
-- Folded in here so a fresh DB gets it; the standalone file still applies too.
-- Requires PostgreSQL 13+ (gen_random_uuid) and the citext extension.

create extension if not exists citext;

create table if not exists waitlist (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  confirm_token uuid default gen_random_uuid(),
  confirmed_at  timestamptz,
  source        text,           -- 'waitlist_section' | 'waitlist_page' | 'hero' | ...
  ip_hash       text,           -- salted sha256; never a raw IP (src/server/rate-limit.ts)
  name          text,           -- optional, from the /waitlist page (db/014)
  reason        text,           -- optional "why", from the /waitlist page (db/014)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists waitlist_status_idx  on waitlist (status);
create index if not exists waitlist_created_idx on waitlist (created_at desc);
