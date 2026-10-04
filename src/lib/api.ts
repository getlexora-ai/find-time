import { Platform } from 'react-native';

/**
 * One wrapper for every call to the `+api.ts` routes. Better Auth's session
 * is a cookie: web is same-origin, so the browser sends it; native has no
 * cookie jar, so the getter returns the cookie from SecureStore and it goes
 * out as a `Cookie` header (src/lib/auth-client.ts).
 *
 * `AuthBridge` in `app/_layout.tsx` installs the getter once the session is
 * known, with the user id, and again on sign-in / sign-out / account switch.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter | null = null;
/** Id of the signed-in user, or null. Stores key their local caches by it. */
let userId: string | null = null;
const tokenListeners = new Set<() => void>();

export function setTokenGetter(fn: TokenGetter | null, user: string | null = null): void {
  getToken = fn;
  userId = fn ? user : null;
  if (fn) tokenListeners.forEach((l) => l());
}

export function hasTokenGetter(): boolean {
  return getToken !== null;
}

/**
 * Who the data on screen belongs to. Anything cached on the device must be
 * keyed by this: two accounts signed in on one browser share its storage, and
 * an unkeyed cache shows the first account's calendar to the second.
 */
export function currentUserId(): string | null {
  return userId;
}

/**
 * Run `listener` each time a token getter is installed — on first mount and
 * again whenever AuthBridge installs a new one (sign-in, account switch).
 *
 * For stores that load at import time. Those run before AuthBridge has
 * mounted, so their first request goes out without a session and 401s; this
 * is how they retry once a session exists, instead of waiting for some unrelated
 * screen action to happen to refresh them.
 */
export function onTokenGetter(listener: () => void): () => void {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const cookie = getToken ? await getToken() : null;
    if (cookie) headers.set('Cookie', cookie);
  } catch {
    // No session → the request goes out unauthenticated and the route answers 401.
  }
  return fetch(`${BASE}${path}`, {
    // Web: the browser attaches the session cookie. Native: set above, and
    // `omit` keeps the platform from adding its own.
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
    ...init,
    headers,
  });
}
