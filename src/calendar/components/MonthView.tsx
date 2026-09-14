import { StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { iso, isoWeek, sameDay, today, WD } from '../cal-date';
import { Icon } from '../Icon';
import { paint } from '../kinds';
import { monthCells } from '../layout';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { Agenda } from './Agenda';
import { EventChip } from './EventChip';

export function MonthView({
  state,
  actions,
  events,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
}) {
  const { isDesktop } = useResponsive();
  return isDesktop ? (
    <DesktopMonth state={state} actions={actions} events={events} />
  ) : (
    <MobileMonth state={state} actions={actions} events={events} />
  );
}

/* ─────────────────────────── desktop ─────────────────────────── */
function DesktopMonth({ state, actions, events }: { state: CalState; actions: CalActions; events: CalEvent[] }) {
  const { theme } = useCalTheme();
  const { is2xl } = useResponsive();
  const cells = monthCells(state.cursor);
  const mo = state.cursor.getMonth();
  const weeks: Date[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder }]}>
      <View style={[styles.grid, { backgroundColor: theme.panelBorder }]}>
        {/* header row */}
        <View style={styles.headRow}>
          <View style={[styles.wkGutter, styles.headCell, { backgroundColor: theme.recessed }]}>
            <Txt style={styles.wkHead}>Wk</Txt>
          </View>
          {WD.map((d) => (
            <View key={d} style={[styles.col, styles.headCell, { backgroundColor: theme.recessed }]}>
              <Txt style={styles.dayHead}>{d}</Txt>
            </View>
          ))}
        </View>

        {weeks.map((week) => (
          <View key={iso(week[0])} style={styles.row}>
            <View style={[styles.wkGutter, styles.wkNumCell, { backgroundColor: theme.recessed }]}>
              <Txt style={styles.wkNum}>{isoWeek(week[0])}</Txt>
            </View>
            {week.map((d) => {
              const list = byDate(events, iso(d));
              const isToday = sameDay(d, today());
              const other = d.getMonth() !== mo;
              const shown = list.slice(0, 4);
              const rest = list.length - shown.length;
              return (
                <Press
                  key={iso(d)}
                  onPress={() => actions.pick(iso(d), true)}
                  hoverBg="#1a1a1a"
                  style={[
                    styles.col,
                    styles.tile,
                    { backgroundColor: other ? theme.otherMonth : theme.panel },
                  ]}>
                  <View style={styles.tileTop}>
                    <View style={[styles.numWrap, isToday && styles.numToday]}>
                      <Txt
                        style={[
                          styles.num,
                          isToday ? styles.numTodayTxt : other ? styles.numOther : styles.numIn,
                        ]}>
                        {d.getDate()}
                      </Txt>
                    </View>
                    <Press
                      onPress={() => actions.openCompose(null, iso(d))}
                      hoverBg={w(0.1)}
                      style={styles.addBtn}
                      aria-label={`Add event on ${iso(d)}`}>
                      <Icon name="add" size={14} color={w(0.35)} />
                    </Press>
                  </View>
                  {shown.map((ev) => (
                    <EventChip key={ev.id} ev={ev} show2xl={is2xl} onPress={(a) => actions.openEvent(ev.id, a)} />
                  ))}
                  {rest > 0 && (
                    <Press
                      onPress={() => actions.pick(iso(d), true)}
                      hoverBg={w(0.05)}
                      style={styles.more}>
                      <Txt style={styles.moreTxt}>+{rest} more</Txt>
                    </Press>
                  )}
                </Press>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

/* ─────────────────────────── mobile ─────────────────────────── */
function MobileMonth({ state, actions, events }: { state: CalState; actions: CalActions; events: CalEvent[] }) {
  const { theme } = useCalTheme();
  const cells = monthCells(state.cursor);
  const mo = state.cursor.getMonth();

  return (
    <View>
      <View style={[styles.mCard, { borderColor: theme.panelBorder }]}>
        <View style={[styles.mGridBg, { backgroundColor: theme.panelBorder }]}>
          <View style={styles.mRow}>
            {WD.map((d, i) => (
              <View key={i} style={[styles.mHeadCell, { backgroundColor: theme.recessed }]}>
                <Txt style={styles.mHead}>{d[0]}</Txt>
              </View>
            ))}
          </View>
          <View style={styles.mCells}>
            {cells.map((d) => {
              const list = byDate(events, iso(d));
              const isToday = sameDay(d, today());
              const sel = sameDay(d, state.selected);
              const other = d.getMonth() !== mo;
              const dots = list.slice(0, 3);
              return (
                <Press
                  key={iso(d)}
                  onPress={() => actions.pick(iso(d))}
                  style={[
                    styles.mCell,
                    { backgroundColor: other ? theme.otherMonth : theme.panel },
                    sel && styles.mCellSel,
                  ]}>
                  <View style={[styles.mNumWrap, isToday && styles.mNumToday]}>
                    <Txt style={[styles.mNum, isToday ? styles.mNumTodayTxt : other ? styles.numOther : styles.mNumIn]}>
                      {d.getDate()}
                    </Txt>
                  </View>
                  <View style={styles.mDots}>
                    {dots.map((e) => (
                      <View key={e.id} style={[styles.mDot, { backgroundColor: paint(e).tint }]} />
                    ))}
                  </View>
                </Press>
              );
            })}
          </View>
        </View>
      </View>
      <View style={{ marginTop: 16 }}>
        <Agenda date={state.selected} actions={actions} events={events} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // A flex column of flex rows: the month fills whatever height the page has,
  // instead of every tile being a fixed 140px and the grid ending wherever
  // that happened to land.
  card: { flex: 1, minHeight: 0, borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
  grid: { flex: 1, minHeight: 0, gap: 1 },
  headRow: { flexDirection: 'row', gap: 1 },
  row: { flex: 1, minHeight: 0, flexDirection: 'row', gap: 1 },
  wkGutter: { width: 30 },
  col: { flex: 1, minWidth: 0 },
  headCell: { paddingVertical: 8, alignItems: 'center', justifyContent: 'center' },
  wkHead: { fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1, color: w(0.25) },
  dayHead: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.6, color: w(0.4) },
  wkNumCell: { alignItems: 'center', paddingTop: 10 },
  wkNum: { fontSize: 10, lineHeight: 14, color: w(0.2), letterSpacing: -0.3 },
  // Low floor on purpose: the rows flex to fill the page, and six of them
  // still fit a short viewport now that the page itself does not scroll.
  tile: { minHeight: 72, padding: 6, gap: 3, overflow: 'hidden' },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  numWrap: { height: 24, minWidth: 24, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  numToday: { borderRadius: R.sm, backgroundColor: w(0.18) },
  num: { fontSize: 12, lineHeight: 16 },
  numIn: { color: w(0.55) },
  numOther: { color: w(0.2) },
  numTodayTxt: { color: '#fff', fontWeight: '500' },
  addBtn: { height: 20, width: 20, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  more: { marginTop: 'auto', width: '100%', borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 4 },
  moreTxt: { color: w(0.4), fontSize: 12 },
  // mobile
  mCard: { borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
  mGridBg: { gap: 1 },
  mRow: { flexDirection: 'row', gap: 1 },
  mHeadCell: { flex: 1, paddingVertical: 8, alignItems: 'center' },
  mHead: { fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1.2, color: w(0.4) },
  mCells: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  mCell: {
    width: `${100 / 7}%`,
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
  },
  mCellSel: { borderWidth: 1, borderColor: w(0.45) },
  mNumWrap: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center' },
  mNumToday: { borderRadius: R.sm, backgroundColor: w(0.18) },
  mNum: { fontSize: 12, lineHeight: 16 },
  mNumIn: { color: w(0.65) },
  mNumTodayTxt: { color: '#fff', fontWeight: '500' },
  mDots: { flexDirection: 'row', gap: 2, height: 4, alignItems: 'center' },
  mDot: { height: 4, width: 4, borderRadius: 2 },
});
