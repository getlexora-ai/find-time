-- find_time — 002 projects + tasks.
--
-- Replaces the `projects` / `tasks` Maps in src/server/store/db.ts.
-- See docs/db/data-layer.md §6.
--
-- tasks.scheduled_event_id -> calendar_events(id) is a circular FK and is
-- added in db/006_cross_refs.sql, after calendar_events exists.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/002_projects_tasks.sql

-- ── projects ────────────────────────────────────────────────────────────────
-- Project has no updatedAt in the domain type, so no set_updated_at trigger.
create table if not exists projects (
  id           text primary key,
  user_id      text not null references users (id) on delete cascade,
  name         text not null,
  color        text not null default 'lime',
  description  text,
  status       text not null default 'active',
  target_date  timestamptz,
  "order"      int  not null default 0,
  created_at   timestamptz not null default now()
);

do $$ begin
  alter table projects add constraint projects_status_ck
    check (status in ('active', 'paused', 'done'));
exception when duplicate_object then null; end $$;

create index if not exists projects_user_idx on projects (user_id, "order");


-- ── tasks ───────────────────────────────────────────────────────────────────
-- The scheduler's task input. dueBy/preferBy are ISO strings in the domain
-- type; stored as timestamptz, mapped back to ISO across src/server/db/rows.ts.
create table if not exists tasks (
  id                    text primary key,
  user_id               text not null references users (id) on delete cascade,
  project_id            text references projects (id) on delete set null,
  title                 text not null,
  notes                 text,
  status                text not null default 'backlog',
  duration_min          int  not null default 30,
  duration_is_estimate  boolean not null default true,
  actual_duration_min   int,
  due_by                timestamptz,
  prefer_by             timestamptz,
  priority              text not null default 'medium',
  requires_focus        boolean not null default false,
  preferred_window      text,                       -- null = no preference
  splittable            boolean not null default false,
  min_chunk_min         int  not null default 30,
  category              text not null default 'other',
  labels                text[] not null default '{}',
  scheduled_event_id    text,                       -- FK added in 006 (circular)
  source_type           text not null default 'native',
  source_account_id     text references connected_accounts (id) on delete set null,
  source_external_id    text,
  source_signal_id      text,                       -- FK added in 006 (email_signals)
  completed_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

do $$ begin
  alter table tasks add constraint tasks_status_ck
    check (status in ('backlog', 'scheduled', 'in-progress', 'done', 'archived'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint tasks_priority_ck
    check (priority in ('low', 'medium', 'high'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint tasks_preferred_window_ck
    check (preferred_window in ('morning', 'afternoon', 'evening'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table tasks add constraint tasks_source_type_ck
    check (source_type in ('native', 'signal', 'todoist', 'google-tasks', 'notion', 'import'));
exception when duplicate_object then null; end $$;

create index if not exists tasks_user_idx on tasks (user_id, status);
create index if not exists tasks_project_idx on tasks (project_id) where project_id is not null;

drop trigger if exists tasks_updated_at on tasks;
create trigger tasks_updated_at before update on tasks
  for each row execute function set_updated_at();
