import { StyleSheet, View } from 'react-native';

import { C } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { RAMP } from '../ramp';

/**
 * Lime dot + eyebrow, section title, optional lede — the one heading recipe every
 * agent-landing section shares, so they read as one page. Same eyebrow as the hero
 * and WaitlistSection. `onPanel` switches the lede to the dark-panel ramp.
 */
export function SectionHead({
  eyebrow,
  title,
  body,
  onPanel,
}: {
  eyebrow: string;
  title: string;
  body?: string;
  onPanel?: boolean;
}) {
  const { width } = useResponsive();
  const size = width >= 1024 ? 40 : width >= 640 ? 32 : 26;

  return (
    <View style={styles.wrap}>
      <View style={styles.eyebrow}>
        <View style={styles.dot} />
        <Txt style={styles.eyebrowTxt}>{eyebrow}</Txt>
      </View>
      <Txt accessibilityRole="header" style={[styles.title, { fontSize: size, lineHeight: Math.round(size * 1.12) }]}>
        {title}
      </Txt>
      {body ? <Txt style={[styles.body, { color: onPanel ? RAMP.onPanel : RAMP.onBlue }]}>{body}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { maxWidth: 820, marginBottom: 40 },
  eyebrow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  dot: { height: 8, width: 8, borderRadius: 4, backgroundColor: C.lime },
  eyebrowTxt: { color: C.lime, letterSpacing: 2, fontSize: 12 },
  title: { color: '#fff', fontWeight: '500', letterSpacing: -0.5 },
  body: { marginTop: 16, maxWidth: 620, fontSize: 14, lineHeight: 22 },
});
