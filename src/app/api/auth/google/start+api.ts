import { randomUUID } from 'node:crypto';

import { authUrl, oauthConfigured } from '@/server/google/oauth';
import { stateSetCookie } from '@/server/auth/session';

/**
 * GET /api/auth/google/start — kick off "Sign in with Google".
 *
 * Sets a short-lived `ft_oauth_state` cookie (CSRF) and 302s to Google's consent
 * screen. The browser comes back to /api/auth/google/callback.
 */
export async function GET(request: Request): Promise<Response> {
  if (!oauthConfigured()) {
    return Response.json(
      { error: 'Google OAuth is not configured (GOOGLE_CLIENT_ID / _SECRET / _REDIRECT_URI).' },
      { status: 503 },
    );
  }

  const state = randomUUID();
  const headers = new Headers({ Location: authUrl(state) });
  headers.append('Set-Cookie', stateSetCookie(request, state));
  return new Response(null, { status: 302, headers });
}
