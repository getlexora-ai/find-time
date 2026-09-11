/**
 * Find Time — landing page (web).
 *
 * Ported from the approved artifact (see find-time/new_landing/HANDOFF.md). The
 * markup here is plain React DOM — no React Native primitives — because this
 * page is only ever rendered on the web route (`src/app/index.web.tsx`); native
 * takes a bare redirect to `/app` (`src/app/index.tsx`) and never imports this
 * file, so there's nothing to gain from Expo's `'use dom'` WebView wrapping.
 *
 * The 3D scenes are plain three.js and live in ./engine — this component only
 * renders the markup and mounts/unmounts the engine into the `data-ft="…"` hooks
 * below. All browser work happens inside useEffect.
 */
import { useEffect, useRef, useState } from 'react';
import type { FormEvent, RefObject } from 'react';
import './landing.css';
import { mountLanding } from './engine';

type Props = {
  /** Called with a validated email. Resolve on success, throw on failure. */
  onJoinWaitlist?: (email: string) => Promise<void>;
};

const MARQUEE =
  'PLANS YOUR WEEK // BOOKS THE MEETING // PROTECTS YOUR FOCUS // FITS IN YOUR GOALS // NO MORE BACK-AND-FORTH // YOUR CALENDAR NEVER LEAVES // PLANS YOUR WEEK // BOOKS THE MEETING // PROTECTS YOUR FOCUS // FITS IN YOUR GOALS //';

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700;800&display=swap';

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
      {/* ================= HERO (fits one screen on desktop) ================= */}
      <div className="screen">
        <div className="marquee" aria-hidden="true">
          <span>{MARQUEE}</span>
        </div>

        <div className="wrap hero-wrap">
          <header className="top">
            <div className="logo">
              <i />
              FIND TIME
            </div>
            <nav className="links" aria-label="Sections">
              <button type="button" onClick={() => scrollToSection('plans')}>HOW IT PLANS</button>
              <button type="button" onClick={() => scrollToSection('connectors')}>CONNECTORS</button>
              <button type="button" onClick={() => scrollToSection('privacy')}>PRIVACY</button>
            </nav>
            <button className="btn-lime" type="button" onClick={goToWaitlist}>
              WAITLIST ↗
            </button>
          </header>

          <section className="sec hero" data-section="plans">
            <div className="hero-grid">
              <div className="hero-copy">
                <p className="eyebrow">HOW IT PLANS</p>
                <h2>Say it once. It lands on your calendar.</h2>
                <p className="lede">
                  One sentence in. It checks your calendar, pulls in what your other tools know, and books the
                  result — no dragging blocks around.
                </p>
                <div className="cta-row">
                  <button className="btn-lime btn-cta" type="button" onClick={goToWaitlist}>
                    JOIN THE WAITLIST <span aria-hidden="true">→</span>
                  </button>
                  <span className="cta-note">PRIVATE BETA · ONE EMAIL WHEN A SPOT OPENS</span>
                </div>
              </div>

              <div className="hero-demo">
                {/* example tabs are created by the engine */}
                <div className="modes" role="tablist" aria-label="Examples" data-ft="modes" />
                <div className="stage stage-plan" data-ft="stage-plan">
                  {/* the engine inserts its <canvas> here */}
                  <div className="tags" data-ft="tags-plan" />
                  <div className="hud">
                    <span className="pill">THIS WEEK / SEP 14–18</span>
                    <span className="pill live" data-ft="status">PLANNED</span>
                  </div>
                  <button className="replay" type="button" data-ft="replay">↻ REPLAY</button>
                </div>
              </div>

              <div className="side">
                <div className="ask">
                  <div className="k">
                    <span>YOU ASK</span>
                    <span className="uses" data-ft="uses" />
                  </div>
                  <p data-ft="ask-text" aria-live="polite" />
                </div>
                <div className="result" data-ft="result">
                  <span className="ic">✓</span>
                  <span data-ft="result-text" />
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="wrap">
        {/* ================= CONNECTORS ================= */}
        <section className="sec" data-section="connectors">
          <p className="eyebrow">CONNECTORS</p>
          <h2>Your calendar, plus everything that fills it.</h2>
          <p className="lede">
            Calendar is the core. Switch on email, Slack and tasks and it plans around what lands there too. It
            can’t reach anything you leave off.
          </p>

          <div className="orbit">
            <div className="stage stage-orbit" data-ft="stage-orbit">
              <div className="tags" data-ft="tags-orbit" />
              <span className="hint">TAP A TOOL IN ORBIT TO SWITCH IT</span>
            </div>
            <div className="board">
              <div className="board-top">
                <b>CONNECTIONS</b>
                <span className="count" data-ft="count">4 OF 8 ON</span>
              </div>
              {/* rows + switches are created by the engine */}
              <div className="rows" data-ft="rows" />
              <div className="sealed">
                <h3>⊘ OFF LIMITS · CAN’T BE CONNECTED</h3>
                <div className="sockets">
                  {['WALLETS', 'CONTACTS', 'PASSWORDS', 'PAYMENT CARDS'].map((name) => (
                    <div className="socket" key={name}>
                      <s>{name}</s>
                      <b>NEVER</b>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <p className="caption">
            PREVIEW · THE CONNECTIONS SCREEN IN THE APP · SWITCHED-ON TOOLS MOVE INTO ORBIT AND FEED THE CALENDAR
          </p>
        </section>

        {/* ================= PRIVACY ================= */}
        <section className="sec" data-section="privacy">
          <div className="vault">
            <p className="eyebrow">PRIVATE BY DESIGN</p>
            <h2>No text leaves your ecosystem.</h2>
            <p className="lede">Your tools talk to Find Time, and Find Time talks to you. Everything else hits the wall.</p>
            <div className="stage stage-dome" data-ft="stage-dome">
              <div className="tags" data-ft="tags-dome" />
              <span className="dome-hint">DRAG TO LOOK AROUND</span>
            </div>
            <div className="pledges">
              <div className="pledge">
                <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden="true">
                  <line x1="1" y1="7" x2="27" y2="7" stroke="#CCFF00" strokeWidth="2" strokeLinecap="round" />
                </svg>
                <h3>STAYS INSIDE</h3>
                <p>Plans, bookings and invites move between your own tools and you. Nowhere else.</p>
              </div>
              <div className="pledge">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="9" cy="9" r="7.5" fill="none" stroke="#FF4400" strokeWidth="1.6" />
                  <path d="M6 6l6 6M12 6l-6 6" stroke="#FF4400" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <h3>NEVER CROSSES</h3>
                <p>No ad networks, data brokers, model training or other companies on the other side.</p>
              </div>
              <div className="pledge">
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <circle cx="9" cy="9" r="7.5" fill="none" stroke="#FF4400" strokeWidth="1.6" />
                  <path d="M4 14L14 4" stroke="#FF4400" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <h3>NEVER CONNECTED</h3>
                <p>Wallets, contacts, passwords and payment cards can’t be switched on at all.</p>
              </div>
            </div>
          </div>
        </section>

        {/* ================= WAITLIST ================= */}
        <section className="sec" data-section="waitlist">
          <div className="early">
            <div>
              <p className="eyebrow">EARLY ACCESS</p>
              <h2>Get your week back.</h2>
              <p className="lede">
                Find Time is in private beta. Leave your email and we’ll tell you when a spot opens — no spam, one
                message.
              </p>
            </div>
            <WaitlistForm onJoinWaitlist={onJoinWaitlist} inputRef={emailRef} />
          </div>
        </section>

        <footer>
          <span>FIND TIME</span>
          <span>YOUR WEEK · PLANNED · NOTHING LEAVES</span>
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
