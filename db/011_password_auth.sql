-- find_time — 011 email/password auth.
--
-- Google sign-in (db/010_oauth_tokens.sql + src/server/google/oauth.ts) was the
-- only way into the app. Beta testers need a no-Google path, so `users` grows an
-- optional password hash. Google-only users keep password_hash null; one row can
-- hold both (set a password later, or connect Google to a password account — the
-- user id does not change).
--
-- Hash format (src/server/auth/password.ts):
--   scrypt$<N>$<r>$<p>$<salt-base64>$<hash-base64>
--
-- Lookups + duplicate prevention ride on the existing
--   create unique index users_email_idx on users (lower(email))
-- from db/001_core.sql — nothing new needed here.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/011_password_auth.sql

alter table users add column if not exists password_hash text;
