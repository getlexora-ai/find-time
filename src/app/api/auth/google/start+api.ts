import { requireUserId, unauthorized } from '@/server/auth/user';
import { asReturnPath, makeOAuthState, returnCookie } from '@/server/auth/session';
import { authUrl, oauthConfigured } from '@/server/google/oauth';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/auth/google/start — begin a Google Calendar connect for the
 * signed-in user.
 *
 * Google no longer logs anyone in; this only grants Calendar access (oauth.ts SCOPES). Returns
 * `{ url }` for the client to redirect to, and sets a short-lived
 * `ft_oauth_state` nonce cookie. The signed `state` carries the user id so
 * the callback knows who owns the new connection.
 *
 * Optional body `{ returnTo: '/welcome' }` (onboarding) sends the browser back
 * there instead of `/app`; anything else falls back to `/app`.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const limited = await enforceRateLimit(request, 'google-connect', { kind: 'user', userId });
  if (limited) return limited;

  if (!oauthConfigured()) {
    return Response.json(
      { error: 'Google OAuth is not configured (GOOGLE_CLIENT_ID / _SECRET / _REDIRECT_URI).' },
      { status: 503 },
    );
  }

  // makeOAuthState throws when SESSION_SECRET is unset. Uncaught, that was an
  // empty 500 and the sidebar's Connect button appeared to do nothing at all.
  let state: string;
  let cookie: string;
  try {
    ({ state, cookie } = makeOAuthState(request, userId));
  } catch (err) {
    console.error('google/start: cannot sign the OAuth state', err);
    return Response.json(
      { error: 'Google connect is not configured on the server (SESSION_SECRET missing).' },
      { status: 503 },
    );
  }

  let returnTo: unknown;
  try {
    returnTo = ((await request.json()) as { returnTo?: unknown })?.returnTo;
  } catch {
    // no body: the calendar's own Connect button
  }

  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookie);
  headers.append('Set-Cookie', returnCookie(request, asReturnPath(returnTo)));
  return new Response(JSON.stringify({ url: authUrl(state) }), { status: 200, headers });
}
