import { StyleSheet, View } from 'react-native';

import { hLabel, type Kpis } from '../kpi';
import { N, R, SANS } from '../tokens';
import { Label, MiniBracket, Mono, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * The four readings above the grid (B artboard; reference artifact's KPI strip).
 * Label → value → one small chart → one line of context. Every number comes
 * from the events the grid is drawing (kpi.ts), so they cannot disagree.
 * Monochrome: the charts are ink on grey, like everything else.
 */
export function KpiStrip({ k, onResolve }: { k: Kpis; onResolve?: () => void }) {
  const { isDesktop, isPhone } = useResponsive();
  const scope = k.dayCount === 1 ? 'today' : 'this week';
  // Phone: label and number only. The charts and context lines cost the grid
  // ~80px of an 844px screen; the numbers are what you glance at there.
  const full = !isPhone;
  const empty = k.plannedH === 0 && k.proposals === 0;
  const resolve =
    k.clashes > 0 && onResolve ? (
      <Press onPress={onResolve} hoverBg={N.hover} hitSlop={10} accessibilityRole="button" style={styles.resolve}>
        <Mono style={styles.resolveTxt}>RESOLVE →</Mono>
      </Press>
    ) : null;

  return (
    <View style={styles.strip}>
      <Cell wide={isDesktop} i={0}>
        <MiniBracket />
        <Label>Planned</Label>
        <Value n={hLabel(k.plannedH)} />
        {full && <Stack k={k} />}
        {full && <Sub>{empty ? 'Nothing planned yet' : `of a ${Math.round(k.targetH)}h target`}</Sub>}
      </Cell>

      <Cell wide={isDesktop} i={1}>
        <Label>Focus protected</Label>
        <Value n={hLabel(k.focusH)} />
        {full && <Meter value={k.focusH} goal={k.focusGoalH} />}
        {full && (
          <Sub>
            {`goal ${Math.round(k.focusGoalH)}h · ${k.focusGoalH ? Math.round((k.focusH / k.focusGoalH) * 100) : 0}%`}
          </Sub>
        )}
      </Cell>

      <Cell wide={isDesktop} i={2}>
        <Label>Open capacity</Label>
        <Value n={hLabel(k.freeH)} />
        {full && <Spark days={k.free} bestDate={k.best?.date} />}
        {full && (
          <Sub>{k.best && k.best.hours > 0 ? `most on ${k.best.label} · in working hours` : `none free ${scope}`}</Sub>
        )}
      </Cell>

      <Cell wide={isDesktop} i={3}>
        <Label>Plan health</Label>
        {full ? (
          <>
            <Value n={String(k.clashes)} unit={k.clashes === 1 ? 'clash' : 'clashes'} />
            <View style={styles.healthRow}>{resolve ?? <View style={styles.healthBar} />}</View>
            <Sub>
              {k.proposals ? (
                <Txt style={styles.subStrong}>{`${k.proposals} proposal${k.proposals === 1 ? '' : 's'} waiting for you`}</Txt>
              ) : (
                `${k.blocks} block${k.blocks === 1 ? '' : 's'} · ${k.movable} movable`
              )}
            </Sub>
          </>
        ) : (
          <View style={styles.healthPhone}>
            <Value n={String(k.clashes)} unit={k.clashes === 1 ? 'clash' : 'clashes'} />
            {resolve}
          </View>
        )}
      </Cell>
    </View>
  );
}

function Cell({ children, wide, i }: { children: React.ReactNode; wide: boolean; i: number }) {
  const { isPhone } = useResponsive();
  return (
    <View
      style={[
        styles.cell,
        isPhone && styles.cellPhone,
        wide ? styles.cellWide : styles.cellHalf,
        (wide ? i < 3 : i % 2 === 0) && styles.divider,
        !wide && i < 2 && styles.rowDivider,
      ]}>
      {children}
    </View>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return (
    <Txt numberOfLines={1} style={styles.sub}>
      {children}
    </Txt>
  );
}

function Value({ n, unit }: { n: string; unit?: string }) {
  const { isPhone } = useResponsive();
  // "6h 30m" → big "6h 30", small "m" would be fussy; split the trailing unit letter only.
  const m = /^(\d+)(h|m)?(?: (\d+)m)?$/.exec(n);
  return (
    <View style={styles.valueRow}>
      {m ? (
        <>
          <Txt style={[styles.value, isPhone && styles.valuePhone]}>{m[1]}</Txt>
          {m[2] && <Txt style={[styles.unit, isPhone && styles.unitPhone]}>{m[2]}</Txt>}
          {m[3] && (
            <>
              <Txt style={[styles.value, isPhone && styles.valuePhone, { marginLeft: 4 }]}>{m[3]}</Txt>
              <Txt style={[styles.unit, isPhone && styles.unitPhone]}>m</Txt>
            </>
          )}
        </>
      ) : (
        <Txt style={[styles.value, isPhone && styles.valuePhone]}>{n}</Txt>
      )}
      {!!unit && <Txt style={[styles.unit, isPhone && styles.unitPhone, { marginLeft: 6 }]}>{unit}</Txt>}
    </View>
  );
}

/** Planned hours split by category, as greys (colour comes later, from CATS). */
function Stack({ k }: { k: Kpis }) {
  return (
    <View style={styles.track}>
      {k.byCat.map((c) =>
        c.hours > 0 ? <View key={c.key} style={[styles.seg, { backgroundColor: c.color, flexGrow: c.hours }]} /> : null,
      )}
      {k.plannedH < k.targetH && <View style={[styles.seg, { flexGrow: Math.max(0, k.targetH - k.plannedH) }]} />}
    </View>
  );
}

function Meter({ value, goal }: { value: number; goal: number }) {
  const scale = Math.max(value, goal, 0.01);
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${(value / scale) * 100}%` }]} />
      <View style={[styles.tick, { left: `${(goal / scale) * 100}%` }]} />
    </View>
  );
}

function Spark({ days, bestDate }: { days: { date: string; hours: number }[]; bestDate?: string }) {
  const max = Math.max(...days.map((d) => d.hours), 1);
  return (
    <View style={styles.spark}>
      {days.map((d) => (
        <View
          key={d.date}
          style={[
            styles.sparkBar,
            { height: Math.max(2, (d.hours / max) * 14) },
            { backgroundColor: d.date === bestDate ? N.ink : N.ghost },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: 1, borderBottomColor: N.line },
  cell: { position: 'relative', minWidth: 0, paddingVertical: 16, paddingHorizontal: 22, gap: 6 },
  cellPhone: { paddingVertical: 8, paddingHorizontal: 12, gap: 2 },
  cellWide: { flexGrow: 1, flexBasis: 0 },
  cellHalf: { width: '50%' },
  divider: { borderRightWidth: 1, borderRightColor: N.line },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: N.line },
  valueRow: { flexDirection: 'row', alignItems: 'baseline' },
  value: { fontFamily: SANS, fontSize: 30, lineHeight: 32, fontWeight: '600', letterSpacing: -0.9, color: N.ink },
  valuePhone: { fontSize: 20, lineHeight: 24, letterSpacing: -0.5 },
  unit: { fontFamily: SANS, fontSize: 16, lineHeight: 20, fontWeight: '600', color: N.ink },
  unitPhone: { fontSize: 13 },
  sub: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },
  subStrong: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.ink, fontWeight: '500' },
  track: { flexDirection: 'row', height: 3, gap: 2, backgroundColor: N.sunken, marginVertical: 2 },
  seg: { flexBasis: 0, height: 3 },
  fill: { height: 3, backgroundColor: N.ink },
  tick: { position: 'absolute', top: -3, width: 1, height: 9, backgroundColor: N.faint },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 14 },
  sparkBar: { flexGrow: 1, flexBasis: 0, borderRadius: 1 },
  healthRow: { height: 14, justifyContent: 'center' },
  healthPhone: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  healthBar: { height: 3, backgroundColor: N.sunken, marginVertical: 2 },
  resolve: { alignSelf: 'flex-start', borderRadius: R.xs, paddingHorizontal: 2 },
  resolveTxt: { color: N.accentInk, fontSize: 10 },
});
