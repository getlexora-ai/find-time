import { queryOne } from '../db';
import { decrypt, encrypt } from '../crypto';

/**
 * Google OAuth 2.0 (authorization-code flow) — no SDK, just `fetch`.
 *
 * Calendar-connect only — Clerk owns login now. `calendar.readonly` grants the
 * pull sync; the `openid email profile` scopes just name the connected account.
 * Tokens are stored AES-256-GCM-encrypted in `oauth_tokens` (db/010).
 *
 * Server-only — imported by the auth routes and src/server/google/sync.ts.
 */

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const REVOKE_ENDPOINT = 'https://oauth2.googleapis.com/revoke';

export const SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const REFRESH_SKEW_MS = 60_000; // refresh a minute before expiry

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
  id_token?: string;
};

function clientId(): string {
  const v = process.env.GOOGLE_CLIENT_ID;
  if (!v) throw new Error('GOOGLE_CLIENT_ID is not set.');
  return v;
}
function clientSecret(): string {
  const v = process.env.GOOGLE_CLIENT_SECRET;
  if (!v) throw new Error('GOOGLE_CLIENT_SECRET is not set.');
  return v;
}
function redirectUri(): string {
  const v = process.env.GOOGLE_REDIRECT_URI;
  if (!v) throw new Error('GOOGLE_REDIRECT_URI is not set.');
  return v;
}

export function oauthConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

export function authUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: redirectUri(),
    response_type: 'code',
    scope: SCOPES.join(' '),
    access_type: 'offline', // ask for a refresh token
    include_granted_scopes: 'true',
    prompt: 'consent', // force a refresh token even on re-consent
    state,
  });
  return `${AUTH_ENDPOINT}?${p.toString()}`;
}

async function postToken(body: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(
      `Google token endpoint ${res.status}: ${json.error ?? ''} ${json.error_description ?? ''}`.trim(),
    );
  }
  return json;
}

export function exchangeCode(code: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      code,
      client_id: clientId(),
      client_secret: clientSecret(),
      redirect_uri: redirectUri(),
      grant_type: 'authorization_code',
    }),
  );
}

function refresh(refreshToken: string): Promise<TokenResponse> {
  return postToken(
    new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
      grant_type: 'refresh_token',
    }),
  );
}

/**
 * The id_token comes straight from Google's TLS token endpoint over a channel we
 * authenticated with our client secret, so the payload is trusted without a
 * signature check (the standard carve-out for the direct code-exchange flow).
 */
export function decodeIdToken(jwt: string): { sub: string; email: string; name: string } {
  const [, payload] = jwt.split('.');
  if (!payload) throw new Error('malformed id_token');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
    sub?: string;
    email?: string;
    name?: string;
    given_name?: string;
  };
  if (!claims.sub || !claims.email) throw new Error('id_token missing sub/email');
  return { sub: claims.sub, email: claims.email, name: claims.name ?? claims.given_name ?? '' };
}

export async function storeTokens(
  connectedAccountId: string,
  tokens: { access_token: string; expires_in: number; refresh_token?: string; scope?: string },
): Promise<void> {
  const expiry = new Date(Date.now() + tokens.expires_in * 1000);
  const accessEnc = encrypt(tokens.access_token);
  const refreshEnc = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

  // Keep an existing refresh token if Google didn't send a new one.
  await queryOne(
    `insert into oauth_tokens (connected_account_id, access_token_enc, refresh_token_enc, expiry, scope)
     values ($1, $2, $3, $4, $5)
     on conflict (connected_account_id) do update set
       access_token_enc  = excluded.access_token_enc,
       refresh_token_enc = coalesce(excluded.refresh_token_enc, oauth_tokens.refresh_token_enc),
       expiry            = excluded.expiry,
       scope             = excluded.scope
     returning connected_account_id`,
    [connectedAccountId, accessEnc, refreshEnc, expiry.toISOString(), tokens.scope ?? SCOPES.join(' ')],
  );
}

/** A live access token for the account, refreshing + re-storing if it is near expiry. */
export async function getValidAccessToken(connectedAccountId: string): Promise<string> {
  const row = await queryOne<{
    access_token_enc: Buffer;
    refresh_token_enc: Buffer | null;
    expiry: Date;
  }>(
    `select access_token_enc, refresh_token_enc, expiry
       from oauth_tokens where connected_account_id = $1`,
    [connectedAccountId],
  );
  if (!row) throw new Error(`no oauth_tokens row for ${connectedAccountId}`);

  if (row.expiry.getTime() - Date.now() > REFRESH_SKEW_MS) {
    return decrypt(row.access_token_enc);
  }
  if (!row.refresh_token_enc) {
    throw new Error(`access token expired and no refresh token for ${connectedAccountId}`);
  }
  const refreshed = await refresh(decrypt(row.refresh_token_enc));
  await storeTokens(connectedAccountId, refreshed);
  return refreshed.access_token;
}

/** Best-effort token revocation on disconnect. Never throws. */
export async function revokeAccount(connectedAccountId: string): Promise<void> {
  try {
    const row = await queryOne<{ refresh_token_enc: Buffer | null; access_token_enc: Buffer }>(
      `select refresh_token_enc, access_token_enc from oauth_tokens where connected_account_id = $1`,
      [connectedAccountId],
    );
    const token = row?.refresh_token_enc
      ? decrypt(row.refresh_token_enc)
      : row
        ? decrypt(row.access_token_enc)
        : null;
    if (!token) return;
    await fetch(`${REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`, { method: 'POST' });
  } catch (err) {
    console.warn('revokeAccount (ignored)', err);
  }
}
