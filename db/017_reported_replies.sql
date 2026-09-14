-- find_time — 017 reported replies.
--
-- Proposal cards already carry their own correction path ("Not this" + a
-- reason). What had none is everything else the agent says: a reply that
-- misread the request, ignored a stated rule, claimed the calendar was free
-- when it wasn't, or was simply unhelpful. Those are failures of the model
-- turn, not of a slot, and until now the only record of them was the user
-- closing the panel.
--
-- A report is a correction like any other, so it lands in `ai_corrections`
-- (016) with `source = 'report'` and goes through the same review fields —
-- `fault`, `label_status`, `split` — rather than a parallel table with its own
-- half-built review story. It references the conversation by id only; the
-- reply text already lives in `ai_messages` and is not copied.
--
--   kind / reason_code  the chip the user picked (Track A)
--   reason_note         their own words, ≤120 chars (Track B — dropped at 'anon')
--   turn_id             the model call that produced the reply
--   before_state        {sessionId, messageId, messageKind}
--
-- Requires: 016_training_capture.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/017_reported_replies.sql
--
-- Review queue:
--   select c.created_at, c.reason_code, c.reason_note, m.content, t.model_id, t.prompt_version
--     from ai_corrections c
--     join ai_messages m on m.id = c.before_state->>'messageId'
--     left join ai_turns t on t.id = c.turn_id
--    where c.source = 'report' and c.label_status = 'unreviewed'
--    order by c.created_at desc;


do $$ begin
  alter table ai_corrections drop constraint if exists ai_corrections_source_ck;
  alter table ai_corrections add constraint ai_corrections_source_ck
    check (source in ('block', 'chat', 'rule', 'preference', 'report'));
exception when duplicate_object then null; end $$;

-- One report per reply per user, looked up by message id on every report and
-- on every history load.
create index if not exists ai_corrections_report_msg_idx
  on ai_corrections (user_id, (before_state->>'messageId'))
  where source = 'report';
