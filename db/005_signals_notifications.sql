-- find_time — 005 email signals + notifications.
--
-- Replaces the `signals` / `notifications` Maps in src/server/store/db.ts.
-- See docs/db/data-layer.md §6. Table is `email_signals` to match the
-- EmailSignal domain type; the API route stays /api/signals.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/005_signals_notifications.sql

-- ── email_signals ───────────────────────────────────────────────────────────
-- A commitment/deadline/etc. extracted from an email. created_task_id /
-- created_event_id point at what a user made from it — both targets exist by
-- now (002 / 003), so the FKs are inline.
create table if not exists email_signals (
  id                     text primary key,
  user_id                text not null references users (id) on delete cascade,
  connected_account_id   text not null references connected_accounts (id) on delete cascade,
  message_id             text not null,
  thread_id              text not null,
  "from"                 text not null default '',
  from_name              text not null default '',
  subject                text not null default '',
  received_at            timestamptz not null,
  snippet                text not null default '',
  source_quote           text not null default '',
  kind                   text not null,
  extracted_title        text not null default '',
  suggested_duration_min int,
  due_by                 timestamptz,
  confidence             double precision not null default 0,
  status                 text not null default 'new',
  created_task_id        text references tasks (id) on delete set null,
  created_event_id       text references calendar_events (id) on delete set null,
  reviewed_at            timestamptz,
  created_at             timestamptz not null default now()
);

do $$ begin
  alter table email_signals add constraint email_signals_kind_ck
    check (kind in ('commitment', 'deadline', 'meeting-request', 'task', 'follow-up', 'travel', 'ignore'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table email_signals add constraint email_signals_status_ck
    check (status in ('new', 'accepted', 'converted', 'ignored', 'snoozed'));
exception when duplicate_object then null; end $$;

create index if not exists email_signals_user_idx on email_signals (user_id, created_at);

-- The same email surfaces one signal per account, not one per sync.
create unique index if not exists email_signals_message_idx
  on email_signals (connected_account_id, message_id);

-- Now that email_signals exists, close the two deferred references to it.
do $$ begin
  alter table tasks add constraint tasks_source_signal_fk
    foreign key (source_signal_id) references email_signals (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_signal_fk
    foreign key (signal_id) references email_signals (id) on delete set null;
exception when duplicate_object then null; end $$;


-- ── notifications ───────────────────────────────────────────────────────────
-- type reuses NotificationType verbatim; event.reminder is what the reminder
-- worker (PLAN.md P12) inserts for in-app delivery.
create table if not exists notifications (
  id            text primary key,
  user_id       text not null references users (id) on delete cascade,
  type          text not null,
  title         text not null default '',
  body          text not null default '',
  read          boolean not null default false,
  read_at       timestamptz,
  action_label  text,
  action_href   text,
  created_at    timestamptz not null default now()
);

do $$ begin
  alter table notifications add constraint notifications_type_ck
    check (type in ('event.reminder', 'plan.ready', 'plan.applied', 'conflict.detected',
                    'task.overdue', 'signal.new', 'account.error', 'focus.complete'));
exception when duplicate_object then null; end $$;

create index if not exists notifications_user_idx on notifications (user_id, created_at);
create index if not exists notifications_unread_idx
  on notifications (user_id) where not read;
