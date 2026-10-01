import { StyleSheet, View } from 'react-native';

import { fromIso, WD, wdIndex } from '../cal-date';
import { paint } from '../kinds';
import type { PointAnchor } from '../state';
import { N, R, SANS, T } from '../tokens';
import type { CalEvent } from '../types';
import { Label, Mono, Press, Txt } from '../ui';
import { Popover } from './Popover';

/** A short list — "+2 more", "2 after 22:00". Each row opens that event. */
export function EventList({
  title,
  events,
  anchor,
  onClose,
  onOpen,
}: {
  title: string;
  events: CalEvent[];
  anchor: PointAnchor | null;
  onClose: () => void;
  onOpen: (id: number) => void;
}) {
  return (
    <Popover anchor={anchor} width={300} estHeight={60 + events.length * 48} onClose={onClose} label={title}>
      <Label>{title}</Label>
      <View style={styles.list}>
        {events.map((ev) => {
          const p = paint(ev);
          const d = fromIso(ev.date);
          return (
            <Press
              key={`${ev.id}-${ev.date}`}
              onPress={() => onOpen(ev.id)}
              hoverBg={N.hover}
              accessibilityRole="button"
              style={styles.row}>
              <View style={[styles.swatch, ...p.box]} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt numberOfLines={1} style={styles.title}>
                  {ev.title}
                </Txt>
                <Mono>
                  {ev.allDay ? 'all day' : `${WD[wdIndex(d)]} ${ev.start}–${ev.end}`} · {p.spec.label.toLowerCase()}
                </Mono>
              </View>
            </Press>
          );
        })}
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 10, gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.md, padding: 8 },
  swatch: { width: 14, height: 14, borderRadius: R.xs },
  title: { fontFamily: SANS, ...T.body, color: N.ink },
});
