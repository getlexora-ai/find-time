import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/design/Icon';
import { C, R, rgba, w } from '@/design/tokens';
import { Txt } from '@/design/ui';
import { useReducedMotion } from '@/design/useReducedMotion';
import { useResponsive } from '@/design/useResponsive';

import { WEEK, type WeekBlock } from '../copy';
import { RAMP } from '../ramp';

type Phase = 'before' | 'planning' | 'done';

const SPAN = WEEK.to - WEEK.from;
const N = WEEK.placed.length;
/** how long the packed week sits there before Find Time starts on it */
const HOLD_MS = 1100;
const STEP_MS = 340;

/**
 * The hero diagram: one week, already packed with meetings, and your one-line
 * ask above it. Find Time then drops focus time, three German sessions and a
 * booked 1:1 into the gaps one at a time, and the footer flips from the week you
 * have to the week you wanted.
 *
 * At rest (SSR + first client render) it shows the "before" week. The first
 * `onLayout` — post-hydration, so the two renders agree — plays it forward once;
 * the replay button runs it again. Reduced motion snaps straight to the planned
 * week. Blocks sit at % offsets inside each day column, so the grid scales to
 * any card width without reflowing.
 */
export function WeekBoard() {
  const { width } = useResponsive();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>('before');
  const [placed, setPlaced] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const started = useRef(false);

  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  const play = useCallback(() => {
    timers.current.splice(0).forEach(clearTimeout);
    if (reduced) {
      setPlaced(N);
      setPhase('done');
      return;
    }
    setPlaced(0);
    setPhase('before');
    const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
    at(() => setPhase('planning'), HOLD_MS);
    WEEK.placed.forEach((_, i) => at(() => setPlaced(i + 1), HOLD_MS + 400 + i * STEP_MS));
    at(() => setPhase('done'), HOLD_MS + 400 + N * STEP_MS);
  }, [reduced]);

  const onLayout = () => {
    if (started.current) return;
    started.current = true;
    play();
  };

  const gridH = width >= 640 ? 300 : 250;
  const done = phase === 'done';

  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.head}>
        <Txt style={styles.headTxt}>{WEEK.title}</Txt>
        <View style={styles.headRight}>
          <View style={styles.status}>
            <View style={[styles.statusDot, phase === 'before' ? styles.statusDotBefore : null]} />
            <Txt style={[styles.statusTxt, phase === 'before' ? styles.statusTxtBefore : null]}>
              {WEEK.status[phase]}
            </Txt>
          </View>
          <Pressable onPress={play} accessibilityRole="button" aria-label={WEEK.replayLabel} style={styles.replay}>
            <Icon name="refresh-plain" size={16} color={RAMP.onPanel} />
          </Pressable>
        </View>
      </View>

      <View style={styles.ask}>
        <Txt style={styles.askLabel}>{WEEK.askLabel}</Txt>
        <Txt style={styles.askTxt}>“{WEEK.ask}”</Txt>
      </View>

      <View style={styles.board} role="img" aria-label={WEEK.label}>
        <View style={styles.daysRow}>
          <View style={styles.gutter} />
          {WEEK.days.map((d) => (
            <Txt key={d} style={styles.dayName}>
              {d}
            </Txt>
          ))}
        </View>

        <View style={[styles.grid, { height: gridH }]}>
          <View style={styles.gutter}>
            {WEEK.gutter.map((h) => (
              <Txt key={h} style={[styles.hour, { top: `${pct(Number(h))}%` }]}>
                {h}
              </Txt>
            ))}
          </View>
          <View style={styles.cols}>
            {WEEK.gutter.map((h) => (
              <View key={h} style={[styles.rule, { top: `${pct(Number(h))}%` }]} />
            ))}
            {WEEK.days.map((d, day) => (
              <View key={d} style={styles.col}>
                {WEEK.meetings
                  .filter((b) => b.day === day)
                  .map((b) => (
                    <Block key={b.label + b.start} b={b} />
                  ))}
                {WEEK.placed.slice(0, placed).map((b) =>
                  b.day === day ? <Block key={b.label + b.start} b={b} placed reduced={reduced} /> : null,
                )}
              </View>
            ))}
          </View>
        </View>
      </View>

      <View style={styles.foot}>
        <Icon name={done ? 'check-bold' : 'triangle'} size={14} color={done ? C.lime : C.orange} />
        <Txt style={[styles.footTxt, done ? styles.footTxtDone : null]}>{done ? WEEK.after : WEEK.before}</Txt>
      </View>
    </View>
  );
}

