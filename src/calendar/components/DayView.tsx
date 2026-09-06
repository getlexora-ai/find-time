import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { byDate } from '../cal-store';
import { iso, sameDay, toMin } from '../cal-date';
import { Icon } from '../Icon';
import { NOW_MIN, TODAY } from '../seed';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { C, DAY_END, DAY_START, durLabel, R, rgba, w } from '../tokens';
import type { CalEvent } from '../types';
import { Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { Agenda } from './Agenda';
import { TimeGrid } from './TimeGrid';

const NOW_PCT = ((NOW_MIN - DAY_START * 60) / ((DAY_END - DAY_START) * 60)) * 100;

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
  const { isDesktop, isWide, height } = useResponsive();
  const d = state.selected;
  const list = byDate(events, iso(d));
  const booked = list.reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const planned = list
    .filter((e) => e.kind !== 'break' && e.kind !== 'ai')
    .reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const capacity = (DAY_END - DAY_START) * 60;
  const pct = Math.round((booked / capacity) * 100);
  const nProtected = list.filter((e) => e.kind === 'focus').length;
  const nClash = list.filter((e) => e.conflict).length;

  return (
    <View style={{ gap: 20 }}>
      <EnergyBand theme={theme} />

      <View style={isWide ? styles.split : undefined}>
        <View style={{ flex: 1, gap: 20 }}>
          {isDesktop && (
            <View style={[styles.gridCard, { borderColor: theme.panelBorder }]}>
              <View style={[styles.gridHead, { backgroundColor: theme.recessed }]}>
                <Txt style={styles.gridHeadLabel}>Time grid</Txt>
                <Txt style={styles.gridHeadHint}>Drag to block · 15 min snap</Txt>
              </View>
              <TimeGrid
                days={[d]}
                events={events}
                actions={actions}
                showNowChip
                maxHeight={Math.max(360, height * 0.58)}
              />
            </View>
          )}
          <Agenda date={d} actions={actions} events={events} />
        </View>

        {isWide && (
          <View style={styles.rail}>
            <View style={[styles.railCard, styles.telemetry]}>
              <View style={styles.railHead}>
                <Txt style={styles.railLabel}>Day telemetry</Txt>
                <Icon name="chart" size={18} color={C.lime} />
              </View>
              <View style={styles.telRow}>
                <View style={{ flex: 1 }}>
                  <Txt style={styles.telBig}>{durLabel(planned)}</Txt>
                  <Txt style={styles.telCap}>Planned</Txt>
                </View>
                <View style={{ flex: 1 }}>
                  <Txt style={[styles.telBig, { color: C.lime }]}>{durLabel(capacity - booked)}</Txt>
                  <Txt style={styles.telCap}>Still free</Txt>
                </View>
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${pct}%` }]} />
              </View>
              <Txt style={styles.telNote}>
                {pct}% of capacity · {nProtected} protected block{nProtected === 1 ? '' : 's'} ·{' '}
                {nClash ? `${nClash / 2} clash to resolve` : 'no clashes'}.
              </Txt>
            </View>

            <View style={[styles.railCard, styles.insight]}>
              <View style={styles.railHead}>
                <Txt style={styles.insightLabel}>AI insight</Txt>
                <Icon name="bulb" size={20} color={C.surface} />
              </View>
              <Txt style={styles.insightBody}>
                {nClash
                  ? 'Roadmap review clashes with your team sync. Maya is free Thursday 14:00 — move it there and your morning stays whole.'
                  : booked < 3 * 60
                    ? 'This day is mostly open. Two hours here would clear the onboarding spec before the beta cut-off.'
                    : 'Your afternoon is back-to-back. Move one flexible block to tomorrow and you keep a recovery window.'}
              </Txt>
              <View style={styles.insightBtns}>
                <View style={styles.insightPrimary}>
                  <Txt style={styles.insightPrimaryTxt}>{nClash ? 'Move it' : 'Do it'}</Txt>
                </View>
                <View style={styles.insightGhost}>
                  <Txt style={styles.insightGhostTxt}>{nClash ? 'Keep both' : 'Dismiss'}</Txt>
                </View>
              </View>
            </View>

            <View style={[styles.railCard, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
              <Txt style={styles.protectedTitle}>Protected {sameDay(d, TODAY) ? 'today' : 'this day'}</Txt>
              <View style={{ marginTop: 16, gap: 8 }}>
                {list.filter((e) => e.kind === 'focus' || e.kind === 'break').length === 0 ? (
                  <Txt style={styles.protectedEmpty}>
                    Nothing is protected on this day. Anything here can be moved by AI.
                  </Txt>
                ) : (
                  list
                    .filter((e) => e.kind === 'focus' || e.kind === 'break')
                    .map((e) => <ProtectedRow key={e.id} ev={e} />)
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

function ProtectedRow({ ev }: { ev: CalEvent }) {
  const focus = ev.kind === 'focus';
  return (
    <View style={[styles.protRow, focus ? styles.protRowFocus : styles.protRowBreak]}>
      <Icon name={focus ? 'shield' : 'cup'} size={18} color={focus ? C.lime : w(0.45)} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt numberOfLines={1} style={{ color: focus ? '#fff' : w(0.8), fontSize: 12 }}>
          {ev.title}
        </Txt>
        <Txt style={styles.protSub}>
          {ev.start}–{ev.end} · {focus ? 'cannot be moved by AI' : 'recovery window'}
        </Txt>
      </View>
    </View>
  );
}

function EnergyBand({ theme }: { theme: { panel: string; panelBorder: string } }) {
  return (
    <View style={[styles.energy, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
      <View style={styles.energyHead}>
        <View style={styles.energyHeadLeft}>
          <Icon name="bolt" size={18} color="#ff7040" />
          <Txt style={styles.energyLabel}>Energy forecast</Txt>
        </View>
        <Txt style={styles.energyHint}>Learned from 6 weeks of your completions</Txt>
      </View>
      <View style={styles.energyBarWrap}>
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="energy" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={rgba('#ccff00', 0.55)} />
              <Stop offset="0.18" stopColor={rgba('#ccff00', 0.75)} />
              <Stop offset="0.38" stopColor={rgba('#ffd600', 0.5)} />
              <Stop offset="0.52" stopColor={rgba('#ff7040', 0.35)} />
              <Stop offset="0.7" stopColor={rgba('#ffd600', 0.4)} />
              <Stop offset="0.88" stopColor={rgba('#c8c8ff', 0.35)} />
              <Stop offset="1" stopColor={rgba('#c8c8ff', 0.2)} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width="100%" height="100%" fill="url(#energy)" />
        </Svg>
        <View style={[styles.energyNow, { left: `${NOW_PCT}%` }]}>
          <View style={styles.energyNowDot} />
        </View>
      </View>
      <View style={styles.energyScale}>
        <Txt style={styles.energyScaleTxt}>07:00 peak</Txt>
        <Txt style={styles.energyScaleTxt}>12:30 dip</Txt>
        <Txt style={styles.energyScaleTxt}>15:00 second wind</Txt>
        <Txt style={styles.energyScaleTxt}>21:00</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: 20 },
  rail: { width: 352, gap: 16 },
  gridCard: {
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  gridHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  gridHeadLabel: { color: w(0.4), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  gridHeadHint: { color: w(0.3), fontSize: 12 },

  railCard: { borderRadius: R.xl2, borderWidth: 1, borderColor: w(0.1), padding: 20 },
  telemetry: { backgroundColor: 'rgba(255,255,255,0.07)' },
  railHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  railLabel: { color: w(0.45), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  telRow: { flexDirection: 'row', gap: 16, marginTop: 20 },
  telBig: { color: '#fff', fontSize: 24, fontWeight: '500', letterSpacing: -0.5 },
  telCap: { marginTop: 4, color: w(0.4), fontSize: 12 },
  bar: { marginTop: 16, height: 6, borderRadius: R.full, backgroundColor: w(0.1), overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: R.full, backgroundColor: C.lime },
  telNote: { marginTop: 12, color: w(0.4), fontSize: 12, lineHeight: 18 },

  insight: { backgroundColor: '#c8c8ff', borderColor: 'rgba(255,255,255,0.15)' },
  insightLabel: { color: 'rgba(18,18,18,0.5)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  insightBody: { marginTop: 20, color: C.surface, fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: -0.3 },
  insightBtns: { marginTop: 20, flexDirection: 'row', gap: 8 },
  insightPrimary: { borderRadius: R.lg, backgroundColor: C.surface, paddingHorizontal: 16, paddingVertical: 10 },
  insightPrimaryTxt: { color: '#fff', fontSize: 12 },
  insightGhost: { borderRadius: R.lg, borderWidth: 1, borderColor: 'rgba(18,18,18,0.15)', paddingHorizontal: 16, paddingVertical: 10 },
  insightGhostTxt: { color: C.surface, fontSize: 12 },

  protectedTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  protectedEmpty: { color: w(0.4), fontSize: 12 },
  protRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.xl, borderWidth: 1, padding: 12 },
  protRowFocus: { borderColor: 'rgba(204,255,0,0.3)', backgroundColor: rgba('#ccff00', 0.1) },
  protRowBreak: { borderColor: w(0.1), backgroundColor: w(0.05) },
  protSub: { marginTop: 4, color: w(0.4), fontSize: 12 },

  energy: {
    borderRadius: R.xl2,
    borderWidth: 1,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  energyHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  energyHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  energyLabel: { color: w(0.45), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  energyHint: { color: w(0.35), fontSize: 12 },
  energyBarWrap: {
    position: 'relative',
    marginTop: 16,
    height: 36,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    overflow: 'hidden',
  },
  energyNow: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: C.orange },
  energyNowDot: {
    position: 'absolute',
    left: -3,
    top: 0,
    height: 7,
    width: 7,
    borderRadius: 4,
    backgroundColor: C.orange,
    shadowColor: C.orange,
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  energyScale: { marginTop: 8, flexDirection: 'row', justifyContent: 'space-between' },
  energyScaleTxt: { color: w(0.35), fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1.2 },
});
