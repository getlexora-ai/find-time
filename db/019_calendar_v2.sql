-- find_time — 019 calendar v2 (docs/calendar-spec.md §11).
--
-- What the calendar needs to show the truth and to be used daily:
--   calendar_events   free/busy, your RSVP, video link, attendee count, task done
--   calendar_sync_state.sync_mode   'series' (old: one master row per Google
--                     series, never expanded) → 'instances' (Google's single
--                     occurrences, so moved and cancelled ones are right)
--   scheduler_profiles   the calendar's own settings, so they follow you across
--                     devices: your hours, first day of week, 24h clock, weekly
--                     targets, and whether focus blocks are written to Google.
--
-- Idempotent. Apply BEFORE deploying the code that reads these columns:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/019_calendar_v2.sql

-- ── calendar_events ─────────────────────────────────────────────────────────
alter table calendar_events add column if not exists transparency text not null default 'opaque';
alter table calendar_events add column if not exists response_status text;
alter table calendar_events add column if not exists conference_url text;
alter table calendar_events add column if not exists attendee_count int;
alter table calendar_events add column if not exists done_at timestamptz;

do $$ begin
  alter table calendar_events add constraint calendar_events_transparency_ck
    check (transparency in ('opaque', 'transparent'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_response_status_ck
    check (response_status is null or response_status in ('needsAction', 'declined', 'tentative', 'accepted'));
exception when duplicate_object then null; end $$;

-- ── calendar_sync_state ────────────────────────────────────────────────────
-- Existing rows stay 'series'; the next sync of each calendar notices, does one
-- full re-sync in 'instances' mode and removes the old unexpanded masters.
alter table calendar_sync_state add column if not exists sync_mode text not null default 'series';

-- ── scheduler_profiles: calendar settings ─────────────────────────────────
alter table scheduler_profiles add column if not exists day_window jsonb not null default '{"start":6,"end":22}'::jsonb;
alter table scheduler_profiles add column if not exists week_start int not null default 1;      -- 1 = Monday, 0 = Sunday
alter table scheduler_profiles add column if not exists clock24 boolean not null default true;
alter table scheduler_profiles add column if not exists week_target_h numeric;                   -- null = app default
alter table scheduler_profiles add column if not exists focus_goal_h numeric;                    -- null = app default
alter table scheduler_profiles add column if not exists push_focus boolean not null default false;

do $$ begin
  alter table scheduler_profiles add constraint scheduler_profiles_week_start_ck check (week_start in (0, 1));
exception when duplicate_object then null; end $$;
