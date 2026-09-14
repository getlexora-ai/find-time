import { useMemo, useState } from 'react';
import { type LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { addDays, iso, sameDay, startOfWeek } from '../cal-date';
import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { GUTTER, GUTTER_PHONE, MIN_COL, R } from '../tokens';
import type { CalEvent } from '../types';
import { useResponsive } from '../useResponsive';
import { TimeGrid } from './TimeGrid';

/**
 * The week. One card, one grid, every screen size.
 *
 * The phone used to get a day-pill strip over an agenda list instead — a
 * different product below 1024px, with none of the things the week grid is for:
 * you could not see Tuesday and Thursday at once, could not see where the room
 * was, and the tile taxonomy the rest of the app teaches did not appear.
 *
 * It is the same grid now. The only concession to width is how many columns are
 * on screen: seven while each stays at least `MIN_COL` wide, and three at a time
 * — scrolled, snapped to the day — once they would not.
 */
export function WeekView({
  state,
  actions,
  events,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
}) {
  const { theme } = useCalTheme();
  const { isDesktop, isPhone, width } = useResponsive();
  const start = startOfWeek(state.cursor);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);

  // Measured once laid out; until then the window width minus the chrome we
  // know about (rail + page padding) is a good enough first guess to paint the
  // right number of columns on the first frame rather than reflowing into it.
  const [cardW, setCardW] = useState(0);
  const avail = cardW || width - (isDesktop ? 252 : isPhone ? 16 : 32);
  const gutter = isPhone ? GUTTER_PHONE : GUTTER;

  const colWidth =
    (avail - gutter) / 7 >= MIN_COL ? undefined : Math.floor((avail - gutter) / 3);

  return (
    <View
      onLayout={(e: LayoutChangeEvent) => setCardW(e.nativeEvent.layout.width)}
      style={[styles.card, { borderColor: theme.panelBorder }]}>
      <TimeGrid
        days={days}
        events={events}
        actions={actions}
        header
        fill
        colWidth={colWidth}
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
  card: { flex: 1, minHeight: 0, borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
});
