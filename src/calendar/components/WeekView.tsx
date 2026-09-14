import { StyleSheet, View } from 'react-native';

import { addDays, iso, isoWeek, sameDay, startOfWeek, today, WD, wdIndex } from '../cal-date';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { Agenda } from './Agenda';
import { DayPillStrip } from './DayPillStrip';
import { TimeGrid } from './TimeGrid';

export function WeekView({
  state,
  actions,
  events,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
}) {
  const { isDesktop } = useResponsive();
  const start = startOfWeek(state.cursor);

  if (!isDesktop) {
    return (
      <View>
        <DayPillStrip weekStart={start} selected={state.selected} events={events} onPick={(d) => actions.pick(d)} />
        <View style={{ marginTop: 12 }}>
          <Agenda date={state.selected} actions={actions} events={events} />
        </View>
      </View>
    );
  }
  return <DesktopWeek state={state} actions={actions} events={events} start={start} />;
}

/**
 * The desktop week. The card is now a flex child that fills the screen rather
 * than a fixed-height panel: the old version capped the grid at 58% of the
 * window height and then sat inside a scrolling, padded page, so on a tall
 * display most of the calendar was empty canvas.
 *
 * The footer strip ("Drag any empty slot to block time · Snaps to 15 min")
 * advertised a drag interaction that does not exist here, and cost a row of
 * height on every screen; it is gone.
 */
function DesktopWeek({
  state,
  actions,
  events,
  start,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
  start: Date;
}) {
  const { theme } = useCalTheme();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder }]}>
      <View style={[styles.row, { backgroundColor: theme.panelBorder }]}>
        <View style={[styles.gutterCell, { backgroundColor: theme.recessed }]}>
          <Txt style={styles.gutterHead}>W{isoWeek(start)}</Txt>
        </View>
        {days.map((d) => {
          const isToday = sameDay(d, today());
          const isWeekend = wdIndex(d) > 4;
          return (
            /* The header is the way into a single day. Week → day used to need
               the view tabs; clicking the column you are already looking at is
               the gesture people try first. */
            <Press
              key={iso(d)}
              onPress={() => {
                actions.pick(iso(d));
                actions.setView('day');
              }}
              hoverBg={w(0.06)}
              accessibilityRole="button"
              aria-label={`Open ${WD[wdIndex(d)]} ${d.getDate()} in day view`}
              style={[styles.col, styles.dayHead, { backgroundColor: theme.recessed }]}>
              <Txt style={[styles.dayHeadWd, isToday && styles.dayHeadWdToday]}>{WD[wdIndex(d)]}</Txt>
              <Txt
                style={[
                  styles.dayHeadNum,
                  isWeekend && styles.dayHeadNumWknd,
                  isToday && styles.dayHeadNumToday,
                ]}>
                {d.getDate()}
              </Txt>
            </Press>
          );
        })}
      </View>

      <TimeGrid days={days} events={events} actions={actions} fill />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 0, borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 1 },
  gutterCell: { width: 52, padding: 6, justifyContent: 'flex-end', alignItems: 'flex-end' },
  gutterHead: { fontSize: 10, lineHeight: 14, letterSpacing: 1, color: w(0.25) },
  col: { flex: 1, minWidth: 0 },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6, paddingVertical: 9 },
  dayHeadWd: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.6, color: w(0.35) },
  dayHeadWdToday: { color: '#fff' },
  dayHeadNum: { fontSize: 14, color: w(0.6) },
  dayHeadNumWknd: { color: w(0.32) },
  // Today is marked by weight, not by a glowing lime chip on every view — the
  // grid reads better when only the now-line is loud.
  dayHeadNumToday: { color: '#fff', fontWeight: '500' },
});
