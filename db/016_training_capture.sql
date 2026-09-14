-- find_time — 016 training capture.
--
-- 015 made the agent able to learn. This migration makes it possible to find
-- out *what there is to learn* — which factors actually drive where a person
-- puts work on a calendar, and whether those factors are the same for
-- everyone. That is a different question from "improve the scorer", and it
-- wants a different shape of data.
--
-- Three things are added:
--
--   1. `ai_turns` — one row per model call. Without `model_id` and
--      `prompt_version` on every row, changing the model constant silently
--      orphans everything collected before the change: you can no longer say
--      whether a correction was against the old model or the new one. That is
--      unrecoverable after the fact, which is why this lands first.
--   2. `ai_choice_occasions` + `ai_choice_candidates` — the placement decision
--      as a discrete choice: every slot that was on offer, one row each, with
--      the slot that won flagged. `ai_suggestions.alternatives` (015) already
--      holds this as jsonb, but jsonb cannot be aggregated across candidates,
--      and aggregating across candidates is the entire question. See §"one row
--      per candidate" in the plan.
--   3. `ai_corrections` — the correction itself: what the agent did, what the
--      user did instead, and why.
--
-- TWO TRACKS. Every table below stores each fact twice where it can:
--   Track A — numbers, enums, timestamps. Always written. Carries no personal
--             content by construction: by the time a slot is `0.55 / 0.85`,
--             what the meeting was about is already gone.
--   Track B — short text notes explaining where a number came from. Written
--             only while `capture_profile = 'full'`, which is the state while
--             there is a single consenting tester. Every Track B column is
--             nullable and length-capped, so switching to 'anon' before beta
--             is one env var and no migration, and the corpus stays analysable
--             either way because Track A is identical under both profiles.
--
-- Event titles, attendees and descriptions appear in NEITHER track, at any
-- profile. They are third-party content and no flag unlocks them
-- (docs/ai-learning.md §8).
--
-- Requires: 001_core.sql, 004_ai.sql, 015_agent_learning.sql.
--
-- Apply (direct/unpooled URL):
--   psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/016_training_capture.sql


-- ── ai_turns: one row per model call ────────────────────────────────────────
-- Covers every action the agent can take, not only `propose` — an `ask` that
-- should have been a `propose` is a real failure mode, and it is invisible if
-- only proposals are logged.
create table if not exists ai_turns (
  id              text primary key,
  user_id         text not null references users (id) on delete cascade,
  session_id      text references ai_sessions (id) on delete set null,
  message_id      text references ai_messages (id) on delete set null,
  created_at      timestamptz not null default now(),

  -- Who answered. `model_id` is the RESOLVED model, never the default
  -- constant: the constant changes, and rows written before the change must
  -- still say what actually produced them.
  provider        text not null default 'google',
  model_id        text not null,
  prompt_version  text not null,
  scorer_version  text not null,
  temperature     double precision,

  -- What it was given, structured, and complete enough to replay against a
  -- different model later. Categories, hours and busy-block bounds only.
  input           jsonb not null default '{}'::jsonb,
  -- Stable digest of `input`, so replays of the same question group together
  -- without comparing large jsonb values.
  input_hash      text not null default '',

  action          text not null,
  tool_args       jsonb not null default '{}'::jsonb,

  latency_ms      int,
  prompt_tokens   int,
  output_tokens   int,
  error           text
);

create index if not exists ai_turns_user_created_idx on ai_turns (user_id, created_at desc);
create index if not exists ai_turns_hash_idx on ai_turns (input_hash);

do $$ begin
  alter table ai_turns add constraint ai_turns_action_ck
    check (action in ('propose', 'ask', 'record_rule', 'answer', 'error'));
exception when duplicate_object then null; end $$;


-- ── ai_choice_occasions: one placement decision ─────────────────────────────
-- One turn proposing three blocks creates three occasions, each with its own
-- candidate set. The occasion is the unit of choice, not the turn.
create table if not exists ai_choice_occasions (
  id                text primary key,
  turn_id           text references ai_turns (id) on delete set null,
  user_id           text not null references users (id) on delete cascade,
  suggestion_id     text references ai_suggestions (id) on delete set null,
  asked_at          timestamptz not null default now(),

  category          text not null default 'deep-work',
  requested_minutes int  not null default 0,
  candidate_count   int  not null default 0,

  -- Exploration. Without it every observation is a choice among slots the
  -- scorer already approved of, so the scorer's own bias is baked into the
  -- evidence and "afternoons don't work" is indistinguishable from "we never
  -- offered an afternoon". Cannot be fixed retroactively, so it ships with
  -- the capture rather than after it.
  randomised        boolean not null default false,
  strategy          text not null default 'top',

  -- Denormalised from the turn so analysis needs no join.
  model_id          text not null default '',
  prompt_version    text not null default '',
  scorer_version    text not null default '',

  -- The state of the week the choice was made in. A light week and a packed
  -- one are different experiments and must be separable at analysis time.
  week_busy_minutes int,
  day_busy_minutes  int,

  -- 'full' while there is one consenting tester; 'anon' from beta onwards.
  -- Stored per row rather than assumed globally, so a mixed corpus stays
  -- honest about which rows carry a Track B.
  capture_profile   text not null default 'full',

  -- TRACK B.
  context_note      varchar(48)
);

