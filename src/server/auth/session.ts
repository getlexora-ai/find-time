import { createHmac, timingSafeEqual } from 'node:crypto';

/** Constant-time string compare (kept local so this module has no local runtime deps). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Session = an httpOnly cookie whose value IS the user id, signed with
 * `SESSION_SECRET` (HMAC-SHA256). This is the model `docs/db/data-layer.md`
 * already specifies ("`ft_session` is an httpOnly cookie whose value is the user
 * id"). "Sign in with Google" sets it; `currentUserId` reads it and falls back
 * to the demo user so the logged-out calendar keeps working on seed data.
 *
 * Server-only.
 */

export const SESSION_COOKIE = 'ft_session';
export const OAUTH_STATE_COOKIE = 'ft_oauth_state';
export const DEMO_USER_ID = 'u1';

const YEAR = 60 * 60 * 24 * 365;
const TEN_MIN = 60 * 10;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set — cannot sign sessions.');
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

/** The signed-in user id, or the demo user when there is no valid session. */
export function currentUserId(req: Request): string {
  const raw = parseCookies(req)[SESSION_COOKIE];
  if (!raw) return DEMO_USER_ID;
  const dot = raw.lastIndexOf('.');
  if (dot === -1) return DEMO_USER_ID;
  const value = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  try {
    return value && safeEqual(sig, sign(value)) ? value : DEMO_USER_ID;
  } catch {
    return DEMO_USER_ID;
  }
}

export function isSignedIn(req: Request): boolean {
  return currentUserId(req) !== DEMO_USER_ID;
}

function attrs(maxAge: number, secure: boolean): string {
  return [
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

/** True unless the request is plain-http localhost (dev). */
function wantsSecure(req: Request): boolean {
  const url = new URL(req.url);
  return url.protocol === 'https:' || (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1');
}

export function sessionSetCookie(req: Request, userId: string): string {
  const value = `${userId}.${sign(userId)}`;
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; ${attrs(YEAR, wantsSecure(req))}`;
}

export function sessionClearCookie(req: Request): string {
  return `${SESSION_COOKIE}=; ${attrs(0, wantsSecure(req))}`;
}

export function stateSetCookie(req: Request, state: string): string {
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; ${attrs(TEN_MIN, wantsSecure(req))}`;
}

export function stateClearCookie(req: Request): string {
  return `${OAUTH_STATE_COOKIE}=; ${attrs(0, wantsSecure(req))}`;
}
