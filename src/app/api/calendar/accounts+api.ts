import { requireUserId } from '@/server/auth/user';
import { isConfigured } from '@/server/db';
import { listAccountsWithCalendars } from '@/server/accounts-repo';

/**
 * GET /api/calendar/accounts — the signed-in user's Google connections + their
 * calendars, plus the profile for the sidebar chip. `{ signedIn: false }` when
 * there is no valid session (the `/app` gate is what actually redirects).
 */
export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ signedIn: false, user: null, accounts: [] });
  }
  const userId = await requireUserId(request);
  if (!userId) {
    return Response.json({ signedIn: false, user: null, accounts: [] });
  }
  const accounts = await listAccountsWithCalendars(userId, { live: true });
  return Response.json({ signedIn: true, user: { id: userId }, accounts });
}
