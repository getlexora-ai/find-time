import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, type TextStyle, View } from 'react-native';

import type { ApiHabit, ApiTask } from '@/lib/api-types';

import { Icon } from '../Icon';
import type { CalActions } from '../state';
import {
  finishTask,
  type PostponePreset,
  postponeTask,
  refreshTasks,
  resumeTask,
  stopHabit,
  useTasks,
} from '../tasks-store';
import { N, R, SANS, SHADOW, T } from '../tokens';
import { Button, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * Tasks — the backlog "plan my week" works from, and the habits it fits in
 * first. A list to look at and tick off; the sentences stay in Plan with AI
 * ("Add task: …", "Habit: …", "report due Friday"), so this page never guesses
 * a length or a date for you.
 *
 *   header   Add task · Add habit · Plan my week (each opens Plan with AI)
 *   Open     ○ title — length · due · on hold until · on the calendar or not
 *            Postpone → 1 hour · 3 hours · Tomorrow · Next week
 *   Habits   title — 3x a week · 1h · mornings          Stop (asks once)
 */
export function Tasks({ actions, toast }: { actions: CalActions; toast: (msg: string) => void }) {
  const { isPhone } = useResponsive();
  const { loading, tasks, habits, error } = useTasks();
  const [open, setOpen] = useState<string | null>(null);
  const [stopping, setStopping] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void refreshTasks();
  }, []);

  const run = async (id: string, fn: () => Promise<{ cleared: number } | null>, done: (n: number) => string) => {
    setBusy(id);
    const r = await fn();
    setBusy(null);
    setOpen(null);
    setStopping(null);
    toast(r ? done(r.cleared) : "That didn't save — check your connection.");
  };
  const cleared = (n: number) => (n ? ` ${n} upcoming session${n === 1 ? '' : 's'} came off your calendar.` : '');

  return (
    <ScrollView style={styles.fill} contentContainerStyle={[styles.page, isPhone && styles.pagePhone]}>
      <View style={styles.head}>
        <View style={styles.headText}>
          {/* On a phone the top bar already says Tasks. */}
          {!isPhone && <Txt style={styles.title}>Tasks</Txt>}
          <Txt style={styles.lede}>
            Plan my week places these by deadline, keeps each day’s hard work within a budget, and fits your habits in. A block you move by hand stays where you put it.
          </Txt>
        </View>
        <View style={styles.headActions}>
          <Button
            variant="secondary"
            label="Add task"
            onPress={() => actions.openAI('Add task: ')}
            icon={<Icon name="add" size={14} color={N.ink2} />}
          />
          <Button
            variant="secondary"
            label="Add habit"
            onPress={() => actions.openAI('Habit: ')}
            icon={<Icon name="refresh-plain" size={14} color={N.ink2} />}
          />
          <Button
            variant="primary"
            label="Plan my week"
            onPress={() => actions.openAI('Plan my week')}
            icon={<Icon name="magic" size={14} color={N.onInk} />}
          />
        </View>
      </View>

      {error && (
        <View style={styles.err} accessibilityRole="alert">
          <Txt style={styles.errTxt}>{error}</Txt>
          <Button variant="ghost" label="Try again" onPress={() => void refreshTasks()} />
        </View>
      )}

      <Section title="Open" count={tasks.length}>
        {loading ? (
          <Txt style={styles.empty}>Loading…</Txt>
        ) : !tasks.length ? (
          <Txt style={styles.empty}>
            Nothing open. Add one, or tell Plan with AI: “Add task: write the report, 3h, due Friday”.
          </Txt>
        ) : (
          tasks.map((t, i) => (
            <View key={t.id} style={[styles.item, i > 0 && styles.itemRule]}>
              <View style={styles.row}>
                <Press
                  onPress={() => void run(t.id, () => finishTask(t.id), (n) => `Done — ${t.title}.${cleared(n)}`)}
                  disabled={busy === t.id}
                  hoverBg={N.hover}
                  accessibilityRole="button"
                  aria-label={`Mark ${t.title} done`}
                  style={styles.check}>
                  <View style={styles.checkRing}>
                    <Icon name="check" size={12} color={N.ghost} />
                  </View>
                </Press>
                <View style={styles.rowText}>
                  <Txt style={styles.rowTitle} numberOfLines={2}>
                    {t.title}
                  </Txt>
                  <Txt style={styles.rowSub}>{taskLine(t)}</Txt>
                </View>
                <Button
                  variant="ghost"
                  label={open === t.id ? 'Cancel' : 'Postpone'}
                  onPress={() => setOpen((o) => (o === t.id ? null : t.id))}
                  disabled={busy === t.id}
                />
              </View>
              {open === t.id && (
                <View style={styles.choices} accessibilityRole="radiogroup" aria-label={`Postpone ${t.title}`}>
                  {PRESETS.map((p) => (
                    <Button
                      key={p.key}
                      variant="secondary"
                      label={p.label}
                      onPress={() =>
                        void run(t.id, () => postponeTask(t.id, p.key), (n) => `${t.title} is on hold ${p.until}.${cleared(n)} Plan your week again to fit it in.`)
                      }
                    />
                  ))}
                  {onHold(t) && (
                    <Button
                      variant="ghost"
                      label="Start any time"
                      onPress={() => void run(t.id, () => resumeTask(t.id), () => `${t.title} can start any time again.`)}
                    />
                  )}
                </View>
              )}
            </View>
          ))
        )}
      </Section>

      <Section title="Habits" count={habits.length}>
        {loading ? (
          <Txt style={styles.empty}>Loading…</Txt>
        ) : !habits.length ? (
          <Txt style={styles.empty}>No habits yet. Try “Habit: gym 3x a week, 1h, mornings”.</Txt>
        ) : (
          habits.map((h, i) => (
            <View key={h.id} style={[styles.item, i > 0 && styles.itemRule]}>
              <View style={styles.row}>
                <View style={styles.habitMark}>
                  <Icon name="refresh-plain" size={14} color={N.muted} />
                </View>
                <View style={styles.rowText}>
                  <Txt style={styles.rowTitle} numberOfLines={2}>
                    {h.title}
                  </Txt>
                  <Txt style={styles.rowSub}>{habitLine(h)}</Txt>
                </View>
                {stopping === h.id ? (
                  <View style={styles.confirm}>
                    <Button variant="ghost" label="Keep" onPress={() => setStopping(null)} />
                    <Button
                      variant="secondary"
                      label="Stop it"
                      disabled={busy === h.id}
                      onPress={() => void run(h.id, () => stopHabit(h.id), (n) => `Stopped ${h.title}.${cleared(n)}`)}
                    />
                  </View>
                ) : (
                  <Button variant="ghost" label="Stop" onPress={() => setStopping(h.id)} />
                )}
              </View>
              {stopping === h.id && (
                <Txt style={styles.note}>Its upcoming sessions come off your calendar. Past ones stay.</Txt>
              )}
            </View>
          ))
        )}
      </Section>
    </ScrollView>
  );
}

