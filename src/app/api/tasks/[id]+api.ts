import type { TaskActionResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/user';
import { isConfigured } from '@/server/db';
import { POSTPONE_PRESETS, type PostponePreset, finishTask, postponeTask, presetInstant } from '@/server/task-actions';
import { getTask, updateTask } from '@/server/tasks-repo';
import { userTimeZone } from '@/server/ai/repo';
import { DEFAULT_ZONE, wallClockNow } from '@/server/wall-clock';

const iso = (ms: number) => new Date(ms).toISOString();

/**
 * PATCH /api/tasks/[id] — one action from the Tasks screen:
 *   { done: true }                      finish it; its upcoming sessions come off
 *   { postpone: '1h'|'3h'|'tomorrow'|'next-week' }
 *                                       hold it until then; earlier sessions come off
 *   { notBefore: null }                 let it start any time again
 * The same helpers the chat uses (src/server/task-actions.ts).
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

  try {
    const task = await getTask(userId, id);
    if (!task) return Response.json({ error: 'Not found.' }, { status: 404 });
    // Now on the user's clock — calendar times are wall-clock (src/server/wall-clock.ts).
    const nowMs = wallClockNow(await userTimeZone(userId).catch(() => DEFAULT_ZONE));
    const nowISO = iso(nowMs);

    if (body.done === true) {
      const r = await finishTask(userId, task, nowISO);
      return Response.json(r satisfies TaskActionResponse);
    }
    if (typeof body.postpone === 'string' && (POSTPONE_PRESETS as readonly string[]).includes(body.postpone)) {
      const at = iso(presetInstant(body.postpone as PostponePreset, nowMs));
      const r = await postponeTask(userId, task, at, nowISO);
      return Response.json(r satisfies TaskActionResponse);
    }
    if ('notBefore' in body && body.notBefore === null) {
      const updated = await updateTask(userId, task.id, { notBefore: null });
      return Response.json({ task: updated, cleared: 0 } satisfies TaskActionResponse);
    }
    return Response.json({ error: 'Send done, postpone or notBefore: null.' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/tasks/[id]', err);
    return Response.json({ error: 'Failed to update the task.' }, { status: 500 });
  }
}
