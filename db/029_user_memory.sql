-- find_time — 029 what Plan with AI knows about you, in words.
--
-- Two kinds, both read on every message (src/server/ai/agent.ts) and shown on
-- the "About you" page (src/calendar/components/AboutYou.tsx):
--   instructions  what you wrote yourself, one per user ("I work part time and
--                 my shifts change weekly. Keep evenings for family.")
--   fact          short things learned from chats, saved by the AI or added by
--                 you ("Works part time, 5 days, about 25h a week")
--
-- Only words the user typed. Never Google event content: a fact is scrubbed of
-- imported titles before it is saved (scrub.ts).
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/029_user_memory.sql

create table if not exists user_memory (
  id          text primary key,
  user_id     text not null references users (id) on delete cascade,
  kind        text not null check (kind in ('instructions', 'fact')),
  body        text not null check (char_length(body) between 1 and 2000),
  source      text not null default 'user' check (source in ('user', 'ai')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index if not exists user_memory_one_instructions on user_memory (user_id) where kind = 'instructions';
create index if not exists user_memory_user_idx on user_memory (user_id, kind, created_at);
