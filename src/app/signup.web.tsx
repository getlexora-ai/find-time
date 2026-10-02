import Head from 'expo-router/head';

import AuthPage from '@/auth/dom/AuthPage';

/** `/signup` on web — create an account, verify the email, then `/welcome`. */
export default function SignupWeb() {
  return (
    <>
      <Head>
        <title>Create your account — Find Time</title>
        <meta name="robots" content="noindex" />
      </Head>
      <AuthPage mode="sign-up" />
    </>
  );
}
