import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { fromIso, iso } from '../cal-date';
import type { CalActions, CalState } from '../state';
import type { CalEvent } from '../types';
import { TimeGrid } from './TimeGrid';

/** One day: the same grid and tiles, one column, more room for each tile's meta. */
export function DayView({
  state,
  actions,
  events,
  selectedId,
  clashIds,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
  selectedId?: number | null;
  clashIds?: Set<number>;
}) {
  const dayIso = iso(state.selected);
  const days = useMemo(() => [fromIso(dayIso)], [dayIso]);
  return (
    <View style={styles.fill}>
      <TimeGrid
        days={days}
        events={events}
        actions={actions}
        header
        fill
        selectedId={selectedId}
        clashIds={clashIds}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
});
