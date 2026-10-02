-- find_time — 020 planning engine v2 (docs/planning-agent-plan.md §8).
--
-- What "plan my week" needs beyond deadlines:
--   tasks.not_before        a task may not start before this instant ("not
--                           before the 20th", or a postpone: "push the report a week")
--   habits                  "gym 3× a week": a weekly target, planned ahead per
--                           week instead of one task rolling forward
--   calendar_events.habit_id / ai_suggestions.habit_id
--                           a habit's sessions, like task_id for tasks
--   calendar_events.item_type 'away'
--                           time away as its own kind of block, so the planner
--                           can say "you're away" instead of "something is booked"
--   scheduler_profiles.travel_min
--                           minutes kept free before and after an in-person event
--                           (one with a location and no video link); 0 = off
--
-- Idempotent. Apply BEFORE deploying the code that reads these columns:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/020_planning_v2.sql

-- ── tasks ───────────────────────────────────────────────────────────────────
alter table tasks add column if not exists not_before timestamptz;

-- ── habits ──────────────────────────────────────────────────────────────────
create table if not exists habits (
  id                text primary key,
  user_id           text not null references users (id) on delete cascade,
  title             text not null,
  category          text not null default 'personal',
  duration_min      int  not null default 60,
  per_week          int  not null default 3,
  preferred_window  text,                         -- morning | afternoon | evening | null
  active            boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists habits_user_idx on habits (user_id) where active;

do $$ begin
  alter table habits add constraint habits_per_week_ck check (per_week between 1 and 7);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table habits add constraint habits_duration_ck check (duration_min between 5 and 480);
exception when duplicate_object then null; end $$;

do $$ begin
  alter table habits add constraint habits_window_ck
    check (preferred_window is null or preferred_window in ('morning', 'afternoon', 'evening'));
exception when duplicate_object then null; end $$;

-- ── calendar_events / ai_suggestions ────────────────────────────────────────
alter table calendar_events add column if not exists habit_id text references habits (id) on delete set null;
create index if not exists calendar_events_habit_idx on calendar_events (habit_id) where habit_id is not null;

alter table ai_suggestions add column if not exists habit_id text references habits (id) on delete set null;

do $$ begin
  alter table calendar_events drop constraint if exists calendar_events_item_type_ck;
  alter table calendar_events add constraint calendar_events_item_type_ck
    check (item_type in ('event', 'task', 'deepwork', 'break', 'away'));
exception when duplicate_object then null; end $$;

-- ── scheduler_profiles ──────────────────────────────────────────────────────
alter table scheduler_profiles add column if not exists travel_min int not null default 0;

do $$ begin
  alter table scheduler_profiles add constraint scheduler_profiles_travel_ck check (travel_min between 0 and 180);
exception when duplicate_object then null; end $$;
