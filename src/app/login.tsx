import { useAuth, useSignIn, useSignUp, useSSO } from '@clerk/clerk-expo';
import { makeRedirectUri } from 'expo-auth-session';
import { Redirect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { C, R, T, w } from '@/design/tokens';
import { MONO, Press, Txt } from '@/design/ui';

/**
 * `/login` on native — a custom Clerk flow (web gets the prebuilt UI in
 * `login.web.tsx`). Email + password sign in / sign up with an email-code
 * verification step, plus "Continue with Google" via SSO.
 */

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

  const [mode, setMode] = useState<Mode>('login');
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
        setPendingCode(true);
      } else {
        const res = await signIn.create({ identifier: email.trim(), password });
        if (res.status === 'complete') {
          await setSignInActive({ session: res.createdSessionId });
          router.replace('/app');
        } else {
          setError('Extra verification is needed — finish signing in on the web app.');
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
      const res = await signUp.attemptEmailAddressVerification({ code: code.trim() });
      if (res.status === 'complete') {
        await setSignUpActive({ session: res.createdSessionId });
        router.replace('/app');
      } else {
        setError('That code did not verify. Try again.');
      }
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
      const { createdSessionId, setActive } = await startSSOFlow({
        strategy: 'oauth_google',
        redirectUrl: makeRedirectUri(),
      });
      if (createdSessionId && setActive) {
        await setActive({ session: createdSessionId });
        router.replace('/app');
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
  switch: { marginTop: 16, alignItems: 'center', paddingVertical: 8, borderRadius: R.md },
  switchTxt: { color: w(0.5), fontSize: T.xs.fontSize },
});
