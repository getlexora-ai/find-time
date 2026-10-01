import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { IMPORTED_LOCKED_MESSAGE } from '@/lib/synced-fields';

import { allEvents, createEventAsync, deleteEvent, SAVE_FAILED, updateEvent } from '../cal-store';
import { addDays, fromIso, fromMin, iso, MO, pad, toMin, today, WD, wdIndex } from '../cal-date';
import { getHours, workFor } from '../hours';
import { Icon } from '../Icon';
import { KINDS, PICKABLE } from '../kinds';
import { sliceOn } from '../layout';
import type { ComposePreset } from '../state';
import { CATS, CAT_KEYS, type CatKey, durLabel, N, R, SANS, SHADOW, SNAP } from '../tokens';
import type { CalEvent, EventKind } from '../types';
import { Button, Chip, INPUT, Label, NEXUS_SURFACE, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { MiniMonth } from './MiniMonth';

const DURATIONS = [15, 30, 45, 60, 90, 120, 180];

/** The category a new block of a kind most likely is — one less tap. */
export const DEFAULT_CAT: Record<EventKind, CatKey> = {
  focus: 'deep',
  event: 'sync',
  task: 'admin',
  routine: 'admin',
  break: 'admin',
  ai: 'deep',
};

/**
 * Length of a timed block in minutes, across midnight when it ends on a later
 * day. `end − start` alone made a 21:00 → 01:00 block −1200 min, which the
 * sheet then floored to 15: editing it would have cut it to a quarter hour.
 */
export function spanMin(ev: Pick<CalEvent, 'date' | 'start' | 'end' | 'endDate' | 'allDay'>): number {
  const days =
    ev.endDate && !ev.allDay ? Math.round((fromIso(ev.endDate).getTime() - fromIso(ev.date).getTime()) / 86_400_000) : 0;
  return days * 1440 + toMin(ev.end) - toMin(ev.start);
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(fromIso(s).getTime());
const isTime = (s: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);

/**
 * First free `dur` minutes on `date` inside that day's working hours, at or
 * after `from` (minutes). Uses the grid's own slicing, so repeats and blocks
 * that run past midnight count as taken. Null if the day has no room.
 */
export function firstFree(date: string, dur: number, from = 0, ignoreId?: number): number | null {
  const h = getHours();
  const work = workFor(h, wdIndex(fromIso(date)));
  if (!work) return null;
  const taken = allEvents()
    .filter((e) => e.id !== ignoreId && e.kind !== 'ai')
    .map((e) => sliceOn(e, date))
    .filter((sl): sl is NonNullable<typeof sl> => !!sl)
    .map((sl) => [sl.s, sl.t] as const);
  const startAt = Math.max(work.start * 60, Math.ceil(from / SNAP) * SNAP);
  for (let m = startAt; m + dur <= work.end * 60; m += SNAP) {
    if (!taken.some(([a, b]) => m < b && m + dur > a)) return m;
  }
  return null;
}

/**
 * The full sheet: new block, or edit one. Quick-create's "More" lands here
 * with the slot and kind already filled in.
 */
export function ComposeSheet({
  composeId,
  defaultDate,
  defaultStart,
  autoPlace,
  preset,
  onClose,
  onSaved,
  toast,
}: {
  composeId: number | null;
  defaultDate: string;
  defaultStart: string;
  /** Open with "Find a time" on — how Reschedule moves a block. */
  autoPlace?: boolean;
  preset?: ComposePreset;
  onClose: () => void;
  onSaved: (dateIso: string) => void;
  toast: (m: string) => void;
}) {
  const { isPhone } = useResponsive();
  const editing = composeId ? allEvents().find((e) => e.id === composeId) ?? null : null;
  const hours = getHours();

  const initialDur = editing
    ? spanMin(editing)
    : preset?.end
      ? toMin(preset.end) - toMin(defaultStart)
      : 60;

  const [title, setTitle] = useState(editing?.title ?? preset?.title ?? '');
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [start, setStart] = useState(editing?.start ?? defaultStart);
  const [dur, setDur] = useState(Math.max(15, initialDur));
  const [kind, setKindState] = useState<EventKind>(editing?.kind === 'ai' ? 'event' : editing?.kind ?? preset?.kind ?? 'event');
  const [cat, setCat] = useState<CatKey>(editing?.cat ?? DEFAULT_CAT[preset?.kind ?? 'event']);
  const [project, setProject] = useState(editing?.project ?? '');
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [find, setFind] = useState(autoPlace ?? false);
  /** set once the person has seen the "outside your hours" line and pressed Save again */
  const [confirmOutside, setConfirmOutside] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickDate, setPickDate] = useState(false);

  const s = isTime(start) ? toMin(start) : NaN;
  const outside =
    !find && Number.isFinite(s) && (s < hours.start * 60 || s + dur > hours.end * 60);

  function save() {
    const t = title.trim();
    if (!t) return setError('Give the block a name.');
    if (editing?.imported) return toast(IMPORTED_LOCKED_MESSAGE);
    if (!isDate(date)) return setError('Date must look like 2026-10-05.');
    if (!find && !isTime(start)) return setError('Start must look like 09:30 (24-hour).');
    // A repeat is drawn as a same-day block on each of its days.
    if (!find && kind === 'routine' && s + dur >= 24 * 60)
      return setError('A routine has to end before midnight — make it shorter or start earlier.');
    if (outside && !confirmOutside) {
      setConfirmOutside(true);
      return setError(null);
    }

    let at = start;
    if (find) {
      const from = date === iso(today()) ? new Date().getHours() * 60 + new Date().getMinutes() : 0;
      const m = firstFree(date, dur, from, composeId ?? undefined);
      if (m == null) return setError(`No free ${durLabel(dur)} in working hours that day. Pick another day or a time.`);
      at = fromMin(m);
    }
    // Past midnight is allowed (a release night, a late flight): it ends on the
    // next day, and the grid draws it on both.
    const endAbs = toMin(at) + dur;
    const end = fromMin(endAbs % 1440);
    const endDate = endAbs >= 1440 ? iso(addDays(fromIso(date), 1)) : undefined;
    const fields = { title: t, date, start: at, end, endDate, cat, kind, project: project.trim(), notes: notes.trim() };
    const when = `${WD[wdIndex(fromIso(date))]} ${at}`;

    if (editing) {
      void updateEvent(editing.id, fields).then((ok) => toast(ok ? `Saved · ${when}` : SAVE_FAILED));
    } else {
      createEventAsync(fields).then(
        () => toast(`Added · ${when}`),
        () => toast(SAVE_FAILED),
      );
    }
    onSaved(date);
  }

  const d = isDate(date) ? fromIso(date) : null;

  return (
    <Modal visible transparent animationType={isPhone ? 'slide' : 'fade'} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[styles.backdrop, isPhone ? styles.backdropSheet : styles.backdropCenter]}>
        <Pressable
          {...NEXUS_SURFACE}
          onPress={(e) => e.stopPropagation()}
          style={[styles.panel, SHADOW.lg, isPhone ? styles.panelSheet : styles.panelModal]}>
          <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Label>{editing ? 'Edit block' : 'New block'}</Label>
                <Txt style={styles.title}>
                  {d ? `${WD[wdIndex(d)]} ${d.getDate()} ${MO[d.getMonth()].slice(0, 3)}` : 'Pick a date'}
                  {!find && isTime(start)
                    ? ` · ${start}–${fromMin((toMin(start) + dur) % 1440)}${toMin(start) + dur >= 1440 ? ' next day' : ''}`
                    : ''}
                </Txt>
              </View>
              <Button variant="ghost" onPress={onClose} accessibilityLabel="Close" icon={<Icon name="close" size={18} color={N.muted} />} />
            </View>

            <Field label="Title">
              <TextInput
                value={title}
                onChangeText={(v) => {
                  setTitle(v);
                  setError(null);
                }}
                autoFocus={!editing}
                onSubmitEditing={save}
                placeholder="What is it?"
                placeholderTextColor={N.faint}
                style={styles.input}
              />
            </Field>

            <Field label="Kind">
              <View style={styles.chips}>
                {PICKABLE.map((k) => (
                  <Chip
                    key={k}
                    on={k === kind}
                    onPress={() => {
                      setKindState(k);
                      if (!editing) setCat(DEFAULT_CAT[k]);
                    }}
                    icon={KINDS[k].icon}
                    label={KINDS[k].label}
                    color={CATS[cat].color}
                  />
                ))}
              </View>
              <Txt style={styles.hint}>{KINDS[kind].blurb}</Txt>
            </Field>

            <View style={styles.two}>
              <Field label="Date" style={{ flex: 1 }}>
                <Press
                  onPress={() => setPickDate((v) => !v)}
                  hoverBg={N.sunken}
                  accessibilityRole="button"
                  aria-label={`Date: ${d ? `${WD[wdIndex(d)]} ${d.getDate()} ${MO[d.getMonth()]}` : 'pick a date'}`}
                  aria-expanded={pickDate}
                  style={[styles.input, styles.dateBtn, pickDate && styles.dateBtnOn]}>
                  <Icon name="calendar" size={15} color={N.muted} />
                  <Txt style={styles.dateTxt}>
                    {d ? `${WD[wdIndex(d)]} ${d.getDate()} ${MO[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` : 'Pick a date'}
                  </Txt>
                </Press>
              </Field>
              <Field label="Start" style={{ flex: 1 }}>
                <TextInput
                  value={find ? 'found for you' : start}
                  editable={!find}
                  onChangeText={(v) => {
                    setStart(v);
                    setConfirmOutside(false);
                  }}
                  placeholder="HH:MM"
                  placeholderTextColor={N.faint}
                  style={[styles.input, find && styles.inputOff]}
                />
              </Field>
            </View>

            {pickDate && (
              <View style={styles.inlinePick}>
                <MiniMonth
                  selected={d ?? fromIso(defaultDate)}
                  events={allEvents()}
                  onPick={(v) => {
                    setDate(v);
                    setConfirmOutside(false);
                    setPickDate(false);
                  }}
                />
              </View>
            )}

            <Field label="Length">
              <View style={styles.chips}>
                {(DURATIONS.includes(dur) ? DURATIONS : [...DURATIONS, dur].sort((a, b) => a - b)).map((m) => (
                  <Chip key={m} on={m === dur} onPress={() => setDur(m)} label={durLabel(m)} color={CATS[cat].color} />
                ))}
              </View>
            </Field>

            <Press
              onPress={() => setFind(!find)}
              accessibilityRole="switch"
              aria-checked={find}
              hoverBg={N.hover}
              style={styles.toggle}>
              <View style={{ flex: 1 }}>
                <Txt style={styles.toggleTitle}>Find a time for me</Txt>
                <Txt style={styles.hint}>
                  {find
                    ? `First free ${durLabel(dur)} in your working hours that day.`
                    : 'Off — use exactly the time above.'}
                </Txt>
              </View>
              <View style={[styles.track, find && styles.trackOn]}>
                <View style={[styles.knob, find && styles.knobOn]} />
              </View>
            </Press>

            <Field label="Category">
              <View style={styles.chips}>
                {CAT_KEYS.map((k) => (
                  <Chip key={k} on={k === cat} onPress={() => setCat(k)} label={CATS[k].label} color={CATS[k].color} dot={CATS[k].color} />
                ))}
              </View>
            </Field>

            <Field label="Project (optional)">
              <TextInput
                value={project}
                onChangeText={setProject}
                placeholder="e.g. Q4 launch"
                placeholderTextColor={N.faint}
                style={styles.input}
              />
            </Field>

            <Field label="Notes (optional)">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                placeholder="Agenda, links, what done looks like"
                placeholderTextColor={N.faint}
                style={[styles.input, styles.textarea]}
              />
            </Field>

            {outside && confirmOutside && (
              <View style={styles.warn}>
                <Icon name="clock" size={14} color={N.accentInk} />
                <Txt style={styles.warnTxt}>
                  Outside your hours ({pad(hours.start)}:00–{pad(hours.end % 24)}:00). It will show as a +1 in that day&apos;s
                  header. Press Save again to keep it.
                </Txt>
              </View>
            )}
            {!!error && <Txt style={styles.error}>{error}</Txt>}

            <View style={styles.footer}>
              {editing && !editing.imported && (
                <Button
                  variant="secondary"
                  onPress={() => {
                    onClose();
                    void deleteEvent(editing.id).then((ok) => toast(ok ? 'Deleted' : SAVE_FAILED));
                  }}
                  accessibilityLabel="Delete"
                  icon={<Icon name="trash" size={16} color={N.ink2} />}
                />
              )}
              <View style={{ flex: 1 }} />
              <Button variant="ghost" label="Cancel" onPress={onClose} />
              <Button
                variant="primary"
                label={outside && confirmOutside ? 'Save anyway' : editing ? 'Save' : `Add ${KINDS[kind].label.toLowerCase()}`}
                onPress={save}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginTop: 22 }, style]}>
      <Label>{label}</Label>
      <View style={{ marginTop: 10 }}>{children}</View>
    </View>
  );
}

