import { StyleSheet, View } from 'react-native';

import { useAccounts } from '../account-store';
import { acceptEvent, deleteEvent, SAVE_FAILED, setKind } from '../cal-store';
import { fromIso, MO, wdIndex, WD_LONG } from '../cal-date';
import { Icon, type IconName } from '../Icon';
import { KINDS, paint, PICKABLE } from '../kinds';
import type { CalActions, PointAnchor } from '../state';
import { CATS, durLabel, N, SANS } from '../tokens';
import type { CalEvent } from '../types';
import { Button, CalSwatch, Chip, Label, Txt } from '../ui';
import { spanMin } from './ComposeSheet';
import { Popover } from './Popover';
import { useToast } from './Toast';

/** Plain words for the rules Find Time writes and Google commonly sends. */
function repeatLabel(rrule: string): string {
  const r = rrule.toUpperCase();
  const every = /INTERVAL=(\d+)/.exec(r)?.[1];
  const n = every && every !== '1' ? `every ${every} ` : '';
  if (r.includes('FREQ=DAILY')) return n ? `Repeats ${n}days` : 'Repeats daily';
  if (r.includes('FREQ=MONTHLY')) return n ? `Repeats ${n}months` : 'Repeats monthly';
  if (r.includes('FREQ=WEEKLY')) {
    const by = /BYDAY=([A-Z,]+)/.exec(r)?.[1];
    if (by === 'MO,TU,WE,TH,FR') return 'Repeats every weekday';
    return n ? `Repeats ${n}weeks` : 'Repeats weekly';
  }
  return 'Repeats';
}

