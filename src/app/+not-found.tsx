import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/design/ui';

/**
 * 404, in the landing's light Nexus look (#FAFAFA ground, ink text, black
 * pill button) so a mistyped URL still looks like the product.
 */
export default function NotFound() {
  return (
    <View style={styles.root}>
      <Txt style={styles.code}>404</Txt>
      <Txt style={styles.title}>This page isn’t on the calendar.</Txt>
      <Txt style={styles.body}>The link may be out of date, or the page may have moved.</Txt>
      <View style={styles.actions}>
        <Link href="/" style={styles.primary}>
          <Txt style={styles.primaryTxt}>Back to home</Txt>
        </Link>
        <Link href="/app" style={styles.secondary}>
          <Txt style={styles.secondaryTxt}>Open the planner</Txt>
        </Link>
      </View>
    </View>
  );
}

// loaded for every page in +html.tsx; Txt's default face is the mono one
const SANS = "'Google Sans Flex', 'Google Sans', system-ui, sans-serif";

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, backgroundColor: '#FAFAFA' },
  code: { color: '#737373', fontSize: 12, letterSpacing: 2.4 },
  title: { fontFamily: SANS, color: '#171717', fontSize: 32, lineHeight: 36, fontWeight: '500', letterSpacing: -1.2, textAlign: 'center' },
  body: { fontFamily: SANS, color: '#525252', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, justifyContent: 'center' },
  primary: { borderRadius: 999, backgroundColor: '#171717', paddingHorizontal: 22, paddingVertical: 14 },
  primaryTxt: { fontFamily: SANS, color: '#FFFFFF', fontSize: 15, fontWeight: '500' },
  secondary: { borderRadius: 999, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E5E5E5', paddingHorizontal: 22, paddingVertical: 14 },
  secondaryTxt: { fontFamily: SANS, color: '#171717', fontSize: 15 },
});
