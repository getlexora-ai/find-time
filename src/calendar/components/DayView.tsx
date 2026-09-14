import { ScrollView, StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { iso, toMin } from '../cal-date';
import { KINDS } from '../kinds';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { C, DAY_END, DAY_START, durLabel, R, w } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { Agenda } from './Agenda';
import { TimeGrid } from './TimeGrid';

/**
 * One day: the time grid, with the agenda beside it on a wide screen.
 *
 * Three cards were removed here, all of them stating things rather than doing
 * them:
 *   - "Energy forecast", a fixed gradient captioned "a typical curve, not
 *     tracked from your data" — a decorative chart of nothing, ~110px tall.
 *   - "AI insight", one canned sentence picked by an if-chain on the booked
 *     total, which the numbers beside it already showed.
 *   - "Protected this day", a third list of blocks that are already in the
 *     grid and in the agenda.
 *
 * What replaces them is a single strip of numbers you cannot derive by looking
 * — planned, free, and the mix by kind — above the agenda.
 */
export function DayView({
  state,
  actions,
  events,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
}) {
  const { theme } = useCalTheme();
  const { isDesktop, isWide } = useResponsive();
  const d = state.selected;
  const list = byDate(events, iso(d));

  const booked = list.reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const planned = list
    .filter((e) => e.kind !== 'break' && e.kind !== 'ai')
    .reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const capacity = (DAY_END - DAY_START) * 60;
  const pct = Math.min(100, Math.round((booked / capacity) * 100));

  const mix = (['event', 'task', 'focus', 'routine'] as EventKind[])
    .map((k) => ({ k, n: list.filter((e) => e.kind === k).length }))
    .filter((x) => x.n > 0);

  if (!isDesktop) return <Agenda date={d} actions={actions} events={events} />;

  return (
    <View style={isWide ? styles.split : styles.stack}>
      <View style={[styles.gridCard, { borderColor: theme.panelBorder }]}>
        <TimeGrid days={[d]} events={events} actions={actions} showNowChip fill />
      </View>

      <View style={styles.rail}>
        <View style={[styles.statCard, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
          <View style={styles.statRow}>
            <View style={{ flex: 1 }}>
              <Txt style={styles.statBig}>{durLabel(planned)}</Txt>
              <Txt style={styles.statCap}>Planned</Txt>
            </View>
            <View style={{ flex: 1 }}>
              <Txt style={[styles.statBig, { color: C.lime }]}>{durLabel(Math.max(0, capacity - booked))}</Txt>
              <Txt style={styles.statCap}>Still free</Txt>
            </View>
          </View>
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${pct}%` }]} />
          </View>
          {mix.length > 0 && (
            <View style={styles.mix}>
              {mix.map(({ k, n }) => (
                <View key={k} style={styles.mixItem}>
                  <View style={[styles.mixDot, { backgroundColor: KINDS[k].accent ?? w(0.5) }]} />
                  <Txt style={styles.mixTxt}>
                    {n} {KINDS[k].label.toLowerCase()}
                    {n > 1 ? 's' : ''}
                  </Txt>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* The rail is a fixed-height flex child now that the page itself does
            not scroll, so a busy day has to scroll inside it. */}
        <ScrollView style={styles.agendaWrap} showsVerticalScrollIndicator={false}>
          <Agenda date={d} actions={actions} events={events} compact />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 14 },
  stack: { flex: 1, minHeight: 0, gap: 14 },
  gridCard: { flex: 1, minHeight: 0, borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
  rail: { width: 320, gap: 12 },
  agendaWrap: { flex: 1, minHeight: 0 },

  statCard: { borderRadius: R.xl, borderWidth: 1, padding: 16 },
  statRow: { flexDirection: 'row', gap: 16 },
  statBig: { color: '#fff', fontSize: 22, fontWeight: '500', letterSpacing: -0.5 },
  statCap: { marginTop: 3, color: w(0.4), fontSize: 11 },
  bar: { marginTop: 14, height: 5, borderRadius: R.full, backgroundColor: w(0.1), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: R.full, backgroundColor: C.lime },
  mix: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  mixItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  mixDot: { height: 5, width: 5, borderRadius: 3 },
  mixTxt: { color: w(0.45), fontSize: 11 },
});
