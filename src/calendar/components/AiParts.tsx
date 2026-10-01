import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, type ViewStyle } from 'react-native';

import type { TraceStep } from '@/lib/api-types';

import { useCalEvents } from '../cal-store';
import { fromMin } from '../cal-date';
import { useHours } from '../hours';
import { useAgentTools } from '../agent-store';
import { Icon, type IconName, SOLAR_ID } from '../Icon';
import { paint } from '../kinds';
import { slicesIn } from '../kpi';
import { BREAK_COLOR, CATS, N, R, SANS, tint } from '../tokens';
import { Press, Txt } from '../ui';

/**
 * The moving parts of Plan with AI (quiet calendar, 2026-10-01).
 *
 * Everything here shows real work, and nothing here knows a tool by name:
 * icons, colours and labels come from the server's tool registry
 * (GET /api/ai/tools). `Working` draws the steps the server streams as it runs
 * them; `Trace` is its record of what it did, with its counts; `DayStrip` is
 * drawn from your events. The
 * flourish is the category palette in motion, not invented progress.
 */

const web = Platform.OS === 'web';
const driver = !web;

/** The four category colours as one moving band. */
const BAND = [CATS.deep.color, CATS.sync.color, CATS.design.color, CATS.research.color, CATS.deep.color];
const bandBg = (Platform.select({
  web: {
    backgroundImage: `linear-gradient(90deg, ${BAND.join(', ')})`,
  } as unknown as ViewStyle,
  default: { backgroundColor: CATS.deep.color },
}) ?? {}) as ViewStyle;

/** A thin bar of the palette sliding sideways — "I'm on it". */
export function Shimmer({ height = 2 }: { height?: number }) {
  const x = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: 1600,
        easing: Easing.linear,
        useNativeDriver: driver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [x]);
  const translateX = x.interpolate({
    inputRange: [0, 1],
    outputRange: ['-50%', '0%'],
  });
  return (
    <View style={[styles.shimmerWell, { height }]}>
      <Animated.View style={[styles.shimmerBand, bandBg, { transform: [{ translateX }] }]} />
    </View>
  );
}

/** Rises in from 6px below. */
export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    Animated.timing(v, {
      toValue: 1,
      duration: 280,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: driver,
    }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [
          {
            translateY: v.interpolate({
              inputRange: [0, 1],
              outputRange: [6, 0],
            }),
          },
        ],
      }}>
      {children}
    </Animated.View>
  );
}

/* ───────────────────────── steps ───────────────────────── */

/** How a tool or step looks: from the server's registry, with a safe fallback for anything unknown. */
export function useToolLook() {
  const tools = useAgentTools();
  return (key: string) => {
    const t = tools.find((x) => x.key === key);
    const icon = (t && t.icon in SOLAR_ID ? t.icon : 'magic') as IconName;
    const color = t && t.color in CATS ? CATS[t.color].color : CATS.deep.color;
    return { icon, color, ui: t };
  };
}

export function StepIcon({ tool, size = 26 }: { tool: string; size?: number }) {
  const s = useToolLook()(tool);
  return (
    <View
      style={[
        styles.stepIcon,
        { width: size, height: size, borderRadius: size / 3, backgroundColor: tint(s.color, 0.14) },
      ]}>
      <Icon name={s.icon} size={size * 0.55} color={s.color} />
    </View>
  );
}

/** A turn in flight: the steps the server has finished, and the one it is on. */
export type Live = { done: TraceStep[]; current: { tool: string; label: string } | null };

/**
 * The live card while a turn runs. Every row is an event the server sent as it
 * happened (ChatStreamEvent) — nothing here is on a timer.
 */
