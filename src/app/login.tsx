import { useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, TextInput, View } from 'react-native';

import { refreshAccounts } from '@/calendar/account-store';
import { C, R, T, w } from '@/design/tokens';
import { MONO, Press, Txt } from '@/design/ui';

/**
 * `/login` — email/password sign in + sign up for the beta, plus "Continue with
 * Google" (which is also the calendar-connect grant). Web is the beta surface;
 * on native this screen still works, but Google there just points at the web.
 *
 * On success we refresh the account store (so the `/app` gate sees the new
 * session) and replace to `/app`.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Mode = 'login' | 'signup';

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setError(null);
    if (!EMAIL_RE.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Password must be at least 8 characters.');

    setBusy(true);
    try {
      const res = await fetch(`${BASE}/api/auth/${mode === 'signup' ? 'signup' : 'login'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password, name: name.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong. Try again.');
        return;
      }
      await refreshAccounts();
      router.replace('/app');
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  function google() {
    const url = `${BASE}/api/auth/google/start`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.location.assign(url);
    } else {
      setError('Continue with Google is available on the web for now.');
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Txt style={styles.brand}>Find Time</Txt>
        <Txt style={styles.title}>{mode === 'signup' ? 'Create your account' : 'Sign in'}</Txt>

        {mode === 'signup' && (
          <Field label="Name (optional)">
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ada Lovelace"
              placeholderTextColor={w(0.25)}
              autoCapitalize="words"
              style={styles.input}
            />
          </Field>
        )}

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

        <Press onPress={google} hoverBg={w(0.1)} style={styles.google}>
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
              : "New here? Create an account"}
          </Txt>
        </Press>
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
