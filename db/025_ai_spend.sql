-- find_time — 025 OpenAI spend per month.
--
-- One row per calendar month (UTC, 'YYYY-MM'). src/server/ai/rewrite.ts adds
-- each call's cost (from the token counts OpenAI reports) and skips the model
-- once the month reaches AI_BUDGET_USD (default $1): the rules then read alone.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/025_ai_spend.sql

create table if not exists ai_spend (
  month   text primary key,
  usd     numeric(12, 6) not null default 0,
  calls   int not null default 0
);
