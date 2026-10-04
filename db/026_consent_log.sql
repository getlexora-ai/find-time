-- find_time — 026 cookie consent log (proof of consent, GDPR Art. 7(1)).
--
-- One row per choice made in the cookie banner / settings dialog
-- (src/consent, POST /api/consent). Holds no personal data: `consent_id` is a
-- random id generated in the browser and kept in its `ft-consent` record, so a
-- visitor can quote it to us; no IP, user id or user agent is stored.
-- Rows older than 3 years are deleted by the API on each insert.
-- Idempotent; safe to re-run. (024/025 are taken on landing-fresh.)
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/026_consent_log.sql

create table if not exists consent_log (
  id          bigint generated always as identity primary key,
  consent_id  text not null,
  version     text not null,
  method      text not null check (method in ('notice', 'accept-all', 'reject-all', 'custom', 'gpc')),
  choices     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists consent_log_consent_idx on consent_log (consent_id, created_at desc);
create index if not exists consent_log_created_idx on consent_log (created_at);
