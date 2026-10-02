-- find_time — 021 effort, habit minimums, hard-work strategy.
--
-- Borrowed from the model in C-Coretex/personalized-schedule-optimizer-benchmark
-- (difficulty capacity per day, Cluster/Even for difficult tasks, min/opt
-- repetition counts); planned by src/server/ai/plan-week.ts.
--   tasks.effort                  light | normal | hard — how much of the day's
--                                 budget (scheduler_profiles.max_daily_focus_min) a minute uses
--   habits.min_per_week           the fewest sessions that still count; null = per_week.
--                                 Minimums are placed before tasks, extras after.
--   scheduler_profiles.hard_work  spread | cluster — hard tasks across the week, or together
--
-- Idempotent. Requires 020. Apply BEFORE deploying the code that reads these columns:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/021_effort_and_minimums.sql

alter table tasks add column if not exists effort text not null default 'normal';
do $$ begin
  alter table tasks add constraint tasks_effort_ck check (effort in ('light', 'normal', 'hard'));
exception when duplicate_object then null; end $$;

alter table habits add column if not exists min_per_week int;
do $$ begin
  alter table habits add constraint habits_min_per_week_ck
    check (min_per_week is null or (min_per_week between 1 and 7 and min_per_week <= per_week));
exception when duplicate_object then null; end $$;

alter table scheduler_profiles add column if not exists hard_work text not null default 'spread';
do $$ begin
  alter table scheduler_profiles add constraint scheduler_profiles_hard_work_ck check (hard_work in ('spread', 'cluster'));
exception when duplicate_object then null; end $$;
