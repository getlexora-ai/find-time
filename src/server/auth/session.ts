import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

/**
 * Google OAuth CSRF state. Clerk owns real sessions now (src/server/auth/clerk.ts);
 * all that survives here is the short-lived `state` for the calendar-connect
 * redirect, which the browser cannot carry an Authorization header through.
 *
 * The `state` value is `<clerkUserId>.<nonce>.<sig>`, with the matching bare
 * `<nonce>` set as an httpOnly cookie. The callback checks the signature and
 * that the nonce round-tripped, then trusts `<clerkUserId>` as the account owner.
 *
 * Server-only.
 */

export const OAUTH_STATE_COOKIE = 'ft_oauth_state';

const TEN_MIN = 60 * 10;

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set — cannot sign the OAuth state.');
  return s;
}

function sign(value: string): string {
  return createHmac('sha256', secret()).update(value).digest('base64url');
}

/** Parse a `Cookie:` header into a plain map. */
export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.get('cookie');
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function attrs(maxAge: number, secure: boolean): string {
  return ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`, secure ? 'Secure' : '']
    .filter(Boolean)
    .join('; ');
}

/**
 * Only mark cookies `Secure` on a genuine https request. `x-forwarded-proto`
 * covers a prod proxy (Railway); the URL protocol covers a direct request.
 */
function wantsSecure(req: Request): boolean {
  const fwd = req.headers.get('x-forwarded-proto');
  const proto = fwd ? fwd.split(',')[0].trim() : new URL(req.url).protocol.replace(':', '');
  return proto === 'https';
}

/** Build the `state` param + its cookie for a connect started by `userId`. */
export function makeOAuthState(req: Request, userId: string): { state: string; cookie: string } {
  const nonce = randomUUID();
  const payload = `${userId}.${nonce}`;
  return {
    state: `${payload}.${sign(payload)}`,
    cookie: `${OAUTH_STATE_COOKIE}=${encodeURIComponent(nonce)}; ${attrs(TEN_MIN, wantsSecure(req))}`,
  };
}

/** Verify a returned `state` against its cookie. Returns the owner id or null. */
export function readOAuthState(req: Request, state: string | null): string | null {
  if (!state) return null;
  const parts = state.split('.');
  if (parts.length !== 3) return null;
  const [userId, nonce, sig] = parts;
  const cookieNonce = parseCookies(req)[OAUTH_STATE_COOKIE];
  if (!userId || !nonce || !cookieNonce) return null;
  try {
    if (!safeEqual(sig, sign(`${userId}.${nonce}`))) return null;
    if (!safeEqual(nonce, cookieNonce)) return null;
    return userId;
  } catch {
    return null;
  }
}

export function stateClearCookie(req: Request): string {
  return `${OAUTH_STATE_COOKIE}=; ${attrs(0, wantsSecure(req))}`;
}
