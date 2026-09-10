import { StyleSheet, View } from 'react-native';

import { C, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { RULES } from '../copy';
import { RAMP } from '../ramp';
import { DemoVideo } from './DemoVideo';
import { SectionHead } from './SectionHead';

/**
 * "The model decides. Code does." — the four rules the agent runs under, beside
 * the existing planner walkthrough video as proof the rule already ships: in the
 * live beta the model only parses the request and `findFreeSlots` places blocks.
 */
export function Rules() {
  const { width } = useResponsive();
  const wide = width >= 1024;

  return (
    <View>
      <SectionHead eyebrow={RULES.eyebrow} title={RULES.title} body={RULES.body} />
      <View style={[styles.split, wide ? styles.splitWide : null]}>
        <View style={[styles.media, wide ? { flex: 1 } : null]}>
          <DemoVideo />
          <Txt style={styles.caption}>{RULES.videoCaption}</Txt>
        </View>
        <View style={[styles.list, wide ? { flex: 1 } : null]}>
          {RULES.items.map((r, i) => (
            <View key={r.code} style={[styles.item, i === 0 ? styles.itemFirst : null]}>
              <Txt style={styles.code}>{r.code}</Txt>
              <Txt style={styles.title}>{r.title}</Txt>
              <Txt style={styles.body}>{r.body}</Txt>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { gap: 48 },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  media: { gap: 12 },
  caption: { color: RAMP.onBlue, fontSize: 10, letterSpacing: 1.5 },
  list: { gap: 20 },
  item: { gap: 8, paddingTop: 20, borderTopWidth: 1, borderTopColor: w(0.15) },
  itemFirst: { paddingTop: 0, borderTopWidth: 0 },
  code: { color: C.lime, fontSize: 10, letterSpacing: 1.5 },
  title: { color: '#fff', fontSize: 15, fontWeight: '500' },
  body: { maxWidth: 520, color: RAMP.onBlue, fontSize: 13, lineHeight: 21 },
});