export function Working({ live }: { live: Live }) {
  return (
    <FadeIn>
      <View style={styles.working}>
        <Shimmer />
        <View style={styles.workingBody}>
          {live.done.map((st, i) => (
            <FadeIn key={`${st.tool}-${i}`}>
              <View style={styles.stepRow}>
                <StepIcon tool={st.tool} size={24} />
                <View style={styles.liveText}>
                  <Txt style={styles.stepLabel}>{st.label}</Txt>
                  {!!st.detail && <Txt style={styles.liveDetail}>{st.detail}</Txt>}
                </View>
                <Icon name="check-bold" size={14} color={BREAK_COLOR} />
              </View>
            </FadeIn>
          ))}
          {live.current ? (
            <FadeIn key={`now-${live.current.tool}-${live.done.length}`}>
              <View style={styles.stepRow}>
                <StepIcon tool={live.current.tool} size={24} />
                <Txt style={[styles.stepLabel, styles.stepLabelNow]}>{live.current.label}</Txt>
                <View style={styles.spacer} />
                <Dots />
              </View>
            </FadeIn>
          ) : (
            !live.done.length && (
              <View style={styles.stepRow}>
                <Txt style={[styles.stepLabel, styles.stepLabelNow]}>Sending</Txt>
                <View style={styles.spacer} />
                <Dots />
              </View>
            )
          )}
        </View>
      </View>
    </FadeIn>
  );
}

