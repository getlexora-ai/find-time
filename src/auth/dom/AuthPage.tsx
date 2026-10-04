/**
 * `/login` and `/signup` on web — our own pages on Better Auth
 * (`src/lib/auth-client.ts`), drawn in the landing's Nexus light language.
 *
 * Flows:
 *   sign in   email + password → done, or → a 6-digit code when the email
 *             was never verified (the server emails one on the attempt) → done
 *   sign up   email + password → 6-digit code → done → /welcome (onboarding)
 *   reset     email → 6-digit code + new password → done
 *   Google    signIn.social → /api/auth/callback/google → /app, or /welcome
 *             for a new account. Failures come back here as `?error=`.
 *
 * The right-hand stage is the product, not decoration: the example week a new
 * account starts from (the same `previewWeek` the onboarding drives). For sign
 * up it also shows where you are in the three steps, ticking as you go.
 */
import { useRouter } from 'expo-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useMounted } from '@/design/useMounted';
import { authClient } from '@/lib/auth-client';
import { useAuthState } from '@/lib/session';

import { defaultAnswers, previewWeek } from '../onboarding';
import { MiniWeek } from './MiniWeek';
import { Otp } from './Otp';
import { WeekBoard3D } from './WeekBoard3D';
import './auth.css';

type Mode = 'sign-in' | 'sign-up';
type Phase = 'form' | 'code' | 'reset-request' | 'reset-code';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_S = 30;

const HAS_ACCOUNT = 'An account already uses that email.';

type AuthError = { code?: string; message?: string; status?: number } | null | undefined;

function authError(err: AuthError): string {
  switch (err?.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email or password is not right. Try again or reset your password.';
    case 'INVALID_OTP':
      return 'That code is not right. Check the latest email.';
    case 'OTP_EXPIRED':
      return 'That code has expired. Send a new one.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many tries with that code. Send a new one.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return HAS_ACCOUNT;
  }
  if (err?.status === 429) return 'Too many attempts. Wait a minute and try again.';
  return err?.message || 'Something went wrong. Try again.';
}

