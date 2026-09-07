import { isConfigured } from '@/server/db';
import { currentUserId, DEMO_USER_ID } from '@/server/auth/session';
import { getUserProfile, listAccountsWithCalendars } from '@/server/accounts-repo';

/**
 * GET /api/calendar/accounts — the signed-in user's Google connections + their
 * calendars, plus the profile for the sidebar chip. `{ signedIn: false }` when
 * there is no session (the logged-out calendar renders on seed data).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ signedIn: false, user: null, accounts: [] });
  }
  const userId = currentUserId(request);
  if (userId === DEMO_USER_ID) {
    return Response.json({ signedIn: false, user: null, accounts: [] });
  }
  const [user, accounts] = await Promise.all([
    getUserProfile(userId),
    listAccountsWithCalendars(userId),
  ]);
  return Response.json({ signedIn: true, user, accounts });
}
