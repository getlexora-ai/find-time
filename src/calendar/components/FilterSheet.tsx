import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCalTheme } from '../theme-context';
import { C, R, w } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { Press, Txt } from '../ui';
import { GoogleCalendars } from './GoogleCalendars';
import { Legend } from './Legend';

/**
 * The rail, as a bottom sheet.
 *
 * Below 1024px the sidebar is not rendered, which quietly took the kind filters
 * and the Google Calendar sources off the phone entirely — they existed, they
 * changed what the grid drew, and there was no way to reach them. This is the
 * same `Legend` and the same `GoogleCalendars` the rail shows, so the two
 * surfaces cannot drift.
 */
export function FilterSheet({
  events,
  hidden,
  onToggleKind,
  onOpenTheme,
  onClose,
}: {
  events: CalEvent[];
  hidden: Set<EventKind>;
  onToggleKind: (k: EventKind) => void;
  onOpenTheme: () => void;
  onClose: () => void;
}) {
  const { theme } = useCalTheme();
  const insets = useSafeAreaInsets();
  const on = events.filter((e) => !hidden.has(e.kind)).length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={[styles.backdrop, { backgroundColor: C.scrim }]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[styles.sheet, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom }}>
            <View style={styles.grab} />
            <View style={styles.head}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={styles.title}>What the grid shows</Txt>
                <Txt style={styles.sub}>
                  {on} of {events.length} block{events.length === 1 ? '' : 's'} visible
                </Txt>
              </View>
              <Press onPress={onOpenTheme} hoverBg={w(0.1)} style={styles.ghost}>
                <Txt style={styles.ghostTxt}>Theme</Txt>
              </Press>
            </View>

            <Legend events={events} hidden={hidden} onToggleKind={onToggleKind} touch />

            <GoogleCalendars />

            <Press onPress={onClose} hoverBg={C.limeHover} style={styles.done}>
              <Txt style={styles.doneTxt}>Done</Txt>
            </Press>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    width: '100%',
    maxHeight: '88%',
    borderTopLeftRadius: R.xl2,
    borderTopRightRadius: R.xl2,
    borderWidth: 1,
  },
  grab: { alignSelf: 'center', marginBottom: 16, height: 4, width: 40, borderRadius: R.full, backgroundColor: w(0.2) },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: '#fff', fontSize: 15, fontWeight: '500', letterSpacing: -0.3 },
  sub: { marginTop: 3, color: w(0.42), fontSize: 11, lineHeight: 15 },
  ghost: {
    height: 34,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostTxt: { color: w(0.7), fontSize: 11 },
  done: {
    marginTop: 20,
    height: 46,
    borderRadius: R.lg,
    backgroundColor: C.lime,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
});
