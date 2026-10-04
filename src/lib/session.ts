import AsyncStorage from '@react-native-async-storage/async-storage';

import { authClient } from './auth-client';

/**
 * The signed-in state every screen reads (Better Auth's `useSession`), in the
 * shape the screens were written against: loaded yet, signed in, the user.
 * `refetch` re-reads the session after the server changed the user (e.g.
 * `/api/onboarding` setting `onboarded`).
 */
export function useAuthState() {
  const { data, isPending, refetch } = authClient.useSession();
  const user = data?.user ?? null;
  return {
    isLoaded: !isPending,
    isSignedIn: Boolean(user),
    user,
    /** first word of the name, '' when unknown */
    firstName: (user?.name ?? '').trim().split(/\s+/)[0] ?? '',
    refetch,
  };
}

/** Per-user caches (consent registry: "until sign-out"): the week's events, the open chat. */
const USER_CACHES = ['ft-cal-events-v2:', 'ft.agent.session:'];

/** Sign out, drop the session (cookie on web, SecureStore on native) and this device's per-user caches. */
export async function signOut(): Promise<void> {
  await authClient.signOut();
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter((k) => USER_CACHES.some((p) => k.startsWith(p))));
  } catch {
    // storage unavailable: nothing was cached
  }
}

