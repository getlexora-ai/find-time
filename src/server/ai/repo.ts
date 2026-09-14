/**
 * Persistence for the agent: the conversation, the proposals it made, what the
 * user did with them, and the profile it has learned.
 *
 * This is the module that closes the loop. Before it, `/api/ai/find-time`
 * returned proposals and the client created events — the proposal itself was
 * never stored, so there was no record of what the agent suggested versus what
 * the user actually kept, and therefore nothing to learn from. Every proposal
 * now lands in `plan_drafts` / `ai_suggestions` before it reaches the client,
 * and its outcome is written back against that row.
 *
 * Server-only: imports `pg` via ./db. Never import from the app bundle.
 */

import { randomUUID } from 'node:crypto';

import { query, queryOne, tx } from '@/server/db';

import {
  type AgentProfile,
  type HardRule,
  type LearnedPref,
  type Weekday,
  defaultProfile,
  normaliseWeights,
} from './preferences.ts';
import type { SlotFeatures } from './scoring.ts';
import type { Outcome, ReasonCode } from './learn.ts';

const id = (p: string) => `${p}_${randomUUID()}`;

// ── profile ─────────────────────────────────────────────────────────────────

type ProfileRow = {
  timezone: string;
  work_hours: unknown;
  weights: unknown;
  energy_curve: unknown;
  duration_bias: unknown;
  default_buffer_min: number;
  min_focus_block_min: number;
  max_daily_focus_min: number;
};

type ConstraintRow = {
  id: string;
  kind: string;
  rule: Record<string, unknown>;
  hard: boolean;
  label: string;
  source: string;
};

type LearnedRow = {
  id: string;
  kind: string;
  scope: string;
  value: Record<string, number>;
  strength: number;
  evidence_count: number;
  user_verdict: string | null;
};

/** `energy_curve` is stored as {hour, level}[]; the scorer wants hour -> level. */
function toEnergyMap(raw: unknown): Record<number, number> {
  const out: Record<number, number> = {};
  if (!Array.isArray(raw)) return out;
  for (const e of raw) {
    const hour = (e as { hour?: unknown })?.hour;
    const level = (e as { level?: unknown })?.level;
    if (typeof hour === 'number' && typeof level === 'number' && Number.isFinite(level)) {
      out[Math.round(hour)] = level;
    }
  }
  return out;
}

function toWorkHours(raw: unknown): AgentProfile['workHours'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: AgentProfile['workHours'] = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === null) {
      out[k as Weekday] = null;
      continue;
    }
    const start = (v as { start?: unknown })?.start;
    const end = (v as { end?: unknown })?.end;
    if (typeof start === 'number' && typeof end === 'number') {
      out[k as Weekday] = { start, end };
    }
  }
  return out;
}

/**
 * The full profile the scorer needs, in one place. Missing rows are not an
 * error — a brand-new user simply gets `defaultProfile()`, which is why the
 * agent behaves sensibly before it has learned anything.
 */
export async function loadProfile(userId: string): Promise<AgentProfile> {
  const base = defaultProfile();

  const [prof, constraints, learned] = await Promise.all([
    queryOne<ProfileRow>(
      `select timezone, work_hours, weights, energy_curve, duration_bias,
              default_buffer_min, min_focus_block_min, max_daily_focus_min
         from scheduler_profiles where user_id = $1`,
      [userId],
    ),
    query<ConstraintRow>(
      `select id, kind, rule, hard, label, source from constraints where user_id = $1
        order by created_at`,
      [userId],
    ),
    query<LearnedRow>(
      `select id, kind, scope, value, strength, evidence_count, user_verdict
         from learned_preferences where user_id = $1 order by updated_at desc`,
      [userId],
    ),
  ]);

  if (prof) {
    base.timezone = prof.timezone || base.timezone;
    const wh = toWorkHours(prof.work_hours);
    if (Object.keys(wh).length) base.workHours = wh;
    base.weights = normaliseWeights(prof.weights);
    const energy = toEnergyMap(prof.energy_curve);
    if (Object.keys(energy).length) base.energyCurve = energy;
    if (prof.duration_bias && typeof prof.duration_bias === 'object') {
      base.durationBias = prof.duration_bias as Record<string, number>;
    }
    base.defaultBufferMin = prof.default_buffer_min ?? base.defaultBufferMin;
    base.minFocusBlockMin = prof.min_focus_block_min ?? base.minFocusBlockMin;
    base.maxDailyFocusMin = prof.max_daily_focus_min ?? base.maxDailyFocusMin;
  }

  base.rules = constraints.map(
    (c): HardRule => ({
      id: c.id,
      kind: c.kind as HardRule['kind'],
      rule: c.rule ?? {},
      hard: c.hard,
      label: c.label,
      source: c.source as HardRule['source'],
    }),
  );

  base.learned = learned.map(
    (l): LearnedPref => ({
      id: l.id,
      kind: l.kind as LearnedPref['kind'],
      scope: l.scope,
      value: l.value ?? {},
      strength: Number(l.strength) || 0,
      evidenceCount: l.evidence_count ?? 0,
      userVerdict: (l.user_verdict as LearnedPref['userVerdict']) ?? null,
    }),
  );

  return base;
}

