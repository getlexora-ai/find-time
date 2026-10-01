import { ScrollView, StyleSheet, View } from 'react-native';

import { fromIso, fromMin, toMin, WD, wdIndex } from '../cal-date';
import { hLabel, type Kpis } from '../kpi';
import type { CalActions } from '../state';
import { N, R, SANS, SHADOW, T } from '../tokens';
import type { CalEvent } from '../types';
import { Button, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * Insights — the numbers that used to sit over the grid (quiet calendar,
 * 2026-10-01). The planner is for looking at the week; this is for asking how
 * the week is going. Same `kpi.ts` readings, so the two cannot disagree.
 *
 *   four cards        planned · focus protected · open capacity · plan health
 *   Needs you         clashes (Resolve) and proposals (Review), one row each
 *   Where it goes     hours per category against its target
 */
export function Insights({
  k,
  clashes,
  proposals,
  scope,
  actions,
  onResolve,
}: {
  k: Kpis;
  clashes: { a: CalEvent; b: CalEvent }[];
  proposals: CalEvent[];
  /** "this week" / "today" */
  scope: string;
  actions: CalActions;
  onResolve: (pair: { a: CalEvent; b: CalEvent }) => void;
}) {
  const { isPhone } = useResponsive();
  const focusPct = k.focusGoalH ? Math.round((k.focusH / k.focusGoalH) * 100) : 0;
  const needs = clashes.length + proposals.length;

  return (
    <ScrollView style={styles.fill} contentContainerStyle={[styles.page, isPhone && styles.pagePhone]}>
      <View style={[styles.cards, isPhone && styles.cardsPhone]}>
        <Card label="Planned" value={hLabel(k.plannedH)} note={k.plannedH ? `of a ${Math.round(k.targetH)}h target` : 'Nothing planned yet'}>
          <View style={styles.track}>
            {k.byCat.map((c) =>
              c.hours > 0 ? <View key={c.key} style={{ flexGrow: c.hours, flexBasis: 0, backgroundColor: c.color }} /> : null,
            )}
            {k.plannedH < k.targetH && <View style={{ flexGrow: k.targetH - k.plannedH, flexBasis: 0 }} />}
          </View>
        </Card>

        <Card label="Focus protected" value={hLabel(k.focusH)} note={`${focusPct}% of your ${Math.round(k.focusGoalH)}h goal`}>
          <View style={styles.track}>
            <View style={{ width: `${Math.min(100, focusPct)}%`, backgroundColor: N.ink }} />
          </View>
        </Card>

        <Card
          label="Open capacity"
          value={hLabel(k.freeH)}
          note={k.best && k.best.hours > 0 ? `Most room on ${k.best.label}` : `None free ${scope}`}>
          <Bars days={k.free} best={k.best?.date} />
        </Card>

        <Card
          label="Plan health"
          value={k.clashes ? `${k.clashes} ${k.clashes === 1 ? 'clash' : 'clashes'}` : 'No clashes'}
          note={k.proposals ? `${k.proposals} proposal${k.proposals === 1 ? '' : 's'} to review` : `${k.blocks} blocks · ${k.movable} movable`}
        />
      </View>

      <Section title="Needs you" count={needs}>
        {needs === 0 ? (
          <Txt style={styles.empty}>{`Nothing needs you ${scope}.`}</Txt>
        ) : (
          <>
            {clashes.map((c) => (
              <Row
                key={`c-${c.a.id}-${c.b.id}-${c.a.date}`}
                dot={N.accent}
                title={`${c.a.title} overlaps ${c.b.title}`}
                when={when(c.b)}
                onOpen={() => actions.openEvent(c.b.id)}
                action={<Button variant="secondary" label="Resolve" onPress={() => onResolve(c)} />}
              />
            ))}
            {proposals.map((e) => (
              <Row
                key={`p-${e.id}-${e.date}`}
                dot={N.accent}
                dashed
                title={e.title}
                when={`${when(e)} · proposed`}
                onOpen={() => actions.openEvent(e.id)}
                action={<Button variant="secondary" label="Review" onPress={() => actions.openEvent(e.id)} />}
              />
            ))}
          </>
        )}
      </Section>

      <Section title="Where the time goes">
        {k.byCat.map((c) => {
          const pct = c.target ? Math.min(100, (c.hours / c.target) * 100) : 0;
          return (
            <View key={c.key} style={styles.catRow}>
              <View style={[styles.catDot, { backgroundColor: c.color }]} />
              <Txt style={styles.catName}>{c.label}</Txt>
              <View style={styles.catTrack}>
                <View style={[styles.catFill, { width: `${pct}%`, backgroundColor: c.color }]} />
              </View>
              <Txt style={styles.catNum}>
                {hLabel(c.hours)}
                <Txt style={styles.catOf}>{` / ${hLabel(c.target)}`}</Txt>
              </Txt>
            </View>
          );
        })}
      </Section>
    </ScrollView>
  );
}

/** "Wed 30 · 14:00 – 15:00" */
function when(e: CalEvent) {
  const d = fromIso(e.date);
  const day = `${WD[wdIndex(d)]} ${d.getDate()}`;
  if (e.allDay || !e.start || !e.end) return day;
  return `${day} · ${fromMin(toMin(e.start))} – ${fromMin(toMin(e.end))}`;
}

function Card({ label, value, note, children }: { label: string; value: string; note: string; children?: React.ReactNode }) {
  return (
    <View style={[styles.card, SHADOW.sm]}>
      <Txt style={styles.cardLabel}>{label}</Txt>
      <Txt style={styles.cardValue}>{value}</Txt>
      <View style={styles.cardViz}>{children}</View>
      <Txt style={styles.cardNote} numberOfLines={1}>
        {note}
      </Txt>
    </View>
  );
}

function Bars({ days, best }: { days: Kpis['free']; best?: string }) {
  const max = Math.max(...days.map((d) => d.hours), 1);
  return (
    <View style={styles.bars}>
      {days.map((d) => (
        <View key={d.date} style={styles.barCol}>
          <View style={styles.barWell}>
            <View
              style={[
                styles.bar,
                { height: `${Math.max(4, (d.hours / max) * 100)}%`, backgroundColor: d.date === best ? N.ink : N.ghost },
              ]}
            />
          </View>
          <Txt style={[styles.barLbl, d.isToday && styles.barLblToday]}>{d.label.slice(0, 1)}</Txt>
        </View>
      ))}
    </View>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Txt style={styles.sectionTitle}>{title}</Txt>
        {!!count && <Txt style={styles.sectionCount}>{count}</Txt>}
      </View>
      <View style={[styles.sectionBody, SHADOW.sm]}>{children}</View>
    </View>
  );
}

function Row({
  dot,
  dashed,
  title,
  when: w,
  onOpen,
  action,
}: {
  dot: string;
  dashed?: boolean;
  title: string;
  when: string;
  onOpen: () => void;
  action: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Press onPress={onOpen} hoverBg={N.hover} accessibilityRole="button" style={styles.rowMain}>
        <View style={[styles.rowMark, dashed ? { borderColor: dot, borderStyle: 'dashed', borderWidth: 1.5 } : { backgroundColor: dot }]} />
        <View style={styles.rowText}>
          <Txt style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Txt>
          <Txt style={styles.rowWhen} numberOfLines={1}>
            {w}
          </Txt>
        </View>
      </Press>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, backgroundColor: N.ground },
  page: { padding: 24, paddingTop: 8, gap: 28, maxWidth: 1120, width: '100%', alignSelf: 'center' },
  pagePhone: { padding: 12, gap: 20 },

  cards: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  cardsPhone: { gap: 10 },
  card: { flexGrow: 1, flexBasis: 220, backgroundColor: N.surface, borderRadius: R.xl, padding: 18, gap: 4 },
  cardLabel: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },
  cardValue: { fontFamily: SANS, ...T.kpi, color: N.ink },
  cardViz: { minHeight: 36, justifyContent: 'center' },
  cardNote: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2 },
  track: { flexDirection: 'row', height: 6, gap: 2, borderRadius: R.full, overflow: 'hidden', backgroundColor: N.sunken },

  bars: { flexDirection: 'row', gap: 6, height: 40, alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 2 },
  barWell: { height: 26, width: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  barLbl: { fontFamily: SANS, fontSize: 10, lineHeight: 12, color: N.faint },
  barLblToday: { color: N.ink, fontWeight: '600' },

  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: SANS, ...T.heading, color: N.ink },
  sectionCount: { fontFamily: SANS, fontSize: 13, color: N.muted },
  sectionBody: { backgroundColor: N.surface, borderRadius: R.xl, paddingVertical: 6, paddingHorizontal: 6 },
  empty: { fontFamily: SANS, fontSize: 14, color: N.muted, padding: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: R.lg },
  rowMark: { width: 10, height: 10, borderRadius: 3 },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink },
  rowWhen: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted, fontVariant: ['tabular-nums'] },

  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10 },
  catDot: { width: 10, height: 10, borderRadius: 3 },
  catName: { width: 110, fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.ink },
  catTrack: { flex: 1, height: 6, borderRadius: R.full, backgroundColor: N.sunken, overflow: 'hidden' },
  catFill: { height: 6, borderRadius: R.full },
  catNum: { width: 110, textAlign: 'right', fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink, fontVariant: ['tabular-nums'] },
  catOf: { fontWeight: '400', color: N.faint },
});
