import type { PreferenceItem, PreferencesResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { describeClaim } from '@/server/ai/learn';
import { MIN_EVIDENCE } from '@/server/ai/preferences';
import { deleteRule, forgetLearned, loadProfile, setLearnedVerdict } from '@/server/ai/repo';
import { isConfigured } from '@/server/db';

/**
 * GET    /api/ai/preferences            — everything the agent believes about you.
 * DELETE /api/ai/preferences?id=…&source=rule|learned — forget one thing.
 * PATCH  /api/ai/preferences            — { id, verdict: 'confirmed' } to pin one.
 *
 * The learned model is a page you can read, not a hidden vector. That is partly
 * a trust argument — nobody accepts a scheduler that changes its mind for
 * reasons it won't show — and partly a practical one: this is also the only
 * debugging surface for the learner, and the only way a wrong inference gets
 * corrected instead of quietly compounding.
 *
 * Two sources, kept visibly apart:
 *   rule    — you said it. Enforced as a hard filter.
 *   learned — inferred from your corrections. Only ever reorders candidates,
 *             and only once it clears the evidence bar.
 */

export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const profile = await loadProfile(userId);

  const rules: PreferenceItem[] = profile.rules.map((r) => ({
    id: r.id,
    text: r.label || r.kind,
    source: 'rule',
    evidence: 0,
    active: r.hard,
  }));

  const learned: PreferenceItem[] = profile.learned
    .filter((p) => p.userVerdict !== 'rejected')
    .flatMap((p) => {
      // A claim that cannot be said in one sentence is not shown — and if it
      // can't be shown, it has no business acting on the calendar either.
      const text = describeClaim(p);
      if (!text) return [];
      return [
        {
          id: p.id,
          text,
          source: 'learned',
          evidence: p.evidenceCount,
          // Shown either way, but the UI marks the ones still gathering
          // evidence so "it noticed but hasn't acted yet" is legible rather
          // than spooky.
          active: p.userVerdict === 'confirmed' || p.evidenceCount >= MIN_EVIDENCE,
        } satisfies PreferenceItem,
      ];
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.evidence - a.evidence);

  return Response.json({ items: [...rules, ...learned] } satisfies PreferencesResponse);
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const url = new URL(request.url);
  const id = url.searchParams.get('id') ?? '';
  const source = url.searchParams.get('source') ?? 'learned';
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });

  // A stated rule is deleted outright. An inferred one is marked rejected
  // instead, so the next few corrections don't simply re-derive the thing the
  // user just removed — which is what makes an adaptive system feel deaf.
  const ok = source === 'rule' ? await deleteRule(userId, id) : await forgetLearned(userId, id);
  if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json({ ok: true });
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  let body: { id?: unknown; verdict?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const verdict = body.verdict === 'confirmed' || body.verdict === 'rejected' ? body.verdict : null;
  if (!id || !verdict) {
    return Response.json({ error: 'id and verdict are required.' }, { status: 400 });
  }

  // Confirming bypasses the evidence gate: the user has said it outright, which
  // is worth more than any number of inferred data points.
  const ok = await setLearnedVerdict(userId, id, verdict);
  if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json({ ok: true });
}
