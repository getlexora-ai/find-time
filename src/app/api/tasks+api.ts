import type { TasksResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured } from '@/server/db';
import { listHabits } from '@/server/habits-repo';
import { listOpenTasks } from '@/server/tasks-repo';

/**
 * GET /api/tasks — the open backlog and the habits, for the Tasks screen.
 * Adding goes through Plan with AI ("Add task: …", "Habit: …"), so a missing
 * length is asked for there, never guessed by a form default.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  try {
    const [tasks, habits] = await Promise.all([listOpenTasks(userId), listHabits(userId)]);
    return Response.json({ tasks, habits } satisfies TasksResponse);
  } catch (err) {
    console.error('GET /api/tasks', err);
    return Response.json({ error: 'Failed to load tasks.' }, { status: 500 });
  }
}
