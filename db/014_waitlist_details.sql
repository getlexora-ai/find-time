-- find_time — 014 waitlist details: optional name + "why" free text collected on
-- the /waitlist page (src/landing/WaitlistScreen.tsx).
--
-- Both nullable — email-only signups from the landing section stay valid. Length
-- is clamped server-side (src/signup/waitlist.ts clampText), not by a check
-- constraint: an over-long paste should truncate and still save, not 500.
-- Idempotent; safe to re-run.
--
-- Apply (direct/unpooled URL) BEFORE deploying the API code that writes them:
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/014_waitlist_details.sql

alter table waitlist add column if not exists name   text;
alter table waitlist add column if not exists reason text;
