/**
 * Find Time — landing page (web).
 *
 * Plain React DOM — no React Native primitives — because this page only ever
 * renders on the web route (`src/app/index.web.tsx`); native redirects to
 * `/app` and never imports this file.
 *
 * Look: Prism, the app's own (src/prism). The page is one dusk sky, top to
 * bottom: the hero is the blue of it, the last section is the sunset and the
 * hills, the footer is the ground (./sky renders the app's scene shader). In
 * between, on the app's pale ground, the product shows itself:
 *
 * - hero: a working week with a life in it. The visitor types what their week
 *   needs and the product's own parser and slot ranking place it (./demo);
 * - human: how a person plans, row by row;
 * - both: one planned day, work and personal together, filterable;
 * - story: the same example week, planned one chapter at a time (./WeekCanvas).
 *
 * Everything is in the server-rendered markup and readable with JS off. Motion
 * lives in ./motion (GSAP + ScrollTrigger + Lenis). All copy comes from ../copy.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import { CookieSettingsLink } from '@/consent/CookieSettingsLink';

import './landing.css';
import { LANDING } from '../copy';
import { type DemoBlock, type DemoResult, planSentence } from './demo';
import type { Motion } from './motion';
import type { Sky } from './sky';
import { readWeek } from './week-data';
import { WeekCanvas } from './WeekCanvas';

type Props = {
  /** Called with a validated email. Resolve on success, throw on failure. */
  onJoinWaitlist?: (email: string) => Promise<void>;
};

const { hero, demo, manifesto, human, both, story, trust, insights, faq, final, footer } = LANDING;

/** `*starred*` runs flagged as emphasis, word by word; `|` starts a new line. */
function parse(text: string) {
  let on = false;
  return text.split(' ').map((raw) => {
    const br = raw.startsWith('|');
    if (br) raw = raw.slice(1);
    if (raw.startsWith('*')) on = true;
    const word = { text: raw.replace(/\*/g, ''), em: on, br };
    if (raw.replace(/[.,!?]$/, '').endsWith('*')) on = false;
    return word;
  });
}
const plain = (text: string) => text.replace(/[*|]/g, '');

/** Masked words for the rise-in. Screen readers get the sentence once. */
function Words({ text }: { text: string }) {
  const words = parse(text);
  return (
    <>
      <span className="sr">{plain(text)}</span>
      <span aria-hidden="true">
        {words.map((w, i) => (
          <Fragment key={i}>
            {w.br && <br className="br" />}
            <span className="w">
              <span className={w.em ? 'wi em' : 'wi'}>{w.text}</span>
            </span>
            {i < words.length - 1 ? ' ' : ''}
          </Fragment>
        ))}
      </span>
    </>
  );
}

const MANIFESTO = parse(manifesto.text);

/** Insights for the example week once it is planned and replanned (story step 5). */
const WEEK = readWeek(4);
const KPI_VALUE = { focus: WEEK.focus / 60, meet: WEEK.meet / 60, ready: WEEK.ready / 60, b2b: WEEK.b2b } as const;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const BAR_MAX = Math.max(...WEEK.days.map((d) => d.focus + d.meet + d.free));
const STEPS = story.chapters.length;

type DemoState =
  | { k: 'idle' }
  | { k: 'plan'; text: string; title: string; asked: number; reason: string }
  | { k: 'ask'; text: string; question: string; options: string[] }
  | { k: 'accepted'; count: number }
  | { k: 'other' };