const PRESETS: { key: PostponePreset; label: string; until: string }[] = [
  { key: '1h', label: '1 hour', until: 'for an hour' },
  { key: '3h', label: '3 hours', until: 'for 3 hours' },
  { key: 'tomorrow', label: 'Tomorrow', until: 'until tomorrow' },
  { key: 'next-week', label: 'Next week', until: 'until next week' },
];

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Wall-clock day of an instant (times are wall-clock with a Z, like the rest of the app). */
const dayOf = (ms: number) => {
  const d = new Date(ms);
  return `${WD[d.getUTCDay()]} ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`;
};
const hours = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${h}h`;
};
/**
 * "now" as the server reads it: postpones and the planner both use the
 * server's clock, so "on hold" here has to agree with what it will plan around.
 */
const wallNow = () => Date.now();
const onHold = (t: ApiTask) => !!t.notBefore && Date.parse(t.notBefore) > wallNow();

/** "3h · due Fri 9 Oct · on hold until Mon 5 Oct · on your calendar" */
export function taskLine(t: ApiTask): string {
  const bits = [hours(t.durationMin)];
  // dueBy is the midnight after the due day.
  if (t.dueBy) {
    const due = Date.parse(t.dueBy);
    bits.push(due <= wallNow() ? `was due ${dayOf(due - 1)}` : `due ${dayOf(due - 1)}`);
  }
  if (onHold(t)) {
    const nb = Date.parse(t.notBefore!);
    bits.push(`on hold until ${dayOf(nb)}${nb % 86_400_000 ? ` ${new Date(nb).toISOString().slice(11, 16)}` : ''}`);
  }
  if (t.priority !== 'medium') bits.push(`${t.priority} priority`);
  if (t.effort === 'hard') bits.push('hard');
  if (t.effort === 'light') bits.push('light');
  if (t.splittable && t.durationMin > 120) bits.push('in sessions');
  bits.push(t.status === 'scheduled' || t.status === 'in-progress' ? 'on your calendar' : 'not planned yet');
  return bits.join(' · ');
}

/** "2–3x a week · 1h · mornings" */
export function habitLine(h: ApiHabit): string {
  const often = h.minPerWeek && h.minPerWeek < h.perWeek ? `${h.minPerWeek}–${h.perWeek}x a week` : `${h.perWeek}x a week`;
  return [often, hours(h.durationMin), h.preferredWindow ? `${h.preferredWindow}s` : ''].filter(Boolean).join(' · ');
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Txt style={styles.sectionTitle}>{title}</Txt>
        {count > 0 && <Txt style={styles.sectionCount}>{count}</Txt>}
      </View>
      <View style={[styles.sectionBody, SHADOW.sm]}>{children}</View>
    </View>
  );
}

const TAB: TextStyle = { fontVariant: ['tabular-nums'] };

const styles = StyleSheet.create({
  fill: { flex: 1, minHeight: 0, backgroundColor: N.ground },
  page: { padding: 24, paddingTop: 32, paddingBottom: 48, gap: 24, maxWidth: 880, width: '100%', alignSelf: 'center' },
  pagePhone: { padding: 16, paddingTop: 16, gap: 16 },

  head: { flexDirection: 'row', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' },
  headText: { flexGrow: 1, flexBasis: 320, gap: 4 },
  title: { fontFamily: SANS, ...T.period, color: N.ink },
  lede: { fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.muted, maxWidth: 560 },
  headActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },

  err: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: N.line, borderRadius: 10 },
  errTxt: { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.accentInk },

  section: { gap: 10 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontFamily: SANS, ...T.heading, color: N.ink },
  sectionCount: { fontFamily: SANS, fontSize: 13, color: N.muted, ...TAB },
  sectionBody: { backgroundColor: N.surface, borderRadius: R.xl, paddingVertical: 4, paddingHorizontal: 6 },
  empty: { fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.muted, padding: 12 },

  item: { paddingVertical: 4 },
  itemRule: { borderTopWidth: 1, borderTopColor: N.line },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingRight: 4, minHeight: 52 },
  check: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg },
  checkRing: { width: 20, height: 20, borderRadius: R.full, borderWidth: 1.5, borderColor: N.lineStrong, alignItems: 'center', justifyContent: 'center' },
  habitMark: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 2, paddingVertical: 6 },
  rowTitle: { fontFamily: SANS, fontSize: 14, lineHeight: 20, fontWeight: '500', color: N.ink },
  rowSub: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted, ...TAB },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingLeft: 54, paddingBottom: 10, paddingRight: 8 },
  confirm: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  note: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted, paddingLeft: 54, paddingBottom: 10 },
});
