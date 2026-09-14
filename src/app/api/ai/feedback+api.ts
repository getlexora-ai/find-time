import type { FeedbackResponse, RejectReason } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { type Feedback, type Outcome, learnFrom } from '@/server/ai/learn';
import { type ScoreContext, type SlotFeatures, ZERO_FEATURES, slotFeatures } from '@/server/ai/scoring';
import {
  evidenceCount,
  getSuggestion,
  loadProfile,
  newId,
  recordOutcome,
  saveDurationBias,
  saveWeights,
  upsertLearned,
} from '@/server/ai/repo';
import {
  editKind,
  markChosen,
  occasionForSuggestion,
  recordCorrection,
} from '@/server/ai/capture';
import { isConfigured } from '@/server/db';
import { listEvents } from '@/server/events-repo';

/**
 * POST /api/ai/feedback — what the user actually did with a proposal.
 *
 * This is the endpoint the whole learning story hangs off. Before it existed
 * the app created the events and forgot the proposal, so there was no record of
 * the gap between what the agent suggested and what the user kept — and that
 * gap is the only real training signal there is.
 *
 * Three outcomes, with deliberately different consequences:
 *   accepted — weak positive. People accept to close the panel. Nudges claims
 *              slightly; never moves the weight vector.
 *   edited   — the strongest signal available: the user looked at a concrete
 *              alternative and moved the block to it. This is the only case
 *              that updates weights, because it is the only one that supplies
 *              both sides of a comparison.
 *   rejected — needs a reason to mean anything. `not-needed` (the task
 *              evaporated) teaches nothing about time and is recorded but
 *              deliberately learned from not at all.
 */

const VALID_OUTCOMES = new Set<Outcome>(['accepted', 'edited', 'rejected']);
const VALID_REASONS = new Set<RejectReason>([
  'too-early', 'too-late', 'wrong-day', 'back-to-back', 'needs-prep',
  'too-long', 'too-short', 'not-needed', 'other',
]);

