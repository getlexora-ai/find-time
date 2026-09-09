import { createClerkClient, verifyToken } from '@clerk/backend';

import { query } from '@/server/db';

/**
 * Clerk is the identity provider. The app sends its session token as
 * `Authorization: Bearer <token>` on every /api call; here we verify it and
 * return the Clerk user id (`user_...`).
 *
 * `users` in Postgres is a thin mirror kept only so the calendar tables can FK
 * to it (`scheduler_profiles`, `connected_accounts`, `calendars`,
 * `calendar_events` all `references users(id) on delete cascade`). It is filled
 * lazily on first sight of a user; deleting the row cascades everything away.
 *
 * Server-only — never import from the app bundle.
 */

const SECRET = process.env.CLERK_SECRET_KEY;

export const clerkClient = createClerkClient({ secretKey: SECRET ?? '' });

export function clerkConfigured(): boolean {
  return Boolean(SECRET);
}

function bearer(req: Request): string | null {
  const m = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '');
  return m ? m[1] : null;
}

// One DB round trip per user per process, not per request.
const ensured = new Set<string>();

async function ensureUser(userId: string): Promise<void> {
  if (ensured.has(userId)) return;
  let email = '';
  let name = '';
  try {
    const u = await clerkClient.users.getUser(userId);
    email =
      u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ??
      u.emailAddresses[0]?.emailAddress ??
      '';
    name = [u.firstName, u.lastName].filter(Boolean).join(' ');
  } catch (err) {
    // A network blip talking to Clerk shouldn't 500 the whole request — the row
    // just gets an empty email/name and is corrected on the next call.
    console.error('ensureUser: clerk getUser failed', err);
  }
  await query(
    `insert into users (id, email, name) values ($1, $2, $3)
     on conflict (id) do update set email = excluded.email, name = excluded.name`,
    [userId, email, name],
  );
  ensured.add(userId);
}

/**
 * The signed-in Clerk user id for this request, or null. On a hit it also
 * guarantees the mirror `users` row exists, so callers can insert child rows
 * straight away.
 */
export async function requireUserId(req: Request): Promise<string | null> {
  if (!SECRET) return null;
  const token = bearer(req);
  if (!token) return null;

  let sub: string | undefined;
  try {
    ({ sub } = await verifyToken(token, { secretKey: SECRET }));
  } catch {
    return null; // invalid / expired token — a genuine 401
  }
  if (!sub) return null;

  // A DB failure here is a 500, not a silent sign-out.
  await ensureUser(sub);
  return sub;
}

/** 401 JSON for a route that needs a signed-in user. */
export function unauthorized(): Response {
  return Response.json({ error: 'sign_in_required' }, { status: 401 });
}
