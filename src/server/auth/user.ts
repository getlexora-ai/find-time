import { auth, authConfigured } from '@/server/auth/auth';
import { query, tx } from '@/server/db';

/**
 * Who is calling. Better Auth (src/server/auth/auth.ts) owns sessions: web
 * sends its httpOnly `ft.session_token` cookie (same origin), native sends the
 * same cookie as a `Cookie` header from SecureStore (src/lib/api.ts). Here we
 * resolve it to the user id.
 *
 * `users` in Postgres is the thin row the calendar tables FK to
 * (`scheduler_profiles`, `connected_accounts`, `calendars`, `calendar_events`
 * all `references users(id) on delete cascade`), keyed by the Better Auth user
 * id. It is filled lazily on first sight of a user; deleting it cascades
 * everything away.
 *
 * Server-only — never import from the app bundle.
 */

// One DB round trip per user per process, not per request.
const ensured = new Set<string>();

/** The `users` row is the id and nothing else: name and email live in `auth_user`. */
async function ensureUser(userId: string): Promise<void> {
  if (ensured.has(userId)) return;
  await query(`insert into users (id) values ($1) on conflict (id) do nothing`, [userId]);
  ensured.add(userId);
}

/**
 * The signed-in user id for this request, or null. On a hit it also
 * guarantees the mirror `users` row exists, so callers can insert child rows
 * straight away.
 */
export async function requireUserId(req: Request): Promise<string | null> {
  if (!authConfigured()) return null;
  const session = await auth().api.getSession({ headers: req.headers });
  const id = session?.user.id;
  if (!id) return null;

  // A DB failure here is a 500, not a silent sign-out.
  await ensureUser(id);
  return id;
}

/** First name for greetings and the onboarding form ('' when unknown). */
export async function firstNameOf(userId: string): Promise<string> {
  const rows = await query<{ name: string }>(`select name from auth_user where id = $1`, [userId]);
  return (rows[0]?.name ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Rename, keeping any last name already there. */
export async function setFirstName(userId: string, firstName: string): Promise<void> {
  await query(
    `update auth_user set name = $2 || coalesce(substring(name from '\\s.*$'), ''), "updatedAt" = now() where id = $1`,
    [userId, firstName],
  );
}

/** `/app` stops sending this user to `/welcome`. */
export async function markOnboarded(userId: string): Promise<void> {
  await query(`update auth_user set onboarded = true, "updatedAt" = now() where id = $1`, [userId]);
}

/**
 * Delete the account: the `users` row (FKs cascade to all calendar data) and
 * the `auth_user` row (cascades to sessions and linked sign-in accounts), in
 * one transaction.
 */
export async function deleteAccount(userId: string): Promise<void> {
  await tx(async (c) => {
    await c.query(`delete from users where id = $1`, [userId]);
    await c.query(`delete from auth_user where id = $1`, [userId]);
  });
  ensured.delete(userId);
}

/** 401 JSON for a route that needs a signed-in user. */
export function unauthorized(): Response {
  return Response.json({ error: 'sign_in_required' }, { status: 401 });
}
