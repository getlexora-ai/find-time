import { StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { hLabel, type Kpis } from '../kpi';
import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import { MONO, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * The instrument panel above the grid.
 *
 * Four readings, one row, hairline-divided — the state of the period you are
 * looking at, answered before you read a single block: how the hours split,
 * whether deep work actually got protected, where the room is, and whether the
 * plan is sound. Everything is computed from the events the grid draws
 * (`kpi.ts`), so the panel and the grid can never disagree.
 *
 * Each cell is label → value → one small chart → one line of context. The chart
 * is the point: "18h planned" is a number, but the stacked bar underneath is
 * the answer to "on what?", and it costs seven pixels.
 */
export function KpiStrip({ k, onResolve }: { k: Kpis; onResolve?: () => void }) {
  const { theme } = useCalTheme();
  const { isDesktop } = useResponsive();
  const scope = k.dayCount === 1 ? 'today' : 'this week';
  const wide = isDesktop;

  return (
    <View style={[styles.strip, { borderBottomColor: w(0.1), backgroundColor: theme.chrome }]}>
      {/* ── 1. where the hours went ── */}
      <Cell wide={wide} first>
        <Label>Planned</Label>
        <Value n={hLabel(k.plannedH)} unit={`/ ${Math.round(k.targetH)}h target`} />
        <View style={styles.stack}>
          {k.byCat.map((c) =>
            c.hours > 0 ? (
              <View
                key={c.key}
                style={[styles.stackSeg, { backgroundColor: c.color, flexGrow: c.hours }]}
              />
            ) : null,
          )}
          {k.plannedH === 0 && <View style={[styles.stackSeg, styles.stackEmpty]} />}
        </View>
        <Sub>{k.lead ? `${k.lead.label} leads · ${hLabel(k.lead.hours)}` : 'nothing planned'}</Sub>
      </Cell>

      {/* ── 2. did deep work survive the week ── */}
      <Cell wide={wide}>
        <Label>Focus protected</Label>
        <Value n={hLabel(k.focusH)} unit={`/ ${Math.round(k.focusGoalH)}h goal`} />
        <Meter value={k.focusH} goal={k.focusGoalH} />
        <Sub>
          {k.focusBlocks
            ? `${k.focusBlocks} block${k.focusBlocks === 1 ? '' : 's'} · longest ${hLabel(k.focusLongestH)}`
            : 'none held'}
        </Sub>
      </Cell>

      {/* ── 3. where the room actually is ── */}
      <Cell wide={wide}>
        <Label>Open capacity</Label>
        <Value n={hLabel(k.freeH)} unit={`free ${scope}`} />
        <Spark days={k.free} bestDate={k.best?.date} />
        <Sub>
          {k.best && k.best.hours > 0
            ? `largest gap ${k.best.label} · ${hLabel(k.best.hours)}`
            : 'no open window'}
        </Sub>
      </Cell>

      {/* ── 4. is the plan sound ── */}
      <Cell wide={wide} last>
        <Label>Plan health</Label>
        <Value
          n={String(k.clashes)}
          unit={`clash${k.clashes === 1 ? '' : 'es'}${k.proposals ? ` · ${k.proposals} proposed` : ''}`}
        />
        <View style={styles.pills}>
          {k.clashes > 0 ? (
            <Press
              onPress={onResolve}
              hoverBg="rgba(255,68,0,0.2)"
              style={[styles.pill, styles.pillCrit]}
              accessibilityRole="button"
              aria-label={`Resolve ${k.clashes} clash${k.clashes === 1 ? '' : 'es'}`}>
              <Icon name="triangle" size={10} color={C.orange} />
              <Txt style={[styles.pillTxt, { color: C.orange }]}>Resolve</Txt>
            </Press>
          ) : (
            <View style={[styles.pill, styles.pillGood]}>
              <Icon name="check" size={10} color={C.lime} />
              <Txt style={[styles.pillTxt, { color: C.lime }]}>Clear</Txt>
            </View>
          )}
        </View>
        <Sub>
          {k.blocks} block{k.blocks === 1 ? '' : 's'} · {k.movable} movable
        </Sub>
      </Cell>
    </View>
  );
}

/* ───────────────────────── parts ───────────────────────── */

/**
 * On desktop the four cells share one row. Below that they wrap to a 2×2 so
 * each value keeps its own line instead of truncating — the panel is useless
 * the moment "18h 30m" becomes "18h…".
 */
function Cell({
  children,
  wide,
  first,
  last,
}: {
  children: React.ReactNode;
  wide: boolean;
  first?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.cell,
        wide ? styles.cellWide : styles.cellHalf,
        !last && styles.cellDivider,
        first && styles.cellFirst,
      ]}>
      {children}
    </View>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <Txt style={styles.label}>{children}</Txt>
);

const Sub = ({ children }: { children: React.ReactNode }) => (
  <Txt numberOfLines={1} style={styles.sub}>
    {children}
  </Txt>
);

/** Big tabular figure plus its quiet denominator, on one baseline. */
function Value({ n, unit }: { n: string; unit: string }) {
  return (
    <View style={styles.valueRow}>
      <Txt style={styles.value}>{n}</Txt>
      <Txt numberOfLines={1} style={styles.unit}>
        {unit}
      </Txt>
    </View>
  );
}

/**
 * Progress against the focus goal. The track is scaled to whichever is larger —
 * the hours held or the goal — so overshooting is visible as a tick that sits
 * short of the fill, rather than a bar that silently pins at 100%.
 */
function Meter({ value, goal }: { value: number; goal: number }) {
  const scale = Math.max(value, goal, 0.01);
  return (
    <View style={styles.meter}>
      <View style={[styles.meterFill, { width: `${(value / scale) * 100}%` }]} />
      <View style={[styles.meterTick, { left: `${(goal / scale) * 100}%` }]} />
    </View>
  );
}

/** One bar per day of open time; the roomiest day is the lime one. */
function Spark({
  days,
  bestDate,
}: {
  days: { date: string; hours: number; isToday: boolean }[];
  bestDate?: string;
}) {
  const max = Math.max(...days.map((d) => d.hours), 1);
  return (
    <View style={styles.spark}>
      {days.map((d) => (
        <View
          key={d.date}
          style={[
            styles.sparkBar,
            { height: Math.max(2, (d.hours / max) * 20) },
            d.date === bestDate
              ? styles.sparkBest
              : d.isToday
                ? styles.sparkToday
                : styles.sparkIdle,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, zIndex: 30 },
  cell: { minWidth: 0, paddingVertical: 10, paddingHorizontal: 14 },
  cellWide: { flexGrow: 1, flexBasis: 0 },
  cellHalf: { width: '50%' },
  // Hairline between readings — lighter than the strip's own bottom edge so the
  // four cells read as one instrument, not four cards.
  cellDivider: { borderRightWidth: 1, borderRightColor: w(0.05) },
  cellFirst: { paddingLeft: 16 },

  label: {
    fontFamily: MONO,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: w(0.35),
    marginBottom: 5,
  },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, minWidth: 0 },
  value: {
    fontSize: 19,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.4,
    color: '#fff',
    fontVariant: ['tabular-nums'],
  },
  unit: { flexShrink: 1, fontSize: 11, lineHeight: 16, color: w(0.35) },
  sub: { fontFamily: MONO, fontSize: 10, lineHeight: 14, color: w(0.3), marginTop: 5 },

  stack: { flexDirection: 'row', gap: 2, height: 6, marginTop: 8 },
  stackSeg: { flexBasis: 0, borderRadius: 2 },
  stackEmpty: { flexGrow: 1, backgroundColor: w(0.07) },

  meter: {
    height: 6,
    marginTop: 8,
    borderRadius: 3,
    backgroundColor: w(0.07),
    justifyContent: 'center',
  },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: C.lime },
  meterTick: { position: 'absolute', top: -2, bottom: -2, width: 1.5, backgroundColor: w(0.5) },

  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 20, marginTop: 6 },
  sparkBar: { flexGrow: 1, flexBasis: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  sparkBest: { backgroundColor: C.lime },
  sparkToday: { backgroundColor: w(0.4) },
  sparkIdle: { backgroundColor: w(0.13) },

  pills: { flexDirection: 'row', gap: 6, marginTop: 8, height: 20, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: R.sm,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  pillCrit: { borderColor: 'rgba(255,68,0,0.4)', backgroundColor: 'rgba(255,68,0,0.12)' },
  pillGood: { borderColor: 'rgba(204,255,0,0.32)', backgroundColor: 'rgba(204,255,0,0.1)' },
  pillTxt: { fontFamily: MONO, fontSize: 9, lineHeight: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
});
