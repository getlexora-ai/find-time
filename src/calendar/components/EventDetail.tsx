import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { deleteEvent, toggleProtected } from '../cal-store';
import { fromIso, MO, toMin, wdIndex, WD_LONG } from '../cal-date';
import { Icon } from '../Icon';
import type { CalActions, PointAnchor } from '../state';
import { useCalTheme } from '../theme-context';
import { CATS, C, durLabel, R, rgba, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { useToast } from './Toast';

type Anchor = PointAnchor;

/** Event detail — anchored popover ≥1024px, bottom sheet below (spec §2.12/§2.13).
 *  Read-only; Edit and Reschedule are explicit next steps. */
export function EventDetail({
  event,
  anchor,
  isDesktop,
  onClose,
  actions,
}: {
  event: CalEvent | null;
  anchor: Anchor | null;
  isDesktop: boolean;
  onClose: () => void;
  actions: CalActions;
}) {
  const { theme } = useCalTheme();
  const { width, height } = useResponsive();
  const toast = useToast();
  if (!event) return null;
  const ev = event;
  const c = CATS[ev.cat];
  const date = fromIso(ev.date);

  const W = 336;
  const H = 460;
  let left = 12;
  let top = 12;
  if (isDesktop && anchor) {
    left = anchor.x + 12;
    top = anchor.y - 8;
    if (left + W > width - 12) left = Math.max(12, anchor.x - W - 12);
    if (top + H > height - 12) top = Math.max(12, height - H - 12);
  }

  const body = (
    <View style={[styles.card, { backgroundColor: theme.panel, borderColor: theme.panelBorder }]}>
      <View style={[styles.catBar, { backgroundColor: c.color }]} />
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={styles.top}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.eyebrowRow}>
              <View style={[styles.dot, { backgroundColor: c.color }]} />
              <Txt style={styles.eyebrow}>{c.label}</Txt>
              {ev.kind === 'focus' && (
                <View style={styles.tagLime}>
                  <Txt style={styles.tagLimeTxt}>Protected</Txt>
                </View>
              )}
              {ev.conflict && (
                <View style={styles.tagOrange}>
                  <Txt style={styles.tagOrangeTxt}>Clash</Txt>
                </View>
              )}
            </View>
            <Txt style={styles.title}>{ev.title}</Txt>
          </View>
          <Press onPress={onClose} hoverBg={w(0.1)} style={styles.close} aria-label="Close">
            <Icon name="close" size={18} color={w(0.45)} />
          </Press>
        </View>

        <View style={styles.meta}>
          <Line icon="clock">
            {WD_LONG[wdIndex(date)]} {date.getDate()} {MO[date.getMonth()].slice(0, 3)} · {ev.start}–{ev.end} ·{' '}
            {durLabel(toMin(ev.end) - toMin(ev.start))}
          </Line>
          {!!ev.project && <Line icon="folder">{ev.project}</Line>}
          <Line icon="bolt">
            {toMin(ev.start) < 12 * 60 ? 'Placed in your morning energy peak' : 'Placed after the midday dip'}
          </Line>
          {!!ev.notes && (
            <View style={styles.notes}>
              <Txt style={styles.notesTxt}>{ev.notes}</Txt>
            </View>
          )}
        </View>

        {ev.conflict && (
          <View style={styles.conflictBox}>
            <Icon name="triangle" size={16} color={C.orange} />
            <Txt style={styles.conflictTxt}>
              Overlaps another block for 30 minutes. Find time can move whichever is flexible.
            </Txt>
          </View>
        )}

        <View style={styles.actionsGrid}>
          <Press
            onPress={() => {
              onClose();
              actions.openCompose(ev.id);
            }}
            hoverBg={w(0.1)}
            style={styles.ghostBtn}>
            <Icon name="pen" size={16} color={w(0.75)} />
            <Txt style={styles.ghostTxt}>Edit</Txt>
          </Press>
          <Press
            onPress={() => {
              onClose();
              actions.openAI(`Find a better slot for "${ev.title}" this week`);
            }}
            hoverBg={C.limeHover}
            style={styles.limeBtn}>
            <Icon name="magic" size={16} color={C.surface} />
            <Txt style={styles.limeTxt}>Reschedule</Txt>
          </Press>
        </View>
        <View style={styles.actionsRow}>
          <Press
            onPress={() => {
              toggleProtected(ev.id);
              onClose();
              toast(ev.kind === 'focus' ? 'Block is flexible again' : 'Block protected — AI will not move it');
            }}
            hoverBg={w(0.1)}
            style={styles.protectBtn}>
            <Icon name="shield" size={16} color={w(0.6)} />
            <Txt style={styles.protectTxt}>{ev.kind === 'focus' ? 'Unprotect' : 'Protect'}</Txt>
          </Press>
          <Press
            onPress={() => {
              deleteEvent(ev.id);
              onClose();
              toast('Event removed');
            }}
            hoverBg={rgba('#ff4400', 0.1)}
            style={styles.delBtn}
            aria-label="Delete event">
            <Icon name="trash" size={16} color={C.orange} />
          </Press>
        </View>
      </ScrollView>
    </View>
  );

  return (
    <Modal visible transparent animationType={isDesktop ? 'fade' : 'slide'} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[styles.backdrop, !isDesktop && styles.backdropSheet, !isDesktop && { backgroundColor: C.scrim }]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={
            isDesktop
              ? [styles.popoverPos, { left, top, width: W }]
              : styles.sheetPos
          }>
          {body}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Line({ icon, children }: { icon: 'clock' | 'folder' | 'bolt'; children: React.ReactNode }) {
  return (
    <View style={styles.line}>
      <Icon name={icon} size={15} color={w(0.35)} />
      <Txt style={styles.lineTxt}>{children}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end' },
  popoverPos: { position: 'absolute' },
  sheetPos: { width: '100%' },
  card: {
    borderRadius: R.xl2,
    borderWidth: 1,
    overflow: 'hidden',
    maxHeight: 640,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  catBar: { height: 4, width: '100%' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  dot: { height: 6, width: 6, borderRadius: 3 },
  eyebrow: { color: w(0.4), fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  tagLime: { borderRadius: R.full, backgroundColor: rgba('#ccff00', 0.15), paddingHorizontal: 8, paddingVertical: 2 },
  tagLimeTxt: { color: C.lime, fontSize: 12 },
  tagOrange: { borderRadius: R.full, backgroundColor: rgba('#ff4400', 0.2), paddingHorizontal: 8, paddingVertical: 2 },
  tagOrangeTxt: { color: C.orange, fontSize: 12 },
  title: { marginTop: 8, color: '#fff', fontSize: 16, lineHeight: 22, fontWeight: '500', letterSpacing: -0.3 },
  close: { height: 32, width: 32, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  meta: { marginTop: 16, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineTxt: { flex: 1, color: w(0.55), fontSize: 12, lineHeight: 16 },
  notes: { borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1), backgroundColor: w(0.05), padding: 12 },
  notesTxt: { color: w(0.6), fontSize: 12, lineHeight: 18 },
  conflictBox: {
    marginTop: 16,
    flexDirection: 'row',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: rgba('#ff4400', 0.4),
    backgroundColor: rgba('#ff4400', 0.1),
    padding: 12,
  },
  conflictTxt: { flex: 1, color: w(0.7), fontSize: 12, lineHeight: 16 },
  actionsGrid: { marginTop: 20, flexDirection: 'row', gap: 8 },
  ghostBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
  },
  ghostTxt: { color: w(0.75), fontSize: 12 },
  limeBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: R.lg,
    backgroundColor: C.lime,
  },
  limeTxt: { color: C.surface, fontSize: 12 },
  actionsRow: { marginTop: 8, flexDirection: 'row', gap: 8 },
  protectBtn: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
  },
  protectTxt: { color: w(0.6), fontSize: 12 },
  delBtn: {
    height: 40,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: rgba('#ff4400', 0.3),
  },
});