export async function saveWeights(
  userId: string,
  weights: AgentProfile['weights'],
  evidence: number,
): Promise<void> {
  await query(
    `insert into scheduler_profiles (user_id, weights, learning)
       values ($1, $2::jsonb, jsonb_build_object('evidence', $3::int, 'updatedAt', now()))
     on conflict (user_id) do update
       set weights = excluded.weights,
           learning = coalesce(scheduler_profiles.learning, '{}'::jsonb) || excluded.learning`,
    [userId, JSON.stringify(weights), evidence],
  );
}

export async function saveDurationBias(userId: string, bias: Record<string, number>): Promise<void> {
  await query(
    `insert into scheduler_profiles (user_id, duration_bias) values ($1, $2::jsonb)
     on conflict (user_id) do update set duration_bias = excluded.duration_bias`,
    [userId, JSON.stringify(bias)],
  );
}

/** Upsert on (user, kind, scope) so claims update in place instead of piling up. */
export async function upsertLearned(userId: string, prefs: LearnedPref[]): Promise<void> {
  if (!prefs.length) return;
  await tx(async (c) => {
    for (const p of prefs) {
      await c.query(
        `insert into learned_preferences
           (id, user_id, kind, scope, value, strength, evidence_count, last_evidence_at)
         values ($1,$2,$3,$4,$5::jsonb,$6,$7, now())
         on conflict (user_id, kind, scope) do update
           set value = excluded.value,
               strength = excluded.strength,
               evidence_count = excluded.evidence_count,
               last_evidence_at = now()`,
        [p.id, userId, p.kind, p.scope, JSON.stringify(p.value), p.strength, p.evidenceCount],
      );
    }
  });
}

export async function setLearnedVerdict(
  userId: string,
  prefId: string,
  verdict: 'confirmed' | 'rejected',
): Promise<boolean> {
  const rows = await query(
    `update learned_preferences set user_verdict = $3 where user_id = $1 and id = $2 returning id`,
    [userId, prefId, verdict],
  );
  return rows.length > 0;
}

/**
 * Deleting an inferred preference marks it rejected rather than removing the
 * row — otherwise the next few corrections would simply re-derive the thing the
 * user just deleted, which reads as the agent ignoring them.
 */
export async function forgetLearned(userId: string, prefId: string): Promise<boolean> {
  return setLearnedVerdict(userId, prefId, 'rejected');
}

// ── stated rules ────────────────────────────────────────────────────────────

export async function addRule(
  userId: string,
  input: { kind: string; rule: Record<string, unknown>; hard: boolean; label: string; messageId?: string },
): Promise<HardRule> {
  const row = await queryOne<ConstraintRow>(
    `insert into constraints (id, user_id, kind, rule, hard, label, source, origin_message_id)
       values ($1,$2,$3,$4::jsonb,$5,$6,'chat',$7)
     returning id, kind, rule, hard, label, source`,
    [id('con'), userId, input.kind, JSON.stringify(input.rule), input.hard, input.label, input.messageId ?? null],
  );
  if (!row) throw new Error('constraint insert returned nothing');
  return {
    id: row.id,
    kind: row.kind as HardRule['kind'],
    rule: row.rule ?? {},
    hard: row.hard,
    label: row.label,
    source: row.source as HardRule['source'],
  };
}

export async function deleteRule(userId: string, ruleId: string): Promise<boolean> {
  const rows = await query(`delete from constraints where user_id = $1 and id = $2 returning id`, [
    userId,
    ruleId,
  ]);
  return rows.length > 0;
}

// ── conversation ────────────────────────────────────────────────────────────

export type StoredMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  kind: string;
  createdAt: string;
  /** proposals attached to an assistant turn, rehydrated for the client */
  parsed: Record<string, unknown> | null;
};

export async function createSession(userId: string, title: string): Promise<string> {
  const sid = id('ses');
  await query(`insert into ai_sessions (id, user_id, title) values ($1,$2,$3)`, [
    sid,
    userId,
    title.slice(0, 120),
  ]);
  return sid;
}

export async function sessionExists(userId: string, sessionId: string): Promise<boolean> {
  const row = await queryOne(`select id from ai_sessions where id = $1 and user_id = $2`, [
    sessionId,
    userId,
  ]);
  return Boolean(row);
}

