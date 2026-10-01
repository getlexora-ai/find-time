import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addMonths, iso, MO, sameDay, startOfWeek, today } from '../cal-date';
import { Icon } from '../Icon';
import { allDayOn, monthCells, sliceOn } from '../layout';
import { MONO, N, R } from '../tokens';
import type { CalEvent } from '../types';
import { Mono, Press } from '../ui';

const WK = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * Date picker: the rail on desktop, the sheet behind the title on a phone.
 * Jumps the grid without changing the view. The week on screen is banded, so
 * you can see where you are in the month.
 */
export function MiniMonth({
  selected,
  events,
  onPick,
  /** the week the grid shows — banded */
  weekOf,
}: {
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
  weekOf?: Date;
}) {
  // Follows the grid: stepping into October turns this page to October too.
  const [shown, setShown] = useState<{ key: string; cursor: Date }>(() => ({
    key: `${selected.getFullYear()}-${selected.getMonth()}`,
    cursor: selected,
  }));
  const selKey = `${selected.getFullYear()}-${selected.getMonth()}`;
  const cursor = shown.key === selKey || shown.key.startsWith('manual') ? shown.cursor : selected;
  if (shown.key !== selKey && !shown.key.startsWith('manual')) setShown({ key: selKey, cursor: selected });
  const move = (n: number) => setShown({ key: `manual-${Date.now()}`, cursor: addMonths(cursor, n) });

  const cells = monthCells(cursor);
  const band = weekOf ? iso(startOfWeek(weekOf)) : null;
  const busy = (d: string) => events.some((e) => sliceOn(e, d)) || allDayOn(events, d).length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Mono style={styles.title}>
          {MO[cursor.getMonth()].slice(0, 3).toUpperCase()} {cursor.getFullYear()}
        </Mono>
        <View style={styles.navRow}>
          <Press onPress={() => move(-1)} hoverBg={N.hover} style={styles.navBtn} accessibilityRole="button" aria-label="Previous month">
            <Icon name="arrow-left" size={13} color={N.muted} />
          </Press>
          <Press onPress={() => move(1)} hoverBg={N.hover} style={styles.navBtn} accessibilityRole="button" aria-label="Next month">
            <Icon name="arrow-right" size={13} color={N.muted} />
          </Press>
        </View>
      </View>

      <View style={styles.week}>
        {WK.map((d, i) => (
          <Mono key={i} style={styles.wkDay}>
            {d}
          </Mono>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d) => {
          const di = iso(d);
          const other = d.getMonth() !== cursor.getMonth();
          const isToday = sameDay(d, today());
          const sel = sameDay(d, selected);
          const inBand = band != null && iso(startOfWeek(d)) === band;
          return (
            <Press
              key={di}
              onPress={() => onPick(di)}
              hoverBg={isToday ? undefined : N.hover}
              accessibilityRole="button"
              aria-label={`${d.getDate()} ${MO[d.getMonth()]}`}
              style={[styles.cell, inBand && styles.cellBand, sel && !isToday && styles.cellSel, isToday && styles.cellToday]}>
              <Mono style={[styles.cellTxt, other && styles.cellOther, isToday && styles.cellTxtToday]}>
                {d.getDate()}
              </Mono>
              {busy(di) && !isToday && <View style={styles.dot} />}
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  title: { fontFamily: MONO, color: N.ink, fontSize: 11 },
  navRow: { flexDirection: 'row', gap: 2 },
  navBtn: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  week: { flexDirection: 'row' },
  wkDay: { flex: 1, textAlign: 'center', color: N.faint },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 2 },
  cell: { width: `${100 / 7}%`, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  cellBand: { backgroundColor: N.sunken, borderRadius: 0 },
  cellSel: { borderWidth: 1, borderColor: N.ink },
  cellToday: { backgroundColor: N.ink },
  cellTxt: { color: N.ink2, fontSize: 11, lineHeight: 15 },
  cellOther: { color: N.ghost },
  cellTxtToday: { color: N.onInk },
  dot: { position: 'absolute', bottom: 3, height: 3, width: 3, borderRadius: 2, backgroundColor: N.faint },
});
