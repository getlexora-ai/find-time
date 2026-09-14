import { ScrollView, StyleSheet, View } from 'react-native';

import { Logo } from '@/design/Logo';
import { C, R, w } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { AccountButton } from './AccountButton';
import { GoogleCalendars } from './GoogleCalendars';
import { Legend } from './Legend';
import { MiniMonth } from './MiniMonth';
import { useCalTheme } from '../theme-context';
import { Txt } from '../ui';

/**
 * The rail. Narrower than before (224 vs 256) and stripped to the three things
 * that navigate or change what the grid shows:
 *
 *   mini-month → jump          kinds → filter          calendars → sources
 *
 * Gone: a one-item "Calendar" nav list that was inert by construction, a
 * "Focus protected" gauge duplicating the Day view's own numbers, and a
 * decorative eye icon.
 *
 * Below 1024px this rail is not rendered at all, so each of its three jobs has a
 * counterpart on the phone: the mini-month is the picker sheet behind the title,
 * the legend and the calendars are the filter sheet behind the bottom nav, and
 * the account button moves into the command bar. `Legend` is literally the same
 * component in both places.
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

        <Legend events={events} hidden={hidden} onToggleKind={onToggleKind} />

        <GoogleCalendars />

        <View style={styles.user}>
          <AccountButton showName />
        </View>
      </ScrollView>
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
  user: { marginTop: 'auto', paddingTop: 16, paddingHorizontal: 4 },
});
