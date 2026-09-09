import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured } from '@/server/db';
import { deleteAccount } from '@/server/accounts-repo';

/**
 * DELETE /api/calendar/accounts/[id] — disconnect a Google account: revoke the
 * token (best effort), drop its imported events, its calendars, and the row.
 */
export async function DELETE(request: Request, { id }: Record<string, string>): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const ok = await deleteAccount(userId, id);
  if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
  return Response.json({ ok: true });
}
