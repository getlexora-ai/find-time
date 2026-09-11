import Head from 'expo-router/head';

import LandingPage from '@/landing/dom/LandingPage';
import { CookieConsent } from '@/landing/components/CookieConsent';
import { META } from '@/landing/copy';
import { joinWaitlist, validateEmail } from '@/signup/waitlist';

/**
 * `/` on **web only** — `index.tsx` takes this route on native, where it is a bare
 * redirect to `/app`.
 *
 * This is the one surface that genuinely needs server-rendered markup (crawlers,
 * link unfurlers), so unlike `/app` it is deliberately *not* gated behind
 * `useMounted()`. The `<Head>` here is the canonical copy of the site title +
 * description; `+html.tsx` carries the same as a fallback for the other routes.
 *
 * `LandingPage` (src/landing/dom) is the 3D week-board / connectors / privacy-dome
 * page from the approved artifact (ported on `calendar-landing`). Its email form
 * is the only waitlist entry point: it posts to `/api/waitlist` (source
 * `landing`), and this adapter turns the API result into resolve/throw.
 */
async function onJoinWaitlist(email: string) {
  if (!validateEmail(email)) throw new Error('invalid_email');
  const res = await joinWaitlist({ email, source: 'landing' });
  if (!res.ok) throw new Error(res.error);
}

export default function Landing() {
  return (
    <>
      <Head>
        <title>{META.title}</title>
        <meta name="description" content={META.description} />
      </Head>
      <LandingPage onJoinWaitlist={onJoinWaitlist} />
      <CookieConsent />
    </>
  );
}
