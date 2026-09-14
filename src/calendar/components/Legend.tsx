import { StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { KIND_KEYS, KINDS } from '../kinds';
import { CATS, CAT_KEYS, R, w } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { Press, Txt } from '../ui';

/**
 * The legend, which is also the filter.
 *
 * Two taxonomies run through this calendar and the app never explained either:
 * kind is the shape of a block, category is its colour. Naming them is what
 * makes the grid readable, and tapping a kind is how you get a calendar of only
 * what you committed to.
 *
 * It lives here rather than inside the sidebar because below 1024px there is no
 * sidebar — the same rows are the body of the filter sheet, and one copy is what
 * stops the phone's legend from drifting out of step with the desktop's.
 */
export function Legend({
  events,
  hidden,
  onToggleKind,
  /** Roomier rows for the phone sheet, where these are thumb targets. */
  touch = false,
}: {
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  touch?: boolean;
}) {
  return (
    <>
      <Section title="Kinds" hint="Shape of the block">
        {KIND_KEYS.map((k) => {
          const spec = KINDS[k];
          const n = events.filter((e) => e.kind === k).length;
          const off = hidden.has(k);
          return (
            <Press
              key={k}
              onPress={() => onToggleKind(k)}
              hoverBg={w(0.08)}
              accessibilityRole="switch"
              aria-checked={!off}
              aria-label={`${spec.label} — ${spec.blurb}`}
              style={[styles.row, touch && styles.rowTouch, off && styles.rowOff]}>
              <Icon name={spec.icon} size={15} color={off ? w(0.22) : spec.accent ?? w(0.6)} />
              <Txt style={[styles.rowLabel, off && styles.rowLabelOff]}>{spec.label}</Txt>
              <Txt style={styles.rowCount}>{n}</Txt>
            </Press>
          );
        })}
      </Section>

      <Section title="Categories" hint="Colour of the block">
        {CAT_KEYS.map((k) => (
          <View key={k} style={[styles.row, touch && styles.rowTouch]}>
            <View style={[styles.catDot, { backgroundColor: CATS[k].color }]} />
            <Txt style={styles.rowLabel}>{CATS[k].label}</Txt>
            <Txt style={styles.rowCount}>{events.filter((e) => e.cat === k).length}</Txt>
          </View>
        ))}
      </Section>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Txt style={styles.sectionTitle}>{title}</Txt>
      <Txt style={styles.sectionHint}>{hint}</Txt>
      <View style={{ marginTop: 6 }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 20, borderTopWidth: 1, borderTopColor: w(0.08), paddingTop: 14 },
  sectionTitle: { color: w(0.5), fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2, paddingHorizontal: 6 },
  sectionHint: { marginTop: 2, color: w(0.24), fontSize: 10, lineHeight: 14, paddingHorizontal: 6 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: R.md,
    paddingHorizontal: 6,
    paddingVertical: 7,
  },
  rowTouch: { paddingVertical: 11, paddingHorizontal: 8 },
  rowOff: { opacity: 0.5 },
  rowLabel: { flex: 1, color: w(0.72), fontSize: 11 },
  rowLabelOff: { color: w(0.3), textDecorationLine: 'line-through' },
  rowCount: { color: w(0.25), fontSize: 11 },
  catDot: { height: 7, width: 7, borderRadius: 4, marginHorizontal: 4 },
});
