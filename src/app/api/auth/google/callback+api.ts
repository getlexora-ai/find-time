import { randomUUID } from 'node:crypto';

import { readOAuthState, stateClearCookie } from '@/server/auth/session';
import { tx } from '@/server/db';
import { decodeIdToken, exchangeCode, oauthConfigured, storeTokens, SCOPES } from '@/server/google/oauth';
import { syncAccount } from '@/server/google/sync';

/**
 * GET /api/auth/google/callback — Google redirects here with `?code` + `?state`.
 *
 * The signed `state` carries the Clerk user id that started the connect. We
 * verify it, exchange the code, attach a `connected_accounts` row to that user,
 * store the encrypted tokens, kick off the first sync, and send the browser back
 * to /app. No session is set — Clerk already owns that. Failure → /app?connect=error.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const back = (params: string) =>
    redirect(new URL(`/app${params}`, url).toString(), [stateClearCookie(request)]);

  if (!oauthConfigured()) return back('?connect=error');

  const code = url.searchParams.get('code');
  const ownerId = readOAuthState(request, url.searchParams.get('state'));
  if (url.searchParams.get('error') || !code || !ownerId) {
    return back('?connect=error');
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.id_token) throw new Error('no id_token in token response');
    const { email, name } = decodeIdToken(tokens.id_token);

    const accountId = await tx(async (c) => {
      // The mirror row is normally already there (requireUserId in /start). This
      // is just an FK backstop; it never overwrites the Clerk-sourced identity.
      await c.query(
        `insert into users (id, email, name) values ($1, $2, $3)
         on conflict (id) do nothing`,
        [ownerId, email, name],
      );
      const existing = await c.query<{ id: string }>(
        `select id from connected_accounts
           where user_id = $1 and provider = 'google' and lower(email) = lower($2)`,
        [ownerId, email],
      );
      const id = existing.rows[0]?.id ?? `acct_${randomUUID()}`;
      await c.query(
        `insert into connected_accounts
           (id, user_id, provider, kind, auth_type, email, display_name, scopes, sync_status)
         values ($1, $2, 'google', 'calendar', 'oauth', $3, $4, $5, 'idle')
         on conflict (id) do update set
           display_name = excluded.display_name,
           scopes = excluded.scopes,
           sync_error = null`,
        [id, ownerId, email, name, tokens.scope?.split(' ') ?? SCOPES],
      );
      return id;
    });

    await storeTokens(accountId, tokens);

    // First pull is fire-and-forget; the UI also syncs on mount.
    void syncAccount(ownerId, accountId).catch((err) =>
      console.error('initial syncAccount failed', err),
    );

    return redirect(new URL('/app?connect=ok', url).toString(), [stateClearCookie(request)]);
  } catch (err) {
    console.error('google callback', err);
    return back('?connect=error');
  }
}

function redirect(location: string, cookies: string[]): Response {
  const headers = new Headers({ Location: location });
  for (const c of cookies) headers.append('Set-Cookie', c);
  return new Response(null, { status: 302, headers });
}
