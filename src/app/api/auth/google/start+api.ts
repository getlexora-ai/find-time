import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { makeOAuthState } from '@/server/auth/session';
import { authUrl, oauthConfigured } from '@/server/google/oauth';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/auth/google/start — begin a Google Calendar connect for the
 * signed-in Clerk user.
 *
 * Google no longer logs anyone in; this only grants `calendar.readonly`. Returns
 * `{ url }` for the client to redirect to, and sets a short-lived
 * `ft_oauth_state` nonce cookie. The signed `state` carries the Clerk user id so
 * the callback knows who owns the new connection.
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

  const { state, cookie } = makeOAuthState(request, userId);
  const headers = new Headers({ 'Content-Type': 'application/json' });
  headers.append('Set-Cookie', cookie);
  return new Response(JSON.stringify({ url: authUrl(state) }), { status: 200, headers });
}
