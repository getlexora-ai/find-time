import { TRACK_ACTIONS, TRACK_STEPS } from '@/auth/onboarding';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured, query } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/onboarding/event — `{ step, action, client }`, one row in
 * `onboarding_events` (db/022) for the drop-off funnel. Best effort: the
 * client never waits on it, and it answers 204 even without a database.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'onboarding-event', { kind: 'user', userId });
  if (limited) return limited;

  let body: { step?: unknown; action?: unknown; client?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }
  const step = (TRACK_STEPS as readonly unknown[]).includes(body.step) ? (body.step as string) : null;
  const action = (TRACK_ACTIONS as readonly unknown[]).includes(body.action) ? (body.action as string) : null;
  if (!step || !action) return Response.json({ error: 'Unknown step or action.' }, { status: 400 });
  const client = body.client === 'native' ? 'native' : 'web';

  if (isConfigured()) {
    try {
      await query(`insert into onboarding_events (user_id, step, action, client) values ($1, $2, $3, $4)`, [
        userId,
        step,
        action,
        client,
      ]);
    } catch (err) {
      // a missing table (022 not applied) must not break setup
      console.error('POST /api/onboarding/event', err);
    }
  }
  return new Response(null, { status: 204 });
}
