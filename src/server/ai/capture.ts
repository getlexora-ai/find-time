/**
 * Training capture, writer half — the inserts behind db/016.
 *
 * NEVER THROW. Capture is telemetry sitting in the path of a user-facing
 * feature. A missing table (016 not yet applied), a dead connection or a bad
 * value must degrade to a lost row and a console line, never to a failed
 * scheduling request. Every exported writer swallows its own errors; callers
 * are not expected to try/catch, and every one returns null or false instead.
 *
 * The shaping, classification and the two-track policy live in
 * capture-core.ts, which has no I/O and is what the check harness exercises.
 */

import { randomUUID } from 'node:crypto';

import { query, tx } from '@/server/db';

import {
  type CorrectionInput,
  type OccasionInput,
  type TurnInput,
  MAX_CANDIDATES,
  cap,
  captureProfile,
  hashInput,
  keepNotes,
} from './capture-core.ts';

export * from './capture-core.ts';

const id = (p: string) => `${p}_${randomUUID()}`;

const HOUR = 3_600_000;

// ── turns ───────────────────────────────────────────────────────────────────



/**
 * Record one model call. Returns the turn id, or null if the write failed —
 * callers pass it straight through to `recordOccasion`, which tolerates null.
 */
export async function recordTurn(t: TurnInput): Promise<string | null> {
  const turnId = id('trn');
  try {
    await query(
      `insert into ai_turns
         (id, user_id, session_id, created_at, provider, model_id, prompt_version,
          scorer_version, temperature, input, input_hash, action, tool_args,
          latency_ms, prompt_tokens, output_tokens, error)
       values ($1,$2,$3,now(),'google',$4,$5,$6,$7,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,$15)`,
      [
        turnId,
        t.userId,
        t.sessionId,
        t.modelId,
        t.promptVersion,
        t.scorerVersion,
        t.temperature ?? null,
        JSON.stringify(t.input ?? {}),
        hashInput(t.input ?? {}),
        t.action,
        JSON.stringify(t.toolArgs ?? {}),
        t.latencyMs ?? null,
        t.promptTokens ?? null,
        t.outputTokens ?? null,
        t.error ?? null,
      ],
    );
    return turnId;
  } catch (err) {
    console.error('capture/recordTurn', err);
    return null;
  }
}

// ── occasions and their candidate sets ──────────────────────────────────────



/**
 * Write one placement decision and its choice set.
 *
 * Everything that was offered is kept regardless of rank; the rest is the top
 * of the ranking up to MAX_CANDIDATES. A slot the user was shown must be in
 * the table even if it ranked poorly, because under 'spread' that is exactly
 * the interesting case.
 */
