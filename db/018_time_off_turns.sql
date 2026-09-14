-- 018 — allow `ai_turns.action = 'time_off'`.
--
-- The chat agent can now block out time away ("I'm in Copenhagen from the 17th
-- till the 22nd") with the block_time_off tool. Its turns are logged like every
-- other action; without this the insert fails the CHECK and recordTurn drops
-- the row (it never breaks the reply, but the turn goes unrecorded).
--
-- Requires: 016_training_capture.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/018_time_off_turns.sql

do $$ begin
  alter table ai_turns drop constraint if exists ai_turns_action_ck;
  alter table ai_turns add constraint ai_turns_action_ck
    check (action in ('propose', 'ask', 'record_rule', 'time_off', 'answer', 'error'));
exception when duplicate_object then null; end $$;
