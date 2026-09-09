import Head from 'expo-router/head';

import { LandingScreen } from '@/landing/LandingScreen';
import { META } from '@/landing/copy';

/**
 * `/` on **web only** — `index.tsx` takes this route on native, where it is a bare
 * redirect to `/app`.
 *
 * This is the one surface that genuinely needs server-rendered markup (crawlers,
 * link unfurlers), so unlike `/app` it is deliberately *not* gated behind
 * `useMounted()`. The `<Head>` here is the canonical copy of the site title +
 * description; `+html.tsx` carries the same as a fallback for the other routes.
 */
export default function Landing() {
  return (
    <>
      <Head>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
      </Head>
      <LandingScreen />
    </>
  );
}
