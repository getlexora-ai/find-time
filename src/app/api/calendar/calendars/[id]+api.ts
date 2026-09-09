import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured } from '@/server/db';
import { setCalendarReadEnabled } from '@/server/accounts-repo';

/**
 * PATCH /api/calendar/calendars/[id] — body `{ readEnabled: boolean }`.
 * Disabling hides that calendar's events immediately; re-enabling brings them
 * back on the next sync.
 */
export async function PATCH(request: Request, { id }: Record<string, string>): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  let readEnabled: unknown;
  try {
    ({ readEnabled } = (await request.json()) as { readEnabled?: unknown });
  } catch {
    return Response.json({ error: 'Invalid body.' }, { status: 400 });
  }
  if (typeof readEnabled !== 'boolean') {
    return Response.json({ error: 'readEnabled must be a boolean.' }, { status: 400 });
  }
  const ok = await setCalendarReadEnabled(userId, id, readEnabled);
  if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json({ ok: true });
}
