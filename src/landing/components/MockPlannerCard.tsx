import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useToast } from '@/calendar/components/Toast';
import { Icon } from '@/design/Icon';
import { C, R, rgba, w } from '@/design/tokens';
import { Press, Txt } from '@/design/ui';
import { useReducedMotion } from '@/design/useReducedMotion';

import { PLANNER, SCHEDULE, SCHEDULE_AFTER_RECOVERY, SCHEDULE_AI, TOASTS, type ScheduleItem } from '../copy';
import { RAMP } from '../ramp';

/**
 * The dark `#121212/90` dashboard mock from landing.html: chrome row, date row +
 * regenerate, a time gutter beside the schedule list, a recovery divider, and the
 * buffer/add-task footer. `regenerate` and `ADD TASK` are the only live controls;
 * regenerate also drops the phone card's capacity via `onRegenerate` (landing.html
 * wires `#regenerate` to `#capacityBar`).
 *
 * `aiPlaced` (0..SCHEDULE_AI.length) is driven by `useDemoSequence`: as the
 * landing walkthrough runs, the AI-placed German rows mount and slide in one by
 * one. Defaults to all rows shown, so the card is complete without the demo.
 */
export function MockPlannerCard({
  onAddTask,
  onRegenerate,
  aiPlaced = SCHEDULE_AI.length,
}: {
  onAddTask: () => void;
  onRegenerate: () => void;
  aiPlaced?: number;
}) {
  const toast = useToast();
  const reduced = useReducedMotion();
  const [spin] = useState(() => new Animated.Value(0));

  const regenerate = () => {
    if (!reduced) {
      spin.setValue(0);
      Animated.timing(spin, {
        toValue: 1,
        duration: 650,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }).start();
    }
    onRegenerate();
    toast(TOASTS.regenerated);
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.card}>
      {/* chrome */}
      <View style={[styles.row, styles.borderB, styles.chrome]}>
        <View style={styles.trafficLights}>
          <View style={[styles.light, { backgroundColor: C.orange }]} />
          <View style={[styles.light, { backgroundColor: '#ffd600' }]} />
          <View style={[styles.light, { backgroundColor: C.lime }]} />
        </View>
        <View style={styles.urlPill}>
          <Txt style={styles.urlTxt}>{PLANNER.urlBar}</Txt>
        </View>
        <Icon name="lock" size={14} color={RAMP.onPanel} />
      </View>

      {/* date + regenerate */}
      <View style={[styles.row, styles.borderB, { paddingVertical: 16 }]}>
        <View style={{ flex: 1 }}>
          <View style={styles.dateLine}>
            <View style={[styles.light, { backgroundColor: C.lime }]} />
            <Txt style={styles.dateTxt}>{PLANNER.date}</Txt>
          </View>
          <Txt style={styles.dateMeta}>{PLANNER.dateMeta}</Txt>
        </View>
        <Press
          onPress={regenerate}
          accessibilityRole="button"
          aria-label={PLANNER.regenerateLabel}
          hoverBorder={rgba('#ccff00', 0.6)}
          style={styles.regen}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Icon name="refresh-plain" size={18} color={RAMP.onPanel} />
          </Animated.View>
        </Press>
      </View>

      {/* gutter + schedule */}
      <View style={styles.grid}>
        <View style={styles.gutter}>
          {PLANNER.gutter.map((t) => (
            <Txt key={t} style={styles.gutterTxt}>
              {t}
            </Txt>
          ))}
        </View>
        <View style={styles.schedule}>
          {SCHEDULE.map((item) => (
            <ScheduleRow key={item.title} item={item} />
          ))}

          <View style={styles.recovery}>
            <View style={styles.recoveryRule} />
            <Icon name="cup" size={16} color={w(0.35)} />
            <Txt style={styles.recoveryTxt}>{PLANNER.recovery}</Txt>
            <View style={styles.recoveryRule} />
          </View>

          {SCHEDULE_AFTER_RECOVERY.map((item) => (
            <ScheduleRow key={item.title} item={item} />
          ))}

          {SCHEDULE_AI.slice(0, Math.max(0, aiPlaced)).map((item) => (
            <AiScheduleRow key={item.title} item={item} reduced={reduced} />
          ))}
        </View>
      </View>

      {/* footer */}
      <View style={[styles.row, styles.borderT, { paddingVertical: 16 }]}>
        <View style={styles.buffer}>
          <Icon name="shield" size={16} color={C.lime} />
          <Txt style={styles.bufferTxt}>{PLANNER.buffer}</Txt>
        </View>
        <Press onPress={onAddTask} accessibilityRole="button" hoverBg={w(0.15)} style={styles.addTask}>
          <Icon name="add" size={16} color="#fff" />
          <Txt style={styles.addTaskTxt}>{PLANNER.addTask}</Txt>
        </Press>
      </View>
    </View>
  );
}

