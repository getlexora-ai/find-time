import { StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { fromMin, iso, MO, sameDay, toMin, wdIndex, WD_LONG } from '../cal-date';
import { Icon } from '../Icon';
import { TODAY } from '../seed';
import type { CalActions } from '../state';
import { useCalTheme } from '../theme-context';
import { CATS, C, DAY_END, DAY_START, durLabel, R, rgba, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * The day agenda (spec §2.11). Dark, like every other surface in the app — the
 * spec's "one light reading surface" is retired: an empty day already rendered
 * on `#121212`, so a populated one on `#f4f4f4` just looked inconsistent.
 *
 *  - default  — full width, full detail: title, notes and the meta row (time /
 *               project / Protected / Overlaps), with a time gutter down the
 *               left. Used on phone and on narrow desktop below the time grid.
 *  - compact  — stripped and denser, for the Day-view right rail next to
 *               "AI insight" / "Protected this day": title · category spine and
 *               the clickable "free — 45m" gap rows, no gutter; notes and the
 *               meta row are left to the event-detail popover.
 *
 * Either way the body lifts with the theme (`recessed`) so it sits with the
 * other panels instead of fighting them.
 */
export function Agenda({
  date,
  actions,
  events,
  compact = false,
}: {
  date: Date;
  actions: CalActions;
  events: CalEvent[];
  compact?: boolean;
}) {
  const { theme } = useCalTheme();
  const { isPhone } = useResponsive();
  const gutter = isPhone ? 52 : 72;
  const list = byDate(events, iso(date));
  const isToday = sameDay(date, TODAY);
  const planned = list
    .filter((e) => e.kind !== 'break' && e.kind !== 'ai')
    .reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const free = (DAY_END - DAY_START) * 60 - list.reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const plannedTxt = list.length ? durLabel(planned) : '—';
  const freeTxt = list.length ? durLabel(free) : '—';

  const head = (
    <View style={[styles.head, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
      <View style={{ minWidth: 0, flex: 1 }}>
        <View style={styles.headTitleRow}>
          <Txt style={styles.headTitle}>
            {WD_LONG[wdIndex(date)]} {date.getDate()} {MO[date.getMonth()].slice(0, 3)}
          </Txt>
          {isToday && (
            <View style={styles.todayPill}>
              <Txt style={styles.todayPillTxt}>Today</Txt>
            </View>
          )}
        </View>
        <Txt style={styles.headSub}>
          {compact
            ? `Planned ${plannedTxt} · free ${freeTxt}`
            : `Planned ${plannedTxt} · free ${freeTxt} · built around your energy.`}
        </Txt>
      </View>
      <Press onPress={() => actions.openCompose(null, iso(date))} hoverBg={w(0.1)} style={styles.addBtn}>
        <Icon name="add" size={16} color={w(0.7)} />
        {!compact && <Txt style={styles.addTxt}>Add</Txt>}
      </Press>
    </View>
  );

  if (!list.length) {
    return (
      <View style={[styles.card, { borderColor: theme.panelBorder }]}>
        {head}
        <View style={styles.emptyBody}>
          <View style={styles.emptyIcon}>
            <Icon name="calendar-add" size={26} color={C.lime} />
          </View>
          <Txt style={styles.emptyTitle}>Nothing booked. That is space, not a gap.</Txt>
          <Txt style={styles.emptyNote}>
            Eight open hours on {WD_LONG[wdIndex(date)]}. Block one for the work you keep postponing.
          </Txt>
          <View style={styles.emptyBtns}>
            <Press onPress={() => actions.openCompose(null, iso(date))} hoverBg={C.limeHover} style={styles.emptyPrimary}>
              <Txt style={styles.emptyPrimaryTxt}>Add event</Txt>
            </Press>
            <Press onPress={() => actions.openAI()} hoverBg={w(0.1)} style={styles.emptyGhost}>
              <Txt style={styles.emptyGhostTxt}>Ask Find time to fill it</Txt>
            </Press>
          </View>
        </View>
      </View>
    );
  }

  let prevEnd: number | null = null;
  const rows: React.ReactNode[] = [];
  list.forEach((ev, idx) => {
    const s = toMin(ev.start);
    if (prevEnd !== null && s - prevEnd >= 25) {
      const gapStart = prevEnd;
      rows.push(
        <Row key={`gap-${idx}`} left={fromMin(gapStart)} gutter={gutter} compact={compact}>
          <Press
            onPress={() => actions.openCompose(null, iso(date), fromMin(gapStart))}
            hoverBg={w(0.06)}
            style={compact ? styles.freeRowCompact : styles.freeRow}>
            <View style={compact ? styles.freeIconCompact : styles.freeIcon}>
              <Icon name="add" size={16} color={w(0.55)} />
            </View>
            <Txt style={styles.freeTxt}>free — {durLabel(s - gapStart)}</Txt>
            <Txt style={styles.freeRange}>
              {fromMin(gapStart)}–{ev.start}
            </Txt>
          </Press>
        </Row>,
      );
    }
    prevEnd = Math.max(prevEnd ?? 0, toMin(ev.end));
    rows.push(
      <Row key={ev.id} left={ev.start} gutter={gutter} compact={compact}>
        <AgendaCard ev={ev} compact={compact} onPress={() => actions.openEvent(ev.id)} />
      </Row>,
    );
  });

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder }]}>
      {head}
      <View style={[styles.body, { backgroundColor: theme.recessed }]}>{rows}</View>
    </View>
  );
}

