import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { iso, pad, sameDay } from '../cal-date';
import { BODY_H, gutterHours, laidOut, minToY } from '../layout';
import { NOW_MIN, TODAY } from '../seed';
import type { CalActions } from '../state';
import { useCalTheme } from '../theme-context';
import { C, ROW, w } from '../tokens';
import type { CalEvent } from '../types';
import { Txt } from '../ui';
import { EventBlock } from './EventBlock';

/** The scrollable time grid body: 4rem gutter + N day columns at 56px/hour,
 *  07:00–21:00, hour + half-hour lines, now-line only in today's column
 *  (spec §2.4–§2.7). On mount it scrolls to 08:00, not 07:00 (spec §5). */
export function TimeGrid({
  days,
  events,
  actions,
  showNowChip,
  maxHeight = 480,
}: {
  days: Date[];
  events: CalEvent[];
  actions: CalActions;
  showNowChip?: boolean;
  maxHeight?: number;
}) {
  const { theme } = useCalTheme();
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollTo({ y: ROW, animated: false }), 80);
    return () => clearTimeout(t);
  }, [days.length]);

  return (
    <ScrollView
      ref={scroller}
      style={{ maxHeight }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.body, { backgroundColor: theme.panelBorder }]}>
      <View style={[styles.gutter, { backgroundColor: theme.recessed }]}>
        {gutterHours().map((h) => (
          <View key={h} style={styles.gutterHour}>
            <Txt style={styles.gutterTxt}>{pad(h)}:00</Txt>
          </View>
        ))}
      </View>

      {days.map((d) => {
        const laid = laidOut(byDate(events, iso(d)));
        const isToday = sameDay(d, TODAY);
        return (
          <View key={iso(d)} style={[styles.col, { backgroundColor: theme.panel }]}>
            <HourLines />
            {laid.map((it) => (
              <EventBlock key={it.ev.id} it={it} onPress={(a) => actions.openEvent(it.ev.id, a)} />
            ))}
            {isToday && (
              <View pointerEvents="none" style={[styles.nowLine, { top: minToY(NOW_MIN) }]}>
                <View style={styles.nowBar} />
                <View style={styles.nowDot} />
                {showNowChip && (
                  <View style={styles.nowChip}>
                    <Txt style={styles.nowChipTxt}>14:22</Txt>
                  </View>
                )}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function HourLines() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {gutterHours().map((_, i) => (
        <View key={`h${i}`}>
          <View style={[styles.hourLine, { top: i * ROW }]} />
          <View style={[styles.halfLine, { top: i * ROW + ROW / 2 }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flexDirection: 'row', gap: 1, minHeight: BODY_H },
  gutter: { width: 64, height: BODY_H, paddingTop: 8 },
  gutterHour: { height: ROW, position: 'relative' },
  gutterTxt: { position: 'absolute', right: 8, top: -6, color: w(0.25), fontSize: 12, textAlign: 'right' },
  col: { flex: 1, minWidth: 0, height: BODY_H, position: 'relative' },
  hourLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.09)' },
  halfLine: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.035)' },
  nowLine: { position: 'absolute', left: 0, right: 0, zIndex: 20 },
  nowBar: { height: 1, backgroundColor: C.orange },
  nowDot: {
    position: 'absolute',
    left: -4,
    top: -3,
    height: 7,
    width: 7,
    borderRadius: 4,
    backgroundColor: C.orange,
    shadowColor: C.orange,
    shadowOpacity: 1,
    shadowRadius: 10,
  },
  nowChip: {
    position: 'absolute',
    right: 8,
    top: -8,
    borderRadius: 4,
    backgroundColor: C.orange,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  nowChipTxt: { color: C.surface, fontSize: 10, lineHeight: 14 },
});
