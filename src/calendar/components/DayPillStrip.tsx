import { ScrollView, StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { addDays, iso, isoWeek, MO, sameDay, WD, wdIndex } from '../cal-date';
import { TODAY } from '../seed';
import { useCalTheme } from '../theme-context';
import { CATS, C, R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

/** Mobile scrollable day-pill strip (spec §2.10). 58px tall thumb targets. */
export function DayPillStrip({
  weekStart,
  selected,
  events,
  onPick,
}: {
  weekStart: Date;
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
}) {
  const { theme } = useCalTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder, backgroundColor: theme.panel }]}>
      <View style={styles.head}>
        <Txt style={styles.headWeek}>Week {isoWeek(weekStart)}</Txt>
        <Txt style={styles.headRange}>
          {MO[weekStart.getMonth()].slice(0, 3)} {weekStart.getDate()} – {addDays(weekStart, 6).getDate()}
        </Txt>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {days.map((d) => {
          const isToday = sameDay(d, TODAY);
          const sel = sameDay(d, selected);
          const list = byDate(events, iso(d));
          const n = list.length;
          return (
            <Press
              key={iso(d)}
              onPress={() => onPick(iso(d))}
              style={[styles.pill, sel ? styles.pillSel : styles.pillIdle]}>
              <Txt
                style={[
                  styles.pw,
                  sel ? styles.pwSel : isToday ? styles.pwToday : styles.pwIdle,
                ]}>
                {WD[wdIndex(d)]}
              </Txt>
              <Txt style={[styles.pd, { color: sel ? C.surface : '#fff' }]}>{d.getDate()}</Txt>
              <View style={styles.dots}>
                {list.slice(0, 3).map((e) => (
                  <View
                    key={e.id}
                    style={[styles.dot, { backgroundColor: sel ? C.surface : CATS[e.cat].color }]}
                  />
                ))}
              </View>
              <Txt style={[styles.pn, { color: sel ? 'rgba(18,18,18,0.55)' : w(0.3) }]}>
                {n ? `${n}${n > 1 ? ' evts' : ' evt'}` : '—'}
              </Txt>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: R.xl2, borderWidth: 1, padding: 12 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  headWeek: { color: w(0.35), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  headRange: { color: w(0.35), fontSize: 12 },
  strip: { gap: 8, paddingHorizontal: 4, paddingBottom: 4 },
  pill: {
    minWidth: 58,
    alignItems: 'center',
    gap: 4,
    borderRadius: R.xl,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  pillSel: {
    borderColor: C.lime,
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.35,
    shadowRadius: 16,
  },
  pillIdle: { borderColor: w(0.1), backgroundColor: w(0.05) },
  pw: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  pwSel: { color: 'rgba(18,18,18,0.6)' },
  pwToday: { color: C.lime },
  pwIdle: { color: w(0.4) },
  pd: { fontSize: 14, fontWeight: '500' },
  dots: { flexDirection: 'row', gap: 2, height: 4, alignItems: 'center' },
  dot: { height: 4, width: 4, borderRadius: 2 },
  pn: { fontSize: 10, lineHeight: 14 },
});
