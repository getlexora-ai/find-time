import { randomUUID } from 'node:crypto';

import { readOAuthState, readReturnPath, returnClearCookie, stateClearCookie } from '@/server/auth/session';
import { tx } from '@/server/db';
import { decodeIdToken, exchangeCode, oauthConfigured, storeTokens, SCOPES } from '@/server/google/oauth';
import { syncAccount } from '@/server/google/sync';

/**
 * GET /api/auth/google/callback — Google redirects here with `?code` + `?state`.
 *
 * The signed `state` carries the user id that started the connect. We
 * verify it, exchange the code, attach a `connected_accounts` row to that user,
 * store the encrypted tokens, kick off the first sync, and send the browser back
 * to /app — or to /welcome when onboarding started the connect (the
 * `ft_oauth_return` cookie). No session is set — Better Auth already owns that.
 * Failure → `<that page>?connect=error`.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const to = readReturnPath(request);
  const clear = [stateClearCookie(request), returnClearCookie(request)];
  const back = (params: string) => redirect(new URL(`${to}${params}`, url).toString(), clear);

  if (!oauthConfigured()) return back('?connect=error');

  const code = url.searchParams.get('code');
  const ownerId = readOAuthState(request, url.searchParams.get('state'));
  if (url.searchParams.get('error') || !code || !ownerId) {
    return back('?connect=error');
  }

  try {
    const tokens = await exchangeCode(code);
    if (!tokens.id_token) throw new Error('no id_token in token response');
    // Google's opaque account id, not the email: no address is stored.
    const { sub } = decodeIdToken(tokens.id_token);

    const accountId = await tx(async (c) => {
      // The mirror row is normally already there (requireUserId in /start). This
      // is just an FK backstop; it never touches the identity in `auth_user`.
      await c.query(`insert into users (id) values ($1) on conflict (id) do nothing`, [ownerId]);
      // ponytail: a row from before db/024 has no subject yet; the first
      // reconnect adopts it. Assumes one Google account per user, true today.
      const existing = await c.query<{ id: string }>(
        `select id from connected_accounts
           where user_id = $1 and provider = 'google' and (provider_subject = $2 or provider_subject is null)
           order by provider_subject nulls last limit 1`,
        [ownerId, sub],
      );
      const id = existing.rows[0]?.id ?? `acct_${randomUUID()}`;
      await c.query(
        `insert into connected_accounts
           (id, user_id, provider, kind, auth_type, provider_subject, scopes, sync_status)
         values ($1, $2, 'google', 'calendar', 'oauth', $3, $4, 'idle')
         on conflict (id) do update set
           provider_subject = excluded.provider_subject,
           scopes = excluded.scopes,
           sync_error = null`,
        [id, ownerId, sub, tokens.scope?.split(' ') ?? SCOPES],
      );
      return id;
    });

    await storeTokens(accountId, tokens);

    // First pull is fire-and-forget; the UI also syncs on mount.
    void syncAccount(ownerId, accountId).catch((err) =>
      console.error('initial syncAccount failed', err),
    );

    return back('?connect=ok');
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
