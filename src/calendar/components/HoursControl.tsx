import { StyleSheet, View } from 'react-native';

import { pad } from '../cal-date';
import { MIN_WINDOW_H, setWindow, useHours } from '../hours';
import { Icon } from '../Icon';
import { CATS, N, R, SANS, tint } from '../tokens';
import { Label, Press, Txt } from '../ui';

const WD1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/**
 * "Your hours" — the window the grid draws (spec §5). Working hours are shown
 * underneath, read-only: they are the AI's scheduler profile, and the grid
 * washes everything outside them.
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
        <Txt style={styles.dash}>–</Txt>
        <Stepper
          value={h.end}
          label="Day ends"
          canDown={h.end > h.start + MIN_WINDOW_H}
          canUp={h.end < 24}
          onChange={(v) => setWindow(h.start, v)}
        />
      </View>
      <Txt style={styles.hint}>The calendar shows only these hours. Anything outside shows as a +n in that day&apos;s header.</Txt>

      <Label style={styles.workHead}>Working hours</Label>
      <View style={styles.days}>
        {h.work.map((w, i) => (
          <View key={i} style={[styles.day, !w && styles.dayOff]}>
            <Txt style={[styles.dayTxt, !w && styles.dayTxtOff]}>{WD1[i]}</Txt>
          </View>
        ))}
      </View>
      <Txt style={styles.workLine}>
        {work ? (same ? `${pad(work.start)}:00 – ${pad(work.end)}:00` : 'Varies by day') : 'None set'} · the rest is shaded
      </Txt>
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
        <Icon name="arrow-left" size={14} color={N.ink2} />
      </Press>
      <Txt style={styles.stepVal}>{pad(value % 24)}:00</Txt>
      <Press
        disabled={!canUp}
        onPress={() => onChange(value + 1)}
        hoverBg={N.hover}
        style={styles.stepBtn}
        accessibilityRole="button"
        aria-label={`${label} later`}>
        <Icon name="arrow-right" size={14} color={N.ink2} />
      </Press>
    </View>
  );
}

const ON = tint(CATS.deep.color, 0.18);

const styles = StyleSheet.create({
  section: { paddingVertical: 16, borderTopWidth: 1, borderTopColor: N.line },
  row: { marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  dash: { fontFamily: SANS, fontSize: 14, color: N.faint },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: N.lineStrong,
    height: 40,
  },
  stepBtn: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  stepVal: { flex: 1, textAlign: 'center', fontFamily: SANS, fontSize: 15, lineHeight: 20, fontWeight: '500', color: N.ink, fontVariant: ['tabular-nums'] },
  hint: { marginTop: 10, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },
  workHead: { marginTop: 18 },
  days: { marginTop: 10, flexDirection: 'row', gap: 6 },
  day: { flex: 1, height: 32, borderRadius: 16, backgroundColor: ON, alignItems: 'center', justifyContent: 'center' },
  dayOff: { backgroundColor: N.sunken },
  dayTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '600', color: N.ink },
  dayTxtOff: { color: N.faint, fontWeight: '500' },
  workLine: { marginTop: 10, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2, fontVariant: ['tabular-nums'] },
});