const HOUR = 3_600_000;

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const suggestionId = typeof body.suggestionId === 'string' ? body.suggestionId : '';
  const outcome = body.outcome as Outcome;
  if (!suggestionId || !VALID_OUTCOMES.has(outcome)) {
    return Response.json({ error: 'suggestionId and a valid outcome are required.' }, { status: 400 });
  }
  const reasonCode =
    typeof body.reasonCode === 'string' && VALID_REASONS.has(body.reasonCode as RejectReason)
      ? (body.reasonCode as RejectReason)
      : null;

  const finalStart = typeof body.finalStartISO === 'string' ? body.finalStartISO : null;
  const finalEnd = typeof body.finalEndISO === 'string' ? body.finalEndISO : null;

  const suggestion = await getSuggestion(userId, suggestionId);
  if (!suggestion) return Response.json({ error: 'Unknown suggestion.' }, { status: 404 });

  // Record first. Even when nothing is learned from this one, the row is what
  // makes a better learner possible later — the log is the durable asset.
  const recorded = await recordOutcome(userId, suggestionId, outcome, {
    finalStart,
    finalEnd,
    reasonCode,
  });
  if (!recorded) return Response.json({ error: 'Unknown suggestion.' }, { status: 404 });

  const profile = await loadProfile(userId);
  const proposedStart = suggestion.proposed_start.toISOString();
  const proposedEnd = suggestion.proposed_end.toISOString();

  /**
   * The feature vector of the slot the user actually chose. If they took one of
   * the runners-up we offered, we stored its vector at proposal time and can
   * use it exactly. If they dragged the block somewhere of their own choosing,
   * the vector is recomputed against today's calendar — slightly lossy, since
   * the calendar has moved, but the alternative is discarding the single
   * strongest signal the system ever gets.
   */
  // An arrow const rather than a function declaration: declarations are hoisted,
  // so TypeScript will not carry the `userId` / `suggestion` null-guards above
  // into one.
  const finalFeatures = async (): Promise<SlotFeatures | null> => {
    if (outcome !== 'edited' || !finalStart || !finalEnd) return null;

    const match = (suggestion.alternatives ?? []).find((a) => a.startISO === finalStart);
    if (match?.features) return match.features;

    try {
      const fs = Date.parse(finalStart);
      const fe = Date.parse(finalEnd);
      if (!Number.isFinite(fs) || !Number.isFinite(fe)) return null;

      const dayFrom = new Date(fs - 2 * 86_400_000).toISOString();
      const dayTo = new Date(fe + 2 * 86_400_000).toISOString();
      const events = await listEvents(userId, dayFrom, dayTo);
      const busy = events
        .filter((e) => e.flexibility !== 'flexible')
        .map((e) => ({ s: Date.parse(e.start), e: Date.parse(e.end) }))
        .filter((b) => Number.isFinite(b.s) && Number.isFinite(b.e))
        .sort((a, b) => a.s - b.s);

      const ctx: ScoreContext = {
        busy,
        earliest: Math.min(Date.parse(proposedStart), fs),
        latest: Math.max(Date.parse(proposedEnd), fe) + HOUR,
        category: suggestion.category || 'deep-work',
        dayStartHour: 0,
        dayEndHour: 24,
      };
      return slotFeatures(profile, ctx, fs, fe);
    } catch (err) {
      console.error('ai/feedback finalFeatures', err);
      return null;
    }
  };

  /**
   * The capture side, kept separate from the learning side above.
   *
   * `learnFrom` asks "how should the scorer change?"; this asks "what was the
   * choice, and what was passed over?" — the question the factor analysis runs
   * on. It is deliberately after the outcome is recorded and deliberately
   * unable to fail the request: a lost capture row costs an observation, a
   * thrown one costs the user their edit.
   */
  const occasionId = await occasionForSuggestion(suggestionId);
  if (occasionId) {
    // Which candidate won. A drag to a time that was never ranked leaves every
    // row unchosen, which is the honest record — the choice happened outside
    // the offered set, and attributing it to a slot we never proposed would
    // invent a comparison that did not take place.
    if (outcome !== 'rejected' && finalStart) await markChosen(occasionId, finalStart);
    else if (outcome === 'accepted') await markChosen(occasionId, proposedStart);
  }

  if (outcome !== 'accepted') {
    await recordCorrection({
      userId,
      occasionId,
      suggestionId,
      source: 'block',
      kind:
        outcome === 'rejected'
          ? 'rejected'
          : editKind(
              { startISO: proposedStart, endISO: proposedEnd },
              { startISO: finalStart ?? proposedStart, endISO: finalEnd ?? proposedEnd },
            ),
      before: { startISO: proposedStart, endISO: proposedEnd, category: suggestion.category },
      after:
        finalStart && finalEnd
          ? { startISO: finalStart, endISO: finalEnd }
          : {},
      reasonCode,
      reasonNote: typeof body.reasonNote === 'string' ? body.reasonNote : null,
    });
  }

  const fb: Feedback = {
    outcome,
    category: suggestion.category || 'deep-work',
    proposedStart,
    proposedEnd,
    proposedFeatures: suggestion.features ?? ZERO_FEATURES,
    finalStart,
    finalEnd,
    finalFeatures: await finalFeatures(),
    reasonCode,
  };

  const result = learnFrom(profile, fb, () => newId('lp'));

  try {
    const evidence = await evidenceCount(userId);
    if (Object.keys(result.weightDelta).length) {
      await saveWeights(userId, result.weights, evidence);
    }
    if (result.claims.length) {
      await upsertLearned(userId, result.claims);

      // duration-bias is the one claim the scorer reads from the profile column
      // rather than from the claim list, because the placer needs it before any
      // slot exists — it changes how long the block is, not where it goes.
      const bias: Record<string, number> = {};
      for (const [k, v] of Object.entries(profile.durationBias)) {
        if (typeof v === 'number' && Number.isFinite(v)) bias[k] = v;
      }
      let biasChanged = false;
      for (const c of result.claims) {
        if (c.kind === 'duration-bias' && Number.isFinite(c.value.multiplier)) {
          const prev = bias[c.scope] ?? 1;
          bias[c.scope] = Math.min(1.5, Math.max(0.7, prev * 0.7 + c.value.multiplier * 0.3));
          biasChanged = true;
        }
      }
      if (biasChanged) await saveDurationBias(userId, bias);
    }
  } catch (err) {
    // The outcome is already recorded; failing to apply the update must not
    // fail the user's action. The signal is not lost — it can be replayed.
    console.error('ai/feedback persist', err);
  }

  return Response.json({ ok: true, notes: result.notes } satisfies FeedbackResponse);
}
