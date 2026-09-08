import { isConfigured } from '@/server/db';
import { passwordPolicyError } from '@/server/auth/password';
import { sessionSetCookie } from '@/server/auth/session';
import { createPasswordUser } from '@/server/users-repo';

/**
 * POST /api/auth/signup — { email, password, name? }.
 *
 * Creates a password account, sets `ft_session`, returns the public user. 409 if
 * the email is taken. "Continue with Google" is the other path
 * (/api/auth/google/start).
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }

  let body: { email?: string; password?: string; name?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const email = (body.email ?? '').trim();
  const password = body.password ?? '';
  const name = (body.name ?? '').trim().slice(0, 120);

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const pwErr = passwordPolicyError(password);
  if (pwErr) return Response.json({ error: pwErr }, { status: 400 });

  try {
    const user = await createPasswordUser(email, password, name);
    if (!user) {
      return Response.json({ error: 'An account with that email already exists.' }, { status: 409 });
    }
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.append('Set-Cookie', sessionSetCookie(request, user.id));
    return new Response(JSON.stringify({ ok: true, user }), { status: 201, headers });
  } catch (err) {
    console.error('POST /api/auth/signup', err);
    return Response.json({ error: 'Could not create the account.' }, { status: 500 });
  }
}
