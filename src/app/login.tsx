import { useAuth, useSignIn, useSignUp, useSSO } from '@clerk/clerk-expo';
import { makeRedirectUri } from 'expo-auth-session';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TextInput, View } from 'react-native';

import { C, R, T, w } from '@/design/tokens';
import { MONO, Press, Txt } from '@/design/ui';

/**
 * `/login` on native — a custom Clerk flow (web has its own page,
 * src/auth/dom/AuthPage.tsx). Email + password sign in / sign up with an
 * email-code step (sign-up verification, or Clerk's email second factor on a
 * new device), resend, "Continue with Google" via SSO. `?mode=signup` opens
 * on sign-up (`/signup` redirects here). Password reset and sign-ups that
 * still need details hand over to the web page, which handles them.
 */
const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');

WebBrowser.maybeCompleteAuthSession();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Mode = 'login' | 'signup';

function clerkError(err: unknown): string {
  const e = err as { errors?: { message?: string; longMessage?: string }[] };
  return e?.errors?.[0]?.longMessage ?? e?.errors?.[0]?.message ?? 'Something went wrong. Try again.';
}

export default function LoginScreen() {
  const router = useRouter();
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { signIn, setActive: setSignInActive, isLoaded: signInLoaded } = useSignIn();
  const { signUp, setActive: setSignUpActive, isLoaded: signUpLoaded } = useSignUp();
  const { startSSOFlow } = useSSO();

  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'signup' ? 'signup' : 'login');
  /** what the pending code is for */
  const [codeFor, setCodeFor] = useState<'signup' | 'second'>('signup');
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
    if (busy || !signInLoaded || !signUpLoaded) return;
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp.create({ emailAddress: email.trim(), password });
        await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
        setCodeFor('signup');
        setPendingCode(true);
      } else {
        const res = await signIn.create({ identifier: email.trim(), password });
        if (res.status === 'complete') {
          await setSignInActive({ session: res.createdSessionId });
          router.replace('/app');
        } else if (
          ((res.status as string) === 'needs_second_factor' || (res.status as string) === 'needs_client_trust') &&
          res.supportedSecondFactors?.some((f) => f.strategy === 'email_code')
        ) {
          // New device: Clerk emails a code before letting you in.
          await signIn.prepareSecondFactor({ strategy: 'email_code' });
          setCodeFor('second');
          setCode('');
          setPendingCode(true);
        } else {
          setError('This sign-in needs a step only the web app supports (authenticator or backup code). Sign in there once, then here.');
        }
      }
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (busy || !signUpLoaded) return;
    setBusy(true);
    setError(null);
    try {
      if (codeFor === 'second') {
        const res = await signIn!.attemptSecondFactor({ strategy: 'email_code', code: code.trim() });
        if (res.status === 'complete') {
          await setSignInActive!({ session: res.createdSessionId });
          router.replace('/app');
        } else setError('That code did not verify. Try again.');
        return;
      }
      const res = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setSignUpActive({ session: res.createdSessionId });
        router.replace('/app');
      } else if (res.status === 'missing_requirements') {
        setError('Your email is verified. A few more details are needed — finish creating the account on the web.');
      } else {
        setError('That code did not verify. Try again.');
      }
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (codeFor === 'second') await signIn!.prepareSecondFactor({ strategy: 'email_code' });
      else await signUp!.prepareEmailAddressVerification({ strategy: 'email_code' });
      setResent(true);
    } catch (err) {
      setError(clerkError(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { createdSessionId, setActive, signUp: ssoSignUp } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/app');
      } else if (ssoSignUp?.status === 'missing_requirements') {
        // Never fail silently: say what is missing and where to finish.
        setError('Your Google sign-up needs a few more details. Finish it on the web, then sign in here.');
      }
    } catch (err) {
      setError(clerkError(err));
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
