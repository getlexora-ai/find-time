/**
 * `/welcome` — the first minute after sign-up. Five short questions, each one
 * a field the planner really reads (src/auth/onboarding.ts maps them), with
 * the week on the right replanned as you answer by the planner's own ranking.
 *
 *   01 Name      02 Calendar   03 Week   04 Peak   05 Focus   → done
 *
 * Calendar comes second on purpose: once Google is connected, the preview
 * plans around *your* meetings this week instead of example ones. Connecting
 * leaves for Google and comes back here (`returnTo: '/welcome'`), with the
 * answers so far kept in sessionStorage.
 *
 * Returning users (anyone who already has planner settings) open on their own
 * settings, and only the groups they touch are written back — a learned energy
 * curve isn't replaced unless they pick a peak.
 *
 * Finishing or skipping posts to `/api/onboarding`, which marks the Clerk
 * user `onboarded` so `/app` stops sending them here. Each step seen, connect,
 * skip and finish is logged for the drop-off funnel (db/022).
 */
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { type CSSProperties, type ReactNode, type RefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';

import { loadOnboarding, type OnboardingState, saveOnboarding, syncCalendars, track } from '../client';
import {
  defaultAnswers,
  energyCurveFor,
  FOCUS_MAX,
  FOCUS_MIN,
  focusByDay,
  type Group,
  GROUP_OF,
  hourLabel,
  modernZone,
  type OnboardingAnswers,
  PEAKS,
  previewWeek,
  SAMPLE_MEETINGS,
  type TrackStep,
  WEEKDAYS,
} from '../onboarding';
import { FocusStrip } from './FocusStrip';
import { MiniWeek } from './MiniWeek';
import { TimeZonePicker } from './TimeZonePicker';
import './auth.css';

const STEPS = ['Name', 'Calendar', 'Week', 'Peak', 'Focus'] as const;
const TRACK: TrackStep[] = ['name', 'calendar', 'week', 'peak', 'focus'];
const CAL = 1;
const WEEK = 2;
const PEAK = 3;
const DAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type Saved = { a: OnboardingAnswers; step: number; changed: Group[] };
type HeadingRef = RefObject<HTMLHeadingElement | null>;

function browserEnv(): { timezone?: string; clock24?: boolean } {
  try {
    const tz = modernZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    const h12 = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12;
    return { timezone: tz, clock24: !h12 };
  } catch {
    return {};
  }
}

function readSaved(key: string | null): Saved | null {
  try {
    const raw = key ? sessionStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string | null, v: Saved | null) {
  try {
    if (!key) return;
    if (v) sessionStorage.setItem(key, JSON.stringify(v));
    else sessionStorage.removeItem(key);
  } catch {
    // storage blocked — progress just won't survive a reload
  }
}

export default function Onboarding() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { user, isLoaded: userLoaded } = useUser();

  const storeKey = user ? `ft-onboarding:${user.id}` : null;
  const env = useMemo(() => browserEnv(), []);
  const [a, setA] = useState<OnboardingAnswers>(() => defaultAnswers(env));
  const [changed, setChanged] = useState<Set<Group>>(() => new Set());
  const [server, setServer] = useState<OnboardingState | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [seen, setSeen] = useState(0);
  const [busy, setBusy] = useState<null | 'finish' | 'connect' | 'skip' | 'sync'>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  /** true once the user has moved between steps — from then on, focus follows the step */
  const [moved, setMoved] = useState(false);
  const viewed = useRef(new Set<number>());

  // Load: saved progress (after a Google round trip) > the user's own settings > defaults.
  useEffect(() => {
    if (!user || started.current) return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const connect = params.get('connect');
    if (connect) window.history.replaceState(null, '', '/welcome');

    void (async () => {
      if (connect === 'ok') {
        setBusy('sync');
        track('calendar', 'connected');
        await syncCalendars();
      } else if (connect === 'error') {
        track('calendar', 'connect_failed');
      }
      const st = await loadOnboarding();
      const saved = readSaved(`ft-onboarding:${user.id}`);
      setServer(st);
      if (saved) {
        setA(saved.a);
        setChanged(new Set(saved.changed));
        setStep(saved.step);
        setSeen(saved.step);
      } else if (st?.existing && st.answers) {
        setA({ ...st.answers, firstName: st.answers.firstName || user.firstName || '' });
      } else {
        setA({ ...defaultAnswers(env), firstName: user.firstName ?? '' });
      }
      if (connect === 'ok') {
        const n = st?.meetings?.length ?? 0;
        setNotice(
          n
            ? `Google Calendar connected. The preview now plans around your ${n} meeting${n === 1 ? '' : 's'} this week.`
            : 'Google Calendar connected. No busy meetings this week yet — events can take a minute to import.',
        );
      } else if (connect === 'error') {
        setError('Google Calendar didn’t connect. Try again, or carry on with the example week.');
      }
      setBusy(null);
      setReady(true);
    })();
  }, [user, env]);

  useEffect(() => {
    if (ready && !done) writeSaved(storeKey, { a, step, changed: [...changed] });
  }, [a, step, changed, storeKey, ready, done]);

  // Signed out → sign in. Already onboarded (another tab) → the app.
  useEffect(() => {
    if (authLoaded && !isSignedIn) router.replace('/login');
  }, [authLoaded, isSignedIn, router]);
  useEffect(() => {
    if (userLoaded && user?.publicMetadata?.onboarded && !busy && !done) router.replace('/app');
  }, [userLoaded, user, busy, done, router]);

  // Each step: log the view once, and move focus to its question (not on first paint).
  useEffect(() => {
    if (!ready || done) return;
    if (!viewed.current.has(step)) {
      viewed.current.add(step);
      track(TRACK[step], 'view');
    }
    if (moved) headingRef.current?.focus();
  }, [step, ready, done, moved]);

  const meetings = server?.meetings ?? null;
  const real = Boolean(server?.connected && meetings);
  const blocks = useMemo(() => previewWeek(a, real && meetings ? meetings : SAMPLE_MEETINGS), [a, real, meetings]);
  const work = WEEKDAYS.map((d) => a.days.includes(d));
  const peak = PEAKS.find((p) => p.id === a.peak)!;
  const focusWeek = focusByDay(blocks).reduce((n, m) => n + m, 0) / 60;
  const workWeek = a.days.length * (a.end - a.start);
  const showFocus = step >= PEAK || done;
  const existing = Boolean(server?.existing);

  const patch = useCallback((p: Partial<OnboardingAnswers>) => {
    setError(null);
    setA((cur) => ({ ...cur, ...p }));
    setChanged((cur) => {
      const next = new Set(cur);
      for (const k of Object.keys(p) as (keyof OnboardingAnswers)[]) next.add(GROUP_OF[k]);
      return next;
    });
  }, []);

  function goTo(i: number) {
    if (i < 0 || i >= STEPS.length) return;
    setMoved(true);
    setDir(i >= step ? 'fwd' : 'back');
    setStep(i);
    setSeen((s) => Math.max(s, i));
    setError(null);
    setNotice(null);
  }

  function next() {
    if (step === WEEK && !a.days.length) return setError('Pick at least one working day.');
    if (step < STEPS.length - 1) goTo(step + 1);
  }

  async function connectGoogle() {
    if (busy) return;
    setBusy('connect');
    setError(null);
    track('calendar', 'connect');
    // Come back to the step after this one, with everything so far.
    writeSaved(storeKey, { a, step: CAL + 1, changed: [...changed] });
    try {
      const res = await apiFetch('/api/auth/google/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnTo: '/welcome' }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (res.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      writeSaved(storeKey, { a, step, changed: [...changed] });
      track('calendar', 'connect_failed');
      setError(data.error ?? `Google connect isn’t available right now (${res.status}). Carry on with the example week.`);
    } catch {
      writeSaved(storeKey, { a, step, changed: [...changed] });
      track('calendar', 'connect_failed');
      setError('Could not reach the server. Carry on with the example week and connect later.');
    }
    setBusy(null);
  }

  async function submit(kind: 'finish' | 'skip') {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await saveOnboarding(
        kind === 'skip'
          ? { skip: true }
          : // first-timers save everything; returning users only what they changed
            { answers: a, changed: existing ? [...changed] : undefined },
      );
      track(kind === 'skip' ? TRACK[step] : 'done', kind);
      writeSaved(storeKey, null);
      await user?.reload();
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

  if (!authLoaded || !userLoaded || !user || !ready) {
    return (
      <div className="au" data-page="onboarding">
        <p className="au-wait" role="status">
          <i className="au-spin" aria-hidden="true" style={{ marginRight: 10 }} />
          {busy === 'sync' ? 'Reading your calendar…' : 'Loading…'}
        </p>
      </div>
    );
  }

  const name = a.firstName.trim();
  const isLast = step === STEPS.length - 1;

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
              {busy === 'skip' ? 'Skipping…' : existing ? 'Keep my settings' : 'Skip for now'}
            </button>
          ) : null}
        </header>

        <div className="au-body">
          {done ? (
            <Done a={a} focusWeek={focusWeek} real={real} headingRef={headingRef} onOpen={() => router.replace('/app')} />
          ) : (
            <>
              <p className="au-eyebrow">{existing ? 'Review your setup' : 'Shape your week'}</p>
              <ol className="ob-rail" aria-label="Setup progress">
                {STEPS.map((s, i) => (
                  <li key={s} data-state={i < step ? 'done' : i === step ? 'now' : 'next'}>
                    <button
                      type="button"
                      onClick={() => goTo(i)}
                      disabled={i > seen && !existing}
                      aria-current={i === step ? 'step' : undefined}
                      aria-label={`Step ${i + 1} of ${STEPS.length}: ${s}`}>
                      {String(i + 1).padStart(2, '0')} <span className="ob-rail-l">{s.toUpperCase()}</span>
                    </button>
                  </li>
                ))}
              </ol>
              {existing && step === 0 && !changed.size ? (
                <p className="ob-note">We filled in your current settings. Change only what you want — the rest stays as it is.</p>
              ) : null}

              <form
                key={step}
                className="ob-step"
                data-dir={dir}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isLast) void submit('finish');
                  else next();
                }}>
                {step === 0 ? (
                  <Step
                    headingRef={headingRef}
                    q={name ? `Hi ${name}. What should we call you?` : 'What should we call you?'}
                    sub="It’s how the week greets you. Nothing else.">
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
                          autoFocus={!moved}
                        />
                      </div>
                    </div>
                  </Step>
                ) : null}

                {step === CAL ? (
                  <Step
                    headingRef={headingRef}
                    q={real ? 'Your calendar is connected.' : 'Plan around your real meetings?'}
                    sub={
                      real
                        ? 'The preview now plans around your own meetings this week.'
                        : 'Connect Google Calendar and the preview — and every plan after it — works around what’s already booked.'
                    }>
                    <div className="ob-connect">
                      <div className="ob-connect-h">
                        <GoogleCal />
                        <b>Google Calendar</b>
                        {real ? <span className="ob-ok">Connected · {meetings?.length ?? 0} this week</span> : null}
                      </div>
                      <ul>
                        <li>Reads first. Writes only if you ask: your focus blocks, as private busy events.</li>
                        <li>Other people’s meetings never move. It plans around them.</li>
                        <li>Disconnect any time; its imported events are removed.</li>
                      </ul>
                      {!real ? (
                        <button
                          type="button"
                          className="au-btn au-ink"
                          onClick={() => void connectGoogle()}
                          disabled={!!busy}
                          aria-busy={busy === 'connect'}>
                          {busy === 'connect' ? <i className="au-spin" aria-hidden="true" /> : null}
                          Connect Google Calendar
                        </button>
                      ) : null}
                    </div>
                  </Step>
                ) : null}

                {step === WEEK ? (
                  <Step headingRef={headingRef} q="When do you work?" sub="Plans only land inside these hours. Days you switch off stay empty.">
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
                              patch({
                                days: a.days.includes(d) ? a.days.filter((x) => x !== d) : WEEKDAYS.filter((x) => x === d || a.days.includes(x)),
                              })
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
                    <div className="ob-rows">
                      <div className="ob-row-tz">
                        <span className="ob-rk" id="ob-tz">
                          Time zone
                        </span>
                        <TimeZonePicker
                          value={a.timezone}
                          detected={env.timezone ?? a.timezone}
                          onChange={(z) => patch({ timezone: z })}
                          labelId="ob-tz"
                        />
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

                {step === PEAK ? (
                  <Step
                    headingRef={headingRef}
                    q="When do you think best?"
                    sub="Demanding work is ranked into these hours first. It learns from your edits after that.">
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

                {step === 4 ? (
                  <Step
                    headingRef={headingRef}
                    q="How much deep work a day?"
                    sub="Your daily budget for focused, demanding work. The rest stays open for everything else.">
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

                <div aria-live="polite" role="status">
                  {error ? <p className="au-err">{error}</p> : null}
                  {notice ? <p className="ob-notice">{notice}</p> : null}
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
                  {isLast ? (
                    <button type="submit" className="au-btn au-ink" disabled={!!busy} aria-busy={busy === 'finish'}>
                      {busy === 'finish' ? <i className="au-spin" aria-hidden="true" /> : null}
                      {existing ? 'Save changes' : 'Finish setup'}
                    </button>
                  ) : (
                    <button type="submit" className={`au-btn ${step === CAL && !real ? 'au-ghost' : 'au-ink'}`} disabled={busy === 'connect'}>
                      {step === CAL && !real ? 'Use an example week' : 'Continue'}
                      <span className="arr" aria-hidden="true">
                        →
                      </span>
                    </button>
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
          <p>{real ? `Live preview · your meetings, week of ${weekLabel(server?.weekOf)}` : 'Live preview · example meetings'}</p>
        </div>
        <MiniWeek
          title={showFocus ? `Best hours ${hourLabel(peak.from, a.clock24)}–${hourLabel(peak.to, a.clock24)}` : 'Working hours'}
          meta={`${hourLabel(a.start, a.clock24)}–${hourLabel(a.end, a.clock24)}`}
          work={work}
          start={a.start}
          end={a.end}
          peak={showFocus ? peak : null}
          blocks={showFocus ? blocks : blocks.filter((b) => b.kind === 'meeting')}
          clock24={a.clock24}
          weekStart={a.weekStart}
          height={380}
          meetingLabel={real ? 'Your meetings' : 'Meetings (example)'}
          stats={[
            { label: 'Working', value: `${workWeek} h` },
            { label: 'Deep work', value: showFocus ? `${focusWeek} h` : '—' },
            { label: 'Meetings', value: `${blocks.filter((b) => b.kind === 'meeting').length}` },
          ]}
        />
      </aside>

      {!done ? <FocusStrip blocks={blocks} work={work} showFocus={showFocus} weekStart={a.weekStart} /> : null}
    </div>
  );
}

/** '2026-09-28' → '28 Sep' in the viewer's locale. */
function weekLabel(isoDay: string | null | undefined): string {
  if (!isoDay) return 'this week';
  const d = new Date(`${isoDay}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? 'this week' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

function Step({ q, sub, children, headingRef }: { q: string; sub: string; children: ReactNode; headingRef: HeadingRef }) {
  return (
    <>
      <h1 className="ob-q" ref={headingRef} tabIndex={-1}>
        {q}
      </h1>
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
    <div className="ob-stepper" role="group" aria-label={`${props.label} time`}>
      <button type="button" onClick={props.onDec} disabled={props.decDisabled} aria-label={`${props.label} earlier (now ${props.value})`}>
        −
      </button>
      <output>
        <small>{props.label}</small>
        <b>{props.value}</b>
      </output>
      <button type="button" onClick={props.onInc} disabled={props.incDisabled} aria-label={`${props.label} later (now ${props.value})`}>
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

function Done({
  a,
  focusWeek,
  real,
  onOpen,
  headingRef,
}: {
  a: OnboardingAnswers;
  focusWeek: number;
  real: boolean;
  onOpen: () => void;
  headingRef: HeadingRef;
}) {
  const peak = PEAKS.find((p) => p.id === a.peak)!;
  const days = WEEKDAYS.map((d, i) => (a.days.includes(d) ? DAY_SHORT[i] : null))
    .filter(Boolean)
    .join(' ');
  useEffect(() => {
    headingRef.current?.focus();
  }, [headingRef]);
  return (
    <div className="ob-done ob-step" data-dir="fwd">
      <p className="au-eyebrow">All set</p>
      <h1 className="ob-q" ref={headingRef} tabIndex={-1}>
        {a.firstName.trim() ? `Your week is ready, ${a.firstName.trim()}.` : 'Your week is ready.'}
      </h1>
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
            {a.focusH} h a day, {a.hardWork === 'spread' ? 'spread out' : 'clustered'} · {focusWeek} h {real ? 'fits this week' : 'in the example week'}
          </dd>
        </div>
        <div>
          <dt>Calendar</dt>
          <dd>{real ? 'Google connected' : 'Not connected yet'}</dd>
        </div>
        <div>
          <dt>Time zone</dt>
          <dd>{a.timezone.replace(/_/g, ' ')}</dd>
        </div>
      </dl>
      <button type="button" className="au-btn au-ink au-wide" onClick={onOpen}>
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
