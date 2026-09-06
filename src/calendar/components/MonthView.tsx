import { StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { iso, isoWeek, sameDay, WD } from '../cal-date';
import { monthCells } from '../layout';
import { TODAY } from '../seed';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { CATS, C, R, w } from '../tokens';
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
        <View style={styles.row}>
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
              const isToday = sameDay(d, TODAY);
              const other = d.getMonth() !== mo;
              const shown = list.slice(0, 3);
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
                      <Txt style={styles.addTxt}>+</Txt>
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
              const isToday = sameDay(d, TODAY);
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
                      <View key={e.id} style={[styles.mDot, { backgroundColor: CATS[e.cat].color }]} />
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
  card: {
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  grid: { gap: 1 },
  row: { flexDirection: 'row', gap: 1 },
  wkGutter: { width: 36 },
  col: { flex: 1, minWidth: 0 },
  headCell: { paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  wkHead: { fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1.2, color: w(0.25) },
  dayHead: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 2.56, color: w(0.4) },
  wkNumCell: { alignItems: 'center', paddingTop: 12 },
  wkNum: { fontSize: 10, lineHeight: 14, color: w(0.2), letterSpacing: -0.3 },
  tile: { minHeight: 140, padding: 8, gap: 4 },
  tileTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  numWrap: { height: 24, minWidth: 24, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  numToday: {
    borderRadius: R.md,
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.55,
    shadowRadius: 16,
  },
  num: { fontSize: 12, lineHeight: 16 },
  numIn: { color: w(0.55) },
  numOther: { color: w(0.2) },
  numTodayTxt: { color: C.surface, fontWeight: '500' },
  addBtn: { height: 20, width: 20, alignItems: 'center', justifyContent: 'center', borderRadius: R.sm },
  addTxt: { color: w(0.35), fontSize: 14, lineHeight: 16 },
  more: { marginTop: 'auto', width: '100%', borderRadius: R.sm, paddingHorizontal: 6, paddingVertical: 4 },
  moreTxt: { color: w(0.4), fontSize: 12 },
  // mobile
  mCard: {
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
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
  mCellSel: { borderWidth: 1, borderColor: C.lime },
  mNumWrap: { height: 24, width: 24, alignItems: 'center', justifyContent: 'center' },
  mNumToday: { borderRadius: R.md, backgroundColor: C.lime, shadowColor: C.lime, shadowOpacity: 0.5, shadowRadius: 14 },
  mNum: { fontSize: 12, lineHeight: 16 },
  mNumIn: { color: w(0.65) },
  mNumTodayTxt: { color: C.surface, fontWeight: '500' },
  mDots: { flexDirection: 'row', gap: 2, height: 4, alignItems: 'center' },
  mDot: { height: 4, width: 4, borderRadius: 2 },
});
