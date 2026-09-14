import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { Logo } from '@/design/Logo';
import { KIND_KEYS, KINDS } from '../kinds';
import { CATS, CAT_KEYS, C, R, w } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { AccountButton } from './AccountButton';
import { GoogleCalendars } from './GoogleCalendars';
import { MiniMonth } from './MiniMonth';
import { useCalTheme } from '../theme-context';
import { Press, Txt } from '../ui';

/**
 * The rail. Narrower than before (224 vs 256) and stripped to the three things
 * that navigate or change what the grid shows:
 *
 *   mini-month → jump          kinds → filter          calendars → sources
 *
 * Gone: a one-item "Calendar" nav list that was inert by construction, a
 * "Focus protected" gauge duplicating the Day view's own numbers, and a
 * decorative eye icon. The category rows were `Press` elements with no
 * `onPress` — they looked clickable and did nothing; they now filter.
 */
export function Sidebar({
  selected,
  events,
  hidden,
  onToggleKind,
  onPick,
}: {
  selected: Date;
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  onPick: (dateIso: string) => void;
}) {
  const { theme } = useCalTheme();

  return (
    <View style={[styles.aside, { backgroundColor: theme.rail, borderRightColor: w(0.1) }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Logo size={22} color={C.surface} />
          </View>
          <Txt style={styles.brandName}>Find time</Txt>
        </View>

        <MiniMonth selected={selected} events={events} onPick={onPick} />

        {/*
          The legend IS the filter. Two taxonomies run through this calendar and
          the app never explained either: kind is the shape of a block, category
          is its colour. Naming them here is what makes the grid readable, and
          clicking one is how you get a calendar of only what you committed to.
        */}
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
                style={[styles.row, off && styles.rowOff]}>
                <Icon name={spec.icon} size={15} color={off ? w(0.22) : spec.accent ?? w(0.6)} />
                <Txt style={[styles.rowLabel, off && styles.rowLabelOff]}>{spec.label}</Txt>
                <Txt style={styles.rowCount}>{n}</Txt>
              </Press>
            );
          })}
        </Section>

        <Section title="Categories" hint="Colour of the block">
          {CAT_KEYS.map((k) => (
            <View key={k} style={styles.row}>
              <View style={[styles.catDot, { backgroundColor: CATS[k].color }]} />
              <Txt style={styles.rowLabel}>{CATS[k].label}</Txt>
              <Txt style={styles.rowCount}>{events.filter((e) => e.cat === k).length}</Txt>
            </View>
          ))}
        </Section>

        <GoogleCalendars />

        <View style={styles.user}>
          <AccountButton showName />
        </View>
      </ScrollView>
    </View>
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
  aside: { width: 224, borderRightWidth: 1 },
  content: { paddingHorizontal: 14, paddingVertical: 16, flexGrow: 1 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 6, paddingHorizontal: 4 },
  logo: {
    height: 30,
    width: 30,
    borderRadius: R.md,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: { color: '#fff', fontSize: 13, fontWeight: '500' },

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
  rowOff: { opacity: 0.5 },
  rowLabel: { flex: 1, color: w(0.72), fontSize: 11 },
  rowLabelOff: { color: w(0.3), textDecorationLine: 'line-through' },
  rowCount: { color: w(0.25), fontSize: 11 },
  catDot: { height: 7, width: 7, borderRadius: 4, marginHorizontal: 4 },

  user: { marginTop: 'auto', paddingTop: 16, paddingHorizontal: 4 },
});
