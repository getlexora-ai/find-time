import { StyleSheet, View } from 'react-native';

import { pad } from '../cal-date';
import { MIN_WINDOW_H, setWindow, useHours } from '../hours';
import { Icon } from '../Icon';
import { N, R, SANS, T } from '../tokens';
import { Label, Mono, Press, Txt } from '../ui';

const WD1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * "Your hours" — the window the grid draws (spec §5). Working hours are shown
 * underneath, read-only: they are the AI's scheduler profile, and the grid
 * hatches everything outside them.
 */
export function HoursControl() {
  const h = useHours();
  const work = h.work.find(Boolean);
  const same = h.work.filter(Boolean).every((w) => w!.start === work?.start && w!.end === work?.end);

  return (
    <View style={styles.section}>
      <Label>Your hours</Label>
      <View style={styles.row}>
        <Stepper
          value={h.start}
          label="Day starts"
          canDown={h.start > 0}
          canUp={h.start < h.end - MIN_WINDOW_H}
          onChange={(v) => setWindow(v, h.end)}
        />
        <Mono style={styles.dash}>–</Mono>
        <Stepper
          value={h.end}
          label="Day ends"
          canDown={h.end > h.start + MIN_WINDOW_H}
          canUp={h.end < 24}
          onChange={(v) => setWindow(h.start, v)}
        />
      </View>
      <Txt style={styles.hint}>The calendar shows only these hours. Anything outside sits in a chip at the edge.</Txt>

      <Label style={styles.workHead}>Working hours</Label>
      <View style={styles.days}>
        {h.work.map((w, i) => (
          <View key={i} style={[styles.day, !w && styles.dayOff]}>
            <Mono style={[styles.dayTxt, !w && styles.dayTxtOff]}>{WD1[i]}</Mono>
          </View>
        ))}
      </View>
      <Mono style={styles.workLine}>
        {work ? (same ? `${pad(work.start)}:00–${pad(work.end)}:00` : 'varies by day') : 'none set'} · rest is hatched
      </Mono>
    </View>
  );
}

function Stepper({
  value,
  label,
  canDown,
  canUp,
  onChange,
}: {
  value: number;
  label: string;
  canDown: boolean;
  canUp: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.stepper} accessibilityRole="adjustable" aria-label={`${label}: ${pad(value)}:00`}>
      <Press
        disabled={!canDown}
        onPress={() => onChange(value - 1)}
        hoverBg={N.hover}
        style={styles.stepBtn}
        accessibilityRole="button"
        aria-label={`${label} earlier`}>
        <Icon name="arrow-left" size={12} color={N.muted} />
      </Press>
      <Mono style={styles.stepVal}>{pad(value % 24)}:00</Mono>
      <Press
        disabled={!canUp}
        onPress={() => onChange(value + 1)}
        hoverBg={N.hover}
        style={styles.stepBtn}
        accessibilityRole="button"
        aria-label={`${label} later`}>
        <Icon name="arrow-right" size={12} color={N.muted} />
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: N.line },
  row: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dash: { color: N.faint },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: N.lineStrong,
    height: 30,
  },
  stepBtn: { width: 24, height: 28, alignItems: 'center', justifyContent: 'center' },
  stepVal: { flex: 1, textAlign: 'center', color: N.ink, fontSize: 11 },
  hint: { marginTop: 8, fontFamily: SANS, ...T.caption, fontSize: 11, color: N.muted },
  workHead: { marginTop: 14 },
  days: { marginTop: 6, flexDirection: 'row', gap: 3 },
  day: { flex: 1, height: 20, borderRadius: R.xs, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  dayOff: { backgroundColor: N.sunken },
  dayTxt: { color: N.onInk, fontSize: 9 },
  dayTxtOff: { color: N.faint },
  workLine: { marginTop: 6 },
});
