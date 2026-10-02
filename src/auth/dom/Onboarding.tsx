/**
 * `/welcome` — the first minute after sign-up. Five short questions, each one
 * a field the planner really reads (src/auth/onboarding.ts maps them), with
 * the week on the right redrawing as you answer: hatching slides when you move
 * your hours, the orange band follows your peak, deep-work blocks re-flow
 * around the example meetings when you change the budget or the layout.
 *
 * Finishing (or skipping) posts to `/api/onboarding`, which saves the answers
 * and marks the Clerk user `onboarded`, so `/app` stops sending them here.
 * The last step can hand straight off to the Google Calendar connect.
 *
 * Progress survives a reload (sessionStorage, per user). Enter moves on;
 * every step can be revisited from the rail.
 */
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';

import {
  defaultAnswers,
  energyCurveFor,
  FOCUS_MAX,
  FOCUS_MIN,
  hourLabel,
  type OnboardingAnswers,
  PEAKS,
  previewWeek,
  WEEKDAYS,
} from '../onboarding';
import { MiniWeek } from './MiniWeek';
import './auth.css';

const STEPS = ['Name', 'Week', 'Peak', 'Focus', 'Calendar'] as const;
const DAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function browserEnv() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const h12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
    return { timezone: tz, clock24: !h12 };
  } catch {
    return {};
  }
}

function zones(current: string): string[] {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
    return all.includes(current) ? all : [current, ...all];
  } catch {
    return [current];
  }
}

