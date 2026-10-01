import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { addMonths, iso, MO, sameDay, startOfWeek, today } from '../cal-date';
import { Icon } from '../Icon';
import { allDayOn, monthCells, sliceOn } from '../layout';
import { CATS, N, R, SANS, tint } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

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
  // Paging with ‹ › browses away until the grid moves, then it follows again
  // (it used to stay on the browsed page for good).
  const selKey = iso(selected);
  const [paged, setPaged] = useState<{ from: string; cursor: Date } | null>(null);
  const cursor = paged && paged.from === selKey ? paged.cursor : selected;
  const move = (n: number) => setPaged({ from: selKey, cursor: addMonths(cursor, n) });

  const cells = monthCells(cursor);
  const band = weekOf ? iso(startOfWeek(weekOf)) : null;
  const busy = (d: string) => events.some((e) => sliceOn(e, d)) || allDayOn(events, d).length > 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Txt style={styles.title}>
          {MO[cursor.getMonth()]} {cursor.getFullYear()}
        </Txt>
        <View style={styles.navRow}>
          <Press onPress={() => move(-1)} hoverBg={N.hover} style={styles.navBtn} accessibilityRole="button" aria-label="Previous month">
            <Icon name="arrow-left" size={15} color={N.ink2} />
          </Press>
          <Press onPress={() => move(1)} hoverBg={N.hover} style={styles.navBtn} accessibilityRole="button" aria-label="Next month">
            <Icon name="arrow-right" size={15} color={N.ink2} />
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
        {cells.map((d, i) => {
          const di = iso(d);
          const other = d.getMonth() !== cursor.getMonth();
          const isToday = sameDay(d, today());
          const sel = sameDay(d, selected);
          const inBand = band != null && iso(startOfWeek(d)) === band;
          const col = i % 7;
          return (
            <View
              key={di}
              style={[
                styles.cell,
                inBand && styles.band,
                inBand && col === 0 && styles.bandStart,
                inBand && col === 6 && styles.bandEnd,
              ]}>
              <Press
                onPress={() => onPick(di)}
                hoverBg={isToday || sel ? undefined : N.hover}
                accessibilityRole="button"
                aria-label={`${d.getDate()} ${MO[d.getMonth()]}`}
                aria-selected={sel}
                style={[styles.day, sel && !isToday && styles.daySel, isToday && styles.dayToday]}>
                <Txt
                  style={[
                    styles.dayTxt,
                    other && styles.dayOther,
                    sel && styles.dayTxtSel,
                    isToday && styles.dayTxtToday,
                  ]}>
                  {d.getDate()}
                </Txt>
                {busy(di) && !isToday && <View style={[styles.dot, sel && styles.dotSel]} />}
              </Press>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const SEL = tint(CATS.deep.color, 0.18);

const styles = StyleSheet.create({
  wrap: { paddingVertical: 4 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  title: { fontFamily: SANS, fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: -0.3, color: N.ink },
  navRow: { flexDirection: 'row', gap: 2 },
  navBtn: { height: 30, width: 30, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  week: { flexDirection: 'row', marginBottom: 4 },
  wkDay: { flex: 1, textAlign: 'center', fontFamily: SANS, fontSize: 12, lineHeight: 18, fontWeight: '500', color: N.muted },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 40, alignItems: 'center', justifyContent: 'center' },
  band: { backgroundColor: N.sunken },
  bandStart: { borderTopLeftRadius: 20, borderBottomLeftRadius: 20 },
  bandEnd: { borderTopRightRadius: 20, borderBottomRightRadius: 20 },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  daySel: { backgroundColor: SEL },
  dayToday: { backgroundColor: N.ink },
  dayTxt: { fontFamily: SANS, fontSize: 14, lineHeight: 18, fontWeight: '500', color: N.ink, fontVariant: ['tabular-nums'] },
  dayOther: { color: N.ghost },
  dayTxtSel: { fontWeight: '600' },
  dayTxtToday: { color: N.onInk, fontWeight: '600' },
  dot: { position: 'absolute', bottom: 3, height: 4, width: 4, borderRadius: 2, backgroundColor: N.faint },
  dotSel: { backgroundColor: CATS.deep.color },
});