function Dots() {
  const v = useState(() => new Animated.Value(0))[0];
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, {
        toValue: 3,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: driver,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={styles.dots}>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            {
              opacity: v.interpolate({
                inputRange: [i, i + 0.5, i + 1, 3],
                outputRange: [0.25, 1, 0.25, 0.25],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

/** "Worked through 4 steps · 2.1s", opening onto the steps with their numbers. */
export function Trace({ steps, open: startOpen = false }: { steps: TraceStep[]; open?: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const ms = steps.reduce((n, s) => n + (s.ms ?? 0), 0);
  return (
    <View style={styles.trace}>
      <Press
        onPress={() => setOpen((o) => !o)}
        hoverBg={N.hover}
        accessibilityRole="button"
        aria-expanded={open}
        style={styles.traceHead}>
        <View style={styles.stack}>
          {steps.slice(0, 4).map((s, i) => (
            <View key={`${s.tool}-${i}`} style={[styles.stackItem, { marginLeft: i ? -8 : 0, zIndex: 10 - i }]}>
              <StepIcon tool={s.tool} size={22} />
            </View>
          ))}
        </View>
        <Txt style={styles.traceTitle}>
          {`Worked through ${steps.length} steps`}
          {ms > 0 && <Txt style={styles.traceMs}>{` · ${(ms / 1000).toFixed(1)}s`}</Txt>}
        </Txt>
        <View style={styles.spacer} />
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="arrow-down" size={14} color={N.muted} />
        </View>
      </Press>
      {open && (
        <View style={styles.traceBody}>
          {steps.map((s, i) => (
            <FadeIn key={`${s.tool}-${i}`} delay={i * 70}>
              <View style={styles.traceRow}>
                <View style={styles.rail}>
                  <StepIcon tool={s.tool} size={24} />
                  {i < steps.length - 1 && <View style={styles.railLine} />}
                </View>
                <View style={styles.traceText}>
                  <Txt style={styles.traceLabel}>{s.label}</Txt>
                  {!!s.detail && <Txt style={styles.traceDetail}>{s.detail}</Txt>}
                </View>
                {s.ms != null && s.ms > 0 && (
                  <Txt style={styles.traceStepMs}>{s.ms < 1000 ? `${s.ms}ms` : `${(s.ms / 1000).toFixed(1)}s`}</Txt>
                )}
              </View>
            </FadeIn>
          ))}
        </View>
      )}
    </View>
  );
}

/* ───────────────────────── a proposal's day ───────────────────────── */

/**
 * The day a proposal lands on, across your hours: what is already there (each
 * in its own tint) and where the new block would go (dashed accent). Drawn
 * from the calendar store, so it is the same day the grid shows.
 */
export function DayStrip({ startISO, endISO }: { startISO: string; endISO: string }) {
  const events = useCalEvents();
  const hours = useHours();
  const day = startISO.slice(0, 10);
  const lo = hours.start * 60;
  const hi = hours.end * 60;
  const span = Math.max(60, hi - lo);
  const pct = (m: number) => `${((Math.min(hi, Math.max(lo, m)) - lo) / span) * 100}%` as const;
  const toM = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16));
  const s = toM(startISO);
  const e = toM(endISO) || 24 * 60;
  const busy = slicesIn(
    events.filter((x) => !x.allDay && x.kind !== 'ai'),
    [day],
  ).filter((sl) => sl.t > lo && sl.s < hi);
  const marks = [];
  for (let h = Math.ceil(hours.start / 3) * 3; h < hours.end; h += 3)
    if (h >= hours.start + 2 && h <= hours.end - 2) marks.push(h);

  return (
    <View style={styles.strip} aria-label={`Your day: ${busy.length} other blocks`}>
      <View style={styles.stripTrack}>
        {marks.map((h) => (
          <View key={h} style={[styles.stripTick, { left: pct(h * 60) }]} />
        ))}
        {busy.map((sl, i) => (
          <View
            key={`${sl.ev.id}-${i}`}
            style={[
              styles.stripBusy,
              {
                left: pct(sl.s),
                width: `${((Math.min(hi, sl.t) - Math.max(lo, sl.s)) / span) * 100}%`,
                backgroundColor: tint(paint(sl.ev).color, 0.32),
              },
            ]}
          />
        ))}
        <View
          style={[
            styles.stripNew,
            {
              left: pct(s),
              width: `${((Math.min(hi, e) - Math.max(lo, s)) / span) * 100}%`,
            },
          ]}
        />
      </View>
      <View style={styles.stripLabels}>
        <Txt style={[styles.stripLbl, styles.stripLblStart]}>{fromMin(lo)}</Txt>
        {marks.map((h) => (
          <Txt key={h} style={[styles.stripLbl, styles.stripLblAbs, { left: pct(h * 60) }]}>
            {String(h).padStart(2, '0')}
          </Txt>
        ))}
        <Txt style={[styles.stripLbl, styles.stripLblEnd]}>{fromMin(hi % (24 * 60))}</Txt>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: { flex: 1 },
  shimmerWell: { overflow: 'hidden', backgroundColor: N.sunken },
  shimmerBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: '200%',
  },

  working: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: N.line,
    backgroundColor: N.surface,
    overflow: 'hidden',
  },
  workingBody: { padding: 12, gap: 10 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepIcon: { alignItems: 'center', justifyContent: 'center' },
  stepLabel: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2 },
  liveText: { flex: 1, minWidth: 0, gap: 1 },
  liveDetail: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.muted, fontVariant: ['tabular-nums'] },
  stepLabelNow: { color: N.ink, fontWeight: '600' },
  dots: { flexDirection: 'row', gap: 3 },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: CATS.sync.color,
  },

  trace: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: N.line,
    backgroundColor: N.surface,
    overflow: 'hidden',
  },
  traceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  stack: { flexDirection: 'row' },
  stackItem: {
    borderRadius: 9,
    borderWidth: 2,
    borderColor: N.surface,
    backgroundColor: N.surface,
  },
  traceTitle: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: N.ink,
  },
  traceMs: { fontWeight: '400', color: N.muted, fontVariant: ['tabular-nums'] },
  traceBody: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    paddingTop: 2,
    borderTopWidth: 1,
    borderTopColor: N.line,
  },
  traceRow: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  rail: { alignItems: 'center' },
  railLine: {
    flex: 1,
    width: 1,
    marginTop: 4,
    marginBottom: -10,
    backgroundColor: N.line,
  },
  traceText: { flex: 1, minWidth: 0, gap: 1, paddingTop: 2 },
  traceLabel: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: N.ink,
  },
  traceDetail: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 17,
    color: N.muted,
    fontVariant: ['tabular-nums'],
  },
  traceStepMs: {
    fontFamily: SANS,
    fontSize: 11,
    lineHeight: 18,
    color: N.faint,
    paddingTop: 2,
    fontVariant: ['tabular-nums'],
  },

  strip: { gap: 4 },
  stripTrack: {
    height: 22,
    borderRadius: R.sm,
    backgroundColor: N.sunken,
    overflow: 'hidden',
  },
  stripTick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: N.line,
  },
  stripBusy: { position: 'absolute', top: 4, bottom: 4, borderRadius: 2 },
  stripNew: {
    position: 'absolute',
    top: 1,
    bottom: 1,
    borderRadius: 3,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: N.accent,
    backgroundColor: N.surface,
  },
  stripLabels: { height: 14 },
  stripLbl: {
    position: 'absolute',
    fontFamily: SANS,
    fontSize: 10,
    lineHeight: 14,
    color: N.faint,
    fontVariant: ['tabular-nums'],
  },
  stripLblAbs: { marginLeft: -6 },
  stripLblStart: { left: 0 },
  stripLblEnd: { right: 0 },
});
