import type { TaskActionResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured } from '@/server/db';
import { getHabit } from '@/server/habits-repo';
import { stopHabit } from '@/server/task-actions';
import { userTimeZone } from '@/server/ai/repo';
import { DEFAULT_ZONE, wallClockNow } from '@/server/wall-clock';

/**
 * PATCH /api/habits/[id] — { stop: true } from the Tasks screen: the habit
 * stops and its upcoming sessions come off the calendar. Past ones stay.
 * Changing a habit ("gym 2x a week") goes through Plan with AI.
 */
export async function PATCH(request: Request, { id }: Record<string, string>): Promise<Response> {
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
  if (body.stop !== true) return Response.json({ error: 'Send { stop: true }.' }, { status: 400 });

  try {
    const habit = await getHabit(userId, id);
    if (!habit) return Response.json({ error: 'Not found.' }, { status: 404 });
    // Now on the user's clock — calendar times are wall-clock (src/server/wall-clock.ts).
    const nowMs = wallClockNow(await userTimeZone(userId).catch(() => DEFAULT_ZONE));
    const r = await stopHabit(userId, habit, new Date(nowMs).toISOString());
    return Response.json(r satisfies TaskActionResponse);
  } catch (err) {
    console.error('PATCH /api/habits/[id]', err);
    return Response.json({ error: 'Failed to stop the habit.' }, { status: 500 });
  }
}
