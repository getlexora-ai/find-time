import { usePathname } from 'expo-router';
import Head from 'expo-router/head';

import { DeclarationTable } from '@/consent/DeclarationTable';
import { CookieSettingsLink } from '@/consent/CookieSettingsLink';

import './dom/landing.css';
import { LANDING, SITE } from './copy';
import { LEGAL_UPDATED, type LegalSection } from './legal-copy';

/**
 * /privacy and /terms on the web — the landing's Nexus light shell (same `.lp`
 * classes, header, framed column and footer as dom/LandingPage), prose in one
 * readable column. Native keeps LegalScreen.tsx.
 *
 * Each section gets an id from its heading ("8. Cookies" → #cookies) so the
 * cookie notice can deep-link to /privacy#cookies. That section also gets the
 * full cookie declaration (src/consent/registry.ts) and a settings button.
 */
const slug = (heading: string) =>
  heading
    .replace(/^\d+\.\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

export function LegalScreen({
  title,
  description,
  intro,
  sections,
}: {
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}) {
  const name = title.charAt(0) + title.slice(1).toLowerCase();
  const path = usePathname();
  return (
    <div className="lp">
      <Head>
        <title>{`${name} — Find Time`}</title>
        <meta name="description" content={description} />
        <link rel="canonical" href={`${SITE}${path}`} />
      </Head>
      <a className="skip" href="#main">
        Skip to content
      </a>

      <header className="hdr is-scrolled">
        <div className="hdr-in">
          <a className="brand" href="/" aria-label={`${LANDING.brand} — home`}>
            <i className="brand-mark" aria-hidden="true" />
            {LANDING.brand}
          </a>
          <div className="hdr-act">
            <a className="link" href="/login">
              {LANDING.signIn}
            </a>
            <a className="btn btn-ink btn-sm" href="/#join">
              {LANDING.headerCta}
            </a>
          </div>
        </div>
      </header>

      <main id="main" className="legal frame">
        <header className="legal-head">
          <span className="label mono">Last updated {LEGAL_UPDATED}</span>
          <h1 className="h2">{name}</h1>
          <p className="lede">{intro}</p>
        </header>

        <div className="legal-grid">
          <nav className="legal-toc" aria-label="On this page">
            <span className="label mono">On this page</span>
            <ol>
              {sections.map((s) => (
                <li key={s.heading}>
                  <a className="link" href={`#${slug(s.heading)}`}>
                    {s.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="legal-body">
            {sections.map((s) => (
              <section key={s.heading} id={slug(s.heading)} className="legal-sec">
                <h2 className="h3">{s.heading}</h2>
                {s.body.map((p, i) => (
                  <p key={i} className="body">
                    {p}
                  </p>
                ))}
                {slug(s.heading) === 'cookies' && (
                  <>
                    <p className="body">
                      <CookieSettingsLink className="btn btn-ghost btn-sm" />
                    </p>
                    <div className="legal-table">
                      <DeclarationTable />
                    </div>
                  </>
                )}
              </section>
            ))}
          </div>
        </div>
      </main>

      <footer className="ftr">
        <div className="ftr-row frame">
          <span className="mono">{LANDING.footer.copyright}</span>
          <nav aria-label="Footer">
            {LANDING.footer.links.map((l) => (
              <a key={l.href} className="link" href={l.href}>
                {l.label}
              </a>
            ))}
            <CookieSettingsLink />
          </nav>
        </div>
        <div className="wordmark-wrap" aria-hidden="true">
          <span className="wordmark">{LANDING.brand}</span>
        </div>
      </footer>
    </div>
  );
}
