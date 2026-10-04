import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TextInput, View } from 'react-native';

import { C, R, T, w } from '@/design/tokens';
import { MONO, Press, Txt } from '@/design/ui';
import { authClient } from '@/lib/auth-client';
import { useAuthState } from '@/lib/session';

/**
 * `/login` on native — a custom Better Auth flow (web has its own page,
 * src/auth/dom/AuthPage.tsx). Email + password sign in / sign up with an
 * email-code step (sign-up verification, or signing in to an email that was
 * never verified), resend, "Continue with Google" in the system browser (the
 * Expo plugin brings the session back on `findtime://`). `?mode=signup` opens
 * on sign-up (`/signup` redirects here). Password reset hands over to the web
 * page.
 */
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Mode = 'login' | 'signup';

/** Better Auth's `{ error }` → a sentence. */
function authError(err: { code?: string; message?: string } | null | undefined): string {
  switch (err?.code) {
    case 'INVALID_EMAIL_OR_PASSWORD':
      return 'That email or password is not right.';
    case 'USER_ALREADY_EXISTS':
    case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
      return 'An account already uses that email. Sign in instead.';
    case 'INVALID_OTP':
      return 'That code is not right. Check the latest email.';
    case 'OTP_EXPIRED':
      return 'That code has expired. Send a new one.';
    case 'TOO_MANY_ATTEMPTS':
      return 'Too many tries. Send a new code.';
    default:
      return err?.message || 'Something went wrong. Try again.';
  }
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuthState();

  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'login');
  const [resent, setResent] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingCode, setPendingCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoaded && isSignedIn) router.replace('/app');
  }, [authLoaded, isSignedIn, router]);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      if (mode === 'signup') {
        // The server emails the verification code on sign-up.
        const { error: err } = await authClient.signUp.email({ email: email.trim(), password, name: '' });
        if (err) return setError(authError(err));
        setCode('');
        setPendingCode(true);
      } else {
        const { error: err } = await authClient.signIn.email({ email: email.trim(), password });
        if (err?.code === 'EMAIL_NOT_VERIFIED') {
          // Never verified: the server has just emailed a fresh code.
          setCode('');
          setPendingCode(true);
        } else if (err) setError(authError(err));
        else router.replace('/app');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Verifying signs you in; /app sends first-timers on to /welcome.
      const { error: err } = await authClient.emailOtp.verifyEmail({ email: email.trim(), otp: code.trim() });
      if (err) setError(authError(err));
      else router.replace('/app');
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.emailOtp.sendVerificationOtp({ email: email.trim(), type: 'email-verification' });
      if (err) setError(authError(err));
      else setResent(true);
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Google opens in the system browser; the session lands in SecureStore and
      // useAuthState flips to signed in, which the effect above follows to /app.
      const { error: err } = await authClient.signIn.social({ provider: 'google', callbackURL: '/app' });
      if (err) setError(authError(err));
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (authLoaded && isSignedIn) return <Redirect href="/app" />;

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Txt style={styles.brand}>Find Time</Txt>

        {pendingCode ? (
          <>
            <Txt style={styles.title}>Check your email</Txt>
            <Field label="Verification code">
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="6-digit code"
                placeholderTextColor={w(0.25)}
                keyboardType="number-pad"
                style={styles.input}
                onSubmitEditing={verify}
              />
            </Field>
            {error && <Txt style={styles.error}>{error}</Txt>}
            <Press onPress={verify} disabled={busy} hoverBg={C.limeHover} style={styles.primary}>
              {busy ? <ActivityIndicator color={C.surface} /> : <Txt style={styles.primaryTxt}>Verify</Txt>}
            </Press>
            <Press onPress={resend} disabled={busy} hoverBg={w(0.05)} style={styles.switch} accessibilityRole="button">
              <Txt style={styles.switchTxt}>{resent ? 'Sent again — check your inbox' : 'Resend code'}</Txt>
            </Press>
            <Press
              onPress={() => {
                setPendingCode(false);
                setError(null);
              }}
              hoverBg={w(0.05)}
              style={styles.switch}
              accessibilityRole="button">
              <Txt style={styles.switchTxt}>Back</Txt>
            </Press>
          </>
        ) : (
          <>
            <Txt style={styles.title}>{mode === 'signup' ? 'Create your account' : 'Sign in'}</Txt>

            <Field label="Email">
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={w(0.25)}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                inputMode="email"
                style={styles.input}
              />
            </Field>

            <Field label="Password">
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="At least 8 characters"
                placeholderTextColor={w(0.25)}
                secureTextEntry
                style={styles.input}
                onSubmitEditing={submit}
              />
            </Field>

            {error && (
              <Txt style={styles.error} accessibilityLiveRegion="polite" aria-live="polite">
                {error}
              </Txt>
            )}

            {mode === 'login' ? (
              <Press
                onPress={() => void Linking.openURL(`${SITE}/login`)}
                hoverBg={w(0.05)}
                style={styles.forgot}
                accessibilityRole="link"
                accessibilityHint="Opens the web app, where you can reset it">
                <Txt style={styles.switchTxt}>Forgot password? Reset it on the web</Txt>
              </Press>
            ) : null}

            <Press onPress={submit} disabled={busy} hoverBg={C.limeHover} style={styles.primary}>
              {busy ? (
                <ActivityIndicator color={C.surface} />
              ) : (
                <Txt style={styles.primaryTxt}>{mode === 'signup' ? 'Create account' : 'Sign in'}</Txt>
              )}
            </Press>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Txt style={styles.dividerTxt}>or</Txt>
              <View style={styles.line} />
            </View>

            <Press onPress={google} disabled={busy} hoverBg={w(0.1)} style={styles.google}>
              <Txt style={styles.googleTxt}>Continue with Google</Txt>
            </Press>

            <Press
              onPress={() => {
                setMode(mode === 'signup' ? 'login' : 'signup');
                setError(null);
              }}
              hoverBg={w(0.05)}
              style={styles.switch}>
              <Txt style={styles.switchTxt}>
                {mode === 'signup'
                  ? 'Already have an account? Sign in'
                  : 'New here? Create an account'}
              </Txt>
            </Press>
          </>
        )}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Txt style={styles.label}>{label}</Txt>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: C.surface,
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.1),
    padding: 24,
  },
  brand: { color: C.lime, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  title: { color: '#fff', fontSize: T.xl2.fontSize, fontWeight: '500', letterSpacing: -0.4, marginTop: 8, marginBottom: 20 },
  field: { marginBottom: 14 },
  label: { color: w(0.5), fontSize: T.xs.fontSize, marginBottom: 6 },
  input: {
    height: 44,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: C.input,
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: T.sm.fontSize,
    fontFamily: MONO,
  },
  error: { color: C.orange, fontSize: T.xs.fontSize, marginBottom: 12, lineHeight: 16 },
  primary: {
    height: 44,
    borderRadius: R.lg,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryTxt: { color: C.surface, fontSize: T.sm.fontSize, fontWeight: '600' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  line: { flex: 1, height: 1, backgroundColor: w(0.1) },
  dividerTxt: { color: w(0.35), fontSize: T.xs.fontSize },
  google: {
    height: 44,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleTxt: { color: '#fff', fontSize: T.sm.fontSize, fontWeight: '500' },
  forgot: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 8 },
  switch: { marginTop: 16, alignItems: 'center', paddingVertical: 8, borderRadius: R.md },
  switchTxt: { color: w(0.5), fontSize: T.xs.fontSize },
});
