import { useAuth } from '@clerk/clerk-expo';
import { SignIn, SignUp } from '@clerk/clerk-expo/web';
import { Redirect } from 'expo-router';
import Head from 'expo-router/head';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { C, T, w } from '@/design/tokens';
import { Press, Txt } from '@/design/ui';

/**
 * `/login` on web — Clerk's prebuilt sign in / sign up (handles email + password,
 * email verification, "Continue with Google", and errors). `routing="virtual"`
 * keeps it on this one route; our own toggle switches between the two.
 * Signed-in users skip straight to `/app`.
 */
export default function LoginWeb() {
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');

  if (isLoaded && isSignedIn) return <Redirect href="/app" />;

  return (
    <View style={styles.root}>
      <Head>
        <title>Sign in — Find Time</title>
        <meta name="robots" content="noindex" />
      </Head>
      <Txt style={styles.brand}>Find Time</Txt>
      {mode === 'sign-in' ? (
        <SignIn routing="virtual" forceRedirectUrl="/app" />
      ) : (
        <SignUp routing="virtual" forceRedirectUrl="/app" />
      )}
      <Press
        onPress={() => setMode(mode === 'sign-in' ? 'sign-up' : 'sign-in')}
        hoverBg={w(0.05)}
        style={styles.switch}>
        <Txt style={styles.switchTxt}>
          {mode === 'sign-in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </Txt>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.canvas, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  brand: { color: C.lime, fontSize: 12, letterSpacing: 2, textTransform: 'uppercase' },
  switch: { alignItems: 'center', paddingVertical: 8 },
  switchTxt: { color: w(0.5), fontSize: T.xs.fontSize },
});
