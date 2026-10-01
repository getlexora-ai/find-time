import { StyleSheet, View } from 'react-native';

import type { PointAnchor } from '../state';
import type { CalEvent } from '../types';
import { Button } from '../ui';
import { MiniMonth } from './MiniMonth';
import { Popover } from './Popover';

/** "Jump to a date": under the heading on desktop, a sheet on a phone. */
export function PickerSheet({
  anchor = null,
  selected,
  events,
  onPick,
  onToday,
  onClose,
}: {
  anchor?: PointAnchor | null;
  cursor?: Date;
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
  onToday: () => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={anchor} width={320} estHeight={380} onClose={onClose} label="Jump to a date">
      <MiniMonth selected={selected} events={events} onPick={onPick} weekOf={selected} />
      <View style={styles.row}>
        <Button variant="secondary" label="Today" onPress={onToday} style={{ flex: 1 }} />
        <Button variant="ghost" label="Close" onPress={onClose} style={{ flex: 1 }} />
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
});
