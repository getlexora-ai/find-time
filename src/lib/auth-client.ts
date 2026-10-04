import { expoClient } from '@better-auth/expo/client';
import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';
import * as SecureStore from 'expo-secure-store';

/**
 * Better Auth client on native (web: `auth-client.web.ts`, same exports).
 * The Expo plugin keeps the session cookie in SecureStore and opens Google
 * sign-in in the system browser, returning on the `findtime://` scheme.
 * The server is our own API (src/server/auth/auth.ts) at EXPO_PUBLIC_API_URL.
 */
export const authClient = createAuthClient({
  baseURL: process.env.EXPO_PUBLIC_API_URL || 'https://www.usefindtime.com',
  plugins: [
    expoClient({ scheme: 'findtime', storagePrefix: 'findtime', cookiePrefix: 'ft', storage: SecureStore }),
    emailOTPClient(),
    inferAdditionalFields({ user: { onboarded: { type: 'boolean', input: false } } }),
  ],
});

/** The session cookie for `apiFetch` — native has no cookie jar. */
export async function sessionCookie(): Promise<string | null> {
  return authClient.getCookie() || null;
}
