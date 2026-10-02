import { useClerk } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useRef } from 'react';

import '@/auth/dom/auth.css';

/**
 * `/sso-callback` on web — where Google sends people back after
 * `authenticateWithRedirect` (src/auth/dom/AuthPage.tsx). Clerk finishes the
 * sign in or sign up; both land on `/app`, which forwards first-timers to
 * `/welcome`. A Google account with no Find Time account yet is turned into a
 * sign-up (and vice versa) rather than bounced.
 */
export default function SsoCallback() {
  const clerk = useClerk();
  const router = useRouter();
  const ran = useRef(false);

  useEffect(() => {
    if (!clerk.loaded || ran.current) return;
    ran.current = true;
    void clerk
      .handleRedirectCallback(
        {
          signInFallbackRedirectUrl: '/app',
          signUpFallbackRedirectUrl: '/app',
          signInUrl: '/login',
          signUpUrl: '/signup',
          transferable: true,
        },
        async (to: string) => router.replace(to as '/app'),
      )
      .catch(() => router.replace('/login'));
  }, [clerk, clerk.loaded, router]);

  return (
    <div className="au" data-page="auth" style={{ display: 'grid', placeItems: 'center' }}>
      <Head>
        <title>Signing you in — Find Time</title>
        <meta name="robots" content="noindex" />
      </Head>
      <p className="au-wait" role="status">
        <i className="au-spin" aria-hidden="true" style={{ marginRight: 10 }} />
        Signing you in…
      </p>
      <div id="clerk-captcha" />
    </div>
  );
}
