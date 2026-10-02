import Head from 'expo-router/head';

import AuthPage from '@/auth/dom/AuthPage';

/**
 * `/login` on web — our own sign-in page on Clerk's headless hooks
 * (src/auth/dom/AuthPage.tsx). `/signup` is the same page in sign-up mode.
 * Signed-in visitors are sent on to `/app`.
 */
export default function LoginWeb() {
  return (
    <>
      <Head>
        <title>Sign in — Find Time</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AuthPage mode="sign-in" />
    </>
  );
}