export async function recordOccasion(o: OccasionInput): Promise<string | null> {
  const occId = id('occ');
  const ranked = [...o.candidates].sort((a, b) => a.rank - b.rank);
  const offered = ranked.filter((c) => c.offered);
  const rest = ranked.filter((c) => !c.offered).slice(0, Math.max(0, MAX_CANDIDATES - offered.length));
  const keep = [...offered, ...rest].sort((a, b) => a.rank - b.rank);
  const notes = keepNotes();

  try {
    await tx(async (c) => {
      await c.query(
        `insert into ai_choice_occasions
           (id, turn_id, user_id, suggestion_id, asked_at, category, requested_minutes,
            candidate_count, randomised, strategy, model_id, prompt_version, scorer_version,
            week_busy_minutes, day_busy_minutes, capture_profile, context_note)
         values ($1,$2,$3,$4,now(),$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          occId,
          o.turnId,
          o.userId,
          o.suggestionId,
          o.category,
          Math.round(o.requestedMinutes),
          keep.length,
          o.randomised,
          o.strategy,
          o.modelId,
          o.promptVersion,
          o.scorerVersion,
          o.weekBusyMinutes ?? null,
          o.dayBusyMinutes ?? null,
          captureProfile(),
          notes ? cap(o.contextNote, 48) : null,
        ],
      );

      for (let i = 0; i < keep.length; i++) {
        const k = keep[i];
        const startMs = Date.parse(k.startISO);
        const f = k.features;
        const n = notes ? k.notes : undefined;
        await c.query(
          `insert into ai_choice_candidates
             (occasion_id, slot_index, start_at, end_at, chosen, offered, rank, score,
              hour_fit, energy, fragmentation, day_load, back_to_back, earliness, weekday_fit,
              hour_fit_note, energy_note, fragmentation_note, day_load_note,
              back_to_back_note, earliness_note, weekday_fit_note,
              hour_of_day, weekday, lead_hours)
           values ($1,$2,$3,$4,false,$5,$6,$7,
                   $8,$9,$10,$11,$12,$13,$14,
                   $15,$16,$17,$18,$19,$20,$21,
                   $22,$23,$24)`,
          [
            occId,
            i,
            k.startISO,
            k.endISO,
            k.offered,
            k.rank,
            k.score,
            f.hourFit,
            f.energy,
            f.fragmentation,
            f.dayLoad,
            f.backToBack,
            f.earliness,
            f.weekdayFit,
            cap(n?.hourFit, 24),
            cap(n?.energy, 24),
            cap(n?.fragmentation, 24),
            cap(n?.dayLoad, 24),
            cap(n?.backToBack, 24),
            cap(n?.earliness, 24),
            cap(n?.weekdayFit, 24),
            Math.floor(((startMs % 86_400_000) + 86_400_000) % 86_400_000 / HOUR),
            new Date(startMs).getUTCDay(),
            Math.round(((startMs - Date.now()) / HOUR) * 10) / 10,
          ],
        );
      }
    });
    return occId;
  } catch (err) {
    console.error('capture/recordOccasion', err);
    return null;
  }
}

/**
 * Mark which candidate the user ended up with.
 *
 * Matched on exact start time: the feedback route reports the slot the block
 * actually landed on, and if that was one of the candidates we ranked, this is
 * the row that turns the occasion into a labelled comparison. A drag to a time
 * that was never a candidate simply leaves every row unchosen, which is
 * truthful — the choice was made outside the offered set, and pretending
 * otherwise would attribute it to a slot the scorer never proposed.
 */
export async function markChosen(occasionId: string, startISO: string): Promise<boolean> {
  try {
    const rows = await query(
      `update ai_choice_candidates
          set chosen = true
        where occasion_id = $1 and start_at = $2::timestamptz
        returning slot_index`,
      [occasionId, startISO],
    );
    return rows.length > 0;
  } catch (err) {
    console.error('capture/markChosen', err);
    return false;
  }
}

/** The occasion written for a given suggestion, if capture was on at the time. */
export async function occasionForSuggestion(suggestionId: string): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `select id from ai_choice_occasions where suggestion_id = $1 order by asked_at desc limit 1`,
      [suggestionId],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('capture/occasionForSuggestion', err);
    return null;
  }
}

// ── corrections ─────────────────────────────────────────────────────────────

export async function recordCorrection(c: CorrectionInput): Promise<string | null> {
  const corrId = id('cor');
  try {
    await query(
      `insert into ai_corrections
         (id, user_id, occasion_id, turn_id, suggestion_id, created_at, source, kind,
          fault, before_state, after_state, reason_code, reason_note, label_status)
       values ($1,$2,$3,$4,$5,now(),$6,$7,'unknown',$8::jsonb,$9::jsonb,$10,$11,'unreviewed')`,
      [
        corrId,
        c.userId,
        c.occasionId ?? null,
        c.turnId ?? null,
        c.suggestionId ?? null,
        c.source,
        c.kind,
        JSON.stringify(c.before ?? {}),
        JSON.stringify(c.after ?? {}),
        c.reasonCode ?? null,
        keepNotes() ? cap(c.reasonNote, 120) : null,
      ],
    );
    return corrId;
  } catch (err) {
    console.error('capture/recordCorrection', err);
    return null;
  }
}


/**
 * The most recent occasion in a conversation — what a correction made in words
 * is correcting.
 *
 * Resolved here rather than asked of the model, which is never shown internal
 * ids. The session is the right scope: a revision always refers to the
 * proposal the user is currently looking at.
 */
export async function latestOccasionInSession(
  userId: string,
  sessionId: string,
): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `select o.id
         from ai_choice_occasions o
         join ai_suggestions s on s.id = o.suggestion_id
         join plan_drafts d on d.id = s.draft_id
        where o.user_id = $1 and d.session_id = $2
        order by o.asked_at desc
        limit 1`,
      [userId, sessionId],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('capture/latestOccasionInSession', err);
    return null;
  }
}

/**
 * Point a turn at the assistant message it produced. `ai_turns.message_id`
 * exists from 016 but the turn is logged before the reply is stored, so it has
 * to be filled in afterwards — and a reported reply is only useful for review
 * if it leads back to the model, prompt version and input behind it.
 */
export async function linkTurnMessage(turnId: string | null, messageId: string): Promise<boolean> {
  if (!turnId) return false;
  try {
    const rows = await query(`update ai_turns set message_id = $2 where id = $1 returning id`, [
      turnId,
      messageId,
    ]);
    return rows.length > 0;
  } catch (err) {
    console.error('capture/linkTurnMessage', err);
    return false;
  }
}

/** The model call behind an assistant message, if it was captured. */
export async function turnForMessage(messageId: string): Promise<string | null> {
  try {
    const rows = await query<{ id: string }>(
      `select id from ai_turns where message_id = $1 order by created_at desc limit 1`,
      [messageId],
    );
    return rows[0]?.id ?? null;
  } catch (err) {
    console.error('capture/turnForMessage', err);
    return null;
  }
}

// ── reported replies (db/017) ───────────────────────────────────────────────

/** Whether this user already reported this reply — one report per reply. */
export async function reportExists(userId: string, messageId: string): Promise<boolean> {
  try {
    const rows = await query(
      `select id from ai_corrections
        where user_id = $1 and source = 'report' and before_state->>'messageId' = $2
        limit 1`,
      [userId, messageId],
    );
    return rows.length > 0;
  } catch (err) {
    console.error('capture/reportExists', err);
    return false;
  }
}

/** Reply ids in a conversation the user has reported, so reloads keep the mark. */
export async function reportedMessageIds(userId: string, sessionId: string): Promise<Set<string>> {
  try {
    const rows = await query<{ message_id: string }>(
      `select before_state->>'messageId' as message_id
         from ai_corrections
        where user_id = $1 and source = 'report' and before_state->>'sessionId' = $2`,
      [userId, sessionId],
    );
    return new Set(rows.map((r) => r.message_id));
  } catch (err) {
    console.error('capture/reportedMessageIds', err);
    return new Set();
  }
}
