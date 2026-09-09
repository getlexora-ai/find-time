import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { setTokenGetter } from '@/lib/api';
import { clerkAppearance } from '@/lib/clerkAppearance';
import '../global.css';

/**
 * Root layout.
 *
 *   `index` → the marketing landing page on web (`index.web.tsx`), and a bare
 *             redirect to `/app` on native (`index.tsx`).
 *   `login` → Clerk sign in / sign up. `/app` redirects here when signed out.
 *   `app`   → the calendar, which owns its own providers in `app/_layout.tsx`.
 *
 * `ClerkProvider` wraps everything (auth state is global); `AuthBridge` hands the
 * session-token getter to `src/lib/api.ts` so non-React fetch code can attach it.
 * The calendar's theme/toast providers still live in `app/_layout.tsx`, not here.
 */
const PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

function AuthBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setTokenGetter(() => getToken());
    return () => setTokenGetter(null);
  }, [getToken]);
  return null;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={PUBLISHABLE_KEY} tokenCache={tokenCache} appearance={clerkAppearance}>
      <AuthBridge />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#2047e6' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="app" />
      </Stack>
      <StatusBar style="light" />
    </ClerkProvider>
  );
}