create index if not exists ai_choice_occasions_user_idx on ai_choice_occasions (user_id, asked_at desc);
create index if not exists ai_choice_occasions_sug_idx on ai_choice_occasions (suggestion_id);

do $$ begin
  alter table ai_choice_occasions add constraint ai_choice_occasions_profile_ck
    check (capture_profile in ('full', 'anon'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_choice_occasions add constraint ai_choice_occasions_strategy_ck
    check (strategy in ('top', 'spread'));
exception when duplicate_object then null; end $$;


-- ── ai_choice_candidates: ONE ROW PER SLOT ON OFFER ─────────────────────────
-- The point of the whole migration. Flat columns rather than a jsonb blob for
-- two reasons: adding a factor becomes a migration you notice rather than a
-- key that quietly appears, and every statistical tool can read the table
-- without unpacking anything.
create table if not exists ai_choice_candidates (
  occasion_id   text not null references ai_choice_occasions (id) on delete cascade,
  slot_index    int  not null,
  start_at      timestamptz not null,
  end_at        timestamptz not null,

  -- The outcome side. `chosen` is set later, when feedback arrives — at
  -- proposal time nothing has been chosen yet.
  chosen        boolean not null default false,
  offered       boolean not null default false,  -- shown to the user, vs merely ranked
  rank          int not null default 0,
  score         double precision not null default 0,

  -- TRACK A — the seven hypotheses. None of these has been tested against a
  -- real person's behaviour; that is what the table is for.
  hour_fit      double precision not null default 0,
  energy        double precision not null default 0,
  fragmentation double precision not null default 0,
  day_load      double precision not null default 0,
  back_to_back  double precision not null default 0,
  earliness     double precision not null default 0,
  weekday_fit   double precision not null default 0,

  -- TRACK B — why each number came out as it did. 24 characters is enforced
  -- rather than intended: a column that cannot hold prose will not accrete it.
  hour_fit_note      varchar(24),
  energy_note        varchar(24),
  fragmentation_note varchar(24),
  day_load_note      varchar(24),
  back_to_back_note  varchar(24),
  earliness_note     varchar(24),
  weekday_fit_note   varchar(24),

  -- Raw descriptors, so factors nobody has invented yet can still be tested
  -- against rows collected today.
  hour_of_day   int not null default 0,
  weekday       int not null default 0,
  lead_hours    double precision not null default 0,

  primary key (occasion_id, slot_index)
);

create index if not exists ai_choice_candidates_chosen_idx
  on ai_choice_candidates (occasion_id, chosen);


-- ── ai_corrections: what the user did instead, and why ──────────────────────
create table if not exists ai_corrections (
  id             text primary key,
  user_id        text not null references users (id) on delete cascade,
  occasion_id    text references ai_choice_occasions (id) on delete set null,
  turn_id        text references ai_turns (id) on delete set null,
  suggestion_id  text references ai_suggestions (id) on delete set null,
  created_at     timestamptz not null default now(),

  source         text not null,
  kind           text not null,

  -- Whose error this was. ONLY 'agent' is training signal: a user who changed
  -- their mind is not evidence the agent was wrong, and mixing the two teaches
  -- the scorer to chase noise. Defaults to 'unknown' because the capture layer
  -- genuinely does not know — a human decides this in review.
  fault          text not null default 'unknown',

  before_state   jsonb not null default '{}'::jsonb,
  after_state    jsonb not null default '{}'::jsonb,

  -- TRACK A: the enum behind the reason chips.
  reason_code    text,
  -- TRACK B: the user's own words. The richest material there is for writing
  -- rules that sound like people actually talk.
  reason_note    varchar(120),

  -- Curation. Nothing reaches a dataset unreviewed, and a split once assigned
  -- is frozen — reassigning splits is how eval sets quietly leak.
  label_status   text not null default 'unreviewed',
  split          text,
  reviewer_note  varchar(200),
  reviewed_at    timestamptz
);

create index if not exists ai_corrections_user_idx on ai_corrections (user_id, created_at desc);
create index if not exists ai_corrections_review_idx on ai_corrections (label_status, created_at desc);

do $$ begin
  alter table ai_corrections add constraint ai_corrections_source_ck
    check (source in ('block', 'chat', 'rule', 'preference'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_corrections add constraint ai_corrections_fault_ck
    check (fault in ('agent', 'user-changed-mind', 'ambiguous-request', 'unknown'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_corrections add constraint ai_corrections_label_ck
    check (label_status in ('unreviewed', 'approved', 'rejected', 'needs-edit'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table ai_corrections add constraint ai_corrections_split_ck
    check (split is null or split in ('train', 'eval', 'holdout'));
exception when duplicate_object then null; end $$;
