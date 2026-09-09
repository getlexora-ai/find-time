-- find_time — 013 rate limiting for the public API routes.
--
-- Fixed-window counters + a block log. Keyed by salted-hashed IP (waitlist) or
-- Clerk user id (ai/find-time, google connect). See src/server/rate-limit.ts.
-- Idempotent; safe to re-run.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/013_rate_limits.sql

-- One row per (bucket key, window bucket). bucket_key looks like
-- "waitlist:ip:<hash>:h" or "ai-find-time:u:user_2ab:d".
create table if not exists rate_limits (
  bucket_key    text not null,
  window_start  timestamptz not null,
  count         int not null default 0,
  primary key (bucket_key, window_start)
);

create index if not exists rate_limits_window_idx on rate_limits (window_start);

-- Insert-only log, written only when a request is blocked (KPI: blocks ÷ total).
create table if not exists rate_limit_blocks (
  id          bigint generated always as identity primary key,
  route       text not null,
  bucket_key  text not null,
  created_at  timestamptz not null default now()
);

create index if not exists rate_limit_blocks_created_idx on rate_limit_blocks (created_at desc);
