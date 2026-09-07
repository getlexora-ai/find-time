-- find_time — 007 Expo calendar compatibility.
--
-- The React Native calendar (src/calendar/) carries `project` as free text
-- ('Mobile launch'), not a projects(id) FK — it has no project entities yet.
-- One nullable column holds that label until real projects arrive, at which
-- point it migrates to project_id.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/007_expo_calendar_compat.sql

alter table calendar_events add column if not exists project_label text;
