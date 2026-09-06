import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useToast } from '@/calendar/components/Toast';
import { Icon } from '@/design/Icon';
import { C, ink, R, rgba, w } from '@/design/tokens';
import { Press, Txt } from '@/design/ui';
import { useResponsive } from '@/design/useResponsive';

import { TOASTS, WIDGETS } from '../copy';
import { RAMP } from '../ramp';
import { useDraggable } from './useDraggable';

/**
 * The four `[data-drag]` widgets from landing.html, positioned at the mockup's %
 * offsets over the hero section and gated by the same breakpoints
 * (`lg`/`xl`/`md`). Rendered only on desktop widths — on a phone landing.html
 * hides them outright, so there is nothing to port there (HANDOFF-landing.md).
 */
export function FloatingWidgets() {
  const { width } = useResponsive();
  const lg = width >= 1024;
  const xl = width >= 1280;
  const md = width >= 768;

  if (!md) return null;

  return (
    <>
      {lg && <WeeklyGoal />}
      {xl && <Comment />}
      {lg && <FocusTimer />}
      {md && <AccuracyDial />}
    </>
  );
}

/** `right-[8%] top-14`, lime card. */
function WeeklyGoal() {
  const drag = useDraggable();
  const bars = [
    { h: 28, c: C.surface },
    { h: 40, c: C.surface },
    { h: 20, c: ink(0.3) },
    { h: 32, c: C.orange },
  ];
  return (
    <Animated.View
      {...drag.handlers}
      style={[styles.abs, { right: '8%', top: 56, width: 224 }, styles.limeCard, drag.style, drag.cursor]}>
      <View style={styles.spread}>
        <Txt style={styles.onLightLabel}>{WIDGETS.weeklyGoal.label}</Txt>
        <Icon name="globe" size={18} color={C.surface} />
      </View>
      <View style={styles.goalBody}>
        <View>
          <Txt style={styles.goalValue}>{WIDGETS.weeklyGoal.value}</Txt>
          <Txt style={styles.onLimeCaption}>{WIDGETS.weeklyGoal.caption}</Txt>
        </View>
        <View style={styles.bars}>
          {bars.map((b, i) => (
            <View key={i} style={{ height: b.h, width: 8, backgroundColor: b.c }} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

/** `right-[2%] top-[43%]`, orange card. */
function Comment() {
  const drag = useDraggable();
  return (
    <Animated.View
      {...drag.handlers}
      style={[styles.abs, { right: '2%', top: '43%', width: 192 }, styles.orangeCard, drag.style, drag.cursor]}>
      <View style={styles.spread}>
        <Icon name="chat" size={20} color={C.surface} />
        <Txt style={styles.onLightLabel}>{WIDGETS.comment.tag}</Txt>
      </View>
      <Txt style={styles.commentBody}>{WIDGETS.comment.body}</Txt>
      <View style={styles.commentByline}>
        <View style={styles.avatar}>
          <Txt style={{ color: '#fff', fontSize: 10 }}>{WIDGETS.comment.avatar}</Txt>
        </View>
        <Txt style={styles.onLightLabel}>{WIDGETS.comment.byline}</Txt>
      </View>
    </Animated.View>
  );
}

/** `bottom-[8%] left-[8%]`, black pill with a real 25:00 countdown. */
function FocusTimer() {
  const drag = useDraggable();
  const toast = useToast();
  const [seconds, setSeconds] = useState(25 * 60);
  const [active, setActive] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (timer.current != null) clearInterval(timer.current);
  }, []);

  const toggle = () => {
    if (active) {
      if (timer.current != null) clearInterval(timer.current);
      setActive(false);
      setSeconds(25 * 60);
      return;
    }
    setActive(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          if (timer.current != null) clearInterval(timer.current);
          setActive(false);
          toast(TOASTS.focusComplete);
          return 25 * 60;
        }
        return s - 1;
      });
    }, 1000);
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const label = active ? `${mm}:${ss} ${WIDGETS.focus.activeSuffix}` : WIDGETS.focus.ready;

  return (
    <Animated.View
      {...drag.handlers}
      style={[styles.abs, { bottom: '8%', left: '8%', width: 240 }, styles.focusPill, drag.style, drag.cursor]}>
      <View style={styles.focusInfo}>
        <Icon name="alarm" size={18} color={C.lime} />
        <View>
          <Txt style={{ color: '#fff', fontSize: 12 }}>{WIDGETS.focus.title}</Txt>
          <Txt style={{ color: RAMP.onBlack, fontSize: 12 }}>{label}</Txt>
        </View>
      </View>
      <Press
        onPress={toggle}
        accessibilityRole="button"
        aria-label={active ? WIDGETS.focus.pauseLabel : WIDGETS.focus.startLabel}
        hoverTransform={{ scale: 1.05 }}
        style={styles.focusBtn}>
        <Icon name={active ? 'pause' : 'play'} size={18} color={C.surface} />
      </Press>
    </Animated.View>
  );
}

/** landing.html `bottom-[2%] right-[5%]`; nudged just below the hero band so the
 *  mock's taller RN cards don't sit on top of it (HANDOFF-landing.md). Not draggable. */
function AccuracyDial() {
  return (
    <View style={[styles.abs, styles.dialWrap, { bottom: -32, right: '5%' }]}>
      <View style={{ alignItems: 'flex-end' }}>
        <Txt style={{ color: C.lime, fontSize: 12 }}>{WIDGETS.accuracy.label}</Txt>
        <Txt style={styles.dialValue}>{WIDGETS.accuracy.value}</Txt>
      </View>
      <View style={styles.dial}>
        <View style={styles.dialLine45} />
        <View style={styles.dialLine12} />
        <View style={styles.dialDot} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute', zIndex: 30 },
  spread: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  limeCard: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.3),
    backgroundColor: C.lime,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  orangeCard: {
    zIndex: 40,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: C.orange,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  onLightLabel: { color: C.surface, fontSize: 12 },
  goalBody: { marginTop: 20, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  goalValue: { color: C.surface, fontSize: 30, lineHeight: 30, fontWeight: '500', letterSpacing: -0.5 },
  onLimeCaption: { marginTop: 4, color: RAMP.onLime, fontSize: 12 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  commentBody: { marginTop: 20, color: C.surface, fontSize: 12, lineHeight: 20 },
  commentByline: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: ink(0.2),
    paddingTop: 12,
  },
  avatar: {
    height: 24,
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    backgroundColor: C.surface,
  },
  focusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: C.surface,
    padding: 4,
    paddingLeft: 16,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  focusInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  focusBtn: {
    height: 44,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    backgroundColor: '#fff',
  },
  dialWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 16 },
  dialValue: { marginTop: 4, color: C.lime, fontSize: 30, lineHeight: 32, fontWeight: '500', letterSpacing: -0.5 },
  dial: {
    height: 96,
    width: 96,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: rgba('#ccff00', 0.4),
    overflow: 'hidden',
  },
  dialLine45: {
    position: 'absolute',
    height: '100%',
    width: 1,
    backgroundColor: rgba('#ccff00', 0.5),
    transform: [{ rotate: '45deg' }],
  },
  dialLine12: {
    position: 'absolute',
    height: 1,
    width: '100%',
    backgroundColor: rgba('#ccff00', 0.5),
    transform: [{ rotate: '-12deg' }],
  },
  dialDot: {
    height: 12,
    width: 12,
    borderRadius: 6,
    backgroundColor: C.lime,
    shadowColor: C.lime,
    shadowOpacity: 0.8,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
  },
});
