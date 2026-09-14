import { StyleSheet, View } from 'react-native';

import { acceptEvent, byDate } from '../cal-store';
import { fromMin, iso, MO, sameDay, today, toMin, wdIndex, WD_LONG } from '../cal-date';
import { Icon } from '../Icon';
import { KindGlyph, KindRail, paint } from '../kinds';
import type { CalActions } from '../state';
import { useCalTheme } from '../theme-context';
import { CATS, C, DAY_END, DAY_START, durLabel, R, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';

/**
 * The day agenda — the list counterpart of the time grid.
 *
 *  - default  — full width, with a time gutter down the left and the meta row.
 *  - compact  — denser and gutterless, for the Day-view rail.
 *
 * Both are now one card. This file used to carry six hand-written card
 * variants (break / ai / event, each duplicated for compact) that between them
 * only ever distinguished three kinds; every one of them is replaced by the
 * shared `paint()` + `KindRail` treatment, so the agenda and the grid cannot
 * drift apart again.
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
  const list = byDate(events, iso(date));
  const isToday = sameDay(date, today());
  const planned = list
    .filter((e) => e.kind !== 'break' && e.kind !== 'ai')
    .reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);
  const free = (DAY_END - DAY_START) * 60 - list.reduce((s, e) => s + toMin(e.end) - toMin(e.start), 0);

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
          {list.length ? `Planned ${durLabel(planned)} · free ${durLabel(free)}` : 'Nothing booked'}
        </Txt>
      </View>
      <Press
        onPress={() => actions.openCompose(null, iso(date))}
        hoverBg={w(0.1)}
        style={styles.addBtn}
        aria-label={`Add a block on ${iso(date)}`}>
        <Icon name="add" size={16} color={w(0.7)} />
        {!compact && <Txt style={styles.addTxt}>Add</Txt>}
      </Press>
    </View>
  );

  if (!list.length) {
    return (
      <View style={[styles.card, { borderColor: theme.panelBorder }]}>
        {head}
        <View style={[styles.emptyBody, { backgroundColor: theme.recessed }]}>
          <Txt style={styles.emptyTitle}>Nothing booked. That is space, not a gap.</Txt>
          <View style={styles.emptyBtns}>
            <Press
              onPress={() => actions.openCompose(null, iso(date))}
              hoverBg={C.limeHover}
              style={styles.emptyPrimary}>
              <Txt style={styles.emptyPrimaryTxt}>Add a block</Txt>
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
        <Row key={`gap-${idx}`} left={fromMin(gapStart)} compact={compact}>
          <Press
            onPress={() => actions.openCompose(null, iso(date), fromMin(gapStart))}
            hoverBg={w(0.06)}
            style={styles.freeRow}>
            <Icon name="add" size={14} color={w(0.45)} />
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
      <Row key={ev.id} left={ev.start} compact={compact}>
        <AgendaCard
          ev={ev}
          compact={compact}
          onPress={() => actions.openEvent(ev.id)}
          onAccept={() => {
            acceptEvent(ev.id);
            actions.toast('Block accepted');
          }}
        />
      </Row>,
    );
  });

  return (
    <View style={[styles.card, { borderColor: theme.panelBorder }]}>
      {head}
      <View style={{ backgroundColor: theme.recessed }}>{rows}</View>
    </View>
  );
}

function Row({ left, compact, children }: { left: string; compact?: boolean; children: React.ReactNode }) {
  // Compact drops the gutter: every card already carries its own time, so in a
  // narrow rail the gutter was a dead strip down the left.
  if (compact) return <View style={[styles.row, styles.rowCompact]}>{children}</View>;
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Txt style={styles.rowLeftTxt}>{left}</Txt>
      </View>
      <View style={styles.rowBody}>{children}</View>
    </View>
  );
}

/**
 * One card for every kind. The kind sets the rail, fill and glyph; the only
 * conditional left is the Accept action, which genuinely exists for proposals
 * and nothing else.
 */
function AgendaCard({
  ev,
  compact,
  onPress,
  onAccept,
}: {
  ev: CalEvent;
  compact?: boolean;
  onPress: () => void;
  onAccept: () => void;
}) {
  const p = paint(ev, ev.conflict);
  const dur = durLabel(toMin(ev.end) - toMin(ev.start));

  return (
    <Press
      onPress={onPress}
      hoverBg={w(0.06)}
      style={[
        styles.evCard,
        compact && styles.evCardCompact,
        { backgroundColor: p.fill, borderColor: p.border, borderStyle: p.borderStyle },
        ev.conflict && styles.clash,
        p.spec.ring ? { borderColor: p.spec.ring } : null,
      ]}>
      <KindRail p={p} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.evTop}>
          <KindGlyph p={p} size={13} />
          <Txt numberOfLines={compact ? 1 : undefined} style={[styles.evTitle, { color: p.title }]}>
            {ev.title}
          </Txt>
          {ev.conflict && <Icon name="triangle" size={13} color={C.orange} />}
        </View>

        <View style={styles.metaRow}>
          {/* The kind, spelled out. The rail says it at a glance; this says it
              unambiguously, and is what makes the legend learnable. */}
          <Txt style={[styles.kindTag, { color: p.tint }]}>{p.spec.label.toUpperCase()}</Txt>
          <Txt style={[styles.metaTxt, { color: p.meta }]}>
            {ev.start}–{ev.end} · {dur}
          </Txt>
          {!compact && ev.kind !== 'break' && ev.kind !== 'routine' && (
            <View style={styles.metaItem}>
              <View style={[styles.metaDot, { backgroundColor: CATS[ev.cat].color }]} />
              <Txt style={styles.metaTxt}>{ev.project || CATS[ev.cat].label}</Txt>
            </View>
          )}
        </View>

        {!compact && !!ev.notes && <Txt style={styles.evNotes}>{ev.notes}</Txt>}
      </View>

      {ev.kind === 'ai' && (
        <Press onPress={onAccept} hoverBg={C.limeHover} style={styles.acceptPill}>
          <Txt style={styles.acceptTxt}>Accept</Txt>
        </Press>
      )}
    </Press>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
  head: {
    flexDirection: 'row',
    gap: 12,
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  headTitleRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  headTitle: { color: '#fff', fontSize: 15, lineHeight: 20, fontWeight: '500', letterSpacing: -0.3 },
  todayPill: { borderRadius: R.sm, backgroundColor: w(0.12), paddingHorizontal: 6, paddingVertical: 2 },
  todayPillTxt: { color: '#fff', fontSize: 10, lineHeight: 14, letterSpacing: 0.8 },
  headSub: { marginTop: 3, color: w(0.42), fontSize: 11, lineHeight: 15 },
  addBtn: {
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 10,
  },
  addTxt: { color: w(0.7), fontSize: 11 },

  row: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: w(0.07) },
  rowCompact: { padding: 8 },
  rowLeft: {
    width: 60,
    borderRightWidth: 1,
    borderRightColor: w(0.07),
    paddingHorizontal: 10,
    paddingVertical: 14,
    alignItems: 'flex-end',
  },
  rowLeftTxt: { color: w(0.35), fontSize: 11 },
  rowBody: { flex: 1, padding: 8 },

  freeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.14),
    borderStyle: 'dashed',
    padding: 9,
  },
  freeTxt: { color: w(0.5), fontSize: 11 },
  freeRange: { marginLeft: 'auto', color: w(0.35), fontSize: 11 },

  evCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: R.md,
    borderWidth: 1,
    padding: 10,
  },
  evCardCompact: { padding: 8, gap: 8 },
  clash: { borderColor: C.orange },
  evTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  evTitle: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  evNotes: { marginTop: 6, color: w(0.45), fontSize: 11, lineHeight: 16 },
  metaRow: { marginTop: 5, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaTxt: { color: w(0.45), fontSize: 11 },
  metaDot: { height: 5, width: 5, borderRadius: 3 },
  kindTag: { fontSize: 9, lineHeight: 13, letterSpacing: 1.4 },

  acceptPill: { borderRadius: R.sm, backgroundColor: C.lime, paddingHorizontal: 8, paddingVertical: 4 },
  acceptTxt: { color: C.surface, fontSize: 11, fontWeight: '500' },

  emptyBody: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 32 },
  emptyTitle: { color: w(0.75), fontSize: 13, textAlign: 'center' },
  emptyBtns: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  emptyPrimary: {
    height: 34,
    borderRadius: R.md,
    backgroundColor: C.lime,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPrimaryTxt: { color: C.surface, fontSize: 11, fontWeight: '500' },
  emptyGhost: {
    height: 34,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyGhostTxt: { color: w(0.7), fontSize: 11 },
});
