import { isConfigured } from '@/server/db';
import { sessionSetCookie } from '@/server/auth/session';
import { authenticate } from '@/server/users-repo';

/**
 * POST /api/auth/login — { email, password }.
 *
 * Verifies the password, sets `ft_session`. 401 (same message) whether the email
 * is unknown or the password is wrong.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  if (!email || !password) {
    return Response.json({ error: 'Email and password are required.' }, { status: 400 });
  }

  try {
    const user = await authenticate(email, password);
    if (!user) {
      return Response.json({ error: 'Wrong email or password.' }, { status: 401 });
    }
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', sessionSetCookie(request, user.id));
    return new Response(JSON.stringify({ ok: true, user }), { status: 200, headers });
  } catch (err) {
    console.error('POST /api/auth/login', err);
    return Response.json({ error: 'Could not sign you in.' }, { status: 500 });
  }
}
