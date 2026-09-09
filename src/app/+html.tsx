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
 * No JetBrains Mono `<link>`: shipping the webfont is still an open question with
 * the user, so web keeps the platform-mono fallback that `MONO` in
 * `src/design/ui.tsx` already declares.
 */

// The deployed origin — used for canonical + absolute OG image URLs. Set
// EXPO_PUBLIC_SITE_URL on Railway to the real host.
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://findtime.ai').replace(/\/$/, '');
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
        <meta name="theme-color" content="#2047e6" />
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

        {/* Disables body scrolling on web so a root <ScrollView> behaves natively. */}
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/** The blue ground, painted before the bundle evaluates (landing.html `body`). */
const SHELL_CSS = `
html, body, #root { background-color: #2047e6; }
body { overflow-x: hidden; }
`;
