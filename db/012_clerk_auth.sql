-- find_time — 012 Clerk auth.
--
-- Clerk is now the identity provider (src/server/auth/clerk.ts). `users` is a
-- thin mirror: `id` holds the Clerk user id (`user_...`), `email` / `name` are
-- filled lazily on first authenticated request. The homegrown email/password
-- path (db/011) is gone.
--
--   * `password_hash` is dead — drop it.
--   * the unique index on lower(email) was there to stop duplicate signups;
--     Clerk owns email uniqueness now, and a lazy upsert must never fail on a
--     transient email clash. Downgrade it to a plain (non-unique) lookup index.
--
-- Safe on a live DB (no rows yet anyway).
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/012_clerk_auth.sql

alter table users drop column if exists password_hash;

drop index if exists users_email_idx;
create index if not exists users_email_idx on users (lower(email));
