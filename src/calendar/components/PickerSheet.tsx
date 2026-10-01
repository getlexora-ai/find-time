import { StyleSheet, View } from 'react-native';

import type { CalEvent } from '../types';
import { Button } from '../ui';
import { MiniMonth } from './MiniMonth';
import { Popover } from './Popover';

/** Phone "jump to a date" sheet — the same month the desktop rail shows. */
export function PickerSheet({
  selected,
  events,
  onPick,
  onToday,
  onClose,
}: {
  cursor?: Date;
  selected: Date;
  events: CalEvent[];
  onPick: (dateIso: string) => void;
  onToday: () => void;
  onClose: () => void;
}) {
  return (
    <Popover anchor={null} onClose={onClose} label="Jump to a date">
      <MiniMonth selected={selected} events={events} onPick={onPick} weekOf={selected} />
      <View style={styles.row}>
        <Button variant="secondary" label="Today" onPress={onToday} style={{ flex: 1 }} />
        <Button variant="ghost" label="Close" onPress={onClose} style={{ flex: 1 }} />
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
});
