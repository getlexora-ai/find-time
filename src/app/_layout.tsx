import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { ConsentManager } from '@/consent/ConsentManager';
import { setTokenGetter } from '@/lib/api';
import { clerkAppearance } from '@/lib/clerkAppearance';
import '../global.css';

/**
 * Root layout.
 *
 *   `index` → the marketing landing page on web (`index.web.tsx`), and a bare
 *             redirect to `/app` on native (`index.tsx`).
 *   `login` / `signup` → sign in / sign up on Clerk's hooks (src/auth/dom on web).
 *             `/app` redirects to `/login` when signed out.
 *   `welcome` → first-run onboarding (web). `/app` redirects here until done.
 *   `sso-callback` → where Google sign-in returns on web.
 *   `app`   → the calendar, which owns its own providers in `app/_layout.tsx`.
 *
 * `ClerkProvider` wraps everything (auth state is global); `AuthBridge` hands the
 * session-token getter to `src/lib/api.ts` so non-React fetch code can attach it.
 * The calendar's theme/toast providers still live in `app/_layout.tsx`, not here.
 * `ConsentManager` is the site-wide cookie banner + settings dialog (web only;
 * src/consent).
 */
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function AuthBridge() {
  const { getToken, userId } = useAuth();
  useEffect(() => {
    // The user id rides along so stores can tell an account switch from a token refresh.
    setTokenGetter(() => getToken(), userId ?? null);
    return () => setTokenGetter(null);
  }, [getToken, userId]);
  return null;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache} appearance={clerkAppearance}>
      <AuthBridge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#FAFAFA' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="sso-callback" />
        <Stack.Screen name="app" />
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="preview" options={{ contentStyle: { backgroundColor: '#FAFAFA' } }} />
      </Stack>
      <StatusBar style="light" />
      <ConsentManager />
    </ClerkProvider>
  );
}