/** Event detail — anchored popover on desktop, sheet on a phone. */
export function EventDetail({
  event,
  anchor,
  onClose,
  actions,
  clash,
}: {
  clash?: boolean;
  event: CalEvent;
  anchor: PointAnchor | null;
  onClose: () => void;
  actions: CalActions;
}) {
  const toast = useToast();
  const { accounts } = useAccounts();
  const ev = event;
  const p = paint(ev);
  const date = fromIso(ev.date);
  const cal = ev.calendarId
    ? accounts.flatMap((a) => a.calendars).find((c) => c.id === ev.calendarId)
    : undefined;

  const dur = spanMin(ev);
  const when = ev.allDay
    ? `${WD_LONG[wdIndex(date)]} ${date.getDate()} ${MO[date.getMonth()].slice(0, 3)} · all day`
    : `${WD_LONG[wdIndex(date)]} ${date.getDate()} ${MO[date.getMonth()].slice(0, 3)} · ${ev.start}–${ev.end}${ev.endDate ? ' next day' : ''} · ${durLabel(dur)}`;

  return (
    <Popover anchor={anchor} width={380} estHeight={460} onClose={onClose} label={ev.title}>
      <View style={styles.top}>
        <View style={[styles.kindMark, ...p.box]}>
          <Icon name={p.spec.icon} size={12} color={p.glyph} />
        </View>
        <Label style={styles.kindLabel}>
          {p.spec.label} · {CATS[ev.cat].label}
        </Label>
        <View style={{ flex: 1 }} />
        <Button
          variant="ghost"
          onPress={onClose}
          accessibilityLabel="Close"
          icon={<Icon name="close" size={16} color={N.muted} />}
          style={styles.close}
        />
      </View>

      <Txt style={styles.title}>{ev.title}</Txt>

      <View style={styles.meta}>
        <Line icon="clock">{when}</Line>
        {!!ev.rrule && <Line icon="refresh-plain">{repeatLabel(ev.rrule)}</Line>}
        {cal ? (
          <View style={styles.line}>
            <View style={styles.lineIcon}>
              <CalSwatch color={/^#/.test(cal.color) ? cal.color : N.faint} size={8} />
            </View>
            <Txt style={styles.lineTxt}>{cal.name}</Txt>
          </View>
        ) : (
          <Line icon="calendar">Find Time</Line>
        )}
        {!!ev.project && <Line icon="folder">{ev.project}</Line>}
      </View>

      {!!ev.notes && <Txt style={styles.notes}>{ev.notes}</Txt>}

      {ev.imported && (
        <View style={styles.box}>
          <Txt style={styles.boxTxt}>
            {ev.googleEditable
              ? 'From Google Calendar. Moving, resizing or deleting it here changes it in Google too. Change its title there.'
              : 'From Google Calendar. Meetings with guests, repeating events and other people’s events are changed there — Find Time reads them and plans around them.'}
          </Txt>
        </View>
      )}
      {ev.googleEditable && (
        <View style={styles.row}>
          <Button
            variant="secondary"
            label="Delete from Google Calendar"
            style={{ flex: 1 }}
            icon={<Icon name="trash" size={14} color={N.ink2} />}
            onPress={() => {
              if (typeof window !== 'undefined' && window.confirm && !window.confirm(`Delete “${ev.title}” from your Google Calendar?`)) return;
              onClose();
              void deleteEvent(ev.id).then((ok) => toast(ok ? 'Deleted from Google Calendar' : SAVE_FAILED));
            }}
          />
        </View>
      )}
      {clash && (
        <View style={[styles.box, styles.boxWarn]}>
          <Icon name="triangle" size={14} color={N.accent} />
          <Txt style={styles.boxTxt}>Overlaps another block. Move whichever one can move.</Txt>
        </View>
      )}

      {ev.kind === 'ai' && (
        <View style={styles.row}>
          <Button
            variant="primary"
            label="Approve"
            style={{ flex: 1 }}
            onPress={() => {
              onClose();
              void acceptEvent(ev.id).then((ok) => toast(ok ? 'Approved — it is on your calendar' : SAVE_FAILED));
            }}
          />
          <Button
            variant="secondary"
            label="Dismiss"
            style={{ flex: 1 }}
            onPress={() => {
              onClose();
              void deleteEvent(ev.id).then((ok) => toast(ok ? 'Proposal dismissed' : SAVE_FAILED));
            }}
          />
        </View>
      )}

      {!ev.imported && ev.kind !== 'ai' && (
        <View style={styles.row}>
          <Button
            variant="secondary"
            label="Edit"
            style={{ flex: 1 }}
            icon={<Icon name="pen" size={14} color={N.ink2} />}
            onPress={() => {
              onClose();
              actions.openCompose(ev.id);
            }}
          />
          <Button
            variant="secondary"
            label="Find another time"
            style={{ flex: 1.4 }}
            icon={<Icon name="magic" size={14} color={N.ink2} />}
            onPress={() => {
              onClose();
              actions.openCompose(ev.id, undefined, undefined, true);
            }}
          />
          <Button
            variant="secondary"
            accessibilityLabel="Delete"
            icon={<Icon name="trash" size={14} color={N.ink2} />}
            onPress={() => {
              onClose();
              void deleteEvent(ev.id).then((ok) => toast(ok ? 'Deleted' : SAVE_FAILED));
            }}
          />
        </View>
      )}

      {ev.kind !== 'ai' && (
        <>
          <Label style={styles.kindHead}>Kind</Label>
          <View style={styles.chips}>
            {PICKABLE.filter((k) => !(ev.imported && k === 'routine')).map((k) => (
              <Chip
                key={k}
                on={ev.kind === k}
                icon={KINDS[k].icon}
                label={KINDS[k].label}
                color={p.color}
                onPress={() =>
                  void setKind(ev.id, k).then((ok) =>
                    toast(ok ? `Now a ${KINDS[k].label.toLowerCase()}` : SAVE_FAILED),
                  )
                }
              />
            ))}
          </View>
        </>
      )}
      {!ev.allDay && (
        <Txt style={styles.tip}>
          {ev.imported && !ev.googleEditable
            ? 'Read-only on the grid'
            : `Drag the tile to move it, its edges to resize${ev.googleEditable ? ' — Google updates too' : ''}`}
        </Txt>
      )}
    </Popover>
  );
}

function Line({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <View style={styles.line}>
      <View style={styles.lineIcon}>
        <Icon name={icon} size={14} color={N.faint} />
      </View>
      <Txt style={styles.lineTxt}>{children}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  kindMark: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  kindLabel: { color: N.muted },
  close: { width: 28, height: 28 },
  title: { marginTop: 12, fontFamily: SANS, fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.4, color: N.ink },
  meta: { marginTop: 14, gap: 10 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  lineIcon: { width: 18, alignItems: 'center' },
  lineTxt: { flex: 1, fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.ink2, fontVariant: ['tabular-nums'] },
  notes: { marginTop: 14, fontFamily: SANS, fontSize: 14, lineHeight: 21, color: N.ink2 },
  box: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: N.line,
    backgroundColor: N.sunken,
    padding: 12,
  },
  boxWarn: { borderColor: N.accent, backgroundColor: N.surface },
  boxTxt: { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: N.ink2 },
  row: { marginTop: 18, flexDirection: 'row', gap: 8 },
  kindHead: { marginTop: 20 },
  chips: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tip: { marginTop: 16, fontFamily: SANS, fontSize: 12, lineHeight: 16, color: N.faint },
});