/** hour → % down the grid */
function pct(hour: number) {
  return Math.round(((hour - WEEK.from) / SPAN) * 1000) / 10;
}

/** A meeting that was already there, or — `placed` — one Find Time put in,
 *  which pops in on mount (straight in under reduced motion). */
function Block({ b, placed, reduced }: { b: WeekBlock; placed?: boolean; reduced?: boolean }) {
  const [anim] = useState(() => new Animated.Value(placed && !reduced ? 0 : 1));
  useEffect(() => {
    if (!placed || reduced) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.back(1.6)),
      useNativeDriver: true,
    }).start();
  }, [anim, placed, reduced]);

  return (
    <Animated.View
      style={[
        styles.block,
        placed ? styles.blockPlaced : null,
        {
          top: `${pct(b.start)}%`,
          height: `${pct(WEEK.from + b.end - b.start)}%`,
          opacity: anim,
          transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
        },
      ]}>
      <Txt style={[styles.blockTxt, placed ? styles.blockTxtPlaced : null]} numberOfLines={1}>
        {b.label}
      </Txt>
    </Animated.View>
  );
}

const GUTTER = 26;

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: w(0.15),
    backgroundColor: rgba('#121212', 0.92),
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 10,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingLeft: 20,
    paddingRight: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
  },
  headTxt: { flexShrink: 1, color: RAMP.onPanel, fontSize: 11, letterSpacing: 1.5 },
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.lime },
  statusDotBefore: { backgroundColor: C.orange },
  statusTxt: { color: C.lime, fontSize: 11, letterSpacing: 1.5 },
  statusTxtBefore: { color: C.orange },
  replay: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.full },
  ask: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#fff',
    borderRadius: R.xl,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 6,
  },
  askLabel: { color: RAMP.onLight, fontSize: 10, letterSpacing: 1.5 },
  askTxt: { color: C.surface, fontSize: 14, lineHeight: 20, fontWeight: '500' },
  board: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 18 },
  daysRow: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  dayName: { flex: 1, textAlign: 'center', color: RAMP.onPanel, fontSize: 10, letterSpacing: 1.5 },
  grid: { flexDirection: 'row', gap: 4 },
  gutter: { width: GUTTER, position: 'relative' },
  hour: { position: 'absolute', right: 4, marginTop: -6, color: RAMP.onPanel, fontSize: 9 },
  cols: { flex: 1, flexDirection: 'row', gap: 4, position: 'relative' },
  rule: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: w(0.07) },
  col: { flex: 1, position: 'relative', borderRadius: R.sm, backgroundColor: w(0.025) },
  block: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderRadius: R.sm,
    backgroundColor: w(0.13),
    borderLeftWidth: 2,
    borderLeftColor: w(0.35),
    paddingHorizontal: 4,
    paddingTop: 2,
    overflow: 'hidden',
  },
  blockPlaced: { backgroundColor: C.lime, borderLeftColor: C.surface },
  blockTxt: { color: w(0.8), fontSize: 8, lineHeight: 10, letterSpacing: 0.5 },
  blockTxtPlaced: { color: C.surface, fontWeight: '600' },
  foot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: w(0.1),
  },
  footTxt: { flexShrink: 1, color: w(0.8), fontSize: 11, lineHeight: 16, letterSpacing: 1 },
  footTxtDone: { color: C.lime },
});
