import { StyleSheet, View } from 'react-native';
import { Link } from 'expo-router';

import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { WAITLIST } from '../copy';
import { RAMP } from '../ramp';
import { WaitlistForm } from './WaitlistForm';

/**
 * The waitlist. Not in landing.html — added on the same dark-panel language as the
 * planner mock (`#121212/90`, lime accent) so it reads as part of the page rather
 * than a bolt-on. Anchored `#waitlist`; the header CTA and hero primary point here.
 */
export function WaitlistSection() {
  const { width } = useResponsive();
  const wide = width >= 768;

  return (
    <View style={[styles.panel, wide ? styles.panelWide : null]}>
      <View style={styles.eyebrow}>
        <View style={styles.dot} />
        <Txt style={styles.eyebrowTxt}>{WAITLIST.eyebrow}</Txt>
      </View>
      <Txt style={styles.title}>{WAITLIST.title}</Txt>
      <Txt style={styles.body}>{WAITLIST.body}</Txt>
      <View style={{ marginTop: 20, alignItems: 'flex-start' }}>
        <WaitlistForm source="waitlist_section" />
      </View>
      <Txt style={styles.consent}>
        {WAITLIST.consent}{' '}
        <Link href="/privacy" style={styles.consentLink}>
          {WAITLIST.consentPrivacy}
        </Link>{' '}
        {WAITLIST.consentAnd}{' '}
        <Link href="/terms" style={styles.consentLink}>
          {WAITLIST.consentTerms}
        </Link>
        .
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 64,
    width: '100%',
    maxWidth: 1152,
    alignSelf: 'center',
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: rgba('#121212', 0.9),
    padding: 24,
  },
  panelWide: { padding: 40 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.8,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  eyebrowTxt: { color: C.lime, letterSpacing: 2, fontSize: 12 },
  title: { color: '#fff', fontSize: 24, lineHeight: 28, fontWeight: '500', letterSpacing: -0.5 },
  body: { marginTop: 12, maxWidth: 520, color: RAMP.onPanel, fontSize: 13, lineHeight: 21 },
  consent: { marginTop: 14, color: w(0.5), fontSize: 11, lineHeight: 16 },
  consentLink: { color: w(0.7), fontSize: 11, fontFamily: 'monospace' },
});
