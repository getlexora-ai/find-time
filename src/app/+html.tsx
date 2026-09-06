import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

/**
 * The HTML shell every web route is rendered into. Runs in Node only — it is not
 * part of the client bundle, and it cannot use browser or React Native APIs.
 *
 * Deliberately minimal for now: per-route `<title>`/OG tags belong in
 * `generateMetadata`, which lands with the SEO pass (M4). What is here is the part
 * that has to be right on the very first paint — the ground colour, so the page
 * never flashes white before the JS boots.
 *
 * No JetBrains Mono `<link>`: shipping the webfont is still an open question with
 * the user, so web keeps the platform-mono fallback that `MONO` in
 * `src/design/ui.tsx` already declares.
 */
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
