import { ScrollView, StyleSheet, View } from 'react-native';

import { N } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { AccountButton } from './AccountButton';
import { GoogleCalendars } from './GoogleCalendars';
import { HoursControl } from './HoursControl';
import { Legend } from './Legend';
import { MiniMonth } from './MiniMonth';

/**
 * The rail: jump (month), show (kinds), your hours, calendars, account.
 * Below 1024px each has a phone counterpart: the month is the sheet behind the
 * title, the rest is the "Show" sheet — the same components, so they cannot drift.
 */
export function Sidebar({
  selected,
  weekOf,
  events,
  hidden,
  onToggleKind,
  onPick,
}: {
  selected: Date;
  weekOf?: Date;
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  onPick: (dateIso: string) => void;
}) {
  return (
    <View style={styles.aside}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <MiniMonth selected={selected} events={events} onPick={onPick} weekOf={weekOf} />
        <Legend events={events} hidden={hidden} onToggleKind={onToggleKind} />
        <HoursControl />
        <GoogleCalendars />
        <View style={styles.user}>
          <AccountButton showName />
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  aside: { width: 248, borderRightWidth: 1, borderRightColor: N.line, backgroundColor: 'rgba(255,255,255,0.5)' },
  content: { paddingHorizontal: 16, paddingBottom: 16, flexGrow: 1 },
  user: { marginTop: 'auto', paddingTop: 16, borderTopWidth: 1, borderTopColor: N.line },
});