function ScheduleRow({ item }: { item: ScheduleItem }) {
  const accent = item.accent;
  return (
    <Press
      accessibilityRole="button"
      hoverTransform={{ translateX: 4 }}
      hoverBorder={accent ? rgba('#ccff00', 0.5) : w(0.25)}
      style={[
        styles.item,
        accent
          ? { borderColor: rgba('#ccff00', 0.2), backgroundColor: rgba('#ccff00', 0.1) }
          : { borderColor: w(0.1), backgroundColor: w(0.06) },
      ]}>
      <View style={[styles.tile, { backgroundColor: item.tile }]}>
        <Icon name={item.icon} size={18} color={C.surface} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt style={styles.itemTitle}>{item.title}</Txt>
        <Txt style={styles.itemMeta}>{item.meta}</Txt>
      </View>
      <View style={[styles.durPill, accent ? { backgroundColor: rgba('#ccff00', 0.15) } : { backgroundColor: w(0.1) }]}>
        <Txt style={{ fontSize: 12, color: accent ? C.lime : w(0.6) }}>{item.duration}</Txt>
      </View>
    </Press>
  );
}

/** An AI-placed row that slides + fades in on mount (`useDemoSequence` mounts
 *  these one at a time as the walkthrough runs). Reduced motion → straight in. */
function AiScheduleRow({ item, reduced }: { item: ScheduleItem; reduced: boolean }) {
  const [anim] = useState(() => new Animated.Value(reduced ? 1 : 0));
  useEffect(() => {
    if (reduced) return;
    Animated.timing(anim, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [anim, reduced]);
  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
      }}>
      <ScheduleRow item={item} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    overflow: 'hidden',
    borderRadius: R.xl2,
    borderWidth: 1,
    borderColor: w(0.2),
    backgroundColor: rgba('#121212', 0.9),
    // shadow-2xl
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20 },
  borderB: { borderBottomWidth: 1, borderBottomColor: w(0.1) },
  borderT: { borderTopWidth: 1, borderTopColor: w(0.1) },
  chrome: { paddingVertical: 12, backgroundColor: w(0.04) },
  trafficLights: { flexDirection: 'row', gap: 8 },
  light: { height: 8, width: 8, borderRadius: 4 },
  urlPill: {
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.04),
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  urlTxt: { fontSize: 10, letterSpacing: 1, color: RAMP.onPanel },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateTxt: { color: '#fff', fontSize: 12 },
  dateMeta: { marginTop: 4, color: RAMP.onPanel, fontSize: 12 },
  regen: {
    height: 36,
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: w(0.15),
  },
  grid: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 16, gap: 16 },
  gutter: { width: 56, alignItems: 'flex-end', gap: 40, paddingTop: 8 },
  gutterTxt: { color: w(0.3), fontSize: 12 },
  schedule: { flex: 1, gap: 8, borderLeftWidth: 1, borderLeftColor: w(0.1), paddingLeft: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.lg,
    borderWidth: 1,
    padding: 12,
  },
  tile: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  itemTitle: { color: '#fff', fontWeight: '500', fontSize: 12 },
  itemMeta: { marginTop: 4, color: RAMP.onPanel, fontSize: 12 },
  durPill: { borderRadius: R.full, paddingHorizontal: 8, paddingVertical: 4 },
  recovery: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  recoveryRule: { flex: 1, height: 1, backgroundColor: w(0.1) },
  recoveryTxt: { color: RAMP.onPanel, fontSize: 12 },
  buffer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bufferTxt: { color: RAMP.onPanel, fontSize: 12 },
  addTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.md,
    backgroundColor: w(0.1),
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  addTaskTxt: { color: '#fff', fontSize: 12 },
});
