import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { fromMin, iso, nowMin, pad, sameDay, today } from '../cal-date';
import { bodyH, dayWindow, gutterHours, laidOut, minToY } from '../layout';
import type { CalActions } from '../state';
import { useCalTheme } from '../theme-context';
import { C, ROW, w } from '../tokens';
import type { CalEvent } from '../types';
import { Txt } from '../ui';
import { EventBlock } from './EventBlock';

/** The scrollable time grid body: 4rem gutter + N day columns at 56px/hour,
 *  07:00–21:00 by default, hour + half-hour lines, now-line only in today's
 *  column (spec §2.4–§2.7). The window widens past that workday whenever a
 *  rendered day has an event before 07:00 or after 21:00, so early/late
 *  events stay scrollable instead of landing above the grid's top edge,
 *  which a ScrollView can never scroll to. On mount it scrolls to 08:00 (or
 *  the window start, whichever is later), not 07:00 (spec §5). */
export function TimeGrid({
  days,
  events,
  actions,
  showNowChip,
  /** Take every pixel the parent has left, instead of a fixed ceiling. This is
   *  what lets the grid own the viewport on desktop; the scrolling list views
   *  below the breakpoint still pass a maxHeight. */
  fill,
  maxHeight = 480,
}: {
  days: Date[];
  events: CalEvent[];
  actions: CalActions;
  showNowChip?: boolean;
  fill?: boolean;
  maxHeight?: number;
}) {
  const { theme } = useCalTheme();
  const scroller = useRef<ScrollView>(null);
  const [dayStart, dayEnd] = dayWindow(days, events);
  const bh = bodyH(dayStart, dayEnd);

  useEffect(() => {
    const y = Math.max(0, 8 - dayStart) * ROW;
    const t = setTimeout(() => scroller.current?.scrollTo({ y, animated: false }), 80);
    return () => clearTimeout(t);
  }, [days.length, dayStart]);

  return (
    <ScrollView
      ref={scroller}
      style={fill ? styles.fill : { maxHeight }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.body, { backgroundColor: theme.panelBorder, minHeight: bh }]}>
      <View style={[styles.gutter, { backgroundColor: theme.recessed, height: bh }]}>
        {gutterHours(dayStart, dayEnd).map((h) => (
          <View key={h} style={styles.gutterHour}>
            <Txt style={styles.gutterTxt}>{pad(h)}:00</Txt>
          </View>
        ))}
      </View>

      {days.map((d) => {
        const laid = laidOut(byDate(events, iso(d)));
        const isToday = sameDay(d, today());
        return (
          <View key={iso(d)} style={[styles.col, { backgroundColor: theme.panel, height: bh }]}>
            <HourLines start={dayStart} end={dayEnd} />
            {laid.map((it) => (
              <EventBlock key={it.ev.id} it={it} dayStart={dayStart} onPress={(a) => actions.openEvent(it.ev.id, a)} />
            ))}
            {isToday && (
              <View pointerEvents="none" style={[styles.nowLine, { top: minToY(nowMin(), dayStart) }]}>
                <View style={styles.nowBar} />
                <View style={styles.nowDot} />
                {showNowChip && (
                  <View style={styles.nowChip}>
                    <Txt style={styles.nowChipTxt}>{fromMin(nowMin())}</Txt>
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

function HourLines({ start, end }: { start: number; end: number }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {gutterHours(start, end).map((_, i) => (
        <View key={`h${i}`}>
          <View style={[styles.hourLine, { top: i * ROW }]} />
          <View style={[styles.halfLine, { top: i * ROW + ROW / 2 }]} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0 },
  body: { flexDirection: 'row', gap: 1 },
  gutter: { width: 52, paddingTop: 8 },
  gutterHour: { height: ROW, position: 'relative' },
  gutterTxt: { position: 'absolute', right: 8, top: -6, color: w(0.25), fontSize: 11, textAlign: 'right' },
  col: { flex: 1, minWidth: 0, position: 'relative' },
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
