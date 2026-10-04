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

/** Sign out and drop the session (cookie on web, SecureStore on native). */
export async function signOut(): Promise<void> {
  await authClient.signOut();
}

