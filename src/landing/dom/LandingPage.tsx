/**
 * Find Time — landing page (web).
 *
 * Plain React DOM — no React Native primitives — because this page only ever
 * renders on the web route (`src/app/index.web.tsx`); native redirects to
 * `/app` and never imports this file.
 *
 * Look: Nexus light monochrome, the calendar's own system (src/calendar/
 * tokens.ts) — ink on a hatched paper ground, framed column, one orange stroke.
 * The only colour is in the example week, exactly as the product draws it.
 *
 * Motion lives in ./motion (GSAP + ScrollTrigger + Lenis), loaded after mount.
 * Everything here renders complete on the server and with JS off; split text
 * keeps an unsplit copy for assistive tech. All copy comes from ../copy.
 */
import { Fragment, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import './landing.css';
import { LANDING } from '../copy';
import type { Motion } from './motion';
import { readWeek } from './week-data';
import { WeekCanvas } from './WeekCanvas';

type Props = {
  /** Called with a validated email. Resolve on success, throw on failure. */
  onJoinWaitlist?: (email: string) => Promise<void>;
};

const { hero, manifesto, story, keeps, trust, insights, faq, final, footer } = LANDING;

/** Manifesto words, with `*…*` runs flagged as emphasis. */
const MANIFESTO = (() => {
  let on = false;
  return manifesto.text.split(' ').map((raw) => {
    const opens = raw.startsWith('*');
    const closes = raw.endsWith('*');
    if (opens) on = true;
    const word = { text: raw.replace(/\*/g, ''), em: on };
    if (closes) on = false;
    return word;
  });
})();
const MANIFESTO_PLAIN = manifesto.text.replace(/\*/g, '');

/** Masked words for the rise-in. Screen readers get the sentence once. */
function Words({ text }: { text: string }) {
  const words = text.split(' ');
  return (
    <>
      <span className="sr">{text}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <Fragment key={i}>
            <span className="w">
              <span className="wi">{w}</span>
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </Fragment>
        ))}
      </span>
    </>
  );
}

/** Insights for the example week once it is planned and replanned (story step 5). */
const WEEK = readWeek(4);
const KPI_VALUE = {
  focus: WEEK.focus / 60,
  meet: WEEK.meet / 60,
  ready: WEEK.ready / 60,
  b2b: WEEK.b2b,
} as const;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const BAR_MAX = Math.max(...WEEK.days.map((d) => d.focus + d.meet + d.free));

