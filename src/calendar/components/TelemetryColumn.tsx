import { StyleSheet, View } from 'react-native';

import { w } from '../tokens';
import { Txt } from '../ui';

const ROWS = [
  'DAY.252',
  'WK.37',
  'CAP.08H',
  'FOC.04',
  'BRK.03',
  'UTC.14:22',
  'PRIORITY.A',
  'ENERGY.78',
  'CONF.01',
  'STATUS.OPEN',
];

/** Pure context column (spec §4, xl+). Nothing functional is gated behind it. */
export function TelemetryColumn() {
  return (
    <View style={styles.col} aria-hidden>
      {ROWS.map((r) => (
        <Txt key={r} style={styles.row}>
          {r}
        </Txt>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  col: {
    width: 80,
    borderRightWidth: 1,
    borderRightColor: w(0.1),
    paddingVertical: 32,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  row: { color: w(0.3), fontSize: 10, lineHeight: 14, textTransform: 'uppercase' },
});
