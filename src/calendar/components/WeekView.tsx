import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { addDays, iso, sameDay, startOfWeek } from '../cal-date';
import type { CalActions, CalState } from '../state';
import { GUTTER, GUTTER_PHONE, MIN_COL } from '../tokens';
import type { CalEvent } from '../types';
import { useResponsive } from '../useResponsive';
import { TimeGrid } from './TimeGrid';

/**
 * The week: seven columns, always — non-working days are hatched, not hidden,
 * so a Saturday commitment is never out of sight (spec §6).
 *
 * Seven columns while each stays at least `MIN_COL` wide; below that, three at
 * a time, swiped and snapped to the day.
 */
export function WeekView({
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
  const { isDesktop, isPhone, width } = useResponsive();
  const start = startOfWeek(state.cursor);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  // Measured once laid out; until then a first guess so the first frame paints
  // the right number of columns instead of reflowing into it.
  const [cardW, setCardW] = useState(0);
  const avail = cardW || width - (isDesktop ? 300 : 0);
  const gutter = isPhone ? GUTTER_PHONE : GUTTER;
  const colWidth = (avail - gutter) / 7 >= MIN_COL ? undefined : Math.floor((avail - gutter) / 3);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setCardW(e.nativeEvent.layout.width)} style={styles.fill}>
      <TimeGrid
        days={days}
        events={events}
        actions={actions}
        header
        fill
        colWidth={colWidth}
        selectedId={selectedId}
        clashIds={clashIds}
        focusIndex={Math.max(0, days.findIndex((d) => sameDay(d, state.selected)))}
        onPickDay={(d) => {
          actions.pick(iso(d));
          actions.setView('day');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
});
