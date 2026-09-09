import { clerkClient, requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured, query } from '@/server/db';

/**
 * DELETE /api/me — wipe everything for the signed-in user: the `users` row
 * (FKs cascade to scheduler_profiles, notification_prefs, constraints,
 * connected_accounts, calendars, calendar_events) then the Clerk account.
 *
 * Triggered from the "Delete account" item in Clerk's `<UserButton />` menu.
 */
export async function DELETE(request: Request): Promise<Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  try {
    await query(`delete from users where id = $1`, [userId]);
  } catch (err) {
    console.error('DELETE /api/me: db', err);
    return Response.json({ error: 'Could not delete your data.' }, { status: 500 });
  }

  try {
    await clerkClient.users.deleteUser(userId);
  } catch (err) {
    // Data is already gone; the Clerk account is now an empty shell. The client
    // still signs out. Surface it so a retry / manual cleanup is possible.
    console.error('DELETE /api/me: clerk', err);
    return Response.json({ ok: true, clerkDeleted: false }, { status: 200 });
  }

  return Response.json({ ok: true, clerkDeleted: true });
}
