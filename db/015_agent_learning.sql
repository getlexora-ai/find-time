-- find_time — 015 agent learning loop.
--
-- Turns the one-off planner into a conversational agent that learns. Three
-- things are added:
--
--   1. Outcome columns on `ai_suggestions` — what the user actually did with a
--      proposal (accepted / edited to a different slot / rejected, and WHY).
--      Without the reason a rejection is unlabelled noise: the user may have
--      disliked the hour, the day, the length, or the task may simply have
--      evaporated. See docs/ai-learning.md §2.
--   2. `learned_preferences` — soft, INFERRED preferences with an evidence
--      count. Deliberately separate from `constraints`, which holds HARD,
--      user-stated rules. A wrongly-learned hard rule is far more damaging than
--      a wrongly-learned soft weight, so inference never writes to
--      `constraints` (docs/ai-learning.md §4).
--   3. `scheduler_profiles.learning` — the online-update bookkeeping (evidence
--      counts, last update, weight version) that sits beside the existing
--      `weights` / `energy_curve` / `duration_bias` columns from 001.
--
-- Requires: 001_core.sql, 004_ai.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/015_agent_learning.sql


-- ── ai_suggestions: the outcome of a proposal ───────────────────────────────
-- `status` (from 004) says pending/accepted/edited/rejected/applied. These
-- columns say what the accepted reality was, so an edit becomes a labelled
-- pair: (proposed_start, final_start) with everything else held constant.
-- The work category the block was for. 004 stores only `kind` (create/move/…),
-- but almost every learned preference is per-category — "afternoons for design"
-- is a different claim from "afternoons for admin" — so without this every
-- correction would be attributed to one bucket and the preferences would blur
-- into each other.
alter table ai_suggestions add column if not exists category text not null default 'deep-work';

alter table ai_suggestions add column if not exists final_start  timestamptz;
alter table ai_suggestions add column if not exists final_end    timestamptz;
alter table ai_suggestions add column if not exists reason_code  text;
alter table ai_suggestions add column if not exists decided_at   timestamptz;

-- The scorer's feature vector for the slot we proposed, and for the runners-up
-- we showed but the user passed over. Stored at proposal time so the learner
-- never has to reconstruct a past calendar to explain a past decision — the
-- calendar will have moved on by then.
alter table ai_suggestions add column if not exists features     jsonb not null default '{}'::jsonb;
alter table ai_suggestions add column if not exists alternatives jsonb not null default '[]'::jsonb;

do $$ begin
  alter table ai_suggestions add constraint ai_suggestions_reason_ck
    check (reason_code is null or reason_code in (
      'too-early', 'too-late', 'wrong-day', 'back-to-back', 'needs-prep',
      'too-long', 'too-short', 'not-needed', 'other'
    ));
exception when duplicate_object then null; end $$;

create index if not exists ai_suggestions_user_decided_idx
  on ai_suggestions (user_id, decided_at desc)
  where decided_at is not null;


-- ── constraints: allow chat- and inference-sourced rules ────────────────────
-- 001 shipped source in ('onboarding','settings','nl'). The agent adds 'chat'
-- (stated in conversation, e.g. "never book me before 10") and 'learned'
-- (promoted from `learned_preferences` after the user confirms it).
do $$ begin
  alter table constraints drop constraint if exists constraints_source_ck;
  alter table constraints add constraint constraints_source_ck
    check (source in ('onboarding', 'settings', 'nl', 'chat', 'learned'));
exception when duplicate_object then null; end $$;

-- Which chat turn produced the rule, so the "what I've learned" screen can show
-- the user the sentence they said that created it.
alter table constraints add column if not exists origin_message_id text;
alter table constraints add column if not exists updated_at timestamptz not null default now();


-- ── learned_preferences ─────────────────────────────────────────────────────
-- Inferred, always SOFT, always visible, always deletable. One row per distinct
-- claim ("prefers deep work before noon"), carrying the evidence that produced
-- it so the UI can say *why* and the user can disagree.
--
-- `strength` is a signed EMA in [-1, 1]: positive = the user gravitates toward
-- this, negative = away from it. `evidence_count` gates whether it is applied
-- at all (cold-start guard, docs/ai-learning.md §5).
create table if not exists learned_preferences (
  id              text primary key,
  user_id         text not null references users (id) on delete cascade,

  -- what kind of claim this is; the scorer reads only the kinds it knows
  kind            text not null,
  -- the subject of the claim: a category ('deep-work'), a weekday ('fri'), or
  -- '*' for a claim that applies to everything
  scope           text not null default '*',
  -- kind-specific payload, e.g. {"hourStart":10,"hourEnd":12} or {"minutes":15}
  value           jsonb not null default '{}'::jsonb,

  strength        double precision not null default 0,
  evidence_count  int not null default 0,
  last_evidence_at timestamptz,

  -- set when the user explicitly says "yes, that's right" / "no, drop it".
  -- confirmed preferences survive decay; rejected ones are never re-learned.
  user_verdict    text,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$ begin
  alter table learned_preferences add constraint learned_preferences_kind_ck
    check (kind in (
      'preferred-hours',     -- value {hourStart, hourEnd} for scope=category
      'avoid-hours',         -- value {hourStart, hourEnd}
      'preferred-weekday',   -- value {} , scope = 'mon'..'sun'
      'avoid-weekday',
      'buffer',              -- value {minutes} — wants more air around blocks
      'duration-bias',       -- value {multiplier} — estimates run long/short
      'block-length'         -- value {minutes} — preferred chunk size
    ));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table learned_preferences add constraint learned_preferences_verdict_ck
    check (user_verdict is null or user_verdict in ('confirmed', 'rejected'));
exception when duplicate_object then null; end $$;

-- One row per (user, kind, scope) — new evidence updates in place rather than
-- accreting duplicate contradictory claims.
create unique index if not exists learned_preferences_claim_idx
  on learned_preferences (user_id, kind, scope);

create index if not exists learned_preferences_user_idx
  on learned_preferences (user_id, updated_at desc);

drop trigger if exists learned_preferences_updated_at on learned_preferences;
create trigger learned_preferences_updated_at before update on learned_preferences
  for each row execute function set_updated_at();


-- ── scheduler_profiles: online-learning bookkeeping ─────────────────────────
-- `weights`, `energy_curve` and `duration_bias` already exist (001). This adds
-- the metadata the update rule needs: how much evidence is behind the current
-- weight vector, and when it last moved.
alter table scheduler_profiles add column if not exists learning jsonb not null default '{}'::jsonb;


-- ── ai_sessions: keep the chat list readable ────────────────────────────────
-- The agent is a conversation now, so sessions need a cheap "is this worth
-- showing in history" signal without counting messages.
alter table ai_sessions add column if not exists message_count int not null default 0;
alter table ai_sessions add column if not exists archived_at timestamptz;
