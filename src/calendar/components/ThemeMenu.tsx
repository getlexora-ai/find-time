import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '../Icon';
import { useCalTheme } from '../theme-context';
import { THEMES } from '../themes';
import { C, R, w } from '../tokens';
import { Txt } from '../ui';
import { useToast } from './Toast';

/** The 7-background menu (calendar.html `#themeMenu`). Anchored top-right. */
export function ThemeMenu({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { theme, themeKey, setTheme } = useCalTheme();
  const toast = useToast();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}
          onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <Txt style={styles.headTitle}>Background</Txt>
            <Txt style={styles.headHint}>Interior stays</Txt>
          </View>
          <ScrollView style={styles.list} contentContainerStyle={{ padding: 8 }}>
            {THEMES.map((t) => {
              const on = t.key === themeKey;
              return (
                <Pressable
                  key={t.key}
                  accessibilityRole="menuitem"
                  aria-checked={on}
                  onPress={() => {
                    setTheme(t.key);
                    toast(`Background: ${t.name}`);
                    onClose();
                  }}
                  style={({ hovered }: { hovered?: boolean }) => [
                    styles.item,
                    (on || hovered) && { backgroundColor: w(0.05) },
                    on && { borderWidth: 1, borderColor: w(0.1) },
                  ]}>
                  <View style={[styles.sw, { backgroundColor: t.sw }]} />
                  <View style={styles.itemBody}>
                    <View style={styles.itemTop}>
                      <Txt style={styles.itemName}>{t.name}</Txt>
                      <View style={styles.tag}>
                        <Txt style={styles.tagTxt}>{t.tag}</Txt>
                      </View>
                    </View>
                    <Txt numberOfLines={1} style={styles.itemNote}>
                      {t.note}
                    </Txt>
                  </View>
                  <View style={{ opacity: on ? 1 : 0 }}>
                    {/* calendar.html themeList uses the -bold check here, not -linear */}
                    <Icon name="check-bold" size={18} color={C.lime} />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.foot}>
            <Txt style={styles.footTxt}>Saved on this device · switch anytime</Txt>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  card: {
    position: 'absolute',
    right: 12,
    top: 68,
    width: 288,
    maxWidth: '92%',
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: w(0.1),
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headTitle: { color: w(0.45), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  headHint: { color: w(0.3), fontSize: 10, lineHeight: 14, textTransform: 'uppercase', letterSpacing: 1.2 },
  list: { maxHeight: 420 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: R.xl, paddingHorizontal: 12, paddingVertical: 10 },
  sw: { height: 32, width: 32, borderRadius: R.lg, borderWidth: 1, borderColor: w(0.15) },
  itemBody: { flex: 1, minWidth: 0 },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemName: { color: w(0.85), fontSize: 12 },
  tag: { borderRadius: R.full, borderWidth: 1, borderColor: w(0.15), paddingHorizontal: 6, paddingVertical: 2 },
  tagTxt: { color: w(0.45), fontSize: 10, lineHeight: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  itemNote: { marginTop: 2, color: w(0.4), fontSize: 12 },
  foot: { borderTopWidth: 1, borderTopColor: w(0.1), paddingHorizontal: 16, paddingVertical: 10 },
  footTxt: { color: w(0.35), fontSize: 12 },
});
