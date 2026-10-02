/**
 * Find Time — landing page (web).
 *
 * Plain React DOM — no React Native primitives — because this page only ever
 * renders on the web route (`src/app/index.web.tsx`); native redirects to
 * `/app` and never imports this file.
 *
 * Look: Nexus light monochrome (src/calendar/tokens.ts). The top of the page is
 * one world: a sticky 3D week board (./board) with the hero and the story
 * scrolling past it. The hero lets the visitor type their own week and runs
 * the product's parser and slot ranking on it (./demo); the story plans the
 * example week chapter by chapter.
 *
 * Server render, no-JS, reduced motion and no-WebGL all get the flat DOM week
 * (./WeekCanvas) instead of the board, with the same data. Motion lives in
 * ./motion (GSAP + ScrollTrigger + Lenis). All copy comes from ../copy.
 */
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';

import './landing.css';
import { LANDING } from '../copy';
import type { Board, BoardMark, BoardTile } from './board';
import { type DemoBlock, type DemoResult, planSentence } from './demo';
import type { Motion } from './motion';
import { CRUMBS, FREE, TILES, readWeek, tileEnd, tileState } from './week-data';
import { WeekCanvas } from './WeekCanvas';

type Props = {
  /** Called with a validated email. Resolve on success, throw on failure. */
  onJoinWaitlist?: (email: string) => Promise<void>;
};

const { hero, demo, manifesto, story, keeps, trust, insights, faq, final, footer } = LANDING;

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

/** Manifesto words, with `*…*` runs flagged as emphasis. */
const MANIFESTO = (() => {
  let on = false;
  return manifesto.text.split(' ').map((raw) => {
    if (raw.startsWith('*')) on = true;
    const word = { text: raw.replace(/\*/g, ''), em: on };
    if (raw.endsWith('*')) on = false;
    return word;
  });
})();
const MANIFESTO_PLAIN = manifesto.text.replace(/\*/g, '');

/** Insights for the example week once it is planned and replanned (story step 5). */
const WEEK = readWeek(4);
const KPI_VALUE = { focus: WEEK.focus / 60, meet: WEEK.meet / 60, ready: WEEK.ready / 60, b2b: WEEK.b2b } as const;
const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const BAR_MAX = Math.max(...WEEK.days.map((d) => d.focus + d.meet + d.free));

/** scene: -1 = hero (the visitor's week), 0–4 = story stage */
function boardTiles(scene: number, pending: DemoBlock[], accepted: DemoBlock[]): BoardTile[] {
  const stage = Math.max(0, scene);
  const out: BoardTile[] = [];
  for (const t of TILES) {
    const st = tileState(t, stage);
    if (st === 'hidden') continue;
    out.push({ id: t.id, day: t.day, s: t.s, e: tileEnd(t, stage), title: t.title, kind: t.kind, state: st });
  }
  if (scene < 0) {
    for (const b of accepted) out.push({ ...b, kind: 'user', state: 'solid' });
    for (const b of pending) out.push({ ...b, kind: 'user', state: 'proposal' });
  }
  return out;
}
function boardMarks(scene: number): BoardMark[] {
  if (scene < 0) return CRUMBS.map((c) => ({ id: `c${c.day}-${c.s}`, ...c, kind: 'crumb' as const }));
  if (scene === 1) return FREE.map((f) => ({ id: `f${f.day}-${f.s}`, ...f, kind: 'free' as const }));
  return [];
}

type DemoState =
  | { k: 'idle' }
  | { k: 'plan'; text: string; title: string; asked: number; reason: string }
  | { k: 'ask'; text: string; question: string; options: string[] }
  | { k: 'accepted'; count: number }
  | { k: 'other' };