const Arrow = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export default function LandingPage({ onJoinWaitlist }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const heroSkyRef = useRef<HTMLCanvasElement>(null);
  const duskSkyRef = useRef<HTMLCanvasElement>(null);
  const motionRef = useRef<Motion | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const askRef = useRef<HTMLInputElement>(null);

  /** -1 = hero, 0–4 = story chapter in view */
  const [scene, setScene] = useState(-1);
  const [pending, setPending] = useState<DemoBlock[]>([]);
  const [accepted, setAccepted] = useState<DemoBlock[]>([]);
  const [lastBatch, setLastBatch] = useState<string[]>([]);
  const [demoState, setDemoState] = useState<DemoState>({ k: 'idle' });
  const [form, setForm] = useState<'idle' | 'sending' | 'done' | 'invalid' | 'failed'>('idle');

  // Motion loads after mount so nothing of it runs on the server.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let alive = true;
    import('./motion').then(({ initMotion }) => {
      if (!alive) return;
      motionRef.current = initMotion(root, { onStage: setScene });
    });
    return () => {
      alive = false;
      motionRef.current?.destroy();
      motionRef.current = null;
    };
  }, []);

  // The sky: the top of it behind the hero (clouds drift), the bottom behind the last section.
  useEffect(() => {
    const top = heroSkyRef.current;
    const dusk = duskSkyRef.current;
    if (!top || !dusk) return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let alive = true;
    let skies: Sky[] = [];
    import('./sky').then(({ mountSky }) => {
      if (!alive) return;
      skies = [
        mountSky(top, 0, 0.7, { drift: !still, clear: 1, scale: 0.6 }),
        mountSky(dusk, 0.3, 1),
      ];
    });
    return () => {
      alive = false;
      skies.forEach((s) => s.destroy());
    };
  }, []);

  /* ── hero demo ─────────────────────────────────────────────── */
  const run = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t) return;
      const r: DemoResult = planSentence(t, accepted);
      if (r.type === 'ask') {
        setPending([]);
        setDemoState({ k: 'ask', text: t, question: r.question, options: r.options });
      } else if (r.type === 'plan') {
        setPending(r.blocks);
        setDemoState({ k: 'plan', text: t, title: r.title, asked: r.asked, reason: r.reason });
      } else {
        setPending([]);
        setDemoState({ k: 'other' });
      }
    },
    [accepted],
  );
  const onAsk = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(askRef.current?.value ?? '');
  };
  const tryExample = (text: string) => {
    if (askRef.current) askRef.current.value = text;
    run(text);
  };
  const answer = (option: string) => {
    if (demoState.k !== 'ask') return;
    const text = `${demoState.text}, ${option}`;
    if (askRef.current) askRef.current.value = text;
    run(text);
  };
  const acceptPlan = () => {
    setAccepted((a) => [...a, ...pending]);
    setLastBatch(pending.map((p) => p.id));
    setDemoState({ k: 'accepted', count: pending.length });
    setPending([]);
  };
  const undo = () => {
    setAccepted((a) => a.filter((b) => !lastBatch.includes(b.id)));
    setLastBatch([]);
    setDemoState({ k: 'idle' });
  };
  const clear = () => {
    setPending([]);
    setDemoState({ k: 'idle' });
  };

  /* ── navigation + waitlist ─────────────────────────────────── */
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
  const formMsg = form === 'invalid' ? final.invalid : form === 'failed' ? final.failed : '';

  const stage = Math.max(0, scene);
  const extra = [
    ...accepted.map((b) => ({ ...b, state: 'solid' as const })),
    ...pending.map((b) => ({ ...b, state: 'proposal' as const })),
  ];

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
        {/* ── hero: the sky, and a week you can plan ────────────── */}
        <section className="hero" data-hero data-section="top" aria-labelledby="hero-title">
          <div className="sky" aria-hidden="true">
            <canvas ref={heroSkyRef} data-sky />
          </div>

          <div className="hero-copy frame">
            <p className="kicker" data-hero-in>
              <span className="dot" aria-hidden="true" />
              {hero.kicker}
            </p>
            <h1 id="hero-title" className="display" data-split>
              <Words text={hero.title} />
            </h1>
            <p className="lede" data-hero-in>
              {hero.body}
            </p>
            <div className="hero-cta" data-hero-in>
              <button className="btn btn-white" type="button" onClick={toWaitlist} data-magnetic>
                {hero.cta}
                <Arrow />
              </button>
              <button className="btn btn-glass" type="button" onClick={() => go('story')}>
                {hero.secondary}
              </button>
            </div>
            <ul className="hero-notes" data-hero-in>
              {hero.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>

          <div className="stage frame" data-lift>
            <div className="panel" data-panel>
              <div className="demo">
                <p className="demo-label">{demo.label}</p>
                <form className="ask-box" onSubmit={onAsk}>
                  <label htmlFor="lp-ask" className="sr">
                    {demo.inputLabel}
                  </label>
                  <input
                    id="lp-ask"
                    ref={askRef}
                    type="text"
                    autoComplete="off"
                    placeholder={demo.placeholder}
                    enterKeyHint="go"
                  />
                  <button className="btn btn-ai" type="submit">
                    {demo.submit}
                  </button>
                </form>
                <div className="examples">
                  {demo.examples.map((x) => (
                    <button key={x} type="button" className="chip chip-btn" onClick={() => tryExample(x)}>
                      {x}
                    </button>
                  ))}
                </div>

                <div className="demo-out" aria-live="polite">
                  {demoState.k === 'plan' && (
                    <div className="out-row">
                      <div className="out-text">
                        <strong>
                          {pending.length === 0
                            ? demo.none
                            : pending.length < demoState.asked
                              ? demo.partial(pending.length, demoState.asked)
                              : demo.placed(pending.length, demoState.title)}
                        </strong>
                        {pending.length > 0 && demoState.reason && (
                          <span>
                            {demo.why} {demoState.reason}
                          </span>
                        )}
                      </div>
                      {pending.length > 0 && (
                        <div className="out-actions">
                          <button className="btn btn-ink btn-sm" type="button" onClick={acceptPlan}>
                            {demo.accept}
                          </button>
                          <button className="btn btn-line btn-sm" type="button" onClick={clear}>
                            {demo.clear}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {demoState.k === 'ask' && (
                    <div className="out-row">
                      <div className="out-text">
                        <strong>{demoState.question}</strong>
                      </div>
                      <div className="out-actions">
                        {demoState.options.map((o) => (
                          <button key={o} type="button" className="chip chip-btn" onClick={() => answer(o)}>
                            {o}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {demoState.k === 'accepted' && (
                    <div className="out-row">
                      <div className="out-text">
                        <strong>
                          <span className="tick" aria-hidden="true" /> {demo.accepted}
                        </strong>
                      </div>
                      <div className="out-actions">
                        <button className="btn btn-line btn-sm" type="button" onClick={undo}>
                          {demo.undo}
                        </button>
                      </div>
                    </div>
                  )}
                  {demoState.k === 'other' && (
                    <div className="out-row">
                      <div className="out-text">
                        <strong>{demo.other}</strong>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <WeekCanvas stage={0} label={hero.boardLabel} extra={extra} className="wk-hero" />

              <div className="panel-foot">
                <ul className="legend" aria-label="What the colours mean">
                  {hero.legend.map((l) => (
                    <li key={l.key}>
                      <i className={`lg-${l.key}`} aria-hidden="true" />
                      {l.label}
                    </li>
                  ))}
                </ul>
                <p className="demo-note">{demo.privacy}</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── manifesto ──────────────────────────────────────── */}
        <section className="manifesto frame" aria-label={manifesto.label}>
          <p className="mf" data-manifesto>
            <span className="sr">{plain(manifesto.text)}</span>
            <span aria-hidden="true">
              {MANIFESTO.map((w, i) => (
                <Fragment key={i}>
                  <span className={w.em ? 'mfw em' : 'mfw'}>{w.text}</span>
                  {i < MANIFESTO.length - 1 ? ' ' : ''}
                </Fragment>
              ))}
            </span>
          </p>
        </section>

        {/* ── planned the way a person would ─────────────────── */}
        <section className="human frame" data-section="human" aria-labelledby="human-title">
          <div className="sec-head sec-split">
            <h2 id="human-title" className="h2" data-split>
              <Words text={human.title} />
            </h2>
            <p className="lede sec-lede">{human.body}</p>
          </div>
          <ul className="rows">
            {human.rows.map((r) => (
              <li key={r.n} className="row" data-row>
                <i className="row-rule" aria-hidden="true" />
                <span className="row-n row-in">{r.n}</span>
                <div className="row-main row-in">
                  <h3 className="row-name">{r.name}</h3>
                  <p className="row-body">{r.body}</p>
                </div>
                <span className="row-spec row-in">{r.spec}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── work and life, one week ────────────────────────── */}
        <section className="both frame" data-section="both" aria-labelledby="both-title">
          <div className="both-copy">
            <h2 id="both-title" className="h2" data-split>
              <Words text={both.title} />
            </h2>
            <p className="lede sec-lede">{both.body}</p>
            <div className="sources" data-rv-group>
              <p className="sources-label">{both.sourcesLabel}</p>
              <ul>
                {both.sources.map((x) => (
                  <li key={x.key} data-rv>
                    <i className={`lg-${x.key}`} aria-hidden="true" />
                    {x.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <BothDay />
        </section>

        {/* ── story: the example week, planned as you scroll ───── */}
        <section className="story frame" data-section="story" aria-labelledby="story-title">
          <div className="sec-head">
            <h2 id="story-title" className="h2" data-split>
              <Words text={story.title} />
            </h2>
          </div>
          <div className="story-grid">
            <div className="story-stage">
              <div className="story-card">
                <WeekCanvas
                  stage={stage}
                  label={`${hero.boardLabel} · ${story.step(stage + 1, STEPS)}`}
                  className="wk-story"
                />
              </div>
            </div>
            <ol className="chapters" data-chapters>
              <li className="rail" aria-hidden="true">
                <i className="rail-fill" data-rail />
              </li>
              {story.chapters.map((c, i) => (
                <li key={c.n} className={`chapter${i === scene ? ' is-active' : ''}`} data-chapter={i}>
                  <span className="ch-n">{c.n}</span>
                  <h3 className="ch-title">{c.title}</h3>
                  {'body' in c && <p className="body">{c.body}</p>}
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

        {/* ── trust (try them) ───────────────────────────────── */}
        <section className="trust frame" data-section="trust" aria-labelledby="trust-title">
          <div className="sec-head">
            <h2 id="trust-title" className="h2" data-split>
              <Words text={trust.title} />
            </h2>
          </div>
          <div className="trust-grid" data-rv-group>
            {trust.items.map((t) => (
              <article key={t.title} className="pledge" data-rv>
                <div className="pledge-ui">
                  {t.ui === 'proposal' && <TryProposal />}
                  {t.ui === 'toggle' && <TryToggle />}
                  {t.ui === 'locked' && <TryLocked />}
                  {t.ui === 'private' && <ShowPrivate />}
                  {t.ui !== 'private' && (
                    <span className="try" aria-hidden="true">
                      {trust.hint}
                    </span>
                  )}
                </div>
                <h3 className="h3">{t.title}</h3>
                <p className="body">{t.body}</p>
              </article>
            ))}
          </div>
        </section>

        {/* ── insights: the night panel ──────────────────────── */}
        <section className="insights frame" aria-labelledby="ins-title" data-insights>
          <div className="night">
            <div className="ins-copy">
              <h2 id="ins-title" className="h2" data-split>
                <Words text={insights.title} />
              </h2>
              <p className="ins-cap">
                <span>{insights.sample}</span>
                <span>Sep 14 – 18</span>
              </p>
            </div>
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
                <span>{insights.chartLabel}</span>
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
                        <span className="bar-away">Away</span>
                      ) : (
                        <>
                          <i className="bar-seg seg-free" style={{ height: `${(b.free / BAR_MAX) * 100}%` }} />
                          <i className="bar-seg seg-meet" style={{ height: `${(b.meet / BAR_MAX) * 100}%` }} />
                          <i className="bar-seg seg-focus" style={{ height: `${(b.focus / BAR_MAX) * 100}%` }} />
                          <span className="bar-tip">
                            {fmt(Math.round((b.focus / 60) * 10) / 10)} h focus · {fmt(Math.round((b.meet / 60) * 10) / 10)} h meetings
                          </span>
                        </>
                      )}
                    </div>
                    <span className="bar-day">{b.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ── faq ────────────────────────────────────────────── */}
        <section className="faq frame" data-section="faq" aria-labelledby="faq-title">
          <div className="sec-head">
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

        {/* ── final cta: the bottom of the sky ───────────────── */}
        <section id="join" className="final" data-section="join" aria-labelledby="final-title">
          <div className="sky sky-dusk" aria-hidden="true">
            <canvas ref={duskSkyRef} data-sky />
          </div>
          <div className="final-in frame">
            <h2 id="final-title" className="display" data-split>
              <Words text={final.title} />
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
                {formMsg}
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ── footer: the ground ─────────────────────────────────── */}
      <footer className="ftr">
        <div className="ftr-row frame">
          <span>{footer.copyright}</span>
          <nav aria-label="Footer">
            {footer.links.map((l) => (
              <a key={l.href} className="link" href={l.href}>
                {l.label}
              </a>
            ))}
            <CookieSettingsLink />
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

/* ── trust: small working pieces of the product ──────────────── */
const ui = trust.uiText;

function TryProposal() {
  const [yes, setYes] = useState(false);
  return (
    <div className="ui-proposal">
      <div className={`ui-tile${yes ? ' is-yes' : ''}`}>
        <strong>{ui.proposalTitle}</strong>
        <span>{ui.proposalTime}</span>
      </div>
      <div className="ui-actions">
        <button type="button" className="ui-btn ink" onClick={() => setYes(true)} disabled={yes}>
          {ui.accept}
        </button>
        <button type="button" className="ui-btn" onClick={() => setYes(false)} disabled={!yes}>
          {ui.undo}
        </button>
      </div>
    </div>
  );
}

function TryToggle() {
  const [on, setOn] = useState(false);
  return (
    <button type="button" className="ui-toggle" role="switch" aria-checked={on} onClick={() => setOn((v) => !v)}>
      <span>{ui.toggle}</span>
      <span className="sw" data-on={on || undefined}>
        <i />
        <em>{on ? ui.on : ui.off}</em>
      </span>
    </button>
  );
}

function TryLocked() {
  const [nudge, setNudge] = useState(0);
  return (
    <div className="ui-locked">
      <button
        type="button"
        key={nudge}
        className={`ui-tile meet${nudge ? ' is-nudged' : ''}`}
        onClick={() => setNudge((n) => n + 1)}
        aria-label={`${ui.lockedTitle}, ${ui.lockedTime}. ${ui.lockedNote}`}>
        <strong>{ui.lockedTitle}</strong>
        <span>{ui.lockedTime}</span>
      </button>
      <span className={`ui-note${nudge ? ' is-on' : ''}`}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {ui.lockedNote}
      </span>
    </div>
  );
}

/** What Google holds next to what Find Time keeps: the time, not the words. */
function ShowPrivate() {
  return (
    <div className="ui-private">
      <div>
        <span className="ui-cap">{ui.privateGoogle}</span>
        <div className="ui-tile life">
          <strong>{ui.privateTitle}</strong>
          <span>{ui.privateTime}</span>
        </div>
      </div>
      <svg viewBox="0 0 24 16" width="24" height="16" aria-hidden="true">
        <path d="M2 8h18M15 3l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div>
        <span className="ui-cap">{ui.privateOurs}</span>
        <div className="ui-tile busy">
          <strong>{ui.privateBusy}</strong>
          <span>{ui.privateTime}</span>
        </div>
      </div>
    </div>
  );
}

/* ── both: one planned day, work and personal together ───────── */
type Side = (typeof both.filters)[number]['key'];

function BothDay() {
  const [show, setShow] = useState<Side>('both');
  const work = both.day.filter((d) => d.side === 'work').length;
  return (
    <figure className="day" data-rv-group>
      <figcaption className="day-head">
        <span className="day-label">{both.dayLabel}</span>
        <div className="seg" role="group" aria-label={both.filterLabel}>
          {both.filters.map((f) => (
            <button key={f.key} type="button" aria-pressed={show === f.key} onClick={() => setShow(f.key)}>
              {f.label}
            </button>
          ))}
        </div>
      </figcaption>
      <ol className="day-list">
        {both.day.map((d) => (
          <li key={d.time} className="day-row" data-rv data-off={(show !== 'both' && show !== d.side) || undefined}>
            <span className="day-time">{d.time}</span>
            <div className={`day-tile dk-${d.kind}`}>
              <strong>{d.title}</strong>
              <span>{d.side === 'work' ? 'Work' : 'Personal'}</span>
            </div>
            {'note' in d && <p className="day-note">{d.note}</p>}
          </li>
        ))}
      </ol>
      <p className="day-foot">{both.count(work, both.day.length - work)}</p>
    </figure>
  );
}
