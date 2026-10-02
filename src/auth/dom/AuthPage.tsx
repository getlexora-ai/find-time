/**
 * `/login` and `/signup` on web — our own pages on Clerk's headless hooks
 * (`useSignIn` / `useSignUp`), drawn in the landing's Nexus light language
 * instead of Clerk's prebuilt card.
 *
 * Flows:
 *   sign in   email + password → done, or → a 6-digit code when Clerk asks for
 *             a second factor (new device) → done
 *   sign up   email + password → 6-digit code → done → /welcome (onboarding)
 *   reset     email → 6-digit code + new password → done
 *   Google    authenticateWithRedirect → /sso-callback → /app (which sends
 *             first-timers on to /welcome)
 *
 * The right-hand stage is the product, not decoration: the example week a new
 * account starts from (the same `previewWeek` the onboarding drives). For sign
 * up it also shows where you are in the three steps, ticking as you go.
 */
import { useAuth, useSignIn, useSignUp } from '@clerk/clerk-expo';
import { useRouter } from 'expo-router';
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useMounted } from '@/design/useMounted';

import { defaultAnswers, previewWeek } from '../onboarding';
import { MiniWeek } from './MiniWeek';
import { Otp } from './Otp';
import './auth.css';

type Mode = 'sign-in' | 'sign-up';
type Phase = 'form' | 'code' | 'more' | 'reset-request' | 'reset-code';
/** second-factor methods we can finish here, best first */
type Factor = 'email_code' | 'phone_code' | 'totp' | 'backup_code';
const FACTOR_ORDER: Factor[] = ['email_code', 'phone_code', 'totp', 'backup_code'];
/** sign-up fields Clerk may still ask for after the email is verified */
type MoreField = 'first_name' | 'last_name' | 'username' | 'legal_accepted';
const MORE_FIELDS: MoreField[] = ['first_name', 'last_name', 'username', 'legal_accepted'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RESEND_S = 30;

function clerkError(err: unknown): string {
  const e = err as { errors?: { message?: string; longMessage?: string; code?: string }[] };
  const first = e?.errors?.[0];
  if (first?.code === 'form_password_incorrect') return 'That password is not right. Try again or reset it.';
  if (first?.code === 'form_identifier_not_found') return 'No account uses that email. Create one instead?';
  if (first?.code === 'form_code_incorrect') return 'That code is not right. Check the latest email.';
  if (first?.code === 'form_identifier_exists') return 'An account already uses that email. Sign in instead?';
  return first?.longMessage ?? first?.message ?? 'Something went wrong. Try again.';
}

export default function AuthPage({ mode }: { mode: Mode }) {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, setActive: setSignInActive, isLoaded: inLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: upLoaded } = useSignUp();

  const [phase, setPhase] = useState<Phase>('form');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'submit' | 'google' | 'resend'>(null);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [shake, setShake] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  /** sign-in second factor vs sign-up email verification */
  const [codeFor, setCodeFor] = useState<'sign-up' | 'second-factor'>('sign-up');
  const [factor, setFactor] = useState<Factor>('email_code');
  const [factors, setFactors] = useState<Factor[]>([]);
  const [missing, setMissing] = useState<string[]>([]);
  const [more, setMore] = useState({ firstName: '', lastName: '', username: '', legal: false });
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

  const ready = inLoaded && upLoaded;

  // Google sign-up that Clerk sent back for more details (sso-callback's
  // continueSignUpUrl): open straight on the "a few more details" step.
  const continuing =
    mode === 'sign-up' &&
    phase === 'form' &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('continue') &&
    signUp?.status === 'missing_requirements';
  const view: Phase = continuing ? 'more' : phase;
  const need = (continuing ? (signUp?.missingFields ?? []) : missing) as string[];
  const unsupported = need.filter((f) => !(MORE_FIELDS as string[]).includes(f));
  const emailOk = EMAIL_RE.test(email.trim());
  const pwLong = password.length >= 8;

  function fail(msg: string) {
    setError(msg);
    setShake((n) => n + 1);
  }

  async function finish(target: '/app' | '/welcome') {
    leaving.current = true;
    router.replace(target);
  }

  // ── sign in / sign up ────────────────────────────────────────────────
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!ready || busy) return;
    setError(null);
    if (!emailOk) return fail('Enter a valid email address.');
    if (mode === 'sign-up' && !pwLong) return fail('Use at least 8 characters for your password.');
    if (mode === 'sign-in' && !password) return fail('Enter your password.');

    setBusy('submit');
    try {
      if (mode === 'sign-up') {
        await signUp!.create({ emailAddress: email.trim(), password });
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
        setCodeFor('sign-up');
        setCode('');
        setPhase('code');
        setResendIn(RESEND_S);
      } else {
        const res = await signIn!.create({ identifier: email.trim(), password });
        if (res.status === 'complete') {
          await setSignInActive!({ session: res.createdSessionId });
          await finish('/app');
          return;
        }
        if ((res.status as string) === 'needs_second_factor' || (res.status as string) === 'needs_client_trust') {
          const offered = FACTOR_ORDER.filter((f) => res.supportedSecondFactors?.some((x) => x.strategy === f));
          if (!offered.length) return fail('This account needs a sign-in method we don’t support here yet. Try Google.');
          setFactors(offered);
          await startFactor(offered[0]);
          return;
        }
        fail('Signing in needs one more step we could not finish. Try Google, or reset your password.');
      }
    } catch (err) {
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  /** Switch to a second-factor method; email and SMS codes are sent first. */
  async function startFactor(f: Factor) {
    if (f === 'email_code' || f === 'phone_code') await signIn!.prepareSecondFactor({ strategy: f });
    setCodeFor('second-factor');
    setFactor(f);
    setCode('');
    setError(null);
    setPhase('code');
    setResendIn(f === 'email_code' || f === 'phone_code' ? RESEND_S : 0);
  }

  async function switchFactor(f: Factor) {
    if (busy) return;
    setBusy('resend');
    try {
      await startFactor(f);
    } catch (err) {
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  // ── the code ─────────────────────────────────────────────────────────
  async function verify(value = code) {
    if (!ready || busy === 'submit') return;
    const backup = codeFor === 'second-factor' && factor === 'backup_code';
    if (backup ? value.trim().length < 6 : value.length !== 6) return fail(backup ? 'Enter one of your backup codes.' : 'Enter all 6 digits.');
    setError(null);
    setBusy('submit');
    try {
      if (codeFor === 'sign-up') {
        const res = await signUp!.attemptEmailAddressVerification({ code: value });
        if (res.status === 'complete') {
          await setSignUpActive!({ session: res.createdSessionId });
          await finish('/welcome');
          return;
        }
        if (res.status === 'missing_requirements') {
          setMissing(res.missingFields as string[]);
          setPhase('more');
          return;
        }
        fail('Your email is verified, but the account isn’t finished. Try again.');
      } else {
        const res = await signIn!.attemptSecondFactor({ strategy: factor, code: value.trim() });
        if (res.status === 'complete') {
          await setSignInActive!({ session: res.createdSessionId });
          await finish('/app');
          return;
        }
        fail('That did not finish signing you in. Try again.');
      }
    } catch (err) {
      setCode('');
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    if (!ready || busy || resendIn > 0) return;
    setBusy('resend');
    setError(null);
    try {
      if (phase === 'reset-code') {
        await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      } else if (codeFor === 'sign-up') {
        await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      } else if (factor === 'email_code' || factor === 'phone_code') {
        await signIn!.prepareSecondFactor({ strategy: factor });
      }
      setResendIn(RESEND_S);
    } catch (err) {
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  // ── sign-up details Clerk still needs ───────────────────────────────
  async function submitMore(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setError(null);
    if (unsupported.length) return fail('This sign-up needs details we can’t collect here yet. Try signing up with email instead.');
    if (need.includes('first_name') && !more.firstName.trim()) return fail('Enter your first name.');
    if (need.includes('last_name') && !more.lastName.trim()) return fail('Enter your last name.');
    if (need.includes('username') && !more.username.trim()) return fail('Choose a username.');
    if (need.includes('legal_accepted') && !more.legal) return fail('Please accept the Terms and Privacy policy to continue.');
    setBusy('submit');
    try {
      const res = await signUp!.update({
        ...(need.includes('first_name') ? { firstName: more.firstName.trim() } : {}),
        ...(need.includes('last_name') ? { lastName: more.lastName.trim() } : {}),
        ...(need.includes('username') ? { username: more.username.trim() } : {}),
        ...(need.includes('legal_accepted') ? { legalAccepted: true } : {}),
      });
      if (res.status === 'complete') {
        await setSignUpActive!({ session: res.createdSessionId });
        await finish('/welcome');
        return;
      }
      setMissing(res.missingFields as string[]);
      setPhase('more');
      fail('A little more is needed to finish your account.');
    } catch (err) {
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  // ── reset password ───────────────────────────────────────────────────
  async function requestReset(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!ready || busy) return;
    setError(null);
    if (!emailOk) return fail('Enter the email you signed up with.');
    setBusy('submit');
    try {
      await signIn!.create({ strategy: 'reset_password_email_code', identifier: email.trim() });
      setCode('');
      setNewPassword('');
      setPhase('reset-code');
      setResendIn(RESEND_S);
    } catch (err) {
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  async function resetPassword(e: FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setError(null);
    if (code.length !== 6) return fail('Enter all 6 digits from the email.');
    if (newPassword.length < 8) return fail('Use at least 8 characters for your new password.');
    setBusy('submit');
    try {
      const first = await signIn!.attemptFirstFactor({ strategy: 'reset_password_email_code', code });
      const res = first.status === 'needs_new_password' ? await signIn!.resetPassword({ password: newPassword }) : first;
      if (res.status === 'complete') {
        await setSignInActive!({ session: res.createdSessionId });
        await finish('/app');
        return;
      }
      fail('Your password changed, but signing in needs another step. Sign in again.');
      setPhase('form');
    } catch (err) {
      fail(clerkError(err));
    } finally {
      setBusy(null);
    }
  }

  // ── Google ───────────────────────────────────────────────────────────
  async function google() {
    if (!ready || busy) return;
    setError(null);
    setBusy('google');
    try {
      const params = { strategy: 'oauth_google' as const, redirectUrl: '/sso-callback', redirectUrlComplete: '/app' };
      if (mode === 'sign-up') await signUp!.authenticateWithRedirect(params);
      else await signIn!.authenticateWithRedirect(params);
    } catch (err) {
      fail(clerkError(err));
      setBusy(null);
    }
  }

  const go = (href: '/login' | '/signup') => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    router.replace(href);
  };

  // ── view ─────────────────────────────────────────────────────────────
  const isUp = mode === 'sign-up';
  let head: { eyebrow: string; title: string; lede: ReactNode };
  const second = codeFor === 'second-factor';
  if (view === 'code' && second && factor === 'phone_code') {
    head = { eyebrow: 'One more step', title: 'Check your phone', lede: 'We texted a 6-digit code to the number on your account.' };
  } else if (view === 'code' && second && factor === 'totp') {
    head = { eyebrow: 'One more step', title: 'Enter your authenticator code', lede: 'Open your authenticator app and enter the 6-digit code for Find Time.' };
  } else if (view === 'code' && second && factor === 'backup_code') {
    head = { eyebrow: 'One more step', title: 'Use a backup code', lede: 'Enter one of the backup codes you saved when you turned on two-step sign-in.' };
  } else if (view === 'code') {
    head = {
      eyebrow: isUp ? 'Step 2 of 3' : 'One more step',
      title: 'Check your email',
      lede: (
        <>
          We sent a 6-digit code to <b>{email.trim()}</b>. It works for 10 minutes.
        </>
      ),
    };
  } else if (view === 'more') {
    head = { eyebrow: 'Step 2 of 3', title: 'A few more details', lede: 'Your account needs these before it can be created.' };
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
      eyebrow: 'Step 1 of 3',
      title: 'Plan the week you meant to have.',
      lede: 'Create your account. Then we’ll set up your working hours and focus time together, in about a minute.',
    };
  } else {
    head = { eyebrow: 'Sign in', title: 'Welcome back.', lede: 'Pick up your week where you left it.' };
  }

  const pathStep = view === 'code' || view === 'more' ? 1 : 0;

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

        <div className="au-body" key={`${mode}-${view}-${factor}`}>
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
              <button type="button" className="au-btn au-ghost au-wide" onClick={google} disabled={!ready || !!busy} aria-busy={busy === 'google'}>
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
                <div className="au-input" data-invalid={touched && (isUp ? !pwLong : !password)}>
                  <input
                    id="au-pw"
                    type={showPw ? 'text' : 'password'}
                    autoComplete={isUp ? 'new-password' : 'current-password'}
                    placeholder={isUp ? 'At least 8 characters' : 'Your password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    aria-describedby={isUp ? 'au-pw-hint' : undefined}
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
              <ErrorLine error={error} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!ready || !!busy} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                {isUp ? 'Create account' : 'Sign in'}
                {busy !== 'submit' ? (
                  <span className="arr" aria-hidden="true">
                    →
                  </span>
                ) : null}
              </button>
              {/* Clerk's bot protection mounts here when it is on for the instance */}
              <div id="clerk-captcha" />
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
              {second && factor === 'backup_code' ? (
                <div className="au-field">
                  <label htmlFor="au-backup">Backup code</label>
                  <div className="au-input" data-invalid={!!error}>
                    <input
                      id="au-backup"
                      className="mono"
                      autoComplete="one-time-code"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoFocus
                    />
                  </div>
                </div>
              ) : (
                <Otp
                  value={code}
                  onChange={setCode}
                  onComplete={(v) => void verify(v)}
                  invalid={!!error}
                  shake={shake}
                  disabled={busy === 'submit'}
                />
              )}
              <ErrorLine error={error} />
              <button
                type="submit"
                className="au-btn au-ink au-wide"
                disabled={busy === 'submit' || (second && factor === 'backup_code' ? !code.trim() : code.length !== 6)}
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
                  {second ? 'Back to sign in' : 'Use a different email'}
                </button>
                {!second || factor === 'email_code' || factor === 'phone_code' ? (
                  <ResendButton resendIn={resendIn} busy={busy === 'resend'} onClick={resend} />
                ) : null}
              </div>
              {second && factors.length > 1 ? (
                <p className="au-alt">
                  Other ways:{' '}
                  {factors
                    .filter((f) => f !== factor)
                    .map((f, i) => (
                      <span key={f}>
                        {i ? ' · ' : ''}
                        <button type="button" className="au-link-btn" onClick={() => void switchFactor(f)} disabled={!!busy}>
                          {FACTOR_LABEL[f]}
                        </button>
                      </span>
                    ))}
                </p>
              ) : null}
            </form>
          ) : null}

          {view === 'more' ? (
            <form className="au-form au-in" style={{ '--i': 3 } as React.CSSProperties} onSubmit={submitMore} noValidate>
              {need.includes('first_name') || need.includes('last_name') ? (
                <div className="au-two">
                  {need.includes('first_name') ? (
                    <div className="au-field">
                      <label htmlFor="au-fn">First name</label>
                      <div className="au-input">
                        <input
                          id="au-fn"
                          autoComplete="given-name"
                          value={more.firstName}
                          onChange={(e) => setMore((m) => ({ ...m, firstName: e.target.value }))}
                          autoFocus
                        />
                      </div>
                    </div>
                  ) : null}
                  {need.includes('last_name') ? (
                    <div className="au-field">
                      <label htmlFor="au-ln">Last name</label>
                      <div className="au-input">
                        <input
                          id="au-ln"
                          autoComplete="family-name"
                          value={more.lastName}
                          onChange={(e) => setMore((m) => ({ ...m, lastName: e.target.value }))}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {need.includes('username') ? (
                <div className="au-field">
                  <label htmlFor="au-un">Username</label>
                  <div className="au-input">
                    <input
                      id="au-un"
                      autoComplete="username"
                      autoCapitalize="off"
                      spellCheck={false}
                      value={more.username}
                      onChange={(e) => setMore((m) => ({ ...m, username: e.target.value }))}
                    />
                  </div>
                </div>
              ) : null}
              {need.includes('legal_accepted') ? (
                <label className="au-check">
                  <input type="checkbox" checked={more.legal} onChange={(e) => setMore((m) => ({ ...m, legal: e.target.checked }))} />
                  <span>
                    I agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
                  </span>
                </label>
              ) : null}
              {unsupported.length ? (
                <p className="au-hint">This sign-up also needs: {unsupported.join(', ').replace(/_/g, ' ')}, which can’t be added here yet.</p>
              ) : null}
              <ErrorLine error={error} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!!busy} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                Create account
              </button>
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
              <ErrorLine error={error} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!ready || !!busy} aria-busy={busy === 'submit'}>
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
              <ErrorLine error={error} />
              <button type="submit" className="au-btn au-ink au-wide" disabled={!!busy} aria-busy={busy === 'submit'}>
                {busy === 'submit' ? <i className="au-spin" aria-hidden="true" /> : null}
                Set password and sign in
              </button>
              <div className="au-row">
                <button type="button" className="au-link-btn" onClick={() => setPhase('form')}>
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
        <p>Your plans, focus blocks and everything it has learned are where you left them.</p>
      </div>
    </aside>
  );
}

function SignUpStage({ step }: { step: number }) {
  const a = useMemo(() => defaultAnswers(), []);
  const blocks = useMemo(() => previewWeek(a), [a]);
  const work = [true, true, true, true, true, false, false];
  const focusH = blocks.filter((b) => b.kind === 'focus').reduce((n, b) => n + (b.e - b.s) / 60, 0);
  return (
    <aside className="au-stage" aria-label="What Find Time does">
      <div className="au-stage-cap au-in" style={{ '--i': 2 } as React.CSSProperties}>
        <h2>Deep work, placed around your meetings.</h2>
      </div>
      <div className="au-in" style={{ '--i': 3 } as React.CSSProperties}>
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
            { label: 'Meetings', value: `${blocks.filter((b) => b.kind === 'meeting').length}` },
            { label: 'You approve', value: 'Every block' },
          ]}
        />
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

const FACTOR_LABEL: Record<Factor, string> = {
  email_code: 'Email a code',
  phone_code: 'Text a code',
  totp: 'Authenticator app',
  backup_code: 'Backup code',
};

function ErrorLine({ error }: { error: string | null }) {
  return (
    <div aria-live="polite" role="status">
      {error ? <p className="au-err">{error}</p> : null}
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
