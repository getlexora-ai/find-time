-- find_time — 004 AI conversation + planning.
--
-- Replaces the `aiSessions` / `aiMessages` / `planDrafts` / `aiSuggestions`
-- Maps in src/server/store/db.ts. See docs/db/data-layer.md §6.
--
-- ai_suggestions.event_id / .signal_id are circular / forward FKs, added in
-- db/006_cross_refs.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/004_ai.sql

-- ── ai_sessions ─────────────────────────────────────────────────────────────
-- active_draft_batch_id -> plan_drafts(id) is added at the end of this file,
-- once plan_drafts exists (the two reference each other).
create table if not exists ai_sessions (
  id                    text primary key,
  user_id               text not null references users (id) on delete cascade,
  title                 text not null default '',
  started_at            timestamptz not null default now(),
  last_message_at       timestamptz not null default now(),
  active_draft_batch_id text
);

create index if not exists ai_sessions_user_idx on ai_sessions (user_id, last_message_at);


-- ── ai_messages ─────────────────────────────────────────────────────────────
-- `parsed` is the ScheduleRequest SSR — a versioned blob, never queried by
-- contents, so jsonb.
create table if not exists ai_messages (
  id              text primary key,
  session_id      text not null references ai_sessions (id) on delete cascade,
  role            text not null,
  content         text not null default '',
  created_at      timestamptz not null default now(),
  kind            text not null default 'text',
  parsed          jsonb,
  ambiguities     jsonb not null default '[]'::jsonb,
  suggestion_ids  text[] not null default '{}'
);

do $$ begin
  alter table ai_messages add constraint ai_messages_role_ck
    check (role in ('user', 'assistant', 'system'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_messages add constraint ai_messages_kind_ck
    check (kind in ('text', 'plan', 'question', 'answer', 'conflict'));
exception when duplicate_object then null; end $$;

create index if not exists ai_messages_session_idx on ai_messages (session_id, created_at);


-- ── plan_drafts ─────────────────────────────────────────────────────────────
-- A batch of proposed changes with one atomic apply/undo. `conflicts` is
-- ConflictReport[] — jsonb.
create table if not exists plan_drafts (
  id             text primary key,
  user_id        text not null references users (id) on delete cascade,
  session_id     text references ai_sessions (id) on delete set null,
  created_at     timestamptz not null default now(),
  horizon_start  timestamptz not null,
  horizon_end    timestamptz not null,
  status         text not null default 'pending',
  change_count   int  not null default 0,
  conflict_count int  not null default 0,
  applied_at     timestamptz,
  undone_at      timestamptz,
  conflicts      jsonb not null default '[]'::jsonb
);

do $$ begin
  alter table plan_drafts add constraint plan_drafts_status_ck
    check (status in ('pending', 'applied', 'discarded', 'superseded'));
exception when duplicate_object then null; end $$;

create index if not exists plan_drafts_user_idx on plan_drafts (user_id, created_at);

-- The deferred back-reference from ai_sessions.
do $$ begin
  alter table ai_sessions add constraint ai_sessions_active_draft_fk
    foreign key (active_draft_batch_id) references plan_drafts (id) on delete set null;
exception when duplicate_object then null; end $$;


-- ── ai_suggestions ──────────────────────────────────────────────────────────
-- One proposed change inside a draft. task_id can reference tasks now (002);
-- event_id / signal_id FKs are added in 006.
create table if not exists ai_suggestions (
  id                   text primary key,
  draft_id             text not null references plan_drafts (id) on delete cascade,
  user_id              text not null references users (id) on delete cascade,
  "index"              int  not null default 0,   -- order within the draft
  kind                 text not null,
  task_id              text references tasks (id) on delete set null,
  event_id             text,                      -- FK added in 006 (calendar_events)
  signal_id            text,                      -- FK added in 006 (email_signals)
  title                text not null default '',
  proposed_start       timestamptz not null,
  proposed_end         timestamptz not null,
  previous_start       timestamptz,
  previous_end         timestamptz,
  rationale            text not null default '',
  confidence           double precision not null default 0,
  score                double precision not null default 0,
  displaced_focus      boolean not null default false,
  displaced_event_ids  text[] not null default '{}',
  status               text not null default 'pending'
);

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_kind_ck
    check (kind in ('create', 'move', 'resize', 'delete', 'protect'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_status_ck
    check (status in ('pending', 'accepted', 'edited', 'rejected', 'applied'));
exception when duplicate_object then null; end $$;

create index if not exists ai_suggestions_draft_idx on ai_suggestions (draft_id, "index");
