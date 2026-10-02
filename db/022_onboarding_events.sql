-- find_time — 022 onboarding drop-off events.
--
-- One row per thing a person does on /welcome (src/auth/dom/Onboarding.tsx and
-- the native screen): which step they saw, connected Google from, skipped at
-- or finished on. Written by POST /api/onboarding/event; nothing reads it in
-- the app — it is for the funnel query below.
--   step    name | calendar | week | peak | focus | done   (src/auth/onboarding.ts TRACK_STEPS)
--   action  view | connect | connected | connect_failed | skip | finish
--   client  web | native
--
-- Funnel (people who reached each step, last 30 days):
--   select step, count(distinct user_id) from onboarding_events
--    where action = 'view' and created_at > now() - interval '30 days'
--    group by step order by min(created_at);
--
-- Idempotent. Apply BEFORE deploying the code that writes it:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/022_onboarding_events.sql

create table if not exists onboarding_events (
  id          bigserial primary key,
  user_id     text not null references users (id) on delete cascade,
  step        text not null,
  action      text not null,
  client      text not null default 'web',
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table onboarding_events add constraint onboarding_events_step_ck
    check (step in ('name', 'calendar', 'week', 'peak', 'focus', 'done'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table onboarding_events add constraint onboarding_events_action_ck
    check (action in ('view', 'connect', 'connected', 'connect_failed', 'skip', 'finish'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table onboarding_events add constraint onboarding_events_client_ck
    check (client in ('web', 'native'));
exception when duplicate_object then null; end $$;

create index if not exists onboarding_events_user_idx on onboarding_events (user_id, created_at);
create index if not exists onboarding_events_step_idx on onboarding_events (step, action, created_at);
