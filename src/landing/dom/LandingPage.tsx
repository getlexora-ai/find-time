/**
 * Find Time — landing page (web).
 *
 * Plain React DOM — no React Native primitives — because this page is only ever
 * rendered on the web route (`src/app/index.web.tsx`); native takes a bare
 * redirect to `/app` (`src/app/index.tsx`) and never imports this file.
 *
 * One animation only: the 3D week board in the hero (./engine), which mounts
 * into the `data-ft="…"` hooks below and narrates itself through the ask /
 * steps / result panel. Every other section is static markup. All copy comes
 * from `../copy.ts` (LANDING).
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import './landing.css';
import { mountLanding } from './engine';
import { LANDING } from '../copy';

type Props = {
  /** Called with a validated email. Resolve on success, throw on failure. */
  onJoinWaitlist?: (email: string) => Promise<void>;
};

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap';

const { hero, demo, how, why, connectors, privacy, waitlist } = LANDING;

export default function LandingPage({ onJoinWaitlist }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  // Web font (the 3D labels are painted with it too).
  useEffect(() => {
    if (document.getElementById('ft-landing-font')) return;
    const link = document.createElement('link');
    link.id = 'ft-landing-font';
    link.rel = 'stylesheet';
    link.href = FONT_HREF;
    document.head.appendChild(link);
  }, []);

  // 3D engine: mount once, clean up on unmount (safe under React StrictMode).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    return mountLanding(root);
  }, []);

  const scrollToSection = (name: string) => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    rootRef.current
      ?.querySelector(`[data-section="${name}"]`)
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const goToWaitlist = () => {
    scrollToSection('waitlist');
    window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 600);
  };

  return (
    <div className="ft-landing" ref={rootRef}>
      <div className="wrap">
        <header className="top">
          <div className="logo">
            <i />
            FIND TIME
          </div>
          <nav className="links" aria-label="Sections">
            {LANDING.nav.map((n) => (
              <button key={n.section} type="button" onClick={() => scrollToSection(n.section)}>
                {n.label}
              </button>
            ))}
          </nav>
          <button className="btn-lime" type="button" onClick={goToWaitlist}>
            {LANDING.headerCta}
          </button>
        </header>

        {/* ================= HERO: what it is + the one animated example ================= */}
        <section className="hero" data-section="top">
          <div className="hero-copy">
            <p className="eyebrow">{hero.eyebrow}</p>
            <h1>{hero.title}</h1>
            <p className="lede">{hero.body}</p>
            <div className="cta-row">
              <button className="btn-lime btn-cta" type="button" onClick={goToWaitlist}>
                {hero.cta} <span aria-hidden="true">→</span>
              </button>
              <span className="cta-note">{hero.note}</span>
            </div>
          </div>

          <div className="demo">
            <p className="demo-label">
              <b>{demo.label}</b>
              {demo.hint}
            </p>
            {/* example tabs are created by the engine */}
            <div className="modes" role="tablist" aria-label="Example requests" data-ft="modes" />
            <div className="stage stage-plan" data-ft="stage-plan">
              {/* the engine inserts its <canvas> here */}
              <div className="tags" data-ft="tags-plan" />
              <div className="hud">
                <span className="pill">{demo.week}</span>
                <span className="pill live" data-ft="status">PLANNED</span>
              </div>
              <button className="replay" type="button" data-ft="replay">{demo.replay}</button>
            </div>
            <ul className="legend" aria-label="Legend">
              {demo.legend.map((l) => (
                <li key={l.kind}>
                  <i data-k={l.kind} aria-hidden="true" />
                  {l.label}
                </li>
              ))}
            </ul>
            <div className="narr">
              <div className="ask">
                <div className="k">
                  <span>{demo.askLabel}</span>
                  <span className="uses" data-ft="uses" />
                </div>
                <p data-ft="ask-text" aria-live="polite" />
              </div>
              <div className="steps-box">
                <p className="k">{demo.stepsLabel}</p>
                <ol className="steps" data-ft="steps" />
              </div>
              <div className="result" data-ft="result">
                <span className="ic">✓</span>
                <span>
                  <b>{demo.resultLabel}</b>
                  <span data-ft="result-text" />
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section className="sec" data-section="how">
          <p className="eyebrow">{how.eyebrow}</p>
          <h2>{how.title}</h2>
          <ol className="how">
            {how.steps.map((s, i) => (
              <li key={s.title}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* ================= WHY ================= */}
        <section className="sec" data-section="why">
          <p className="eyebrow">{why.eyebrow}</p>
          <h2>{why.title}</h2>
          <p className="lede">{why.body}</p>
          <div className="pains">
            <div className="pains-head" aria-hidden="true">
              <span />
              <span>{why.head.problem}</span>
              <span>{why.head.fix}</span>
            </div>
            {why.items.map((it) => (
              <div className="pain" key={it.tag}>
                <h3>{it.tag}</h3>
                <p>{it.problem}</p>
                <p className="fix">{it.fix}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ================= CONNECTORS ================= */}
        <section className="sec" data-section="connectors">
          <p className="eyebrow">{connectors.eyebrow}</p>
          <h2>{connectors.title}</h2>
          <p className="lede">{connectors.body}</p>
          <div className="panel">
            <ul className="conns">
              {connectors.items.map((c) => (
                <li className={'conn' + (c.required ? ' req' : '')} key={c.name}>
                  <div className="conn-top">
                    <h3>{c.name}</h3>
                    <span className="badge">{c.required ? connectors.required : connectors.optional}</span>
                  </div>
                  <p className="apps">{c.apps}</p>
                  <p className="does">{c.does}</p>
                </li>
              ))}
            </ul>
            <div className="sealed">
              <h3>{connectors.never.title}</h3>
              <ul className="sockets">
                {connectors.never.items.map((name) => (
                  <li className="socket" key={name}>
                    <s>{name}</s>
                  </li>
                ))}
              </ul>
              <p>{connectors.never.body}</p>
            </div>
          </div>
        </section>

        {/* ================= PRIVACY ================= */}
        <section className="sec" data-section="privacy">
          <div className="vault">
            <p className="eyebrow">{privacy.eyebrow}</p>
            <h2>{privacy.title}</h2>
            <p className="lede">{privacy.body}</p>

            <figure className="eco" role="img" aria-label={privacy.diagramLabel}>
              <div className="eco-in">
                <span className="eco-tag">{privacy.inside}</span>
                <div className="eco-flow">
                  <div className="node">
                    <b>{privacy.tools.name}</b>
                    <span>{privacy.tools.sub}</span>
                  </div>
                  <div className="link">
                    <span className="fwd">{privacy.toCore}</span>
                    <span className="back">{privacy.toTools}</span>
                  </div>
                  <div className="node core">
                    <b>{privacy.core.name}</b>
                    <span>{privacy.core.sub}</span>
                  </div>
                  <div className="link">
                    <span className="fwd">{privacy.toYou}</span>
                    <span className="back">{privacy.fromYou}</span>
                  </div>
                  <div className="node">
                    <b>{privacy.you.name}</b>
                    <span>{privacy.you.sub}</span>
                  </div>
                </div>
              </div>
              <div className="eco-wall">
                <b>⊘</b>
                <span>{privacy.wall}</span>
              </div>
              <div className="eco-out">
                <span className="eco-tag bad">{privacy.outside}</span>
                <ul>
                  {privacy.blocked.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </div>
            </figure>

            <div className="pledges">
              {privacy.pledges.map((p) => (
                <div className="pledge" key={p.title}>
                  <PledgeIcon kind={p.icon} />
                  <h3>{p.title}</h3>
                  <p>{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ================= WAITLIST ================= */}
        <section className="sec" data-section="waitlist">
          <div className="early">
            <div>
              <p className="eyebrow">{waitlist.eyebrow}</p>
              <h2>{waitlist.title}</h2>
              <p className="lede">{waitlist.body}</p>
            </div>
            <WaitlistForm onJoinWaitlist={onJoinWaitlist} inputRef={emailRef} />
          </div>
        </section>

        <footer>
          <span>FIND TIME</span>
          <span>{LANDING.footer.tagline}</span>
          <nav className="legal" aria-label="Legal">
            <a href="/privacy">PRIVACY</a>
            <a href="/terms">TERMS</a>
          </nav>
          <span>© 2026 FIND TIME</span>
        </footer>
      </div>
    </div>
  );
}

function PledgeIcon({ kind }: { kind: 'line' | 'cross' | 'slash' }) {
  if (kind === 'line') {
    return (
      <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
        <line x1="1" y1="7" x2="27" y2="7" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r="7.5" fill="none" stroke="#FF4400" strokeWidth="1.6" />
      <path
        d={kind === 'cross' ? 'M6 6l6 6M12 6l-6 6' : 'M4 14L14 4'}
        stroke="#FF4400"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* Its own component so typing never re-renders the page (the engine owns parts of the page's DOM). */
type Status = 'idle' | 'invalid' | 'sending' | 'done' | 'error' | 'unwired';

/** 'idle' is the consent line, rendered with real links in WaitlistForm. */
const MESSAGES: Record<Exclude<Status, 'idle'>, string> = {
  invalid: 'Enter an email address like you@example.com.',
  sending: 'Adding you to the list…',
  done: 'You’re on the list. We’ll email you when a spot opens.',
  error: 'Couldn’t add you just now. Try again in a moment.',
  unwired: 'Waitlist isn’t connected yet — pass onJoinWaitlist to <LandingPage />.',
};

function WaitlistForm({
  onJoinWaitlist,
  inputRef,
}: {
  onJoinWaitlist?: (email: string) => Promise<void>;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setStatus('invalid');
      inputRef.current?.focus();
      return;
    }
    if (!onJoinWaitlist) {
      setStatus('unwired');
      return;
    }
    setStatus('sending');
    try {
      await onJoinWaitlist(value);
      setStatus('done');
      setEmail('');
    } catch {
      setStatus('error');
    }
  }

  const tone = status === 'done' ? ' good' : ['invalid', 'error', 'unwired'].includes(status) ? ' bad' : '';

  return (
    <form className="wl-form" onSubmit={submit} noValidate>
      <label className="sr" htmlFor="ft-wl-email">Email address</label>
      <div className="wl-row">
        <input
          ref={inputRef}
          id="ft-wl-email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status === 'invalid'}
          aria-describedby="ft-wl-status"
        />
        <button className="btn-lime" type="submit" disabled={status === 'sending'}>
          {status === 'sending' ? 'ADDING…' : 'REQUEST ACCESS ↗'}
        </button>
      </div>
      <p className={'wl-fine' + tone} id="ft-wl-status" aria-live="polite">
        {status === 'idle' ? (
          <>
            By joining you accept our <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>.
          </>
        ) : (
          MESSAGES[status]
        )}
      </p>
    </form>
  );
}
