import { useEffect, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, ScrollView, StyleSheet, View } from 'react-native';

import { byDate } from '../cal-store';
import { fromMin, iso, isoWeek, nowMin, pad, sameDay, today, WD, wdIndex } from '../cal-date';
import { bodyH, dayWindow, gutterHours, laidOut, minToY } from '../layout';
import type { CalActions } from '../state';
import { useCalTheme } from '../theme-context';
import { C, GUTTER, GUTTER_PHONE, ROW, w } from '../tokens';
import type { CalEvent } from '../types';
import { Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { EventBlock } from './EventBlock';

/**
 * The time grid: hour gutter + N day columns at 56px/hour, 07:00–21:00 by
 * default, hour + half-hour lines, now-line only in today's column (spec
 * §2.4–§2.7). The window widens past that workday whenever a rendered day has
 * an event before 07:00 or after 21:00, so early/late events stay scrollable
 * instead of landing above the grid's top edge, which a ScrollView can never
 * scroll to. On mount it scrolls to 08:00 (or the window start, whichever is
 * later), not 07:00 (spec §5).
 *
 * This is now the only calendar surface on every screen size — the phone used
 * to get an agenda list instead, which meant the product below 1024px was a
 * different product. Two things make the same grid work on a 390px screen:
 *
 *   - the day header lives *inside* the grid, so it can scroll sideways with
 *     the columns it labels rather than drifting out of register with them;
 *   - when `colWidth` is set the columns move into a horizontal scroller while
 *     the hour gutter stays pinned outside it, so you never lose the times
 *     when you scroll to Thursday.
 *
 * Vertical scrolling wraps gutter and columns together (they share one
 * ScrollView), so only the sideways axis needs syncing — one-way, from the
 * body to the passive header scroller.
 */
export function TimeGrid({
  days,
  events,
  actions,
  showNowChip,
  /** Take every pixel the parent has left, instead of a fixed ceiling. */
  fill,
  /** Render the day header row. Pinned vertically, scrolls with the columns. */
  header,
  /**
   * Fixed px per day column. Unset = the columns share the width (desktop).
   * Set = they overflow into a horizontal, day-snapping scroller (phone).
   */
  colWidth,
  /** Day to bring into view sideways when the columns scroll. */
  focusIndex = 0,
  onPickDay,
}: {
  days: Date[];
  events: CalEvent[];
  actions: CalActions;
  showNowChip?: boolean;
  fill?: boolean;
  header?: boolean;
  colWidth?: number;
  focusIndex?: number;
  onPickDay?: (d: Date) => void;
}) {
  const { theme } = useCalTheme();
  const { isPhone } = useResponsive();
  const scroller = useRef<ScrollView>(null);
  const headScroller = useRef<ScrollView>(null);
  const colScroller = useRef<ScrollView>(null);
  const [dayStart, dayEnd] = dayWindow(days, events);
  const bh = bodyH(dayStart, dayEnd);
  const gutterW = isPhone ? GUTTER_PHONE : GUTTER;
  const pan = colWidth != null;
  const step = pan ? colWidth + 1 : 0; // +1 for the hairline gap between columns

  useEffect(() => {
    const y = Math.max(0, 8 - dayStart) * ROW;
    const t = setTimeout(() => scroller.current?.scrollTo({ y, animated: false }), 80);
    return () => clearTimeout(t);
  }, [days.length, dayStart]);

  // Land on the selected day rather than always on Monday: on a phone only
  // three columns are on screen, so week → day → week would otherwise keep
  // dumping you back at the start of the week.
  useEffect(() => {
    if (!pan) return;
    const t = setTimeout(
      () => colScroller.current?.scrollTo({ x: Math.max(0, focusIndex - 1) * step, animated: false }),
      80,
    );
    return () => clearTimeout(t);
  }, [pan, focusIndex, step]);

  const syncHead = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    headScroller.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false });

  const colStyle = pan ? { width: colWidth } : styles.colFlex;

  const heads = days.map((d) => {
    const isToday = sameDay(d, today());
    const isWeekend = wdIndex(d) > 4;
    return (
      /* The header is the way into a single day. Week → day used to need the
         view tabs; tapping the column you are already looking at is the gesture
         people try first — and on a phone it is the only one that scales. */
      <Press
        key={iso(d)}
        onPress={() => onPickDay?.(d)}
        disabled={!onPickDay}
        hoverBg={w(0.06)}
        accessibilityRole="button"
        aria-label={`Open ${WD[wdIndex(d)]} ${d.getDate()} in day view`}
        style={[colStyle, styles.dayHead, { backgroundColor: theme.recessed }]}>
        <Txt style={[styles.dayHeadWd, isToday && styles.dayHeadWdToday]}>{WD[wdIndex(d)]}</Txt>
        <Txt
          style={[
            styles.dayHeadNum,
            isWeekend && styles.dayHeadNumWknd,
            isToday && styles.dayHeadNumToday,
          ]}>
          {d.getDate()}
        </Txt>
      </Press>
    );
  });

  const columns = days.map((d) => {
    const laid = laidOut(byDate(events, iso(d)));
    const isToday = sameDay(d, today());
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    return (
      <View key={iso(d)} style={[colStyle, styles.col, { backgroundColor: theme.panel, height: bh }]}>
        {/* Ground tints, under the hour lines: the weekend sits back a shade and
            today comes forward a shade, so the eye finds the right column before
            it reads a single label. Both are ~2%, far below the weight of any
            block — the grid must not compete with what is on it. */}
        {(isWeekend || isToday) && (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, isToday ? styles.todayCol : styles.weekendCol]}
          />
        )}
        <HourLines start={dayStart} end={dayEnd} />
        {laid.map((it) => (
          <EventBlock
            key={it.ev.id}
            it={it}
            dayStart={dayStart}
            onPress={(a) => actions.openEvent(it.ev.id, a)}
          />
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
  });

  return (
    <View style={fill ? styles.fill : undefined}>
      {header && (
        <View style={[styles.row, { backgroundColor: theme.panelBorder }]}>
          <View style={[styles.gutterCell, { width: gutterW, backgroundColor: theme.recessed }]}>
            <Txt style={styles.gutterHead}>W{isoWeek(days[0])}</Txt>
          </View>
          {pan ? (
            <ScrollView
              ref={headScroller}
              style={styles.flexW}
              horizontal
              scrollEnabled={false}
              showsHorizontalScrollIndicator={false}>
              <View style={[styles.row, { backgroundColor: theme.panelBorder }]}>{heads}</View>
            </ScrollView>
          ) : (
            heads
          )}
        </View>
      )}

      <ScrollView
        ref={scroller}
        style={fill ? styles.fill : undefined}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ minHeight: bh }}>
        <View style={[styles.row, { backgroundColor: theme.panelBorder, height: bh }]}>
          <View style={[styles.gutter, { width: gutterW, backgroundColor: theme.recessed, height: bh }]}>
            {gutterHours(dayStart, dayEnd).map((h) => (
              <View key={h} style={styles.gutterHour}>
                <Txt style={styles.gutterTxt}>{pad(h)}:00</Txt>
              </View>
            ))}
          </View>
          {pan ? (
            <ScrollView
              ref={colScroller}
              style={styles.flexW}
              horizontal
              showsHorizontalScrollIndicator={false}
              onScroll={syncHead}
              scrollEventThrottle={16}
              snapToInterval={step}
              decelerationRate="fast">
              <View style={[styles.row, { backgroundColor: theme.panelBorder, height: bh }]}>
                {columns}
              </View>
            </ScrollView>
          ) : (
            columns
          )}
        </View>
      </ScrollView>
    </View>
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
  // A horizontal ScrollView sizes to its content unless it is told to take the
  // width that is left — without this the columns push the gutter off-screen.
  flexW: { flex: 1, minWidth: 0 },
  row: { flexDirection: 'row', gap: 1 },
  gutter: { paddingTop: 8 },
  gutterCell: { padding: 6, justifyContent: 'flex-end', alignItems: 'flex-end' },
  gutterHead: { fontSize: 10, lineHeight: 14, letterSpacing: 1, color: w(0.25) },
  gutterHour: { height: ROW, position: 'relative' },
  gutterTxt: { position: 'absolute', right: 8, top: -6, color: w(0.25), fontSize: 11, textAlign: 'right' },

  dayHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
  },
  dayHeadWd: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.6, color: w(0.35) },
  dayHeadWdToday: { color: '#fff' },
  dayHeadNum: { fontSize: 14, color: w(0.6) },
  dayHeadNumWknd: { color: w(0.32) },
  // Today is marked by weight, not by a glowing lime chip on every view — the
  // grid reads better when only the now-line is loud.
  dayHeadNumToday: { color: '#fff', fontWeight: '500' },

  colFlex: { flex: 1, minWidth: 0 },
  col: { position: 'relative' },
  weekendCol: { backgroundColor: 'rgba(255,255,255,0.022)' },
  todayCol: { backgroundColor: 'rgba(204,255,0,0.022)' },
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