export default function LandingPage({ onJoinWaitlist }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<Board | null>(null);
  const motionRef = useRef<Motion | null>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const askRef = useRef<HTMLInputElement>(null);

  const [scene, setScene] = useState(-1);
  const [gl, setGl] = useState(false);
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

  // The 3D board: only with WebGL and motion allowed; the DOM week otherwise.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const probe = document.createElement('canvas');
    if (!probe.getContext('webgl2') && !probe.getContext('webgl')) return;
    let alive = true;
    import('./board')
      .then(({ mountBoard }) =>
        mountBoard(host, {
          offsetX: () => (window.innerWidth >= 900 ? 0.2 : 0),
          onFail: () => {
            boardRef.current?.dispose();
            boardRef.current = null;
            setGl(false);
          },
        }),
      )
      .then((b) => {
        if (!alive) return b.dispose();
        boardRef.current = b;
        setGl(true);
      })
      .catch(() => setGl(false));
    return () => {
      alive = false;
      boardRef.current?.dispose();
      boardRef.current = null;
    };
  }, []);

  // React owns what is on the board; the board animates the difference.
  useEffect(() => {
    const b = boardRef.current;
    if (!b) return;
    b.setTiles(boardTiles(scene, pending, accepted));
    b.setMarks(boardMarks(scene));
    b.setView(scene < 0 ? 'hero' : 'story');
  }, [gl, scene, pending, accepted]);

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
  const extra = scene < 0
    ? [
        ...accepted.map((b) => ({ ...b, state: 'solid' as const })),
        ...pending.map((b) => ({ ...b, state: 'proposal' as const })),
      ]
    : [];

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
        {/* ── the world: sticky board + hero + story ────────────── */}
        <div className="world" data-gl={gl || undefined}>
          <div className="world-track">
            <div className="world-stage" data-stage-wrap>
              <div className="board-host" ref={hostRef} role="img" aria-label={hero.boardAlt} />
              <div className="board-flat">
                <WeekCanvas
                  stage={stage}
                  label={scene < 0 ? hero.boardLabel : `${hero.boardLabel} · step ${scene + 1} of 5`}
                  extra={extra}
                  crumbs={scene < 0}
                />
              </div>
              <p className="board-tag mono" aria-hidden="true">
                {scene < 0 ? hero.boardLabel : `Step ${scene + 1} of 5`}
              </p>
            </div>
          </div>

          <div className="world-flow frame">
            <section className="hero" data-hero data-section="top" aria-labelledby="hero-title">
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
              <p className="lede" data-hero-in>
                {hero.body}
              </p>

              <div className="demo" data-hero-in>
                <p className="demo-label mono">{demo.label}</p>
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
                  <button className="btn btn-ink" type="submit" data-magnetic>
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
                          <button className="btn btn-ghost btn-sm" type="button" onClick={clear}>
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
                        <button className="btn btn-ghost btn-sm" type="button" onClick={undo}>
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
                <p className="demo-note">{demo.privacy}</p>
              </div>
            </section>

            <section className="story" data-section="story" aria-labelledby="story-title">
              <div className="sec-head">
                <p className="label mono">{story.label}</p>
                <h2 id="story-title" className="h2" data-split>
                  <Words text={story.title} />
                </h2>
              </div>
              <ol className="chapters">
                {story.chapters.map((c, i) => (
                  <li key={c.n} className={`chapter${i === scene ? ' is-active' : ''}`} data-chapter={i}>
                    <span className="ch-n mono">{c.n}</span>
                    <h3 className="h3 ch-title">{c.title}</h3>
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
            </section>
          </div>
        </div>

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
                <span className="row-spec mono row-in">{r.spec}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* ── trust (try them) ───────────────────────────────── */}
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
                <div className="pledge-ui">
                  {t.ui === 'proposal' && <TryProposal />}
                  {t.ui === 'toggle' && <TryToggle />}
                  {t.ui === 'locked' && <TryLocked />}
                  <span className="try mono" aria-hidden="true">
                    {trust.hint}
                  </span>
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
                          <span className="bar-tip mono">
                            {fmt(Math.round((b.focus / 60) * 10) / 10)} h focus · {fmt(Math.round((b.meet / 60) * 10) / 10)} h meetings
                          </span>
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
              {formMsg}
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
        <em className="mono">{on ? ui.on : ui.off}</em>
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
      <span className={`mono ui-note${nudge ? ' is-on' : ''}`}>
        <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
          <rect x="3" y="7" width="10" height="7" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        {ui.lockedNote}
      </span>
    </div>
  );
}
