import { isConfigured } from '@/server/db';
import { currentUserId, DEMO_USER_ID } from '@/server/auth/session';
import { listAccountsWithCalendars } from '@/server/accounts-repo';
import { syncAccount } from '@/server/google/sync';

/**
 * POST /api/calendar/sync — pull every connected Google account for the session
 * user. Throttled: an account synced within the last minute is skipped unless
 * `?force=1`. Called after connect and on the calendar screen's mount.
 */
const THROTTLE_MS = 60_000;

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured.' }, { status: 503 });
  }
  const userId = currentUserId(request);
  if (userId === DEMO_USER_ID) {
    return Response.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const force = new URL(request.url).searchParams.get('force') === '1';
  const accounts = await listAccountsWithCalendars(userId);

  let imported = 0;
  let deleted = 0;
  let synced = 0;
  const errors: { account: string; error: string }[] = [];

  for (const a of accounts) {
    if (!force && a.lastSyncAt && Date.now() - Date.parse(a.lastSyncAt) < THROTTLE_MS) continue;
    try {
      const r = await syncAccount(userId, a.id);
      imported += r.imported;
      deleted += r.deleted;
      synced++;
    } catch (err) {
      errors.push({ account: a.email, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return Response.json({ accounts: accounts.length, synced, imported, deleted, errors });
}