/** `?error=` from a Google sign-in that didn't finish (Better Auth's errorCallbackURL). */
function googleError(code: string, description: string | null): string {
  if (code === 'NOT_INVITED' && description) return description;
  return 'Google sign-in didn’t finish. Try again.';
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn, refetch } = useAuthState();

  const [phase, setPhase] = useState<Phase>('form');
  const mounted = useMounted();
  const [typedEmail, setEmail] = useState<string | null>(null);
  // carried over from the other page's error link (?email=…); read after hydration
  const email = typedEmail ?? (mounted ? (new URLSearchParams(window.location.search).get('email') ?? '').slice(0, 254) : '');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'submit' | 'google' | 'resend'>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [shake, setShake] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  /** set once a flow has picked its destination, so the redirect below doesn't race it */
  const leaving = useRef(false);

  // Signed-in visitors never see this page.
  useEffect(() => {
    if (authLoaded && isSignedIn && !busy && !leaving.current) router.replace('/app');
  }, [authLoaded, isSignedIn, busy, router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // A Google sign-in that came back with ?error= (e.g. not invited yet): shown
  // on the untouched form; read after hydration, like ?email=.
  const q = mounted ? new URLSearchParams(window.location.search) : null;
  const googleFailed = q?.get('error') ? googleError(q.get('error')!, q.get('error_description')) : null;
  const formError = error ?? (phase === 'form' && !touched && !busy ? googleFailed : null);

  const emailOk = EMAIL_RE.test(email.trim());
  const pwLong = password.length >= 8;

  function fail(msg: string) {
    setError(msg);
    setShake((n) => n + 1);
  }

  /** The session cookie is set by now; load it, then go. */
  async function finish(target: '/app' | '/welcome') {
    leaving.current = true;
    await refetch();
    router.replace(target);
  }

  function toCode() {
    setCode('');
    setPhase('code');
    setResendIn(RESEND_S);
  }

  // ── sign in / sign up ────────────────────────────────────────────────
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (busy) return;
    setError(null);
    if (!emailOk) return fail('Enter a valid email address.');
    if (mode === 'sign-up' && !pwLong) return fail('Use at least 8 characters for your password.');
    if (mode === 'sign-in' && !password) return fail('Enter your password.');

    setBusy('submit');
    try {
      if (mode === 'sign-up') {
        // Verification is required, so this never signs in: the server emails a code.
        const { error: err } = await authClient.signUp.email({ email: email.trim(), password, name: '' });
        if (err) return fail(authError(err));
        toCode();
      } else {
        const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
        if (!err) return await finish('/app');
        // Never verified: the server just emailed a code — finish verifying here.
        if (err.code === 'EMAIL_NOT_VERIFIED') return toCode();
        fail(authError(err));
      }
    } catch (err) {
      fail(authError(err as AuthError));
    } finally {
      setBusy(null);
    }
  }

  // ── the code ─────────────────────────────────────────────────────────
  async function verify(value = code) {
    if (busy === 'submit') return;
    if (value.length !== 6) return fail('Enter all 6 digits.');
    setError(null);
    setBusy('submit');
    try {
      // Verifying also signs in (autoSignInAfterVerification).
      const { error: err } = await authClient.emailOtp.verifyEmail({ email: email.trim(), otp: value });
      if (err) {
        setCode('');
        return fail(authError(err));
      }
      await finish(mode === 'sign-up' ? '/welcome' : '/app');
    } catch (err) {
      setCode('');
      fail(authError(err as AuthError));
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    if (busy || resendIn > 0) return;
    setBusy('resend');
    setError(null);
    try {
      const { error: err } =
        phase === 'reset-code'
          ? await authClient.emailOtp.requestPasswordReset({ email: email.trim() })
          : await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' });
      if (err) return fail(authError(err));
      setResendIn(RESEND_S);
    } catch (err) {
      fail(authError(err as AuthError));
    } finally {
      setBusy(null);
    }
  }

  // ── reset password ───────────────────────────────────────────────────
  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (busy) return;
    setError(null);
    if (!emailOk) return fail('Enter the email you signed up with.');
    setBusy('submit');
    try {
      const { error: err } = await authClient.emailOtp.requestPasswordReset({ email: email.trim() });
      if (err) return fail(authError(err));
      setCode('');
      setNewPassword('');
      setPhase('reset-code');
      setResendIn(RESEND_S);
    } catch (err) {
      fail(authError(err as AuthError));
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (code.length !== 6) return fail('Enter all 6 digits from the email.');
    if (newPassword.length < 8) return fail('Use at least 8 characters for your new password.');
    setBusy('submit');
    try {
      const reset = await authClient.emailOtp.resetPassword({ email: email.trim(), otp: code, password: newPassword });
      if (reset.error) return fail(authError(reset.error));
      const signedIn = await authClient.signIn.email({ email: email.trim(), password: newPassword });
      if (!signedIn.error) return await finish('/app');
      fail('Your password changed, but signing in needs another step. Sign in again.');
      setPhase('form');
    } catch (err) {
      fail(authError(err as AuthError));
    } finally {
      setBusy(null);
    }
  }

  // ── Google ───────────────────────────────────────────────────────────
  async function google() {
    if (busy) return;
    setError(null);
    setBusy('google');
    try {
      // Redirects away to Google; we only get past this on failure.
      const { error: err } = await authClient.signIn.social({
        provider: 'google',
        callbackURL: '/app',
        newUserCallbackURL: '/welcome',
        errorCallbackURL: mode === 'sign-up' ? '/signup' : '/login',
      });
      if (err) {
        fail(authError(err));
        setBusy(null);
      }
    } catch (err) {
      fail(authError(err as AuthError));
      setBusy(null);
    }
  }

  const go = (href: '/login' | '/signup') => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    router.replace(href);
  };

  // ── view ─────────────────────────────────────────────────────────────
  const isUp = mode === 'sign-up';
  const view = phase;
  let head: { eyebrow: string; title: string; lede: ReactNode };
  if (view === 'code') {
    head = {
      eyebrow: isUp ? 'Verify email' : 'One more step',
      title: 'Check your email',
      lede: (
        <>
          We sent a 6-digit code to <b>{email.trim()}</b>. It works for 10 minutes.
        </>
      ),
    };
  } else if (phase === 'reset-request') {
    head = { eyebrow: 'Reset password', title: 'Forgot your password?', lede: 'We’ll email you a code to set a new one.' };
  } else if (phase === 'reset-code') {
    head = {
      eyebrow: 'Reset password',
      title: 'Set a new password',
      lede: (
        <>
          Enter the code we sent to <b>{email.trim()}</b> and choose a new password.
        </>
      ),
    };
  } else if (isUp) {
    head = {
      eyebrow: 'Create account',
      title: 'Plan the week you meant to have.',
      lede: 'Create your account. Then we’ll set up your working hours and deep work together, in about a minute.',
    };
  } else {
    head = { eyebrow: 'Sign in', title: 'Welcome back.', lede: 'Pick up your week where you left it.' };
  }

  const pathStep = view === 'code' ? 1 : 0;

  return (
    <div className="au" data-page="auth">
      <section className="au-side">
        <header className="au-top">
          <a className="au-brand" href="/" aria-label="Find Time — home">
            <i className="au-mark" aria-hidden="true" />
            Find Time
          </a>
          <p className="au-swap">
            {isUp ? 'Have an account?' : 'New here?'}
            <a href={isUp ? '/login' : '/signup'} onClick={go(isUp ? '/login' : '/signup')}>
              {isUp ? 'Sign in' : 'Create account'}
            </a>
          </p>
        </header>

        <div className="au-body" key={`${mode}-${view}`}>
          <p className="au-eyebrow au-in" style={{ '--i': 0 } as React.CSSProperties}>
            {head.eyebrow}
          </p>
          <h1 className="au-h1 au-in" style={{ '--i': 1 } as React.CSSProperties}>
            {head.title}
          </h1>
          <p className="au-lede au-in" style={{ '--i': 2 } as React.CSSProperties}>
            {head.lede}
          </p>

          {view === 'form' ? (
            <form className="au-form au-in" style={{ '--i': 3 } as React.CSSProperties} onSubmit={onSubmit} noValidate>
              <button type="button" className="au-btn au-ghost au-wide" onClick={google} disabled={!!busy} aria-busy={busy === 'google'}>
                {busy === 'google' ? <i className="au-spin" aria-hidden="true" /> : <GoogleG />}
                Continue with Google
              </button>
              <p className="au-or" aria-hidden="true">
                OR
              </p>
              <div className="au-field">
                <label htmlFor="au-email">Email</label>
                <div className="au-input" data-invalid={touched && !emailOk}>
                  <input
                    id="au-email"
                    type="email"
                    autoComplete="email"
                    inputMode="email"
                    placeholder="you@work.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    aria-invalid={touched && !emailOk}
                    autoFocus
                  />
                </div>
              </div>
              <div className="au-field">
                <div className="au-row">
                  <label htmlFor="au-pw" className="au-lbl">
                    Password
                  </label>
                  {!isUp ? (
                    <button
                      type="button"
                      className="au-link-btn"
                      onClick={() => {
                        setError(null);
                        setPhase('reset-request');
                      }}>
                      Forgot password?
                    </button>
                  ) : null}
                </div>
                <div className="au-input" data-invalid={touched && emailOk && (isUp ? !pwLong : !password)}>
                  <input
                    id="au-pw"
                    type={showPw ? 'text' : 'password'}
                    autoComplete={isUp ? 'new-password' : 'current-password'}
                    placeholder={isUp ? 'At least 8 characters' : 'Your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-invalid={touched && (isUp ? !pwLong : !password)}
                    aria-describedby={[isUp ? 'au-pw-hint' : '', formError ? 'au-err' : ''].filter(Boolean).join(' ') || undefined}
                  />
                  <button
                    type="button"
                    className="au-reveal"
                    onClick={() => setShowPw((v) => !v)}
                    aria-pressed={showPw}
                    aria-label={showPw ? 'Hide password' : 'Show password'}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
                {isUp ? (
                  <p id="au-pw-hint" className="au-hint" data-ok={pwLong}>
                    <i aria-hidden="true" />
                    {pwLong ? '8+ characters' : `${Math.max(0, 8 - password.length)} more character${8 - password.length === 1 ? '' : 's'}`}
                  </p>
                ) : null}
              </div>
              <ErrorLine error={formError} email={email.trim()} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!!busy} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                {isUp ? 'Create account' : 'Sign in'}
                {busy !== 'submit' ? (
                  <span className="arr" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </button>
            </form>
          ) : null}

          {view === 'code' ? (
            <form
              className="au-form au-in"
              style={{ '--i': 3 } as React.CSSProperties}
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}>
              <Otp
                value={code}
                onChange={setCode}
                onComplete={(v) => void verify(v)}
                invalid={!!error}
                shake={shake}
                disabled={busy === 'submit'}
              />
              <ErrorLine error={error} email={email.trim()} />
              <button
                type="submit"
                className="au-btn au-ink au-wide"
                disabled={busy === 'submit' || code.length !== 6}
                aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                {isUp ? 'Verify email' : 'Verify and sign in'}
              </button>
              <div className="au-row">
                <button
                  type="button"
                  className="au-link-btn"
                  onClick={() => {
                    setPhase('form');
                    setError(null);
                  }}>
                  {isUp ? 'Use a different email' : 'Back to sign in'}
                </button>
                <ResendButton resendIn={resendIn} busy={busy === 'resend'} onClick={resend} />
              </div>
            </form>
          ) : null}

          {phase === 'reset-request' ? (
            <form className="au-form au-in" style={{ '--i': 3 } as React.CSSProperties} onSubmit={requestReset} noValidate>
              <div className="au-field">
                <label htmlFor="au-remail">Email</label>
                <div className="au-input" data-invalid={touched && !emailOk}>
                  <input
                    id="au-remail"
                    type="email"
                    autoComplete="email"
                    placeholder="you@work.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <ErrorLine error={error} email={email.trim()} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!!busy} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                Email me a code
              </button>
              <button
                type="button"
                className="au-btn au-quiet"
                onClick={() => {
                  setPhase('form');
                  setError(null);
                }}>
                ← Back to sign in
              </button>
            </form>
          ) : null}

          {phase === 'reset-code' ? (
            <form className="au-form au-in" style={{ '--i': 3 } as React.CSSProperties} onSubmit={resetPassword} noValidate>
              <Otp value={code} onChange={setCode} invalid={!!error && code.length !== 6} shake={shake} disabled={busy === 'submit'} />
              <div className="au-field">
                <label htmlFor="au-npw">New password</label>
                <div className="au-input">
                  <input
                    id="au-npw"
                    type={showPw ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button type="button" className="au-reveal" onClick={() => setShowPw((v) => !v)} aria-pressed={showPw}>
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
              <ErrorLine error={error} email={email.trim()} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!!busy} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                Set password and sign in
              </button>
              <div className="au-row">
                <button
                  type="button"
                  className="au-link-btn"
                  onClick={() => {
                    setPhase('form');
                    setError(null);
                  }}>
                  Back to sign in
                </button>
                <ResendButton resendIn={resendIn} busy={busy === 'resend'} onClick={resend} />
              </div>
            </form>
          ) : null}
        </div>

        <footer className="au-foot">
          By continuing you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
        </footer>
      </section>

      <AuthStage isUp={isUp} step={pathStep} />
    </div>
  );
}

function AuthStage({ isUp, step }: { isUp: boolean; step: number }) {
  if (!isUp) return <SignInStage />;
  return <SignUpStage step={step} />;
}

/**
 * Sign in: no sample data for someone who already has a week — just today,
 * and where it sits in the week. Client-only dates (the page is SSR'd), so
 * the strip renders after hydration.
 */
function SignInStage() {
  const mounted = useMounted();
  const now = mounted ? new Date() : null;
  const monday = now ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7)) : null;
  return (
    <aside className="au-stage" aria-label="Today">
      <div className="si au-in" style={{ '--i': 2 } as React.CSSProperties}>
        <div className="si-date">
          <small>{now ? now.toLocaleDateString(undefined, { weekday: 'long' }) : '\u00a0'}</small>
          <b>{now ? now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) : '\u00a0'}</b>
        </div>
        <ol className="si-week" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => {
            const d = monday ? new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i) : null;
            const today = Boolean(d && now && d.toDateString() === now.toDateString());
            return (
              <li key={i} data-today={today} data-past={Boolean(d && now && d < now && !today)}>
                {d ? d.toLocaleDateString(undefined, { weekday: 'short' }) : ''}
                <b>{d ? d.getDate() : ''}</b>
              </li>
            );
          })}
        </ol>
        <p>Your plans, deep-work blocks and everything it has learned are where you left them.</p>
      </div>
    </aside>
  );
}

