-- find_time — 006 circular foreign keys, added last.
--
-- These four (five, counting the two halves of each cycle) references form
-- cycles, so the tables are created without them in 002-005 and the
-- back-references are bolted on here. See docs/db/data-layer.md §6.
--
--   tasks.scheduled_event_id      <-> calendar_events.task_id
--   calendar_events.draft_batch_id -> plan_drafts.id
--   calendar_events.suggestion_id  -> ai_suggestions.id  (<-> ai_suggestions.event_id)
--
-- Idempotent: re-running is a no-op.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/006_cross_refs.sql

do $$ begin
  alter table tasks add constraint tasks_scheduled_event_fk
    foreign key (scheduled_event_id) references calendar_events (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_task_fk
    foreign key (task_id) references tasks (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_draft_batch_fk
    foreign key (draft_batch_id) references plan_drafts (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table calendar_events add constraint calendar_events_suggestion_fk
    foreign key (suggestion_id) references ai_suggestions (id) on delete set null;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_event_fk
    foreign key (event_id) references calendar_events (id) on delete set null;
exception when duplicate_object then null; end $$;
