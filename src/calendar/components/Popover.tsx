import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { PointAnchor } from '../state';
import { N, R, SHADOW } from '../tokens';
import { useResponsive } from '../useResponsive';

/**
 * One shell for every small surface that opens from a point on the grid —
 * event detail, quick-create, "+2 more". Anchored beside the pointer on
 * desktop (flipped to stay on screen), a bottom sheet on a phone.
 */
export function Popover({
  anchor,
  width = 340,
  estHeight = 320,
  onClose,
  children,
  label,
}: {
  anchor: PointAnchor | null;
  width?: number;
  /** used only to keep the card on screen */
  estHeight?: number;
  onClose: () => void;
  children: React.ReactNode;
  label: string;
}) {
  const { isDesktop, width: vw, height: vh } = useResponsive();

  let pos: object = styles.sheetPos;
  if (isDesktop) {
    let left = (vw - width) / 2;
    let top = Math.max(16, (vh - estHeight) / 2);
    if (anchor) {
      left = anchor.x + 12;
      top = anchor.y - 12;
      if (left + width > vw - 16) left = Math.max(16, anchor.x - width - 12);
      if (top + estHeight > vh - 16) top = Math.max(16, vh - estHeight - 16);
    }
    pos = [styles.popPos, { left, top, width }];
  }

  return (
    <Modal visible transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close"
        style={[styles.backdrop, !isDesktop && styles.backdropSheet]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          aria-label={label}
          role="dialog"
          style={[pos, styles.card, SHADOW.lg, !isDesktop && styles.cardSheet]}>
          {!isDesktop && <View style={styles.grab} />}
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.pad}>
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end', backgroundColor: N.scrim },
  popPos: { position: 'absolute' },
  sheetPos: { width: '100%' },
  card: { backgroundColor: N.surface, borderRadius: R.xl, maxHeight: 560, overflow: 'hidden' },
  cardSheet: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0, maxHeight: '88%' },
  grab: { alignSelf: 'center', marginTop: 8, height: 4, width: 36, borderRadius: R.full, backgroundColor: N.ghost },
  pad: { padding: 18 },
});