function SignUpStage({ step }: { step: number }) {
  const a = useMemo(() => defaultAnswers(), []);
  const blocks = useMemo(() => previewWeek(a), [a]);
  const work = useMemo(() => [true, true, true, true, true, false, false], []);
  const [gl, setGl] = useState<boolean | null>(null);
  // Account step: the week as it is. From the code step on, deep work floats in
  // as proposals — what the account is about to do for you.
  const showFocus = step >= 1;
  const focusH = blocks.filter((b) => b.kind === 'focus').reduce((n, b) => n + (b.e - b.s) / 60, 0);
  const meetings = blocks.filter((b) => b.kind === 'meeting').length;
  return (
    <aside className="au-stage" aria-label="What Find Time does">
      <div className="au-stage-cap au-in" style={{ '--i': 2 } as React.CSSProperties}>
        <h2>{showFocus ? 'Deep work, placed around your meetings.' : 'A week with room to think.'}</h2>
      </div>
      <div className="au-in" style={{ '--i': 3 } as React.CSSProperties}>
        {gl !== false ? (
          <div className="b3d-card" data-on={gl === true}>
            <WeekBoard3D
              blocks={blocks}
              settled={false}
              showFocus={showFocus}
              work={work}
              start={a.start}
              end={a.end}
              peak={showFocus ? { from: 8, to: 11 } : null}
              label={`Example week: ${meetings} meetings${showFocus ? `, ${focusH} hours of deep work proposed around them` : ''}.`}
              onGl={setGl}
            />
            <dl className="mw-stat">
              <div>
                <dt>Deep work</dt>
                <dd>{showFocus ? `${focusH} h` : '—'}</dd>
              </div>
              <div>
                <dt>Meetings</dt>
                <dd>{meetings}</dd>
              </div>
              <div>
                <dt>You approve</dt>
                <dd>Every block</dd>
              </div>
            </dl>
          </div>
        ) : null}
        {gl === false ? (
          <MiniWeek
            title="Example week"
            meta="09:00–18:00 · MON–FRI"
            work={work}
            start={a.start}
            end={a.end}
            peak={{ from: 8, to: 11 }}
            blocks={blocks}
            height={330}
            stats={[
              { label: 'Deep work', value: `${focusH} h` },
              { label: 'Meetings', value: `${meetings}` },
              { label: 'You approve', value: 'Every block' },
            ]}
          />
        ) : null}
      </div>
      <ol className="au-path au-in" style={{ '--i': 4 } as React.CSSProperties} aria-label="Sign-up steps">
        {['Account', 'Verify email', 'Shape your week'].map((label, i) => (
          <li key={label} data-state={i < step ? 'done' : i === step ? 'now' : 'next'} aria-current={i === step ? 'step' : undefined}>
            <span>{String(i + 1).padStart(2, '0')}</span>
            {label}
          </li>
        ))}
      </ol>
    </aside>
  );
}

/**
 * The form's error, announced (role=alert) and pointed at by the inputs'
 * aria-describedby. "Already have one" carries its way out — a link to sign
 * in with the email kept.
 */
function ErrorLine({ error, email }: { error: string | null; email?: string }) {
  const keep = email ? `?email=${encodeURIComponent(email)}` : '';
  const action = error === HAS_ACCOUNT ? { href: `/login${keep}`, label: 'Sign in instead' } : null;
  return (
    <div id="au-err" role="alert">
      {error ? (
        <p className="au-err">
          <span>
            {error}
            {action ? (
              <>
                {' '}
                <a href={action.href} className="au-err-act">
                  {action.label}
                </a>
              </>
            ) : null}
          </span>
        </p>
      ) : null}
    </div>
  );
}

function ResendButton({ resendIn, busy, onClick }: { resendIn: number; busy: boolean; onClick: () => void }) {
  return (
    <button type="button" className="au-link-btn" onClick={onClick} disabled={resendIn > 0 || busy}>
      {busy ? 'Sending…' : resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
    </button>
  );
}

function GoogleG() {
  return (
    <svg className="au-g" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
