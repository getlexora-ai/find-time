import { Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { ConsentManager } from '@/consent/ConsentManager';
import { setTokenGetter } from '@/lib/api';
import { sessionCookie } from '@/lib/auth-client';
import { useAuthState } from '@/lib/session';
import '../global.css';

/**
 * Root layout.
 *
 *   `index` → the marketing landing page on web (`index.web.tsx`), and a bare
 *             redirect to `/app` on native (`index.tsx`).
 *   `login` / `signup` → sign in / sign up on Better Auth (src/auth/dom on web).
 *             `/app` redirects to `/login` when signed out.
 *   `welcome` → first-run onboarding (web). `/app` redirects here until done.
 *   `app`   → the calendar, which owns its own providers in `app/_layout.tsx`.
 *
 * Auth is Better Auth (src/lib/auth-client.ts) — no provider needed; `AuthBridge`
 * hands the session getter and user id to `src/lib/api.ts` so non-React fetch
 * code can attach the session.
 * The calendar's theme/toast providers still live in `app/_layout.tsx`, not here.
 * `ConsentManager` is the site-wide cookie banner + settings dialog (web only;
 * src/consent).
 *
 * Auth is NOT touched on the public web pages (PUBLIC_WEB): no session lookup,
 * so nothing auth-related is requested or stored. Someone just reading the
 * landing or the legal pages hasn't asked to sign in, so sign-in cookies aren't
 * strictly necessary there (§25(2) TDDDG). These pages link onward with plain
 * <a href>, so the choice never changes mid-session.
 */
function AuthBridge() {
  const { isLoaded, user } = useAuthState();
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!isLoaded) return;
    // The user id rides along so stores can tell an account switch from a session refresh.
    setTokenGetter(sessionCookie, userId);
    return () => setTokenGetter(null);
  }, [isLoaded, userId]);
  return null;
}

const PUBLIC_WEB = new Set(['/', '/privacy', '/terms']);

export default function RootLayout() {
  const pathname = usePathname();
  const isPublic = Platform.OS === 'web' && PUBLIC_WEB.has(pathname);
  return (
    <>
      {isPublic ? null : <AuthBridge />}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFAFA' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="app" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="preview" options={{ contentStyle: { backgroundColor: '#FAFAFA' } }} />
      </Stack>
      <StatusBar style="light" />
      <ConsentManager />
    </>
  );
}
