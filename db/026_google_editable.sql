-- find_time — 026 imported events you may edit from Find Time.
--
-- provider_editable is set by sync (src/server/google/map.ts): true only for a
-- timed, one-off, ordinary event you organise with no other guests. Those can be
-- moved, resized and deleted from the grid; the change goes to Google first
-- (src/server/google/edit.ts). Meetings with guests, other people's events and
-- repeating events stay read-only.
--
-- Clearing the sync tokens makes the next sync a full one, so rows synced before
-- this column existed get their flag.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/026_google_editable.sql

alter table calendar_events add column if not exists provider_editable boolean not null default false;

update calendar_sync_state set sync_token = null;
