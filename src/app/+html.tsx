import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

import { META } from '@/landing/copy';

/**
 * The HTML shell every web route is rendered into. Runs in Node only — it is not
 * part of the client bundle, and it cannot use browser or React Native APIs.
 *
 * Holds the site-wide defaults: ground colour (must be right on first paint),
 * and the fallback `<title>` / description / Open Graph / Twitter tags so a link
 * to any route unfurls and the tab is named even before JS boots. Routes that
 * want their own title override these with `<Head>` (expo-router/head) —
 * `/`, `/login`, `/app`, `/privacy`, `/terms` do.
 *
 * Fonts: Google Sans Flex + JetBrains Mono, the calendar's two faces
 * (src/calendar/tokens.ts, docs/calendar-spec.md §1.2), served from
 * public/fonts — never from fonts.googleapis.com.
 */

// The deployed origin — used for canonical + absolute OG image URLs. Set
// EXPO_PUBLIC_SITE_URL on Railway to the real host.
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');
const OG_IMAGE = `${SITE}/find-time-og.jpg`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        <title>{META.title}</title>
        <meta name="description" content={META.description} />
        <meta name="theme-color" content="#FAFAFA" />
        <link rel="canonical" href={`${SITE}/`} />
        <link rel="manifest" href="/site.webmanifest" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Find Time" />
        <meta property="og:title" content={META.title} />
        <meta property="og:description" content={META.description} />
        <meta property="og:url" content={`${SITE}/`} />
        <meta property="og:image" content={OG_IMAGE} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={META.title} />
        <meta name="twitter:description" content={META.description} />
        <meta name="twitter:image" content={OG_IMAGE} />

        {/* Self-hosted (public/fonts): loading them from Google would send every
            visitor's IP to Google without consent (LG München I, 3 O 17493/20). */}
        <link
          rel="preload"
          href="/fonts/google-sans-flex-latin.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="stylesheet" href="/fonts/fonts.css" />

        {/* Disables body scrolling on web so a root <ScrollView> behaves natively. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
        <script dangerouslySetInnerHTML={{ __html: MOTION_GUARD }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/** The Nexus ground (src/calendar/tokens.ts `N.ground`), painted before the bundle evaluates. */
const SHELL_CSS = `
html, body, #root { background-color: #FAFAFA; }
body { overflow-x: hidden; }
`;

/**
 * Landing pre-paint guard (src/landing/dom/motion.ts). Adds `lp-motion` before
 * first paint so the hero can start hidden and animate in without a flash of
 * the finished page. If the motion module hasn't taken over within 4 s (JS
 * failed, slow network), the class comes off and everything simply shows.
 * Only `.lp` selectors use the class, so other routes are unaffected.
 */
const MOTION_GUARD = `(function(){try{
if(location.pathname!=='/'||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var d=document.documentElement;d.classList.add('lp-motion');
setTimeout(function(){if(!window.__lpMotion)d.classList.remove('lp-motion')},4000);
}catch(e){}})();`;