export { Chip };

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: N.scrim },
  backdropSheet: { justifyContent: 'flex-end' },
  backdropCenter: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  panel: { backgroundColor: N.surface, maxHeight: '92%' },
  panelSheet: { width: '100%', borderTopLeftRadius: R.xl, borderTopRightRadius: R.xl },
  panelModal: { width: '100%', maxWidth: 540, borderRadius: 16 },
  pad: { padding: 24 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { marginTop: 4, fontFamily: SANS, fontSize: 22, lineHeight: 28, fontWeight: '600', letterSpacing: -0.5, color: N.ink, fontVariant: ['tabular-nums'] },
  hint: { marginTop: 8, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },
  input: { ...INPUT },
  inputOff: { backgroundColor: N.sunken, color: N.muted },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateBtnOn: { borderColor: N.ink },
  dateTxt: { fontFamily: SANS, fontSize: 15, lineHeight: 20, color: N.ink, fontVariant: ['tabular-nums'] },
  inlinePick: { marginTop: 12, borderRadius: 12, borderWidth: 1, borderColor: N.line, paddingHorizontal: 12, paddingVertical: 10 },
  textarea: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  two: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  toggle: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: N.line,
    padding: 14,
  },
  toggleTitle: { fontFamily: SANS, fontSize: 15, lineHeight: 20, fontWeight: '500', color: N.ink },
  track: { width: 34, height: 20, borderRadius: R.full, backgroundColor: N.ghost },
  trackOn: { backgroundColor: CATS.deep.color },
  knob: { position: 'absolute', top: 2, left: 2, height: 16, width: 16, borderRadius: R.full, backgroundColor: N.surface },
  knobOn: { left: 16 },
  warn: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: N.accent,
    padding: 10,
  },
  warnTxt: { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2 },
  error: { marginTop: 14, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.accentInk },
  footer: { marginTop: 22, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
