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
-- Identity only. Connected mailboxes/calendars are a SEPARATE system
-- (connected_accounts) — PLAN.md §3.1: conflating them means adding account #2
-- overwrites the session.
create table if not exists users (
  id                      text primary key,          -- "u1" for the demo user
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

create unique index if not exists users_email_idx on users (lower(email));

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