export default function LandingPage({ onJoinWaitlist }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<Motion | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState(3);
  const [form, setForm] = useState<'idle' | 'sending' | 'done' | 'invalid' | 'failed'>('idle');

  // Motion loads after mount so nothing of it runs on the server.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let alive = true;
    import('./motion').then(({ initMotion }) => {
      if (!alive) return;
      motionRef.current = initMotion(root, { onStage: setStage });
    });
    return () => {
      alive = false;
      motionRef.current?.destroy();
      motionRef.current = null;
    };
  }, []);

  const go = (section: string) => {
    const el = rootRef.current?.querySelector(`[data-section="${section}"]`);
    if (!el) return;
    if (motionRef.current) motionRef.current.scrollTo(el);
    else el.scrollIntoView({ block: 'start' });
  };
  const toWaitlist = () => {
    go('join');
    window.setTimeout(() => emailRef.current?.focus({ preventScroll: true }), 1300);
  };

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const email = emailRef.current?.value.trim() ?? '';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setForm('invalid');
      emailRef.current?.focus();
      return;
    }
    setForm('sending');
    try {
      await onJoinWaitlist?.(email);
      setForm('done');
    } catch (err) {
      setForm((err as Error)?.message === 'invalid_email' ? 'invalid' : 'failed');
    }
  };

  const formMsg =
    form === 'done' ? final.done : form === 'invalid' ? final.invalid : form === 'failed' ? final.failed : '';

  return (
    <div className="lp" ref={rootRef}>
      <a className="skip" href="#main">
        Skip to content
      </a>

      {/* ── header ───────────────────────────────────────────── */}
      <header className="hdr" data-header>
        <div className="hdr-in">
          <a className="brand" href="/" aria-label={`${LANDING.brand} — home`}>
            <i className="brand-mark" aria-hidden="true" />
            {LANDING.brand}
          </a>
          <nav className="hdr-nav" aria-label="Sections">
            {LANDING.nav.map((n) => (
              <button key={n.section} type="button" onClick={() => go(n.section)}>
                {n.label}
              </button>
            ))}
          </nav>
          <div className="hdr-act">
            <a className="link" href="/login">
              {LANDING.signIn}
            </a>
            <button className="btn btn-ink btn-sm" type="button" onClick={toWaitlist}>
              {LANDING.headerCta}
            </button>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ── hero ───────────────────────────────────────────── */}
        <section className="hero frame" data-hero data-section="top" aria-labelledby="hero-title">
          <p className="kicker mono" data-hero-in>
            <span className="dot" aria-hidden="true" />
            {hero.kicker}
          </p>
          <h1 id="hero-title" className="display" data-split>
            {hero.title.map((line, i) => (
              <span key={i} className="line">
                <Words text={line} />
              </span>
            ))}
          </h1>
          <div className="hero-foot">
            <p className="lede" data-hero-in>
              {hero.body}
            </p>
            <div className="hero-cta" data-hero-in>
              <button className="btn btn-ink btn-lg" type="button" onClick={toWaitlist} data-magnetic>
                {hero.cta}
                <span className="arr" aria-hidden="true">
                  →
                </span>
              </button>
              <button className="link link-quiet" type="button" onClick={() => go('story')}>
                {hero.secondary}
              </button>
            </div>
            <p className="note mono" data-hero-in>
              {hero.note}
            </p>
          </div>
          <div className="hero-stage">
            <WeekCanvas
              stage={0}
              label={hero.canvasLabel}
              notes={hero.notes}
              alt={hero.canvasAlt}
              className="wk-hero"
            />
          </div>
        </section>

        {/* ── manifesto ──────────────────────────────────────── */}
        <section className="manifesto frame" aria-label={manifesto.label}>
          <p className="label mono">{manifesto.label}</p>
          <p className="mf" data-manifesto>
            <span className="sr">{MANIFESTO_PLAIN}</span>
            <span aria-hidden="true">
              {MANIFESTO.map((w, i) => (
                <Fragment key={i}>
                  <span className={w.em ? 'mw em' : 'mw'}>{w.text}</span>
                  {i < MANIFESTO.length - 1 ? ' ' : ''}
                </Fragment>
              ))}
            </span>
          </p>
        </section>

        {/* ── story ──────────────────────────────────────────── */}
        <section className="story frame" data-section="story" aria-labelledby="story-title">
          <div className="sec-head">
            <p className="label mono">{story.label}</p>
            <h2 id="story-title" className="h2" data-split>
              <Words text={story.title} />
            </h2>
          </div>

          <div className="story-grid">
            <div className="story-stick">
              <WeekCanvas stage={stage} label={`${story.canvasLabel} · step ${stage + 1} of 5`} />
              <ul className="legend" aria-label="Legend">
                {story.legend.map((l) => (
                  <li key={l.kind}>
                    <i className={`lg lg-${l.kind}`} aria-hidden="true" />
                    {l.label}
                  </li>
                ))}
              </ul>
            </div>

            <ol className="chapters">
              {story.chapters.map((c, i) => (
                <li
                  key={c.n}
                  className={`chapter${i === stage ? ' is-active' : ''}`}
                  data-chapter={i}>
                  <span className="ch-n mono">{c.n}</span>
                  <h3 className="h3">{c.title}</h3>
                  <p className="body">{c.body}</p>
                  {'quote' in c && <blockquote className="say">{c.quote}</blockquote>}
                  {'ask' in c && (
                    <div className="ask" aria-label="Example question from Find Time">
                      <span>{c.ask.q}</span>
                      <span className="ask-opts">
                        {c.ask.options.map((o) => (
                          <span key={o} className="chip">
                            {o}
                          </span>
                        ))}
                      </span>
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── what it keeps in mind ──────────────────────────── */}
        <section className="keeps frame" aria-labelledby="keeps-title">
          <div className="sec-head">
            <p className="label mono">{keeps.label}</p>
            <h2 id="keeps-title" className="h2" data-split>
              <Words text={keeps.title} />
            </h2>
          </div>
          <ul className="rows">
            {keeps.rows.map((r) => (
              <li key={r.n} className="row" data-row>
                <i className="row-rule" aria-hidden="true" />
                <span className="row-n mono row-in">{r.n}</span>
                <h3 className="row-name row-in">{r.name}</h3>
                <p className="row-body row-in">{r.body}</p>
                <span className="row-spec mono row-in">{r.spec}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── trust ──────────────────────────────────────────── */}
        <section className="trust frame" data-section="trust" aria-labelledby="trust-title">
          <div className="sec-head">
            <p className="label mono">{trust.label}</p>
            <h2 id="trust-title" className="h2" data-split>
              <Words text={trust.title} />
            </h2>
          </div>
          <div className="trust-grid" data-rv-group>
            {trust.items.map((t) => (
              <article key={t.title} className="pledge" data-rv>
                <div className="pledge-ui" aria-hidden="true">
                  {t.ui === 'proposal' && (
                    <div className="ui-proposal">
                      <div className="ui-tile">
                        <strong>{trust.uiText.proposalTitle.split(' · ')[0]}</strong>
                        <span>{trust.uiText.proposalTitle.split(' · ')[1]}</span>
                      </div>
                      <div className="ui-actions">
                        <span className="ui-btn ink">{trust.uiText.accept}</span>
                        <span className="ui-btn">{trust.uiText.undo}</span>
                      </div>
                    </div>
                  )}
                  {t.ui === 'toggle' && (
                    <div className="ui-toggle">
                      <span>{trust.uiText.toggle}</span>
                      <span className="sw">
                        <i />
                        <em className="mono">{trust.uiText.toggleState}</em>
                      </span>
                    </div>
                  )}
                  {t.ui === 'locked' && (
                    <div className="ui-locked">
                      <div className="ui-tile meet">
                        <strong>{trust.uiText.lockedTitle.split(' · ')[0]}</strong>
                        <span>{trust.uiText.lockedTitle.split(' · ')[1]}</span>
                      </div>
                      <span className="mono ui-note">
                        <svg viewBox="0 0 16 16" width="12" height="12">
                          <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
                        </svg>
                        {trust.uiText.lockedNote}
                      </span>
                    </div>
                  )}
                </div>
                <h3 className="h3">{t.title}</h3>
                <p className="body">{t.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── insights ───────────────────────────────────────── */}
        <section className="insights frame" aria-labelledby="ins-title" data-insights>
          <div className="ins-copy">
            <p className="label mono">{insights.label}</p>
            <h2 id="ins-title" className="h2" data-split>
              <Words text={insights.title} />
            </h2>
            <p className="lede">{insights.body}</p>
          </div>
          <figure className="dash">
            <figcaption className="dash-cap mono">
              <span>{insights.sample}</span>
              <span>Sep 14 – 18</span>
            </figcaption>
            <dl className="kpis">
              {insights.kpis.map((k) => (
                <div key={k.label} className="kpi">
                  <dt>{k.label}</dt>
                  <dd>
                    <span data-count={fmt(KPI_VALUE[k.key])}>{fmt(KPI_VALUE[k.key])}</span>
                    {k.unit && <small>{k.unit}</small>}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="chart" role="img" aria-label={insights.chartAlt}>
              <div className="chart-head">
                <span className="mono">{insights.chartLabel}</span>
                <ul className="chart-key" aria-hidden="true">
                  {insights.series.map((s) => (
                    <li key={s.key}>
                      <i className={`seg-${s.key}`} />
                      {s.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bars" aria-hidden="true">
                {WEEK.days.map((b) => (
                  <div key={b.label} className="bar">
                    <div className="bar-track">
                      {b.away ? (
                        <span className="bar-away mono">Away</span>
                      ) : (
                        <>
                          <i className="bar-seg seg-free" style={{ height: `${(b.free / BAR_MAX) * 100}%` }} />
                          <i className="bar-seg seg-meet" style={{ height: `${(b.meet / BAR_MAX) * 100}%` }} />
                          <i className="bar-seg seg-focus" style={{ height: `${(b.focus / BAR_MAX) * 100}%` }} />
                        </>
                      )}
                    </div>
                    <span className="mono">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </figure>
        </section>

        {/* ── faq ────────────────────────────────────────────── */}
        <section className="faq frame" data-section="faq" aria-labelledby="faq-title">
          <div className="sec-head">
            <p className="label mono">{faq.label}</p>
            <h2 id="faq-title" className="h2" data-split>
              <Words text={faq.title} />
            </h2>
          </div>
          <div className="qa" data-rv-group>
            {faq.items.map((f) => (
              <details key={f.q} data-rv>
                <summary>
                  {f.q}
                  <i aria-hidden="true" />
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── final cta ──────────────────────────────────────── */}
        <section className="final frame" data-section="join" aria-labelledby="final-title">
          <h2 id="final-title" className="display display-sm" data-split>
            {final.title.map((line, i) => (
              <span key={i} className="line">
                <Words text={line} />
              </span>
            ))}
          </h2>
          <div className="final-foot" data-rv-group>
            <p className="lede" data-rv>
              {final.body}
            </p>
            {form === 'done' ? (
              <p className="form-done" role="status" data-rv>
                <span className="tick" aria-hidden="true" />
                {final.done}
              </p>
            ) : (
              <form className="join" onSubmit={submit} noValidate data-rv>
                <label htmlFor="lp-email" className="sr">
                  {final.emailLabel}
                </label>
                <input
                  id="lp-email"
                  ref={emailRef}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  placeholder={final.placeholder}
                  aria-invalid={form === 'invalid' || undefined}
                  aria-describedby="lp-email-msg"
                  onInput={() => (form === 'invalid' || form === 'failed') && setForm('idle')}
                  required
                />
                <button className="btn btn-ink" type="submit" disabled={form === 'sending'} data-magnetic>
                  {form === 'sending' ? final.sending : final.button}
                </button>
              </form>
            )}
            <p id="lp-email-msg" className="form-msg" role="alert">
              {form === 'invalid' || form === 'failed' ? formMsg : ''}
            </p>
          </div>
        </section>
      </main>

      {/* ── footer ─────────────────────────────────────────────── */}
      <footer className="ftr">
        <div className="ftr-row frame">
          <span className="mono">{footer.copyright}</span>
          <nav aria-label="Footer">
            {footer.links.map((l) => (
              <a key={l.href} className="link" href={l.href}>
                {l.label}
              </a>
            ))}
          </nav>
        </div>
        <div className="wordmark-wrap" aria-hidden="true">
          <span className="wordmark" data-wordmark>
            {LANDING.brand}
          </span>
        </div>
      </footer>
    </div>
  );
}
