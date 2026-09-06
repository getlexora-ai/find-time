import { useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { addDays, durationMin, formatRange, fullDayLabel, sameDay, startOfDay, weekdayShort } from '@/lib/date';
import { confirmDraft, removeEvent, useEvents } from '@/lib/store';
import { CATEGORY_COLOR, CATEGORY_LABEL, type CalendarEvent } from '@/lib/types';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const WEEK_LENGTH = 14;

export default function CalendarScreen() {
  const theme = useTheme();
  const events = useEvents();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selected, setSelected] = useState<Date>(today);

  const days = useMemo(() => Array.from({ length: WEEK_LENGTH }, (_, i) => addDays(today, i)), [today]);

  const dayEvents = useMemo(
    () => events.filter((e) => sameDay(new Date(e.start), selected)),
    [events, selected],
  );

  const draftCount = events.filter((e) => e.draft).length;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['bottom']}>
      <View style={[styles.stripWrap, { borderBottomColor: theme.backgroundElement }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}>
          {days.map((d) => {
            const isSelected = sameDay(d, selected);
            const isToday = sameDay(d, today);
            const count = events.filter((e) => sameDay(new Date(e.start), d)).length;
            return (
              <Pressable
                key={d.toISOString()}
                onPress={() => setSelected(d)}
                style={[
                  styles.dayPill,
                  { backgroundColor: isSelected ? theme.text : theme.backgroundElement },
                ]}>
                <Text style={[styles.dayName, { color: isSelected ? theme.background : theme.textSecondary }]}>
                  {weekdayShort(d)}
                </Text>
                <Text style={[styles.dayNum, { color: isSelected ? theme.background : theme.text }]}>
                  {d.getDate()}
                </Text>
                <View style={styles.dotRow}>
                  {count > 0 && (
                    <View
                      style={[
                        styles.countDot,
                        { backgroundColor: isSelected ? theme.background : theme.textSecondary },
                      ]}
                    />
                  )}
                  {isToday && !isSelected && (
                    <View style={[styles.todayDot, { backgroundColor: theme.text }]} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.agenda}>
        <Text style={[styles.dayHeading, { color: theme.text }]}>{fullDayLabel(selected)}</Text>
        {draftCount > 0 && (
          <Text style={[styles.draftHint, { color: CATEGORY_COLOR.focus }]}>
            {draftCount} proposed {draftCount === 1 ? 'block' : 'blocks'} from the planner — confirm or remove below
          </Text>
        )}

        {dayEvents.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
              Nothing scheduled. Head to “Plan with AI” to fill this day.
            </Text>
          </View>
        ) : (
          dayEvents.map((e) => (
            <EventRow key={e.id} event={e} textColor={theme.text} subColor={theme.textSecondary} surface={theme.backgroundElement} />
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function EventRow({
  event,
  textColor,
  subColor,
  surface,
}: {
  event: CalendarEvent;
  textColor: string;
  subColor: string;
  surface: string;
}) {
  const color = CATEGORY_COLOR[event.category];
  return (
    <View
      style={[
        styles.row,
        { backgroundColor: surface },
        event.draft && { borderWidth: 1, borderColor: color, borderStyle: 'dashed', backgroundColor: 'transparent' },
      ]}>
      <View style={[styles.bar, { backgroundColor: color }]} />
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, { color: textColor }]} numberOfLines={1}>
          {event.title}
        </Text>
        <Text style={[styles.rowMeta, { color: subColor }]}>
          {formatRange(event.start, event.end)} · {durationMin(event.start, event.end)} min · {CATEGORY_LABEL[event.category]}
        </Text>
        {event.draft && (
          <View style={styles.draftActions}>
            <Pressable onPress={() => confirmDraft(event.id)} style={[styles.smallBtn, { backgroundColor: color }]}>
              <Text style={styles.smallBtnText}>Confirm</Text>
            </Pressable>
            <Pressable onPress={() => removeEvent(event.id)} style={[styles.smallBtn, styles.smallBtnGhost, { borderColor: subColor }]}>
              <Text style={[styles.smallBtnText, { color: subColor }]}>Remove</Text>
            </Pressable>
          </View>
        )}
      </View>
      {event.draft && <Text style={[styles.proposedTag, { color }]}>PROPOSED</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  stripWrap: { borderBottomWidth: StyleSheet.hairlineWidth },
  strip: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, gap: Spacing.two },
  dayPill: {
    width: 56,
    borderRadius: 14,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    gap: 2,
  },
  dayName: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase' },
  dayNum: { fontSize: 18, fontWeight: '700' },
  dotRow: { flexDirection: 'row', gap: 3, height: 6, alignItems: 'center' },
  countDot: { width: 5, height: 5, borderRadius: 3 },
  todayDot: { width: 5, height: 5, borderRadius: 3 },
  agenda: {
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
    ...Platform.select({ web: { paddingBottom: Spacing.six } }),
  },
  dayHeading: { fontSize: 20, fontWeight: '700', marginBottom: Spacing.one },
  draftHint: { fontSize: 13, fontWeight: '600', marginBottom: Spacing.two },
  empty: { alignItems: 'center', paddingVertical: Spacing.six, gap: Spacing.two },
  emptyEmoji: { fontSize: 40 },
  emptyText: { fontSize: 15, textAlign: 'center', maxWidth: 260 },
  row: {
    flexDirection: 'row',
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.three,
    alignItems: 'flex-start',
  },
  bar: { width: 4, alignSelf: 'stretch', borderRadius: 2, minHeight: 36 },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { fontSize: 15, fontWeight: '600' },
  rowMeta: { fontSize: 13 },
  draftActions: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.two },
  smallBtn: { paddingHorizontal: Spacing.three, paddingVertical: 6, borderRadius: 8 },
  smallBtnGhost: { backgroundColor: 'transparent', borderWidth: 1 },
  smallBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  proposedTag: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
});
