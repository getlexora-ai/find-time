import { Platform } from 'react-native';

/**
 * One wrapper for every call to the `+api.ts` routes. It attaches the Clerk
 * session token as `Authorization: Bearer …` so the same code path works on
 * web and native (native has no cookie jar).
 *
 * `getToken` comes from Clerk's `useAuth()` hook, which can only run inside a
 * component — `AuthBridge` in `app/_layout.tsx` pushes it here once mounted.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

type TokenGetter = () => Promise<string | null>;
let getToken: TokenGetter | null = null;

export function setTokenGetter(fn: TokenGetter | null): void {
  getToken = fn;
}

export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  try {
    const token = getToken ? await getToken() : null;
    if (token) headers.set('Authorization', `Bearer ${token}`);
  } catch {
    // No token → the request goes out unauthenticated and the route answers 401.
  }
  return fetch(`${BASE}${path}`, {
    // Web still sends Clerk's cookies too; harmless alongside the bearer token.
    credentials: Platform.OS === 'web' ? 'include' : 'omit',
    ...init,
    headers,
  });
}
