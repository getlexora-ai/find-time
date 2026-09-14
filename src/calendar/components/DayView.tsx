import { StyleSheet, View } from 'react-native';

import type { CalActions, CalState } from '../state';
import { useCalTheme } from '../theme-context';
import { R } from '../tokens';
import type { CalEvent } from '../types';
import { useResponsive } from '../useResponsive';
import { Agenda } from './Agenda';
import { TimeGrid } from './TimeGrid';

/**
 * One day: the time grid, full width.
 *
 * The right rail is gone. It held a stat card — planned, still free, a capacity
 * bar and a count by kind — which is now three of the four readings in the KPI
 * strip above the grid, computed from the same events and scoped to the same
 * day; and under it a compact agenda, which was a second rendering of the
 * blocks already drawn beside it. Neither told you anything the screen was not
 * already saying, and between them they took 320px off the one surface that
 * benefits from width.
 *
 * Below the desktop breakpoint there is no grid at all, so the agenda is the
 * day view rather than a duplicate of it.
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
  const { isDesktop } = useResponsive();
  const d = state.selected;

  if (!isDesktop) return <Agenda date={d} actions={actions} events={events} />;

  return (
    <View style={[styles.gridCard, { borderColor: theme.panelBorder }]}>
      <TimeGrid days={[d]} events={events} actions={actions} showNowChip fill />
    </View>
  );
}

const styles = StyleSheet.create({
  gridCard: { flex: 1, minHeight: 0, borderRadius: R.xl, borderWidth: 1, overflow: 'hidden' },
});
