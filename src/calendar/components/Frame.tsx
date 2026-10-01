import { StyleSheet, View } from 'react-native';

import { HATCH, N } from '../tokens';

/** The ground behind the frame: #FAFAFA with the 2% diagonal hatch. */
export function Frame() {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: N.ground }, HATCH.ground]} />;
}
