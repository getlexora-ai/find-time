import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, ScrollView, StyleSheet, type TextStyle, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { fromIso, fromMin, iso, MO, nowMin as nowMinOf, toMin, today, WD, wdIndex } from '../cal-date';
import { type Hours } from '../hours';
import { Icon, type IconName } from '../Icon';
import {
  clock,
  type DayRead,
  deltaHm,
  type Gap,
  gapsAhead,
  headline,
  hm,
  type Insight,
  OPEN_MIN,
  pct,
  readInsight,
} from '../insights';
import { type Kpis } from '../kpi';
import type { CalActions, ViewKind } from '../state';
import { BREAK_COLOR, CATS, HATCH, N, R, SANS, SHADOW, T, tint } from '../tokens';
import type { CalEvent } from '../types';
import { Button, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * Insights — how the week (or the day) is going, as opposed to the planner,
 * which is for looking at it. Two horizons, one page; the Week | Day switch is
 * the planner's own view, so arrows and Today move both together.
 *
 *   headline    two true sentences + where the working time goes
 *   four tiles  week: booked · focus · meetings · focus-ready (vs last week)
 *               day:  booked · still open · meetings · focus
 *   Needs you   clashes and proposals, only when there are any
 *   the map     week: seven rows of the day's shape · day: one big timeline
 *   lower pair  week: categories vs target · rhythm
 *               day:  agenda · open windows
 *
 * Readings come from `insights.ts` (shape of each day) and `kpi.ts` (totals,
 * targets), both cut from the same events the grid draws.
 */
export function Insights({
  k,
  events,
  days,
  hours,
  view,
  clashes,
  proposals,
  actions,
  onResolve,
}: {
  k: Kpis;
  events: CalEvent[];
  /** the exact days on screen */
  days: string[];
  hours: Hours;
  view: ViewKind;
  clashes: { a: CalEvent; b: CalEvent }[];
  proposals: CalEvent[];
  actions: CalActions;
  onResolve: (pair: { a: CalEvent; b: CalEvent }) => void;
}) {
  const { isPhone } = useResponsive();
  const todayIso = iso(today());
  const now = nowMinOf();
  const ins = useMemo(() => readInsight(events, days, hours, todayIso), [events, days, hours, todayIso]);
  const head = headline(ins, k, now);
  const isDay = view === 'day';
  const needs = clashes.length + proposals.length;
  const [allNeeds, setAllNeeds] = useState(false);

  return (
    <ScrollView style={styles.fill} contentContainerStyle={[styles.page, isPhone && styles.pagePhone]}>
      {isPhone && <ViewSwitch view={view} actions={actions} />}

      <Hero ins={ins} k={k} head={head} isDay={isDay} needs={needs} isPhone={isPhone} />

      <View style={[styles.tiles, isPhone && styles.tilesPhone]}>
        {isDay ? <DayTiles d={ins.days[0]} now={now} /> : <WeekTiles ins={ins} k={k} />}
      </View>

      {needs > 0 && (
        <Section
          title="Needs you"
          count={needs}
          aside={needs > NEEDS_SHOWN ? <Button variant="ghost" label={allNeeds ? 'Show fewer' : `Show all ${needs}`} onPress={() => setAllNeeds((v) => !v)} /> : null}>
          {clashes.slice(0, allNeeds ? undefined : NEEDS_SHOWN).map((c) => (
            <Row
              key={`c-${c.a.id}-${c.b.id}-${c.a.date}`}
              mark={<View style={[styles.rowMark, { backgroundColor: N.accent }]} />}
              title={`${c.a.title} overlaps ${c.b.title}`}
              sub={when(c.b)}
              onOpen={() => actions.openEvent(c.b.id)}
              action={<Button variant="secondary" label="Resolve" onPress={() => onResolve(c)} />}
            />
          ))}
          {proposals.slice(0, allNeeds ? undefined : Math.max(0, NEEDS_SHOWN - clashes.length)).map((e) => (
            <Row
              key={`p-${e.id}-${e.date}`}
              mark={<View style={[styles.rowMark, styles.rowMarkDashed]} />}
              title={e.title}
              sub={`${when(e)} · proposed by AI`}
              onOpen={() => actions.openEvent(e.id)}
              action={<Button variant="secondary" label="Review" onPress={() => actions.openEvent(e.id)} />}
            />
          ))}
        </Section>
      )}

      {isDay ? (
        <Section title="The day" aside={<Legend />}>
          <View style={styles.mapPad}>
            <DayTimeline d={ins.days[0]} hours={hours} now={now} actions={actions} />
          </View>
        </Section>
      ) : (
        <WeekMap ins={ins} hours={hours} now={now} actions={actions} isPhone={isPhone} />
      )}

      <View style={[styles.pair, isPhone && styles.pairPhone]}>
        {isDay ? (
          <>
            <Agenda d={ins.days[0]} now={now} actions={actions} />
            <OpenWindows d={ins.days[0]} now={now} actions={actions} />
          </>
        ) : (
          <>
            <Categories k={k} />
            <Rhythm ins={ins} />
          </>
        )}
      </View>
    </ScrollView>
  );
}

/* ───────────────────────── headline ───────────────────────── */

function Hero({
  ins,
  k,
  head,
  isDay,
  needs,
  isPhone,
}: {
  ins: Insight;
  k: Kpis;
  head: { lead: string; sub: string };
  isDay: boolean;
  needs: number;
  isPhone: boolean;
}) {
  const first = fromIso(ins.days[0].date);
  const last = fromIso(ins.days[ins.days.length - 1].date);
  const eyebrow = isDay
    ? `${ins.days[0].isToday ? 'Today' : ins.days[0].long} · ${first.getDate()} ${MO[first.getMonth()]}`
    : `This week · ${first.getDate()} ${MO[first.getMonth()].slice(0, 3)} – ${last.getDate()} ${MO[last.getMonth()].slice(0, 3)}`;
  const t = ins.totals;

  // Working time, split by what it went to, then what is still open. Categories
  // use kpi.ts hours (booked anywhere); the open part is free working time.
  const parts = k.byCat.filter((c) => c.hours > 0);
  const openMin = t.freeMin;
  const whole = parts.reduce((a, c) => a + c.hours * 60, 0) + t.breakMin + openMin;

  return (
    <View style={[styles.hero, SHADOW.sm, isPhone && styles.heroPhone]}>
      <View style={styles.heroTop}>
        <View style={styles.heroText}>
          <Txt style={styles.eyebrow}>{eyebrow}</Txt>
          <Txt style={[styles.lead, isPhone && styles.leadPhone]}>{head.lead}</Txt>
          {!!head.sub && <Txt style={styles.sub}>{head.sub}</Txt>}
        </View>
        {needs === 0 && (
          <View style={styles.clear}>
            <Icon name="check" size={14} color={N.ink2} />
            <Txt style={styles.clearTxt}>No clashes, nothing to review</Txt>
          </View>
        )}
      </View>

      {whole > 0 && (
        <View style={styles.capWrap}>
          <View style={styles.cap} accessibilityLabel="Where your time goes">
            {parts.map((c) => (
              <View key={c.key} style={{ flexGrow: c.hours * 60, flexBasis: 0, backgroundColor: c.color }} />
            ))}
            {t.breakMin > 0 && <View style={{ flexGrow: t.breakMin, flexBasis: 0, backgroundColor: BREAK_COLOR }} />}
            {openMin > 0 && <View style={[{ flexGrow: openMin, flexBasis: 0 }, styles.capOpen, HATCH.off]} />}
          </View>
          <View style={styles.capLegend}>
            {parts.map((c) => (
              <View key={c.key} style={styles.capItem}>
                <View style={[styles.sq, { backgroundColor: c.color }]} />
                <Txt style={styles.capName}>{c.label}</Txt>
                <Txt style={styles.capNum}>{hm(c.hours * 60)}</Txt>
              </View>
            ))}
            {t.breakMin > 0 && (
              <View style={styles.capItem}>
                <View style={[styles.sq, { backgroundColor: BREAK_COLOR }]} />
                <Txt style={styles.capName}>Breaks</Txt>
                <Txt style={styles.capNum}>{hm(t.breakMin)}</Txt>
              </View>
            )}
            {openMin > 0 && (
              <View style={styles.capItem}>
                <View style={[styles.sq, styles.sqOpen]} />
                <Txt style={styles.capName}>Open</Txt>
                <Txt style={styles.capNum}>{hm(openMin)}</Txt>
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  );
}

/* ───────────────────────── tiles ───────────────────────── */

function WeekTiles({ ins, k }: { ins: Insight; k: Kpis }) {
  const t = ins.totals;
  const p = ins.prev;
  const goalMin = k.focusGoalH * 60;
  return (
    <>
      <Tile
        icon="calendar"
        label="Booked"
        value={hm(t.inWorkMin)}
        delta={p ? { min: t.inWorkMin - p.inWorkMin } : null}
        note={`of ${hm(t.workMin)} working · ${pct(t.inWorkMin, t.workMin)}%`}>
        <DayBars days={ins.days} get={(d) => (d.workMin ? d.inWorkMin / d.workMin : 0)} hi={ins.busiest?.date} />
      </Tile>
      <Tile
        icon="target"
        label="Focus protected"
        value={hm(t.focusMin)}
        delta={p ? { min: t.focusMin - p.focusMin } : null}
        note={`${pct(t.focusMin, goalMin)}% of ${hm(goalMin)} goal · longest ${hm(Math.max(...ins.days.map((d) => d.focusLongestMin)))}`}
        ring={t.focusMin / Math.max(1, goalMin)}
      />
      <Tile
        icon="users"
        label="Meetings"
        value={hm(t.meetingMin)}
        delta={p ? { min: t.meetingMin - p.meetingMin, upIsBad: true } : null}
        note={`${t.meetings} meeting${t.meetings === 1 ? '' : 's'} · ${pct(t.meetingMin, t.workMin)}% of working time`}>
        <DayBars days={ins.days} get={(d) => (d.workMin ? d.meetingMin / d.workMin : 0)} color={CATS.sync.color} />
      </Tile>
      <Tile
        icon="bolt"
        label="Focus-ready time"
        value={hm(t.readyMin)}
        delta={p ? { min: t.readyMin - p.readyMin } : null}
        note={`${t.readyCount} open window${t.readyCount === 1 ? '' : 's'} of 1h or more`}>
        <DayBars days={ins.days} get={(d) => (d.workMin ? d.readyMin / d.workMin : 0)} color={CATS.deep.color} />
      </Tile>
    </>
  );
}

function DayTiles({ d, now }: { d: DayRead; now: number }) {
  const ahead = gapsAhead(d, now);
  const aheadMin = ahead.reduce((a, g) => a + g.t - g.s, 0);
  const next = ahead.find((g) => g.t - g.s >= OPEN_MIN);
  return (
    <>
      <Tile
        icon="calendar"
        label="Booked"
        value={hm(d.inWorkMin)}
        note={d.work ? `of ${hm(d.workMin)} working · ${pct(d.inWorkMin, d.workMin)}%` : `Day off · ${hm(d.bookedMin)} booked`}
        ring={d.workMin ? d.inWorkMin / d.workMin : undefined}
      />
      <Tile
        icon="clock"
        label={d.isToday ? 'Still open today' : 'Open'}
        value={d.isPast ? '—' : hm(aheadMin)}
        note={d.isPast ? 'This day has passed' : next ? `Next: ${clock(next.s)} for ${hm(next.t - next.s)}` : 'No window of 30m or more'}
      />
      <Tile
        icon="users"
        label="Meetings"
        value={String(d.meetings)}
        note={
          d.meetings
            ? `${hm(d.meetingMin)}${d.b2bRuns ? ` · ${d.b2bRuns} back-to-back run${d.b2bRuns === 1 ? '' : 's'}` : ' · none back to back'}`
            : 'None booked'
        }
      />
      <Tile
        icon="target"
        label="Focus"
        value={hm(d.focusMin)}
        note={d.focusMin ? `Longest block ${hm(d.focusLongestMin)}` : 'No focus block booked'}
      />
    </>
  );
}

function Tile({
  icon,
  label,
  value,
  note,
  delta,
  ring,
  children,
}: {
  icon: IconName;
  label: string;
  value: string;
  note: string;
  /** change vs last week; `upIsBad` flips which way reads as a warning */
  delta?: { min: number; upIsBad?: boolean } | null;
  /** 0–1 progress drawn as a ring beside the value */
  ring?: number;
  children?: React.ReactNode;
}) {
  const { isPhone } = useResponsive();
  return (
    <View style={[styles.tile, isPhone && styles.tilePhone, SHADOW.sm]}>
      <View style={styles.tileHead}>
        <View style={styles.tileIcon}>
          <Icon name={icon} size={14} color={N.ink2} />
        </View>
        <Txt style={styles.tileLabel}>{label}</Txt>
        {delta && <Delta {...delta} />}
      </View>
      <View style={styles.tileValueRow}>
        <Txt style={[styles.tileValue, isPhone && styles.tileValuePhone]}>{value}</Txt>
        {ring !== undefined && <Ring v={ring} />}
      </View>
      {children && <View style={styles.tileViz}>{children}</View>}
      <Txt style={styles.tileNote} numberOfLines={2}>
        {note}
      </Txt>
    </View>
  );
}

/** "+3h vs last week" — text first; the arrow is the secondary mark. */
function Delta({ min, upIsBad }: { min: number; upIsBad?: boolean }) {
  const same = Math.abs(min) < 1;
  const bad = !same && (upIsBad ? min > 0 : min < 0);
  return (
    <View style={styles.delta} aria-label={`${deltaHm(min)} versus last week`}>
      {!same && <Icon name={min > 0 ? 'arrow-right-up' : 'arrow-down'} size={11} color={bad ? N.accentInk : N.ink2} />}
      <Txt style={[styles.deltaTxt, bad && { color: N.accentInk }]}>{same ? 'same as last wk' : `${deltaHm(min)} vs last wk`}</Txt>
    </View>
  );
}

function Ring({ v, size = 40 }: { v: number; size?: number }) {
  const sw = 5;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, v));
  return (
    <View style={styles.ring} aria-label={`${Math.round(v * 100)}%`}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={N.sunken} strokeWidth={sw} fill="none" />
        {f > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={N.ink}
            strokeWidth={sw}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * f} ${c}`}
          />
        )}
      </Svg>
      <Txt style={styles.ringTxt}>{`${Math.round(v * 100)}%`}</Txt>
    </View>
  );
}

/**
 * Seven small columns, one per day. `get` is a share of that day's working
 * hours; small shares (meetings) are scaled to the week's largest so the shape
 * reads — the tile's note carries the absolute number.
 */
function DayBars({ days, get, hi, color = N.ink }: { days: DayRead[]; get: (d: DayRead) => number; hi?: string; color?: string }) {
  const max = Math.max(...days.map(get));
  const scale = max > 0 && max < 0.5 ? 1 / max : 1;
  return (
    <View style={styles.dbars}>
      {days.map((d) => {
        const v = Math.min(1, get(d) * scale);
        return (
          <View key={d.date} style={styles.dbarCol} aria-label={`${d.label} ${Math.round(v * 100)}%`}>
            <View style={styles.dbarWell}>
              {d.work ? (
                <View
                  style={[
                    styles.dbar,
                    { height: `${Math.max(v > 0 ? 8 : 0, v * 100)}%`, backgroundColor: hi && d.date !== hi ? tint(color, 0.35) : color },
                  ]}
                />
              ) : (
                <View style={[styles.dbarOff, HATCH.off]} />
              )}
            </View>
            <Txt style={[styles.dbarLbl, d.isToday && styles.dbarLblToday]}>{d.label.slice(0, 1)}</Txt>
          </View>
        );
      })}
    </View>
  );
}

/* ───────────────────────── the week map ───────────────────────── */

function WeekMap({ ins, hours, now, actions, isPhone }: { ins: Insight; hours: Hours; now: number; actions: CalActions; isPhone: boolean }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <Section title="Week at a glance" aside={<Legend />}>
      <View style={styles.mapPad}>
        <View style={styles.mapRow}>
          <View style={[styles.mapDay, isPhone && styles.mapDayPhone]} />
          <Axis hours={hours} step={isPhone ? 4 : 2} />
          {!isPhone && (
            <View style={styles.mapNums}>
              <Txt style={styles.mapHeadNum}>Booked</Txt>
              <Txt style={styles.mapHeadNum}>Open</Txt>
            </View>
          )}
        </View>
        {ins.days.map((d) => (
          <View key={d.date} style={styles.mapRow}>
            <View style={[styles.mapDay, isPhone && styles.mapDayPhone]}>
              <Txt style={[styles.mapDayTxt, d.isToday && styles.mapDayToday]}>{isPhone ? d.label.slice(0, 2) : d.label}</Txt>
              {!isPhone && <Txt style={[styles.mapDayNum, d.isToday && styles.mapDayToday]}>{d.dayNum}</Txt>}
            </View>
            <Track d={d} hours={hours} now={now} height={30} actions={actions} onHover={setHover} />
            {!isPhone && (
              <View style={styles.mapNums}>
                <Txt style={styles.mapNum}>{d.work || d.bookedMin ? hm(d.inWorkMin || d.bookedMin) : '—'}</Txt>
                <Txt style={styles.mapNumSoft}>{d.work ? hm(d.freeMin) : 'off'}</Txt>
              </View>
            )}
          </View>
        ))}
        <Txt style={styles.readout} numberOfLines={1}>
          {hover ?? 'Hover a block for details · dashed outlines are open windows of 1h or more'}
        </Txt>
      </View>
    </Section>
  );
}

function Axis({ hours, step }: { hours: Hours; step: number }) {
  const lo = hours.start;
  const hi = hours.end;
  const ticks: number[] = [];
  for (let h = Math.ceil(lo / step) * step; h <= hi; h += step) ticks.push(h);
  return (
    <View style={styles.axis}>
      {ticks.map((h) => (
        <Txt key={h} style={[styles.tick, { left: `${((h - lo) / (hi - lo)) * 100}%` }]}>
          {String(h % 24).padStart(2, '0')}
        </Txt>
      ))}
    </View>
  );
}

/**
 * One day's shape across your hours: hatched outside working hours, booked
 * blocks in their category colour, proposals dashed, and free windows of an
 * hour or more outlined so the room you have reads at a glance.
 */
function Track({
  d,
  hours,
  now,
  height,
  actions,
  onHover,
  big,
}: {
  d: DayRead;
  hours: Hours;
  now: number;
  height: number;
  actions: CalActions;
  onHover?: (s: string | null) => void;
  /** the day view: titles inside blocks, durations inside windows */
  big?: boolean;
}) {
  const [w, setW] = useState(0);
  const lo = hours.start * 60;
  const hi = hours.end * 60;
  const span = hi - lo;
  const x = (m: number) => `${((Math.min(hi, Math.max(lo, m)) - lo) / span) * 100}%` as const;
  const wd = (s: number, t: number) => `${((Math.min(hi, t) - Math.max(lo, s)) / span) * 100}%` as const;
  const px = (s: number, t: number) => ((Math.min(hi, t) - Math.max(lo, s)) / span) * w;
  const inView = (s: number, t: number) => t > lo && s < hi;
  const windows = d.gaps.filter((g) => g.t - g.s >= (big ? OPEN_MIN : 60) && (!d.isPast || big));

  return (
    <View style={[styles.track, { height }]} onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <View style={[StyleSheet.absoluteFill, styles.trackOff, HATCH.off]} />
      {d.work && <View style={[styles.trackWork, { left: x(d.work.s), width: wd(d.work.s, d.work.t) }]} />}

      {windows.map((g) => {
        const label = `${clock(g.s)} – ${clock(g.t)} open`;
        return (
          <Press
            key={`g${g.s}`}
            onPress={() => actions.openAI(`Plan something for ${WD[wdIndex(fromIso(d.date))]} ${fromIso(d.date).getDate()} ${MO[fromIso(d.date).getMonth()]}, ${clock(g.s)}–${clock(g.t)}`)}
            onHoverIn={() => onHover?.(`${d.label} ${d.dayNum} · ${label} (${hm(g.t - g.s)}) · click to plan it`)}
            onHoverOut={() => onHover?.(null)}
            hoverBg={tint(CATS.deep.color, 0.08)}
            accessibilityRole="button"
            aria-label={`${label}. Plan it with AI`}
            style={[styles.win, { left: x(g.s), width: wd(g.s, g.t) }]}>
            {big && px(g.s, g.t) > 54 && <Txt style={styles.winTxt}>{hm(g.t - g.s)}</Txt>}
          </Press>
        );
      })}

      {d.slices
        .filter((sl) => inView(sl.s, sl.t))
        .map((sl, i) => {
          const e = sl.ev;
          const ai = e.kind === 'ai';
          const base = e.kind === 'break' ? BREAK_COLOR : CATS[e.cat].color;
          const soft = e.kind === 'routine' || e.kind === 'break';
          const bg = ai ? N.surface : soft ? tint(base, 0.5) : base;
          const fg = ai || soft ? N.ink : N.onInk;
          const label = `${d.label} ${d.dayNum} · ${e.title} · ${clock(sl.s)} – ${clock(sl.t)}${ai ? ' · proposed' : ''}`;
          return (
            <Press
              key={`${e.id}-${i}`}
              onPress={() => actions.openEvent(e.id)}
              onHoverIn={() => onHover?.(label)}
              onHoverOut={() => onHover?.(null)}
              accessibilityRole="button"
              aria-label={label}
              style={[
                styles.blk,
                { left: x(sl.s), width: wd(sl.s, sl.t), backgroundColor: bg, opacity: d.isPast ? 0.55 : 1 },
                ai && styles.blkAi,
              ]}>
              {big && px(sl.s, sl.t) > 56 && (
                <Txt style={[styles.blkTxt, { color: fg }]} numberOfLines={1}>
                  {e.title}
                </Txt>
              )}
            </Press>
          );
        })}

      {d.isToday && now > lo && now < hi && <View pointerEvents="none" style={[styles.now, { left: x(now) }]} />}
    </View>
  );
}

function DayTimeline({ d, hours, now, actions }: { d: DayRead; hours: Hours; now: number; actions: CalActions }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <>
      <View style={styles.axisRow}>
        <Axis hours={hours} step={2} />
      </View>
      {/* a row, so the track's flex:1 is its width and not its height */}
      <View style={styles.axisRow}>
        <Track d={d} hours={hours} now={now} height={64} actions={actions} onHover={setHover} big />
      </View>
      <Txt style={styles.readout} numberOfLines={1}>
        {hover ?? 'Dashed outlines are open windows of 30m or more · click one to plan it'}
      </Txt>
    </>
  );
}

function Legend() {
  const items: { label: string; color: string; dashed?: boolean }[] = [
    ...Object.values(CATS),
    { label: 'Break', color: BREAK_COLOR },
    { label: 'Proposed', color: N.accent, dashed: true },
  ];
  return (
    <View style={styles.legend}>
      {items.map((i) => (
        <View key={i.label} style={styles.legendItem}>
          <View style={[styles.sq, i.dashed ? styles.sqDashed : { backgroundColor: i.color }]} />
          <Txt style={styles.legendTxt}>{i.label}</Txt>
        </View>
      ))}
    </View>
  );
}

/* ───────────────────────── lower pair · week ───────────────────────── */

function Categories({ k }: { k: Kpis }) {
  return (
    <Section title="Where the time goes" flex>
      {k.byCat.map((c) => {
        const f = c.target ? c.hours / c.target : 0;
        const diff = (c.hours - c.target) * 60;
        const status = !c.target ? '' : Math.abs(diff) < 30 ? 'On target' : diff > 0 ? `${hm(diff)} over` : `${hm(-diff)} under`;
        return (
          <View key={c.key} style={styles.catRow}>
            <View style={styles.catHead}>
              <View style={[styles.sq, { backgroundColor: c.color }]} />
              <Txt style={styles.catName}>{c.label}</Txt>
              <Txt style={styles.catNum}>
                {hm(c.hours * 60)}
                <Txt style={styles.catOf}>{` / ${hm(c.target * 60)}`}</Txt>
              </Txt>
            </View>
            <View style={styles.catTrack}>
              <View style={[styles.catFill, { width: `${Math.min(100, f * 100)}%`, backgroundColor: c.color }]} />
              {f > 1 && <View style={[styles.catOver, { left: `${100 / f}%` }]} />}
            </View>
            <Txt style={styles.catStatus}>{status}</Txt>
          </View>
        );
      })}
    </Section>
  );
}

function Rhythm({ ins }: { ins: Insight }) {
  const t = ins.totals;
  const perDay = t.switchDays ? t.switches / t.switchDays : 0;
  const longest = Math.max(0, ...ins.days.map((d) => d.b2bLongestMin));
  const crumbs = ins.days.reduce((a, d) => a + d.crumbMin, 0);
  const items: { icon: IconName; label: string; value: string; note: string; watch: boolean }[] = [
    {
      icon: 'transfer',
      label: 'Context switches',
      value: t.switchDays ? `${perDay.toFixed(1)} a day` : '—',
      note: 'times the kind of work changes between blocks',
      watch: perDay > 4,
    },
    {
      icon: 'users',
      label: 'Back-to-back meetings',
      value: t.b2bRuns ? `${t.b2bRuns} run${t.b2bRuns === 1 ? '' : 's'}` : 'None',
      note: t.b2bRuns ? `longest ${hm(longest)} without a gap` : 'every meeting has room around it',
      watch: longest >= 120,
    },
    {
      icon: 'sun',
      label: 'Outside working hours',
      value: hm(t.outsideMin),
      note: 'events, tasks and focus booked outside your hours',
      watch: t.outsideMin >= 120,
    },
    {
      icon: 'cup',
      label: 'Breaks',
      value: `${t.breakDays} of ${t.workDays} days`,
      note: 'working days with a break booked',
      watch: t.workDays > 0 && t.breakDays < t.workDays,
    },
    {
      icon: 'sort-time',
      label: 'Fragmented time',
      value: hm(crumbs),
      note: 'free, but in gaps under 30m',
      watch: crumbs >= 120,
    },
  ];
  return (
    <Section title="Rhythm" flex>
      {items.map((i) => (
        <View key={i.label} style={styles.rhy}>
          <View style={styles.tileIcon}>
            <Icon name={i.icon} size={14} color={N.ink2} />
          </View>
          <View style={styles.rhyText}>
            <Txt style={styles.rhyLabel}>{i.label}</Txt>
            <Txt style={styles.rhyNote} numberOfLines={1}>
              {i.note}
            </Txt>
          </View>
          <Txt style={styles.rhyValue}>{i.value}</Txt>
          <View style={[styles.tag, i.watch && styles.tagWatch]}>
            <Icon name={i.watch ? 'triangle' : 'check'} size={10} color={i.watch ? N.accentInk : N.muted} />
            <Txt style={[styles.tagTxt, i.watch && { color: N.accentInk }]}>{i.watch ? 'Watch' : 'Fine'}</Txt>
          </View>
        </View>
      ))}
    </Section>
  );
}

/* ───────────────────────── lower pair · day ───────────────────────── */

function Agenda({ d, now, actions }: { d: DayRead; now: number; actions: CalActions }) {
  const list = d.slices;
  return (
    <Section title={d.isToday ? 'Today' : d.long} count={list.length} flex>
      {list.length === 0 ? (
        <Txt style={styles.empty}>Nothing on this day.</Txt>
      ) : (
        list.map((sl, i) => {
          const e = sl.ev;
          const done = d.isPast || (d.isToday && sl.t <= now);
          const live = d.isToday && sl.s <= now && sl.t > now;
          const c = e.kind === 'break' ? BREAK_COLOR : CATS[e.cat].color;
          return (
            <Row
              key={`${e.id}-${i}`}
              faded={done}
              mark={<View style={[styles.rowMark, e.kind === 'ai' ? styles.rowMarkDashed : { backgroundColor: c }]} />}
              title={e.title}
              sub={`${clock(sl.s)} – ${clock(sl.t)} · ${hm(sl.t - sl.s)}${e.kind === 'ai' ? ' · proposed' : ''}`}
              onOpen={() => actions.openEvent(e.id)}
              action={live ? <Txt style={styles.live}>Now</Txt> : null}
            />
          );
        })
      )}
    </Section>
  );
}

function OpenWindows({ d, now, actions }: { d: DayRead; now: number; actions: CalActions }) {
  const list = gapsAhead(d, now).filter((g) => g.t - g.s >= OPEN_MIN);
  const date = fromIso(d.date);
  const day = `${WD[wdIndex(date)]} ${date.getDate()} ${MO[date.getMonth()]}`;
  return (
    <Section title="Open windows" count={list.length} flex>
      {list.length === 0 ? (
        <Txt style={styles.empty}>{d.isPast ? 'This day has passed.' : d.work ? 'No open window of 30m or more.' : 'A day off — no working hours.'}</Txt>
      ) : (
        list.map((g: Gap) => (
          <Row
            key={g.s}
            mark={<View style={[styles.rowMark, styles.rowMarkWin]} />}
            title={`${clock(g.s)} – ${clock(g.t)}`}
            sub={`${hm(g.t - g.s)} free${g.t - g.s >= 60 ? ' · long enough for focus' : ''}`}
            onOpen={() => actions.openAI(`Plan something for ${day}, ${clock(g.s)}–${clock(g.t)}`)}
            action={
              <Button
                variant="secondary"
                label="Plan"
                icon={<Icon name="magic" size={13} color={N.ink2} />}
                onPress={() => actions.openAI(`Plan something for ${day}, ${clock(g.s)}–${clock(g.t)}`)}
              />
            }
          />
        ))
      )}
    </Section>
  );
}

/* ───────────────────────── shared pieces ───────────────────────── */

/** Needs you shows this many rows before "Show all". */
const NEEDS_SHOWN = 3;

const VIEWS: { key: ViewKind; label: string }[] = [
  { key: 'week', label: 'Week' },
  { key: 'day', label: 'Day' },
];

/** Phone only — on desktop the toolbar carries the same switch. */
function ViewSwitch({ view, actions }: { view: ViewKind; actions: CalActions }) {
  return (
    <View style={styles.seg} accessibilityRole="tablist" aria-label="Insights span">
      {VIEWS.map((v) => {
        const on = view === v.key;
        return (
          <Press
            key={v.key}
            onPress={() => actions.setView(v.key)}
            accessibilityRole="tab"
            aria-selected={on}
            style={[styles.segItem, on && [styles.segOn, SHADOW.sm]]}>
            <Txt style={[styles.segTxt, on && styles.segTxtOn]}>{v.label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

/** "Wed 30 · 14:00 – 15:00" */
function when(e: CalEvent) {
  const d = fromIso(e.date);
  const day = `${WD[wdIndex(d)]} ${d.getDate()}`;
  if (e.allDay || !e.start || !e.end) return day;
  return `${day} · ${fromMin(toMin(e.start))} – ${fromMin(toMin(e.end))}`;
}

function Section({
  title,
  count,
  aside,
  flex,
  children,
}: {
  title: string;
  count?: number;
  aside?: React.ReactNode;
  flex?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, flex && styles.sectionFlex]}>
      <View style={styles.sectionHead}>
        <Txt style={styles.sectionTitle}>{title}</Txt>
        {!!count && <Txt style={styles.sectionCount}>{count}</Txt>}
        <View style={styles.spacer} />
        {aside}
      </View>
      <View style={[styles.sectionBody, SHADOW.sm]}>{children}</View>
    </View>
  );
}

function Row({
  mark,
  title,
  sub,
  onOpen,
  action,
  faded,
}: {
  mark: React.ReactNode;
  title: string;
  sub: string;
  onOpen: () => void;
  action: React.ReactNode;
  faded?: boolean;
}) {
  return (
    <View style={[styles.row, faded && styles.rowFaded]}>
      <Press onPress={onOpen} hoverBg={N.hover} accessibilityRole="button" style={styles.rowMain}>
        {mark}
        <View style={styles.rowText}>
          <Txt style={styles.rowTitle} numberOfLines={1}>
            {title}
          </Txt>
          <Txt style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Txt>
        </View>
      </Press>
      {action}
    </View>
  );
}

const TAB: TextStyle = { fontVariant: ['tabular-nums'] };

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, backgroundColor: N.ground },
  page: { padding: 24, paddingTop: 8, paddingBottom: 48, gap: 24, maxWidth: 1160, width: '100%', alignSelf: 'center' },
  pagePhone: { padding: 12, gap: 16 },
  spacer: { flex: 1 },

  /* headline */
  hero: { backgroundColor: N.surface, borderRadius: R.xl, padding: 24, gap: 22 },
  heroPhone: { padding: 16, gap: 16 },
  heroTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' },
  heroText: { flex: 1, minWidth: 260, gap: 6 },
  eyebrow: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '500', color: N.muted },
  lead: { fontFamily: SANS, fontSize: 30, lineHeight: 36, fontWeight: '600', letterSpacing: -0.9, color: N.ink },
  leadPhone: { fontSize: 22, lineHeight: 28, letterSpacing: -0.5 },
  sub: { fontFamily: SANS, fontSize: 16, lineHeight: 22, color: N.ink2 },
  clear: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: R.full, backgroundColor: N.sunken },
  clearTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '500', color: N.ink2 },

  capWrap: { gap: 12 },
  cap: { flexDirection: 'row', height: 14, gap: 2, borderRadius: R.sm, overflow: 'hidden' },
  capOpen: { backgroundColor: N.sunken },
  capLegend: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 20, rowGap: 8 },
  capItem: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  capName: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2 },
  capNum: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '600', color: N.ink, ...TAB },
  sq: { width: 10, height: 10, borderRadius: 3 },
  sqOpen: { backgroundColor: N.sunken, borderWidth: 1, borderColor: N.lineStrong },
  sqDashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: N.accent },

  /* tiles */
  tiles: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' },
  tilesPhone: { gap: 10 },
  tile: { flexGrow: 1, flexBasis: 230, backgroundColor: N.surface, borderRadius: R.xl, padding: 18, gap: 8 },
  // phone: two up, so the four numbers fit on one screen
  tilePhone: { flexBasis: 150, padding: 14, gap: 6 },
  tileValuePhone: { fontSize: 24, lineHeight: 30, letterSpacing: -0.6 },
  tileHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tileIcon: { width: 26, height: 26, borderRadius: R.md, backgroundColor: N.sunken, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { flex: 1, fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink2 },
  tileValueRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 42 },
  tileValue: { fontFamily: SANS, ...T.kpi, fontSize: 32, lineHeight: 38, color: N.ink, ...TAB },
  tileViz: { height: 46, justifyContent: 'flex-end' },
  tileNote: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },

  delta: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 22, paddingHorizontal: 8, borderRadius: R.full, backgroundColor: N.sunken },
  deltaTxt: { fontFamily: SANS, fontSize: 11, lineHeight: 14, fontWeight: '600', color: N.ink2, ...TAB },

  ring: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  ringTxt: { position: 'absolute', fontFamily: SANS, fontSize: 10, lineHeight: 12, fontWeight: '600', color: N.ink, ...TAB },

  dbars: { flexDirection: 'row', gap: 5, alignItems: 'flex-end', height: 46 },
  dbarCol: { flex: 1, alignItems: 'center', gap: 3 },
  dbarWell: { height: 30, width: '100%', justifyContent: 'flex-end', borderRadius: 3, backgroundColor: N.sunken, overflow: 'hidden' },
  dbar: { width: '100%', borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dbarOff: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  dbarLbl: { fontFamily: SANS, fontSize: 10, lineHeight: 12, color: N.faint },
  dbarLblToday: { color: N.ink, fontWeight: '700' },

  /* map */
  mapPad: { padding: 14, paddingTop: 10, gap: 6 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  mapDay: { width: 58, flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  mapDayPhone: { width: 22 },
  mapDayTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '500', color: N.ink2 },
  mapDayNum: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.faint, ...TAB },
  mapDayToday: { color: N.ink, fontWeight: '700' },
  mapNums: { width: 132, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'baseline', gap: 10 },
  mapHeadNum: { width: 61, textAlign: 'right', fontFamily: SANS, fontSize: 11, lineHeight: 14, color: N.faint },
  mapNum: { width: 61, textAlign: 'right', fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '600', color: N.ink, ...TAB },
  mapNumSoft: { width: 61, textAlign: 'right', fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted, ...TAB },

  axisRow: { flexDirection: 'row', paddingBottom: 2 },
  axis: { flex: 1, height: 16 },
  tick: { position: 'absolute', width: 24, marginLeft: -12, textAlign: 'center', fontFamily: SANS, fontSize: 10, lineHeight: 14, color: N.faint, ...TAB },

  track: { flex: 1, borderRadius: R.md, overflow: 'hidden', backgroundColor: N.offHours },
  trackOff: { backgroundColor: N.offHours },
  trackWork: { position: 'absolute', top: 0, bottom: 0, backgroundColor: N.sunken },
  win: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: R.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: tint(CATS.deep.color, 0.55),
    alignItems: 'center',
    justifyContent: 'center',
  },
  winTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '600', color: CATS.deep.color, ...TAB },
  blk: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    borderRadius: R.sm,
    // the 2px surface ring keeps overlapping and adjacent blocks apart
    borderWidth: 1,
    borderColor: N.surface,
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  blkAi: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: N.accent },
  blkTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  now: { position: 'absolute', top: -2, bottom: -2, width: 2, marginLeft: -1, backgroundColor: N.accent },
  readout: { marginTop: 6, fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted, ...TAB },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end', flexShrink: 1 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },

  /* lower pair */
  pair: { flexDirection: 'row', gap: 16, alignItems: 'flex-start' },
  pairPhone: { flexDirection: 'column', alignItems: 'stretch' },

  catRow: { paddingVertical: 10, paddingHorizontal: 12, gap: 6 },
  catHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catName: { flex: 1, fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink },
  catNum: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '600', color: N.ink, ...TAB },
  catOf: { fontWeight: '400', color: N.faint },
  catTrack: { height: 8, borderRadius: R.full, backgroundColor: N.sunken, overflow: 'hidden' },
  catFill: { height: 8, borderRadius: R.full },
  catOver: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: N.surface },
  catStatus: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },

  rhy: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12 },
  rhyText: { flex: 1, minWidth: 0, gap: 1 },
  rhyLabel: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink },
  rhyNote: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted },
  rhyValue: { fontFamily: SANS, fontSize: 15, lineHeight: 20, fontWeight: '600', color: N.ink, ...TAB },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, width: 70, height: 24, justifyContent: 'center', borderRadius: R.full, borderWidth: 1, borderColor: N.line },
  tagWatch: { borderColor: tint(N.accent, 0.45) },
  tagTxt: { fontFamily: SANS, fontSize: 11, lineHeight: 14, fontWeight: '600', color: N.muted },

  live: { fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '700', color: N.accentInk, paddingRight: 6 },

  /* sections & rows */
  section: { gap: 10 },
  sectionFlex: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  sectionTitle: { fontFamily: SANS, ...T.heading, color: N.ink },
  sectionCount: { fontFamily: SANS, fontSize: 13, color: N.muted, ...TAB },
  sectionBody: { backgroundColor: N.surface, borderRadius: R.xl, paddingVertical: 6, paddingHorizontal: 6 },
  empty: { fontFamily: SANS, fontSize: 14, color: N.muted, padding: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 8 },
  rowFaded: { opacity: 0.55 },
  rowMain: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, borderRadius: R.lg },
  rowMark: { width: 10, height: 10, borderRadius: 3 },
  rowMarkDashed: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: N.accent },
  rowMarkWin: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: CATS.deep.color },
  rowText: { flex: 1, minWidth: 0, gap: 1 },
  rowTitle: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink },
  rowSub: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted, ...TAB },

  seg: { flexDirection: 'row', alignSelf: 'flex-start', padding: 3, gap: 2, borderRadius: R.lg, backgroundColor: N.sunken },
  segItem: { height: 30, paddingHorizontal: 16, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  segOn: { backgroundColor: N.surface },
  segTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '500', color: N.muted },
  segTxtOn: { color: N.ink },
});