function Row({
  left,
  gutter,
  compact,
  children,
}: {
  left: string;
  gutter: number;
  compact?: boolean;
  children: React.ReactNode;
}) {
  // Compact drops the time-gutter column entirely — every card and free row
  // already carries its own time, so the gutter was just a dead strip down the
  // left of a narrow rail. The rows then stack like the cards above them.
  if (compact) {
    return <View style={[styles.row, styles.rowCompact]}>{children}</View>;
  }
  return (
    <View style={styles.row}>
      <View style={[styles.rowLeft, { width: gutter }]}>
        <Txt style={styles.rowLeftTxt}>{left}</Txt>
      </View>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

function AgendaCard({ ev, compact, onPress }: { ev: CalEvent; compact?: boolean; onPress: () => void }) {
  if (ev.kind === 'break') {
    if (compact) {
      return (
        <View style={styles.breakCardCompact}>
          <View style={styles.breakIconCompact}>
            <Icon name="cup" size={16} color={w(0.5)} />
          </View>
          <Txt numberOfLines={1} style={styles.breakTitleCompact}>
            {ev.title}
          </Txt>
        </View>
      );
    }
    return (
      <View style={styles.breakCard}>
        <View style={styles.breakIcon}>
          <Icon name="cup" size={18} color={w(0.5)} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt style={styles.breakTitle}>{ev.title}</Txt>
          <Txt style={styles.breakSub}>A protected break before your afternoon block.</Txt>
        </View>
      </View>
    );
  }
  if (ev.kind === 'ai') {
    if (compact) {
      return (
        <Press onPress={onPress} style={styles.aiCardCompact}>
          <View style={styles.aiIcon}>
            <Icon name="magic" size={16} color={C.lime} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt numberOfLines={1} style={styles.aiTitleCompact}>
              {ev.title}
            </Txt>
            <Txt style={styles.aiSubCompact}>
              {ev.start}–{ev.end}
            </Txt>
          </View>
          <View style={styles.acceptPill}>
            <Txt style={styles.acceptTxt}>Accept</Txt>
          </View>
        </Press>
      );
    }
    return (
      <Press onPress={onPress} style={styles.aiCard}>
        <View style={styles.aiIcon}>
          <Icon name="magic" size={18} color={C.lime} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Txt style={styles.aiTitle}>{ev.title}</Txt>
          <Txt style={styles.aiSub}>
            {ev.start}–{ev.end} · your strongest open window
          </Txt>
        </View>
        <View style={styles.acceptPill}>
          <Txt style={styles.acceptTxt}>Accept</Txt>
        </View>
      </Press>
    );
  }
  const c = CATS[ev.cat];
  if (compact) {
    return (
      <Press onPress={onPress} style={[styles.card2Compact, ev.conflict && styles.card2Clash]}>
        <View style={[styles.spine, { backgroundColor: c.color }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.card2CompactTop}>
            {ev.kind === 'focus' && <Icon name="shield" size={12} color={C.lime} />}
            {ev.conflict && <Icon name="triangle" size={12} color={C.orange} />}
            <Txt numberOfLines={1} style={styles.card2TitleCompact}>
              {ev.title}
            </Txt>
          </View>
          <Txt style={styles.card2MetaCompact}>
            {ev.start}–{ev.end} · {durLabel(toMin(ev.end) - toMin(ev.start))}
          </Txt>
        </View>
        <View style={[styles.catDot, { backgroundColor: c.color }]} />
      </Press>
    );
  }
  return (
    <Press onPress={onPress} style={[styles.card2, ev.conflict && styles.card2Clash]}>
      <View style={[styles.spine, { backgroundColor: c.color }]} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.card2Top}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt style={styles.card2Title}>{ev.title}</Txt>
            {!!ev.notes && <Txt style={styles.card2Notes}>{ev.notes}</Txt>}
          </View>
          <View style={[styles.catPill, { backgroundColor: rgba(c.color, 0.7) }]}>
            <Txt style={styles.catPillTxt}>{c.label}</Txt>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Icon name="clock" size={13} color={w(0.5)} />
            <Txt style={styles.metaTxt}>
              {ev.start}–{ev.end} · {durLabel(toMin(ev.end) - toMin(ev.start))}
            </Txt>
          </View>
          {!!ev.project && (
            <View style={styles.metaItem}>
              <View style={[styles.metaDot, { backgroundColor: c.color }]} />
              <Txt style={styles.metaTxt}>{ev.project}</Txt>
            </View>
          )}
          {ev.kind === 'focus' && (
            <View style={styles.metaItem}>
              <Icon name="shield" size={13} color={C.protectedOnDark} />
              <Txt style={[styles.metaTxt, { color: C.protectedOnDark }]}>Protected</Txt>
            </View>
          )}
          {ev.conflict && (
            <View style={styles.metaItem}>
              <Icon name="triangle" size={13} color={C.orange} />
              <Txt style={[styles.metaTxt, { color: C.orange }]}>Overlaps</Txt>
            </View>
          )}
        </View>
      </View>
    </Press>
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
  head: {
    flexDirection: 'row',
    gap: 12,
    borderBottomWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  headTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  headTitle: { color: '#fff', fontSize: 18, lineHeight: 24, fontWeight: '500', letterSpacing: -0.4 },
  todayPill: { borderRadius: R.full, backgroundColor: C.lime, paddingHorizontal: 8, paddingVertical: 4 },
  todayPillTxt: { color: C.surface, fontSize: 12 },
  headSub: { marginTop: 4, color: w(0.45), fontSize: 12, lineHeight: 16 },
  addBtn: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 12,
  },
  addTxt: { color: w(0.7), fontSize: 12 },

  /* ── full: phone + narrow-desktop, dark, all detail ── */
  body: {},
  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: w(0.08) },
  rowLeft: {
    borderRightWidth: 1,
    borderRightColor: w(0.08),
    paddingHorizontal: 12,
    paddingVertical: 20,
    alignItems: 'flex-end',
  },
  rowLeftTxt: { color: w(0.4), fontSize: 12 },
  rowBody: { flex: 1, padding: 12 },

  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.16),
    borderStyle: 'dashed',
    backgroundColor: w(0.04),
    padding: 12,
  },
  freeIcon: { height: 28, width: 28, borderRadius: R.full, backgroundColor: w(0.08), alignItems: 'center', justifyContent: 'center' },
  freeTxt: { color: w(0.55), fontSize: 12 },
  freeRange: { marginLeft: 'auto', color: w(0.4), fontSize: 12 },

  card2: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.04),
    padding: 16,
  },
  card2Clash: { borderColor: C.orange },
  spine: { width: 4, borderRadius: R.full, alignSelf: 'stretch' },
  card2Top: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  card2Title: { color: '#fff', fontSize: 14, lineHeight: 20, fontWeight: '500' },
  card2Notes: { marginTop: 4, color: w(0.55), fontSize: 12, lineHeight: 18 },
  catPill: { borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4 },
  catPillTxt: { color: C.surface, fontSize: 12 },
  metaRow: { marginTop: 16, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt: { color: w(0.5), fontSize: 12 },
  metaDot: { height: 6, width: 6, borderRadius: 3 },

  breakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.14),
    borderStyle: 'dashed',
    backgroundColor: w(0.04),
    padding: 16,
  },
  breakIcon: { height: 32, width: 32, borderRadius: R.full, backgroundColor: w(0.08), alignItems: 'center', justifyContent: 'center' },
  breakTitle: { color: w(0.7), fontSize: 12 },
  breakSub: { marginTop: 4, color: w(0.5), fontSize: 12 },

  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: 'rgba(32,71,230,0.5)',
    borderStyle: 'dashed',
    backgroundColor: w(0.05),
    padding: 16,
  },
  aiIcon: { height: 32, width: 32, borderRadius: R.full, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' },
  aiTitle: { color: '#fff', fontSize: 14, fontWeight: '500' },
  aiSub: { marginTop: 4, color: w(0.55), fontSize: 12 },
  acceptPill: { borderRadius: R.full, backgroundColor: C.lime, paddingHorizontal: 8, paddingVertical: 4 },
  acceptTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },

  /* ── compact: the dense, gutterless rail variant ── */
  rowCompact: { padding: 10 },

  freeRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.16),
    borderStyle: 'dashed',
    backgroundColor: w(0.03),
    padding: 10,
  },
  freeIconCompact: { height: 26, width: 26, borderRadius: R.full, backgroundColor: w(0.08), alignItems: 'center', justifyContent: 'center' },

  card2Compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.04),
    padding: 10,
  },
  card2CompactTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  card2TitleCompact: { flex: 1, color: '#fff', fontSize: 13, lineHeight: 18, fontWeight: '500' },
  card2MetaCompact: { marginTop: 3, color: w(0.45), fontSize: 11 },
  catDot: { height: 7, width: 7, borderRadius: 4 },

  breakCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.12),
    borderStyle: 'dashed',
    backgroundColor: w(0.03),
    padding: 10,
  },
  breakIconCompact: { height: 28, width: 28, borderRadius: R.full, backgroundColor: w(0.06), alignItems: 'center', justifyContent: 'center' },
  breakTitleCompact: { flex: 1, color: w(0.7), fontSize: 12 },

  aiCardCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: 'rgba(32,71,230,0.5)',
    borderStyle: 'dashed',
    backgroundColor: w(0.05),
    padding: 10,
  },
  aiTitleCompact: { color: '#fff', fontSize: 13, fontWeight: '500' },
  aiSubCompact: { marginTop: 3, color: w(0.5), fontSize: 11 },

  emptyBody: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 48, backgroundColor: C.surface },
  emptyIcon: {
    height: 56,
    width: 56,
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: 'rgba(204,255,0,0.4)',
    backgroundColor: rgba('#ccff00', 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { marginTop: 20, color: '#fff', fontSize: 16, fontWeight: '500', letterSpacing: -0.4, textAlign: 'center' },
  emptyNote: { marginTop: 8, maxWidth: 288, color: w(0.45), fontSize: 12, lineHeight: 18, textAlign: 'center' },
  emptyBtns: { marginTop: 20, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  emptyPrimary: { height: 40, borderRadius: R.lg, backgroundColor: C.lime, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  emptyPrimaryTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  emptyGhost: {
    height: 40,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGhostTxt: { color: w(0.7), fontSize: 12 },
});