export async function appendMessage(
  sessionId: string,
  msg: { role: 'user' | 'assistant'; content: string; kind?: string; parsed?: unknown },
): Promise<string> {
  const mid = id('msg');
  await tx(async (c) => {
    await c.query(
      `insert into ai_messages (id, session_id, role, content, kind, parsed)
       values ($1,$2,$3,$4,$5,$6::jsonb)`,
      [mid, sessionId, msg.role, msg.content, msg.kind ?? 'text', JSON.stringify(msg.parsed ?? null)],
    );
    await c.query(
      `update ai_sessions
          set last_message_at = now(), message_count = message_count + 1
        where id = $1`,
      [sessionId],
    );
  });
  return mid;
}

type MessageRow = {
  id: string;
  role: string;
  content: string;
  kind: string;
  created_at: Date;
  parsed: Record<string, unknown> | null;
};

export async function listMessages(sessionId: string, limit = 40): Promise<StoredMessage[]> {
  // Newest `limit`, then flipped back into chronological order — an old thread
  // must not push the system prompt out of the context window.
  const rows = await query<MessageRow>(
    `select id, role, content, kind, created_at, parsed
       from (select * from ai_messages where session_id = $1
             order by created_at desc limit $2) t
      order by created_at asc`,
    [sessionId, limit],
  );
  return rows
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .map((r) => ({
      id: r.id,
      role: r.role as 'user' | 'assistant',
      content: r.content,
      kind: r.kind,
      createdAt: r.created_at.toISOString(),
      parsed: r.parsed,
    }));
}

// ── proposals and their outcomes ────────────────────────────────────────────

export type ProposalInput = {
  title: string;
  category: string;
  startISO: string;
  endISO: string;
  score: number;
  features: SlotFeatures;
  reason: string;
  alternatives: { startISO: string; endISO: string; score: number; features: SlotFeatures }[];
};

export type StoredProposal = ProposalInput & { id: string };

/**
 * Write a batch of proposals as a draft + its suggestions, and hand back the
 * ids. The client needs those ids: without one, an outcome reported later
 * cannot be matched to what was actually proposed, and the feedback is
 * unusable.
 */
export async function saveProposals(
  userId: string,
  sessionId: string,
  horizon: { startISO: string; endISO: string },
  proposals: ProposalInput[],
): Promise<StoredProposal[]> {
  const draftId = id('drf');
  const stored: StoredProposal[] = proposals.map((p) => ({ ...p, id: id('sug') }));

  await tx(async (c) => {
    await c.query(
      `insert into plan_drafts (id, user_id, session_id, horizon_start, horizon_end, change_count)
       values ($1,$2,$3,$4,$5,$6)`,
      [draftId, userId, sessionId, horizon.startISO, horizon.endISO, stored.length],
    );
    for (let i = 0; i < stored.length; i++) {
      const p = stored[i];
      await c.query(
        `insert into ai_suggestions
           (id, draft_id, user_id, "index", kind, title, category, proposed_start, proposed_end,
            rationale, confidence, score, features, alternatives)
         values ($1,$2,$3,$4,'create',$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb)`,
        [
          p.id,
          draftId,
          userId,
          i,
          p.title,
          p.category,
          p.startISO,
          p.endISO,
          p.reason,
          p.score,
          p.score,
          JSON.stringify(p.features),
          JSON.stringify(p.alternatives),
        ],
      );
    }
    await c.query(`update ai_sessions set active_draft_batch_id = $2 where id = $1`, [sessionId, draftId]);
  });

  return stored;
}

export type SuggestionRow = {
  id: string;
  title: string;
  category: string;
  proposed_start: Date;
  proposed_end: Date;
  features: SlotFeatures;
  alternatives: { startISO: string; endISO: string; score: number; features: SlotFeatures }[];
  status: string;
};

export async function getSuggestion(userId: string, sugId: string): Promise<SuggestionRow | null> {
  return queryOne<SuggestionRow>(
    `select id, title, category, proposed_start, proposed_end, features, alternatives, status
       from ai_suggestions where user_id = $1 and id = $2`,
    [userId, sugId],
  );
}

/** Record what the user actually did. Idempotent per suggestion. */
export async function recordOutcome(
  userId: string,
  sugId: string,
  outcome: Outcome,
  extra: { finalStart?: string | null; finalEnd?: string | null; reasonCode?: ReasonCode | null },
): Promise<boolean> {
  const rows = await query(
    `update ai_suggestions
        set status = $3,
            final_start = $4,
            final_end = $5,
            reason_code = $6,
            decided_at = now()
      where user_id = $1 and id = $2
      returning id`,
    [userId, sugId, outcome, extra.finalStart ?? null, extra.finalEnd ?? null, extra.reasonCode ?? null],
  );
  return rows.length > 0;
}

/** How many decided proposals this user has produced — the cold-start gate. */
export async function evidenceCount(userId: string): Promise<number> {
  const row = await queryOne<{ n: string }>(
    `select count(*)::text as n from ai_suggestions where user_id = $1 and decided_at is not null`,
    [userId],
  );
  return row ? Number(row.n) || 0 : 0;
}

export { id as newId };
