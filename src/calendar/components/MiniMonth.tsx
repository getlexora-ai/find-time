import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addMonths, iso, MO, sameDay } from '../cal-date';
import { Icon } from '../Icon';
import { monthCells } from '../layout';
import { TODAY } from '../seed';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

const WK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Sidebar mini-month (spec §2.9). Navigates the calendar without changing the
 *  current view grain. */
export function MiniMonth({
  selected,
  events,
  onPick,
}: {
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
}) {
  const { theme } = useCalTheme();
  const [cursor, setCursor] = useState(new Date(TODAY));
  const cells = monthCells(cursor);
  const hasEvents = (d: Date) => events.some((e) => e.date === iso(d));

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder, backgroundColor: theme.panel }]}>
      <View style={styles.head}>
        <Txt style={styles.title}>
          {MO[cursor.getMonth()].slice(0, 3)} {cursor.getFullYear()}
        </Txt>
        <View style={styles.navRow}>
          <Press
            onPress={() => setCursor(addMonths(cursor, -1))}
            hoverBg={w(0.1)}
            style={styles.navBtn}
            aria-label="Previous month">
            <Icon name="arrow-left" size={14} color={w(0.45)} />
          </Press>
          <Press
            onPress={() => setCursor(addMonths(cursor, 1))}
            hoverBg={w(0.1)}
            style={styles.navBtn}
            aria-label="Next month">
            <Icon name="arrow-right" size={14} color={w(0.45)} />
          </Press>
        </View>
      </View>

      <View style={styles.week}>
        {WK.map((d, i) => (
          <Txt key={i} style={styles.wkDay}>
            {d}
          </Txt>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d) => {
          const other = d.getMonth() !== cursor.getMonth();
          const isToday = sameDay(d, TODAY);
          const sel = sameDay(d, selected);
          const dot = hasEvents(d) && !isToday;
          return (
            <Press
              key={iso(d)}
              onPress={() => onPick(iso(d))}
              hoverBg={w(0.1)}
              style={[styles.cell, isToday && styles.cellToday, sel && !isToday && styles.cellSel]}>
              <Txt
                style={[
                  styles.cellTxt,
                  isToday ? styles.cellTxtToday : other ? styles.cellTxtOther : styles.cellTxtIn,
                ]}>
                {d.getDate()}
              </Txt>
              {dot && <View style={styles.dot} />}
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 28, borderRadius: R.xl, borderWidth: 1, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingHorizontal: 4 },
  title: { color: w(0.7), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  navBtn: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  week: { flexDirection: 'row' },
  wkDay: { flex: 1, textAlign: 'center', color: w(0.3), fontSize: 10, lineHeight: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  cell: {
    width: `${100 / 7}%`,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.sm,
  },
  cellToday: { backgroundColor: C.lime },
  cellSel: { borderWidth: 1, borderColor: 'rgba(204,255,0,0.6)' },
  cellTxt: { fontSize: 11, lineHeight: 15 },
  cellTxtToday: { color: C.surface, fontWeight: '500' },
  cellTxtOther: { color: w(0.2) },
  cellTxtIn: { color: w(0.6) },
  dot: { position: 'absolute', bottom: 2, height: 2, width: 2, borderRadius: 1, backgroundColor: C.lime },
});
