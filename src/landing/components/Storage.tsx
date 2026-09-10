import { StyleSheet, View } from 'react-native';

import { C, ink, R, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { STORAGE } from '../copy';
import { RAMP } from '../ramp';
import { SectionHead } from './SectionHead';

/**
 * "What we keep": a user's whole account drawn as the one database row it will
 * be, on the light-card language (MockPhoneCard's `#f4f4f4`), beside the three
 * storage principles. Labelled as the Phase 2 design spec — it describes the
 * target, not today's schema.
 */
export function Storage() {
  const { width } = useResponsive();
  const wide = width >= 1024;
  const sm = width >= 640;
  const last = STORAGE.rows.length - 1;

  return (
    <View>
      <SectionHead eyebrow={STORAGE.eyebrow} title={STORAGE.title} body={STORAGE.body} />
      <View style={[styles.split, wide ? styles.splitWide : null]}>
        <View style={[styles.table, wide ? { flex: 1.3 } : null]}>
          <View style={styles.tableHead}>
            <Txt style={styles.tableHeadTxt}>{STORAGE.tableLeft}</Txt>
            <Txt style={styles.tableHeadTxt}>{STORAGE.tableRight}</Txt>
          </View>
          {STORAGE.rows.map((r, i) => (
            <View
              key={r.field}
              style={[styles.tr, { flexDirection: sm ? 'row' : 'column' }, i === last ? { borderBottomWidth: 0 } : null]}>
              <Txt style={[styles.field, sm ? { width: '36%' } : null]}>{r.field}</Txt>
              <View style={styles.cell}>
                <Txt style={[styles.value, r.empty ? styles.valueEmpty : null]}>{r.value}</Txt>
                <Txt style={styles.note}>{r.note}</Txt>
              </View>
            </View>
          ))}
        </View>

        <View style={[styles.principles, wide ? { flex: 1 } : null]}>
          {STORAGE.principles.map((p) => (
            <View key={p.title} style={styles.principle}>
              <Txt style={styles.pTitle}>{p.title}</Txt>
              <Txt style={styles.pBody}>{p.body}</Txt>
            </View>
          ))}
          <View style={styles.tag}>
            <Txt style={styles.tagTxt}>{STORAGE.roadmapNote}</Txt>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { gap: 40 },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  table: { backgroundColor: C.light, borderRadius: R.xl2, overflow: 'hidden' },
  tableHead: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: ink(0.12),
  },
  tableHeadTxt: { color: RAMP.onLight, fontSize: 10, letterSpacing: 1.5 },
  tr: { gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: ink(0.1) },
  field: { color: C.surface, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  cell: { flex: 1, gap: 4 },
  value: { color: C.surface, fontSize: 12, lineHeight: 18 },
  valueEmpty: { color: RAMP.onLight },
  note: { color: RAMP.onLight, fontSize: 12, lineHeight: 18 },
  principles: { gap: 28 },
  principle: { gap: 8, paddingLeft: 16, borderLeftWidth: 2, borderLeftColor: w(0.3) },
  pTitle: { color: '#fff', fontSize: 14, fontWeight: '500', letterSpacing: 0.5 },
  pBody: { color: RAMP.onBlue, fontSize: 13, lineHeight: 21 },
  tag: { alignSelf: 'flex-start', borderRadius: R.md, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: w(0.1) },
  tagTxt: { color: '#fff', fontSize: 10, letterSpacing: 1.5 },
});
