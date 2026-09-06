import { LandingScreen } from '@/landing/LandingScreen';

/**
 * `/` on **web only** — `index.tsx` takes this route on native, where it is a bare
 * redirect to `/app`.
 *
 * This is the one surface that genuinely needs server-rendered markup (crawlers,
 * link unfurlers), so unlike `/app` it is deliberately *not* gated behind
 * `useMounted()`. Per-route `generateMetadata` lands with the SEO pass (M4).
 */
export default function Landing() {
  return <LandingScreen />;
}
