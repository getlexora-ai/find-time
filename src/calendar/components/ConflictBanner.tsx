import { StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { C, R, rgba, w } from '../tokens';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

export function ConflictBanner({ onResolve }: { onResolve: () => void }) {
  const { isPhone } = useResponsive();
  return (
    <View style={styles.wrap}>
      <View style={styles.badge}>
        <Icon name="triangle" size={18} color={C.surface} />
      </View>
      <View style={styles.body}>
        <Txt style={styles.title}>Double-booked Wednesday 11:00</Txt>
        <Txt style={styles.sub}>Product team sync overlaps Roadmap review with Maya by 30 minutes.</Txt>
      </View>
      {!isPhone && (
        <Press onPress={onResolve} hoverBg="#ff5a1f" style={styles.resolve} accessibilityRole="button">
          <Txt style={styles.resolveTxt}>Resolve</Txt>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: rgba('#ff4400', 0.4),
    backgroundColor: rgba('#ff4400', 0.1),
    padding: 16,
  },
  badge: {
    height: 36,
    width: 36,
    borderRadius: R.lg,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  title: { color: '#fff', fontSize: 12, lineHeight: 16 },
  sub: { marginTop: 4, color: w(0.5), fontSize: 12, lineHeight: 16 },
  resolve: { borderRadius: R.lg, backgroundColor: C.orange, paddingHorizontal: 12, paddingVertical: 8 },
  resolveTxt: { color: C.surface, fontSize: 12 },
});