export default function Onboarding() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const storeKey = user ? `ft-onboarding:${user.id}` : null;
  const [a, setA] = useState<OnboardingAnswers>(() => defaultAnswers());
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [seen, setSeen] = useState(0);
  const [busy, setBusy] = useState<null | 'finish' | 'google' | 'skip'>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const hydrated = useRef(false);

  // First paint for this user: browser clock + Clerk name, then any saved progress.
  useEffect(() => {
    if (!user || hydrated.current) return;
    hydrated.current = true;
    let next = { ...defaultAnswers(browserEnv()), firstName: user.firstName ?? '' };
    let at = 0;
    try {
      const raw = storeKey ? sessionStorage.getItem(storeKey) : null;
      if (raw) {
        const saved = JSON.parse(raw) as { a?: Partial<OnboardingAnswers>; step?: number };
        next = { ...next, ...saved.a };
        at = Math.min(STEPS.length - 1, Math.max(0, saved.step ?? 0));
      }
    } catch {
      // storage blocked or malformed — start fresh
    }
    setA(next);
    setStep(at);
    setSeen(at);
  }, [user, storeKey]);

  useEffect(() => {
    if (!storeKey || !hydrated.current) return;
    try {
      sessionStorage.setItem(storeKey, JSON.stringify({ a, step }));
    } catch {
      // ignore
    }
  }, [a, step, storeKey]);

  // Signed out → sign in. Already onboarded (another tab) → the app.
  useEffect(() => {
    if (authLoaded && !isSignedIn) router.replace('/login');
  }, [authLoaded, isSignedIn, router]);
  useEffect(() => {
    if (userLoaded && user?.publicMetadata?.onboarded && !busy && !done) router.replace('/app');
  }, [userLoaded, user, busy, done, router]);

  const blocks = useMemo(() => previewWeek(a), [a]);
  const work = WEEKDAYS.map((d) => a.days.includes(d));
  const peak = PEAKS.find((p) => p.id === a.peak)!;
  const focusWeek = blocks.filter((b) => b.kind === 'focus').reduce((n, b) => n + (b.e - b.s) / 60, 0);
  const workWeek = a.days.length * (a.end - a.start);

  const patch = (p: Partial<OnboardingAnswers>) => {
    setError(null);
    setA((cur) => ({ ...cur, ...p }));
  };

  function goTo(i: number) {
    if (i < 0 || i >= STEPS.length) return;
    setDir(i >= step ? 'fwd' : 'back');
    setStep(i);
    setSeen((s) => Math.max(s, i));
    setError(null);
  }

  function next() {
    if (step === 1 && !a.days.length) return setError('Pick at least one working day.');
    if (step < STEPS.length - 1) goTo(step + 1);
  }

  async function submit(kind: 'finish' | 'google' | 'skip') {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      const res = await apiFetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(kind === 'skip' ? { skip: true } : a),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status}).`);
      try {
        if (storeKey) sessionStorage.removeItem(storeKey);
      } catch {
        // ignore
      }
      await user?.reload();

      if (kind === 'google') {
        const g = await apiFetch('/api/auth/google/start', { method: 'POST' });
        const gd = (await g.json().catch(() => ({}))) as { url?: string; error?: string };
        if (g.ok && gd.url) {
          window.location.assign(gd.url);
          return;
        }
        // Saved, but connect is unavailable: land in the app, which shows the connect panel.
        router.replace('/app?connect=error');
        return;
      }
      if (kind === 'finish') {
        setDone(true);
        return;
      }
      router.replace('/app');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  }

  if (!authLoaded || !userLoaded || !user) {
    return (
      <div className="au" data-page="onboarding">
        <p className="au-wait">Loading…</p>
      </div>
    );
  }

  const name = a.firstName.trim();

  return (
    <div className="au" data-page="onboarding">
      <section className="au-side">
        <header className="au-top">
          <a className="au-brand" href="/" aria-label="Find Time — home">
            <i className="au-mark" aria-hidden="true" />
            Find Time
          </a>
          {!done ? (
            <button type="button" className="au-btn au-quiet" onClick={() => void submit('skip')} disabled={!!busy}>
              {busy === 'skip' ? 'Skipping…' : 'Skip for now'}
            </button>
          ) : null}
        </header>

        <div className="au-body">
          {done ? (
            <Done a={a} focusWeek={focusWeek} onOpen={() => router.replace('/app')} />
          ) : (
            <>
              <p className="au-eyebrow">Set up · step 3 of 3</p>
              <ol className="ob-rail" aria-label="Setup progress">
                {STEPS.map((s, i) => (
                  <li key={s} data-state={i < step ? 'done' : i === step ? 'now' : 'next'}>
                    <button type="button" onClick={() => goTo(i)} disabled={i > seen} aria-current={i === step ? 'step' : undefined}>
                      {String(i + 1).padStart(2, '0')} <span className="ob-rail-l">{s.toUpperCase()}</span>
                    </button>
                  </li>
                ))}
              </ol>

              <form
                key={step}
                className="ob-step"
                data-dir={dir}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (step === STEPS.length - 1) void submit('finish');
                  else next();
                }}>
                {step === 0 ? (
                  <Step q={name ? `Hi ${name}. What should we call you?` : 'What should we call you?'} sub="It’s how the week greets you. Nothing else.">
                    <div className="au-field">
                      <label htmlFor="ob-name">First name</label>
                      <div className="au-input">
                        <input
                          id="ob-name"
                          autoComplete="given-name"
                          placeholder="Your first name"
                          value={a.firstName}
                          maxLength={60}
                          onChange={(e) => patch({ firstName: e.target.value })}
                          autoFocus
                        />
                      </div>
                    </div>
                  </Step>
                ) : null}

                {step === 1 ? (
                  <Step q="When do you work?" sub="Plans only land inside these hours. Days you switch off stay empty.">
                    <fieldset>
                      <legend className="au-lbl" style={{ marginBottom: 8 }}>
                        Working days
                      </legend>
                      <div className="ob-days">
                        {WEEKDAYS.map((d, i) => (
                          <button
                            key={d}
                            type="button"
                            aria-pressed={a.days.includes(d)}
                            aria-label={DAY_NAME[i]}
                            onClick={() =>
                              patch({ days: a.days.includes(d) ? a.days.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || a.days.includes(x)) })
                            }>
                            {DAY_SHORT[i]}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="ob-hours">
                      <Stepper
                        label="Start"
                        value={hourLabel(a.start, a.clock24)}
                        onDec={() => patch({ start: a.start - 1 })}
                        onInc={() => patch({ start: a.start + 1 })}
                        decDisabled={a.start <= 5}
                        incDisabled={a.end - (a.start + 1) < 2}
                      />
                      <Stepper
                        label="End"
                        value={hourLabel(a.end, a.clock24)}
                        onDec={() => patch({ end: a.end - 1 })}
                        onInc={() => patch({ end: a.end + 1 })}
                        decDisabled={a.end - 1 - a.start < 2}
                        incDisabled={a.end >= 23}
                      />
                    </div>
                    <p className="au-hint">
                      {a.days.length} day{a.days.length === 1 ? '' : 's'} · {workWeek} h a week
                    </p>
                  </Step>
                ) : null}

                {step === 2 ? (
                  <Step q="When do you think best?" sub="Demanding work is ranked into these hours first. It learns from your edits after that.">
                    <div className="ob-peaks" role="radiogroup" aria-label="Best hours">
                      {PEAKS.map((p) => (
                        <label key={p.id} className="ob-peak">
                          <input type="radio" name="peak" value={p.id} checked={a.peak === p.id} onChange={() => patch({ peak: p.id })} />
                          <span className="ob-peak-t">
                            <b>{p.label}</b>
                            <small>{a.clock24 ? p.hint : `${hourLabel(p.from, false)} – ${hourLabel(p.to, false)}`}</small>
                          </span>
                          <Curve peak={p.id} />
                        </label>
                      ))}
                    </div>
                  </Step>
                ) : null}

                {step === 3 ? (
                  <Step q="How much deep work a day?" sub="Your daily budget for focused, demanding work. The rest stays open for everything else.">
                    <div className="ob-range">
                      <div className="ob-range-top">
                        <label htmlFor="ob-focus" className="au-lbl">
                          Each working day
                        </label>
                        <output htmlFor="ob-focus">
                          {a.focusH}
                          <small>h</small>
                        </output>
                      </div>
                      <input
                        id="ob-focus"
                        type="range"
                        min={FOCUS_MIN}
                        max={FOCUS_MAX}
                        step={0.5}
                        value={a.focusH}
                        onChange={(e) => patch({ focusH: Number(e.target.value) })}
                        style={{ '--fill': `${((a.focusH - FOCUS_MIN) / (FOCUS_MAX - FOCUS_MIN)) * 100}%` } as CSSProperties}
                        aria-valuetext={`${a.focusH} hours`}
                      />
                      <div className="ob-ticks" aria-hidden="true">
                        {Array.from({ length: FOCUS_MAX - FOCUS_MIN + 1 }, (_, i) => (
                          <span key={i}>{FOCUS_MIN + i}h</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="au-lbl" id="ob-hw" style={{ marginBottom: 8 }}>
                        Hard work across the week
                      </p>
                      <div className="ob-seg" data-v={a.hardWork === 'cluster' ? 1 : 0} role="group" aria-labelledby="ob-hw">
                        <button type="button" aria-pressed={a.hardWork === 'spread'} onClick={() => patch({ hardWork: 'spread' })}>
                          <b>Spread it</b>
                          <small>A little every day</small>
                        </button>
                        <button type="button" aria-pressed={a.hardWork === 'cluster'} onClick={() => patch({ hardWork: 'cluster' })}>
                          <b>Cluster it</b>
                          <small>Big days, lighter days</small>
                        </button>
                      </div>
                    </div>
                  </Step>
                ) : null}

                {step === 4 ? (
                  <Step q="Last thing: your calendar." sub="Connect Google Calendar so plans go around your real meetings. You can do it later from the sidebar.">
                    <div className="ob-connect">
                      <div className="ob-connect-h">
                        <GoogleCal />
                        <b>Google Calendar</b>
                      </div>
                      <ul>
                        <li>Reads first. Writes only if you ask: your focus blocks, as private busy events.</li>
                        <li>Other people’s meetings never move. It plans around them.</li>
                        <li>Disconnect any time; its imported events are removed.</li>
                      </ul>
                    </div>
                    <div className="ob-rows">
                      <div>
                        <label htmlFor="ob-tz">Time zone</label>
                        <select id="ob-tz" value={a.timezone} onChange={(e) => patch({ timezone: e.target.value })}>
                          {zones(a.timezone).map((z) => (
                            <option key={z} value={z}>
                              {z.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <span className="ob-rk" id="ob-clock">
                          Clock
                        </span>
                        <Mini
                          labelledBy="ob-clock"
                          options={[
                            ['24h', a.clock24],
                            ['12h', !a.clock24],
                          ]}
                          onPick={(i) => patch({ clock24: i === 0 })}
                        />
                      </div>
                      <div>
                        <span className="ob-rk" id="ob-ws">
                          Week starts
                        </span>
                        <Mini
                          labelledBy="ob-ws"
                          options={[
                            ['Monday', a.weekStart === 1],
                            ['Sunday', a.weekStart === 0],
                          ]}
                          onPick={(i) => patch({ weekStart: i === 0 ? 1 : 0 })}
                        />
                      </div>
                    </div>
                  </Step>
                ) : null}

                <div aria-live="polite" role="status">
                  {error ? <p className="au-err">{error}</p> : null}
                </div>

                <div className="ob-nav">
                  {step > 0 ? (
                    <button type="button" className="au-btn au-quiet" onClick={() => goTo(step - 1)} disabled={!!busy}>
                      ← Back
                    </button>
                  ) : (
                    <span className="ob-kbd">
                      Press <kbd>Enter</kbd> to continue
                    </span>
                  )}
                  {step < STEPS.length - 1 ? (
                    <button type="submit" className="au-btn au-ink">
                      Continue
                      <span className="arr" aria-hidden="true">
                        →
                      </span>
                    </button>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <button type="submit" className="au-btn au-ghost" disabled={!!busy} aria-busy={busy === 'finish'}>
                        {busy === 'finish' ? <i className="au-spin" aria-hidden="true" /> : null}
                        Later
                      </button>
                      <button type="button" className="au-btn au-ink" onClick={() => void submit('google')} disabled={!!busy} aria-busy={busy === 'google'}>
                        {busy === 'google' ? <i className="au-spin" aria-hidden="true" /> : null}
                        Connect Google
                      </button>
                    </div>
                  )}
                </div>
              </form>
            </>
          )}
        </div>
      </section>

      <aside className="au-stage" aria-label="Preview of your week">
        <div className="au-stage-cap">
          <h2>{name ? `${name}’s week` : 'Your week'}</h2>
          <p>Live preview · example meetings</p>
        </div>
        <MiniWeek
          title={step >= 2 || done ? `Best hours ${hourLabel(peak.from, a.clock24)}–${hourLabel(peak.to, a.clock24)}` : 'Working hours'}
          meta={`${hourLabel(a.start, a.clock24)}–${hourLabel(a.end, a.clock24)}`}
          work={work}
          start={a.start}
          end={a.end}
          peak={step >= 2 || done ? peak : null}
          blocks={step >= 3 || done ? blocks : blocks.filter((b) => b.kind === 'meeting')}
          clock24={a.clock24}
          weekStart={a.weekStart}
          height={380}
          stats={[
            { label: 'Working', value: `${workWeek} h` },
            { label: 'Deep work', value: step >= 3 || done ? `${focusWeek} h` : '—' },
            { label: 'Days off', value: `${7 - a.days.length}` },
          ]}
        />
      </aside>
    </div>
  );
}

function Step({ q, sub, children }: { q: string; sub: string; children: ReactNode }) {
  return (
    <>
      <h1 className="ob-q">{q}</h1>
      <p className="ob-sub">{sub}</p>
      {children}
    </>
  );
}

function Stepper(props: {
  label: string;
  value: string;
  onDec: () => void;
  onInc: () => void;
  decDisabled: boolean;
  incDisabled: boolean;
}) {
  return (
    <div className="ob-stepper">
      <button type="button" onClick={props.onDec} disabled={props.decDisabled} aria-label={`${props.label} earlier`}>
        −
      </button>
      <output aria-live="polite">
        <small>{props.label}</small>
        <b>{props.value}</b>
      </output>
      <button type="button" onClick={props.onInc} disabled={props.incDisabled} aria-label={`${props.label} later`}>
        +
      </button>
    </div>
  );
}

function Mini({ options, onPick, labelledBy }: { options: [string, boolean][]; onPick: (i: number) => void; labelledBy: string }) {
  return (
    <div className="ob-mini" role="group" aria-labelledby={labelledBy}>
      {options.map(([label, on], i) => (
        <button key={label} type="button" aria-pressed={on} onClick={() => onPick(i)}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** The real stored energy curve for a peak (energyCurveFor), 6–21h, as a sparkline. */
function Curve({ peak }: { peak: (typeof PEAKS)[number]['id'] }) {
  const pts = energyCurveFor(peak);
  const W = 200;
  const H = 34;
  const x = (i: number) => (i / (pts.length - 1)) * W;
  const y = (l: number) => H - 2 - l * (H - 6);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.level).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <path className="fill" d={`${line} L${W},${H} L0,${H} Z`} />
      <path d={line} />
    </svg>
  );
}

function Done({ a, focusWeek, onOpen }: { a: OnboardingAnswers; focusWeek: number; onOpen: () => void }) {
  const peak = PEAKS.find((p) => p.id === a.peak)!;
  const days = WEEKDAYS.map((d, i) => (a.days.includes(d) ? DAY_SHORT[i] : null)).filter(Boolean).join(' ');
  return (
    <div className="ob-done ob-step" data-dir="fwd">
      <p className="au-eyebrow">All set</p>
      <h1 className="ob-q">{a.firstName.trim() ? `Your week is ready, ${a.firstName.trim()}.` : 'Your week is ready.'}</h1>
      <p className="ob-sub">Ask Find Time to plan something and it starts from these. It keeps learning from what you move.</p>
      <dl className="ob-sum">
        <div>
          <dt>Working</dt>
          <dd>
            {days} · {hourLabel(a.start, a.clock24)}–{hourLabel(a.end, a.clock24)}
          </dd>
        </div>
        <div>
          <dt>Best hours</dt>
          <dd>{peak.label}</dd>
        </div>
        <div>
          <dt>Deep work</dt>
          <dd>
            {a.focusH} h a day, {a.hardWork === 'spread' ? 'spread out' : 'clustered'} · {focusWeek} h this week
          </dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{a.timezone.replace(/_/g, ' ')}</dd>
        </div>
      </dl>
      <button type="button" className="au-btn au-ink au-wide" onClick={onOpen} autoFocus>
        Open my week
        <span className="arr" aria-hidden="true">
          →
        </span>
      </button>
    </div>
  );
}

function GoogleCal() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="3" fill="#fff" stroke="#4285F4" strokeWidth="1.6" />
      <path d="M3 9h18" stroke="#4285F4" strokeWidth="1.6" />
      <path d="M8 2.5v3M16 2.5v3" stroke="#4285F4" strokeWidth="1.6" strokeLinecap="round" />
      <text x="12" y="18.2" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#1a73e8" fontFamily="system-ui, sans-serif">
        31
      </text>
    </svg>
  );
}
