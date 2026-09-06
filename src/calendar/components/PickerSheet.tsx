import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { addMonths, iso, MO, sameDay } from '../cal-date';
import { Icon } from '../Icon';
import { monthCells } from '../layout';
import { TODAY } from '../seed';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

const WK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Mobile "jump to a date" sheet (spec §2.13 / calendar.html `#pickerSheet`). */
export function PickerSheet({
  cursor,
  selected,
  events,
  onPick,
  onToday,
  onClose,
}: {
  cursor: Date;
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
  onToday: () => void;
  onClose: () => void;
}) {
  const { theme } = useCalTheme();
  // parent remounts on open, so a lazy initialiser tracks `cursor` fine
  const [pc, setPc] = useState(() => new Date(cursor));
  const has = (d: Date) => events.some((e) => e.date === iso(d));

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={[styles.backdrop, { backgroundColor: C.scrim }]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
          <View style={styles.grab} />
          <View style={styles.head}>
            <Press onPress={() => setPc(addMonths(pc, -1))} hoverBg={w(0.1)} style={styles.navBtn} aria-label="Previous month">
              <Icon name="arrow-left" size={18} color={w(0.6)} />
            </Press>
            <Txt style={styles.title}>
              {MO[pc.getMonth()]} {pc.getFullYear()}
            </Txt>
            <Press onPress={() => setPc(addMonths(pc, 1))} hoverBg={w(0.1)} style={styles.navBtn} aria-label="Next month">
              <Icon name="arrow-right" size={18} color={w(0.6)} />
            </Press>
          </View>

          <View style={styles.wkRow}>
            {WK.map((d) => (
              <Txt key={d} style={styles.wk}>
                {d}
              </Txt>
            ))}
          </View>
          <View style={styles.grid}>
            {monthCells(pc).map((d) => {
              const other = d.getMonth() !== pc.getMonth();
              const isToday = sameDay(d, TODAY);
              const sel = sameDay(d, selected);
              return (
                <Press
                  key={iso(d)}
                  onPress={() => onPick(iso(d))}
                  style={[
                    styles.cell,
                    isToday ? styles.cellToday : sel ? styles.cellSel : other ? styles.cellOther : styles.cellIn,
                  ]}>
                  <Txt style={[styles.cellTxt, isToday ? styles.cellTxtToday : other ? styles.cellTxtOther : styles.cellTxtIn]}>
                    {d.getDate()}
                  </Txt>
                  {has(d) && !isToday && <View style={styles.dot} />}
                </Press>
              );
            })}
          </View>

          <View style={styles.footer}>
            <Press onPress={onToday} hoverBg={C.limeHover} style={styles.jump}>
              <Txt style={styles.jumpTxt}>Jump to today</Txt>
            </Press>
            <Press onPress={onClose} hoverBg={w(0.1)} style={styles.closeBtn}>
              <Txt style={styles.closeTxt}>Close</Txt>
            </Press>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: { width: '100%', borderTopLeftRadius: R.xl2, borderTopRightRadius: R.xl2, borderWidth: 1, padding: 20 },
  grab: { alignSelf: 'center', marginBottom: 16, height: 4, width: 40, borderRadius: R.full, backgroundColor: w(0.2) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navBtn: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  title: { color: '#fff', fontSize: 14, fontWeight: '500', letterSpacing: -0.3 },
  wkRow: { marginTop: 20, flexDirection: 'row' },
  wk: { flex: 1, textAlign: 'center', color: w(0.3), fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1.2 },
  grid: { marginTop: 8, flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  cellToday: { borderColor: C.lime, backgroundColor: C.lime },
  cellSel: { borderColor: 'rgba(204,255,0,0.6)' },
  cellIn: { borderColor: w(0.1) },
  cellOther: { borderColor: w(0.05) },
  cellTxt: { fontSize: 12 },
  cellTxtToday: { color: C.surface, fontWeight: '500' },
  cellTxtIn: { color: w(0.7) },
  cellTxtOther: { color: w(0.2) },
  dot: { position: 'absolute', bottom: 6, height: 4, width: 4, borderRadius: 2, backgroundColor: C.lime },
  footer: { marginTop: 20, flexDirection: 'row', gap: 8 },
  jump: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, backgroundColor: C.lime },
  jumpTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  closeBtn: { height: 44, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  closeTxt: { color: w(0.6), fontSize: 12 },
});
