import { emailOTPClient, inferAdditionalFields } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

/**
 * Better Auth client on web (native: `auth-client.ts`, same exports). Same
 * origin as the API, so the browser carries the httpOnly session cookie by
 * itself. The page is also rendered on the server (`web.output: "server"`),
 * where there is no window — the site URL stands in there.
 */
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');

export const authClient = createAuthClient({
  baseURL: typeof window !== 'undefined' ? window.location.origin : SITE,
  plugins: [emailOTPClient(), inferAdditionalFields({ user: { onboarded: { type: 'boolean', input: false } } })],
});

/** Nothing to attach on web: the browser sends the cookie. */
export async function sessionCookie(): Promise<string | null> {
  return null;
}
