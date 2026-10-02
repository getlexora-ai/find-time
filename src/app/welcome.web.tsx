import Head from 'expo-router/head';

import Onboarding from '@/auth/dom/Onboarding';
import { useMounted } from '@/design/useMounted';

/**
 * `/welcome` on web — first-run onboarding (src/auth/dom/Onboarding.tsx).
 * `/app` sends any signed-in user here until `/api/onboarding` marks them done.
 * Client-only: it reads the browser's time zone and clock on first paint.
 */
export default function WelcomeWeb() {
  const mounted = useMounted();
  return (
    <>
      <Head>
        <title>Set up your week — Find Time</title>
        <meta name="robots" content="noindex" />
      </Head>
      {mounted ? <Onboarding /> : <div style={{ minHeight: '100vh', backgroundColor: '#FAFAFA' }} />}
    </>
  );
}
