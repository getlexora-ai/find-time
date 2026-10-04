-- find_time — 028 per-user AI credits.
--
-- Plan with AI reads every typed message with the model (src/server/ai/agent.ts),
-- so spend is counted per person: each user gets AI_USER_CREDIT_USD a month
-- (src/server/ai/credits.ts). Over it, that person's messages are read by the
-- rules alone until the month turns. ai_spend (025) stays the global ceiling.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/028_ai_user_credits.sql

create table if not exists ai_user_spend (
  user_id text not null references users (id) on delete cascade,
  month   text not null,             -- 'YYYY-MM'
  usd     numeric(12, 6) not null default 0,
  calls   integer not null default 0,
  primary key (user_id, month)
);
