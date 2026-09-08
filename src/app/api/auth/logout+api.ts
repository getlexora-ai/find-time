import { sessionClearCookie } from '@/server/auth/session';

/**
 * POST /api/auth/logout — clear the session cookie.
 *
 * Works for both password and Google sessions. Connected Google accounts +
 * tokens stay in the DB (reconnect is a fresh consent); DELETE
 * /api/calendar/accounts/[id] is what removes those.
 */
export async function POST(request: Request): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', sessionClearCookie(request));
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}
