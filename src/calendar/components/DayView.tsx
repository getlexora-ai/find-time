import { StyleSheet, View } from 'react-native';

import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { R } from '../tokens';
import type { CalEvent } from '../types';
import { TimeGrid } from './TimeGrid';

/**
 * One day: the time grid, full width, on every screen size.
 *
 * The desktop right rail is gone — it held a stat card (planned, still free, a
 * capacity bar, a count by kind) which is now three of the four readings in the
 * KPI strip above the grid, computed from the same events and scoped to the same
 * day; and under it a compact agenda, a second rendering of the blocks already
 * drawn beside it.
 *
 * The phone's agenda list is gone for the same reason it was never right: it was
 * a *different* view of the day, so the tile taxonomy, the now-line and the
 * shape of an empty afternoon — the things the grid exists to show — simply did
 * not exist on a phone.
 */
export function DayView({
  state,
  actions,
  events,
}: {
  state: CalState;
  actions: CalActions;
  events: CalEvent[];
}) {
  const { theme } = useCalTheme();

  return (
    <View style={[styles.gridCard, { borderColor: theme.panelBorder }]}>
      <TimeGrid days={[state.selected]} events={events} actions={actions} showNowChip fill />
    </View>
  );
}

const styles = StyleSheet.create({
  gridCard: { flex: 1, minHeight: 0, borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
});
