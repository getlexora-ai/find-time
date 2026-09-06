-- Waitlist — landing-page email capture (plan §6.3, trimmed to what the form sends).
-- NOT YET APPLIED anywhere: the running endpoint uses the in-memory store in
-- src/server/waitlist-store.ts. Apply this once a host + Postgres are chosen
-- (plan §10 Q1), then swap the three functions in waitlist-store.ts for queries.
--
-- Requires PostgreSQL 13+ (gen_random_uuid) and the citext extension.

create extension if not exists citext;

create table if not exists waitlist (
  id            uuid primary key default gen_random_uuid(),
  email         citext not null unique,
  status        text not null default 'pending'
                check (status in ('pending', 'confirmed', 'unsubscribed', 'bounced')),
  confirm_token uuid default gen_random_uuid(),
  confirmed_at  timestamptz,
  source        text,           -- 'waitlist_section' | 'hero' | 'header' | ...
  ip_hash       text,           -- salted sha256; never a raw IP (add with rate-limiting)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists waitlist_status_idx  on waitlist (status);
create index if not exists waitlist_created_idx on waitlist (created_at desc);
