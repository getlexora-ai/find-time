import { deleteAccount, requireUserId, unauthorized } from '@/server/auth/user';
import { isConfigured } from '@/server/db';

/**
 * DELETE /api/me — wipe everything for the signed-in user in one transaction:
 * the `users` row (FKs cascade to scheduler_profiles, notification_prefs,
 * constraints, connected_accounts, calendars, calendar_events) and the
 * `auth_user` row (cascades to sessions and linked sign-in accounts).
 *
 * Triggered from "Delete account" in the account menu (AccountButton).
 */
export async function DELETE(request: Request): Promise<Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  try {
    await deleteAccount(userId);
  } catch (err) {
    console.error('DELETE /api/me', err);
    return Response.json({ error: 'Could not delete your data.' }, { status: 500 });
  }
  return Response.json({ ok: true });
}
