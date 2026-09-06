import { StyleSheet, View } from 'react-native';

import { addDays, iso, isoWeek, sameDay, startOfWeek, WD, wdIndex } from '../cal-date';
import { Icon } from '../Icon';
import { TODAY } from '../seed';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { C, R, rgba, w } from '../tokens';
import type { CalEvent } from '../types';
import { Txt } from '../ui';
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
        <View style={{ marginTop: 16 }}>
          <Agenda date={state.selected} actions={actions} events={events} />
        </View>
      </View>
    );
  }
  return <DesktopWeek state={state} actions={actions} events={events} start={start} />;
}

const ALLDAY_BADGE: Record<string, { label: string; bg: string; fg: string }> = {
  '2026-09-07': { label: 'Sprint 14 · week 1 of 2', bg: rgba('#c8c8ff', 0.2), fg: '#c8c8ff' },
  '2026-09-11': { label: 'Beta cut-off', bg: rgba('#ff7040', 0.2), fg: '#ffb39a' },
};

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
  const { height } = useResponsive();
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder }]}>
      {/* header row */}
      <View style={[styles.row, { backgroundColor: theme.panelBorder }]}>
        <View style={[styles.gutterCell, { backgroundColor: theme.recessed }]}>
          <Txt style={styles.gutterHead}>W{isoWeek(start)}</Txt>
        </View>
        {days.map((d) => {
          const isToday = sameDay(d, TODAY);
          return (
            <View key={iso(d)} style={[styles.col, styles.dayHead, { backgroundColor: theme.recessed }]}>
              <Txt style={[styles.dayHeadWd, { color: isToday ? C.lime : w(0.4) }]}>{WD[wdIndex(d)]}</Txt>
              <View style={isToday ? styles.dayHeadNumToday : undefined}>
                <Txt style={[styles.dayHeadNum, isToday ? styles.dayHeadNumTodayTxt : styles.dayHeadNumTxt]}>
                  {d.getDate()}
                </Txt>
              </View>
            </View>
          );
        })}
      </View>

      {/* all-day row */}
      <View style={[styles.row, { backgroundColor: theme.panelBorder }]}>
        <View style={[styles.gutterCell, styles.allDayGutter, { backgroundColor: theme.recessed }]}>
          <Txt style={styles.gutterHead}>All day</Txt>
        </View>
        {days.map((d) => {
          const badge = ALLDAY_BADGE[iso(d)];
          return (
            <View key={iso(d)} style={[styles.col, styles.allDayCell, { backgroundColor: theme.panel }]}>
              {badge && (
                <View style={[styles.allDayBadge, { backgroundColor: badge.bg }]}>
                  <Txt numberOfLines={1} style={[styles.allDayBadgeTxt, { color: badge.fg }]}>
                    {badge.label}
                  </Txt>
                </View>
              )}
            </View>
          );
        })}
      </View>

      <TimeGrid days={days} events={events} actions={actions} maxHeight={Math.max(360, height * 0.58)} />

      <View style={[styles.footer, { backgroundColor: theme.recessed }]}>
        <View style={styles.footerLeft}>
          <Icon name="cursor" size={13} color={C.lime} />
          <Txt style={styles.footerTxt}>Drag any empty slot to block time</Txt>
        </View>
        <Txt style={styles.footerHint}>Snaps to 15 min · release to name it</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  row: { flexDirection: 'row', gap: 1 },
  gutterCell: { width: 64, padding: 8, justifyContent: 'flex-end', alignItems: 'flex-end' },
  allDayGutter: { justifyContent: 'center' },
  gutterHead: { fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1.2, color: w(0.25) },
  col: { flex: 1, minWidth: 0 },
  dayHead: { alignItems: 'center', gap: 4, paddingVertical: 12 },
  dayHeadWd: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 2.56 },
  dayHeadNum: { fontSize: 14 },
  dayHeadNumTxt: { color: w(0.7) },
  dayHeadNumToday: {
    height: 28,
    minWidth: 28,
    paddingHorizontal: 4,
    borderRadius: R.md,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: C.lime,
    shadowOpacity: 0.55,
    shadowRadius: 16,
  },
  dayHeadNumTodayTxt: { color: C.surface, fontWeight: '500' },
  allDayCell: { minHeight: 36, padding: 4, gap: 4 },
  allDayBadge: { borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 4 },
  allDayBadgeTxt: { fontSize: 12 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: w(0.1),
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerTxt: { color: w(0.35), fontSize: 12 },
  footerHint: { color: w(0.35), fontSize: 12 },
});
