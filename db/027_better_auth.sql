-- find_time — 027 Better Auth.
--
-- Better Auth replaces Clerk as the identity provider
-- (src/server/auth/auth.ts). It runs inside our own API and keeps its state
-- here, in four `auth_*` tables (generated from the config with Better Auth's
-- getMigrations, then made idempotent). Column names are Better Auth's own
-- camelCase, so they are quoted.
--
--   auth_user          one row per person: name, email, verified, `onboarded`
--   auth_session       live sign-ins (the `ft.session_token` cookie)
--   auth_account       how they sign in: 'credential' (password hash) or 'google'
--   auth_verification  short-lived 6-digit email codes
--
-- `users` stays the thin row every calendar table FKs to, keyed by the same
-- id (`auth_user.id`); src/server/auth/user.ts inserts it on first request with
-- the id alone, so `email` gets a default.
--
-- `waitlist.invited_at` is the beta gate: with BETA_INVITE_ONLY=1 only invited
-- emails can create an account (scripts/invite-beta.mjs sets it).
--
-- Existing Clerk users (`users.id` = 'user_…') are not migrated: they sign up
-- again. Their old rows are left alone.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/027_better_auth.sql

create table if not exists "auth_user" (
  "id"            text not null primary key,
  "name"          text not null,
  "email"         text not null unique,
  "emailVerified" boolean not null,
  "image"         text,
  "createdAt"     timestamptz default current_timestamp not null,
  "updatedAt"     timestamptz default current_timestamp not null,
  "onboarded"     boolean not null default false
);

create table if not exists "auth_session" (
  "id"        text not null primary key,
  "expiresAt" timestamptz not null,
  "token"     text not null unique,
  "createdAt" timestamptz default current_timestamp not null,
  "updatedAt" timestamptz not null,
  "ipAddress" text,
  "userAgent" text,
  "userId"    text not null references "auth_user" ("id") on delete cascade
);

create table if not exists "auth_account" (
  "id"                    text not null primary key,
  "accountId"             text not null,
  "providerId"            text not null,
  "userId"                text not null references "auth_user" ("id") on delete cascade,
  "accessToken"           text,
  "refreshToken"          text,
  "idToken"               text,
  "accessTokenExpiresAt"  timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  "scope"                 text,
  "password"              text,
  "createdAt"             timestamptz default current_timestamp not null,
  "updatedAt"             timestamptz not null
);

create table if not exists "auth_verification" (
  "id"         text not null primary key,
  "identifier" text not null,
  "value"      text not null,
  "expiresAt"  timestamptz not null,
  "createdAt"  timestamptz default current_timestamp not null,
  "updatedAt"  timestamptz default current_timestamp not null
);

create index if not exists "auth_session_userId_idx" on "auth_session" ("userId");
create index if not exists "auth_account_userId_idx" on "auth_account" ("userId");
create index if not exists "auth_verification_identifier_idx" on "auth_verification" ("identifier");

alter table users alter column email set default '';

alter table waitlist add column if not exists invited_at timestamptz;
