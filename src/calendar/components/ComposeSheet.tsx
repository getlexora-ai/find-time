import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { allEvents, byDate, createEvent, deleteEvent, updateEvent } from '../cal-store';
import { fromMin, iso, toMin } from '../cal-date';
import { Icon } from '../Icon';
import { TODAY } from '../seed';
import { useCalTheme } from '../theme-context';
import { CATS, CAT_KEYS, type CatKey, C, R, w } from '../tokens';
import { MONO, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

const DURATIONS = [
  { v: 30, label: '30 min' },
  { v: 45, label: '45 min' },
  { v: 60, label: '60 min' },
  { v: 90, label: '90 min' },
  { v: 120, label: '120 min' },
  { v: 180, label: '3 hours' },
];
const REPEATS = ['Does not repeat', 'Every weekday', 'Weekly on this day', 'Every 2 weeks'];
const PROJECTS = ['Mobile launch', 'Website v2', 'User research', 'No project'];

export function ComposeSheet({
  composeId,
  defaultDate,
  defaultStart,
  onClose,
  onSaved,
  toast,
}: {
  composeId: number | null;
  defaultDate: string;
  defaultStart: string;
  onClose: () => void;
  onSaved: (dateIso: string) => void;
  toast: (m: string) => void;
}) {
  const { theme } = useCalTheme();
  const { isPhone } = useResponsive();
  // The parent remounts this sheet per open (key={compose.id}), so plain lazy
  // initialisers are enough — no prop→state effect needed.
  const editing = composeId ? allEvents().find((e) => e.id === composeId) ?? null : null;

  const [title, setTitle] = useState(editing?.title ?? '');
  const [date, setDate] = useState(editing?.date ?? defaultDate);
  const [start, setStart] = useState(editing?.start ?? defaultStart);
  const [dur, setDur] = useState(editing ? toMin(editing.end) - toMin(editing.start) : 60);
  const [repeat, setRepeat] = useState(0);
  const [cat, setCat] = useState<CatKey>(editing?.cat ?? 'deep');
  const [project, setProject] = useState(editing?.project || 'No project');
  const [ai, setAi] = useState(!editing);
  const [notes, setNotes] = useState(editing?.notes ?? '');

  function save() {
    const t = title.trim();
    if (!t) {
      toast('Give the block a name');
      return;
    }
    const d = date || iso(TODAY);
    let s = start || '09:00';
    let placed = false;
    if (ai && !composeId) {
      const taken = byDate(allEvents(), d).map((e) => [toMin(e.start), toMin(e.end)] as const);
      for (let m = 8 * 60; m + dur <= 18 * 60; m += 15) {
        if (!taken.some(([a, b]) => m < b && m + dur > a)) {
          s = fromMin(m);
          placed = true;
          break;
        }
      }
    }
    const proj = project === 'No project' ? '' : project;
    if (composeId) {
      updateEvent(composeId, {
        title: t,
        date: d,
        start: s,
        end: fromMin(toMin(s) + dur),
        cat,
        project: proj,
        notes: notes.trim(),
      });
      toast('Event updated');
    } else {
      createEvent({ date: d, start: s, end: fromMin(toMin(s) + dur), title: t, cat, project: proj, notes: notes.trim() });
      toast(placed ? `Time found at ${s}. No conflicts.` : `Added at ${s}`);
    }
    onSaved(d);
  }

  return (
    <Modal visible transparent animationType={isPhone ? 'slide' : 'fade'} onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[styles.backdrop, { backgroundColor: C.scrim }, isPhone ? styles.backdropSheet : styles.backdropCenter]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.panel,
            { backgroundColor: theme.panel, borderColor: theme.panelBorder },
            isPhone ? styles.panelSheet : styles.panelModal,
          ]}>
          <ScrollView contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {isPhone && <View style={styles.grab} />}
            <View style={styles.head}>
              <View>
                <Txt style={styles.eyebrow}>{editing ? 'Edit block' : 'New block'}</Txt>
                <Txt style={styles.title}>{editing ? 'Adjust this event' : 'Add to your calendar'}</Txt>
              </View>
              <Press onPress={onClose} hoverBg={w(0.1)} style={styles.close} aria-label="Close">
                <Icon name="close" size={20} color={w(0.5)} />
              </Press>
            </View>

            <Field label="Title">
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Deep work · Onboarding spec"
                placeholderTextColor={w(0.25)}
                style={styles.input}
              />
            </Field>

            <View style={styles.two}>
              <Field label="Date" style={{ flex: 1 }}>
                <TextInput value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={w(0.25)} style={styles.input} />
              </Field>
              <Field label="Start" style={{ flex: 1 }}>
                <TextInput value={start} onChangeText={setStart} placeholder="HH:MM" placeholderTextColor={w(0.25)} style={styles.input} />
              </Field>
            </View>

            <Field label="Duration">
              <ChipRow
                options={DURATIONS.map((d) => ({ key: String(d.v), label: d.label }))}
                value={String(dur)}
                onChange={(k) => setDur(Number(k))}
              />
            </Field>

            <Field label="Repeats">
              <ChipRow
                options={REPEATS.map((r, i) => ({ key: String(i), label: r }))}
                value={String(repeat)}
                onChange={(k) => setRepeat(Number(k))}
              />
            </Field>

            <Field label="Category">
              <View style={styles.chips}>
                {CAT_KEYS.map((k) => {
                  const on = k === cat;
                  return (
                    <Press
                      key={k}
                      onPress={() => setCat(k)}
                      style={[styles.catChip, on ? styles.catChipOn : styles.catChipOff]}>
                      <View style={[styles.catDot, { backgroundColor: CATS[k].color }]} />
                      <Txt style={[styles.catChipTxt, { color: on ? '#fff' : w(0.5) }]}>{CATS[k].label}</Txt>
                    </Press>
                  );
                })}
              </View>
            </Field>

            <Field label="Project">
              <ChipRow
                options={PROJECTS.map((p) => ({ key: p, label: p }))}
                value={project}
                onChange={setProject}
              />
            </Field>

            <Press
              onPress={() => setAi(!ai)}
              accessibilityRole="switch"
              aria-checked={ai}
              style={[styles.aiToggle, ai ? styles.aiToggleOn : styles.aiToggleOff]}>
              <Icon name="magic" size={18} color={C.lime} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt style={styles.aiToggleTitle}>Let AI place it</Txt>
                <Txt style={styles.aiToggleHint}>
                  {ai ? 'Find the best slot around my energy and deadlines.' : 'Use exactly the time I picked.'}
                </Txt>
              </View>
              <View style={[styles.track, { backgroundColor: ai ? C.lime : w(0.18) }]}>
                <View style={[styles.knob, { left: ai ? 18 : 2, backgroundColor: ai ? C.surface : C.light }]} />
              </View>
            </Press>

            <Field label="Notes">
              <TextInput
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                placeholder="Agenda, links, what done looks like…"
                placeholderTextColor={w(0.25)}
                style={[styles.input, styles.textarea]}
              />
            </Field>

            <View style={styles.footer}>
              <Press onPress={save} hoverBg={C.limeHover} style={styles.saveBtn}>
                <Icon name="check" size={18} color={C.surface} />
                <Txt style={styles.saveTxt}>Save event</Txt>
              </Press>
              {editing && (
                <Press
                  onPress={() => {
                    deleteEvent(editing.id);
                    onClose();
                    toast('Event removed');
                  }}
                  hoverBg="rgba(255,68,0,0.1)"
                  style={styles.delBtn}>
                  <Icon name="trash" size={18} color={C.orange} />
                </Press>
              )}
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[{ marginTop: 16 }, style]}>
      <Txt style={styles.fieldLabel}>{label}</Txt>
      <View style={{ marginTop: 8 }}>{children}</View>
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.chip, on ? styles.chipOn : styles.chipOff]}>
            <Txt style={[styles.chipTxt, { color: on ? '#fff' : w(0.5) }]}>{o.label}</Txt>
          </Press>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end' },
  backdropCenter: { justifyContent: 'center', alignItems: 'center', padding: 20 },
  panel: {
    borderWidth: 1,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  panelSheet: { width: '100%', borderTopLeftRadius: R.xl2, borderTopRightRadius: R.xl2 },
  panelModal: { width: '100%', maxWidth: 512, borderRadius: R.xl2 },
  grab: { alignSelf: 'center', marginBottom: 16, height: 4, width: 40, borderRadius: R.full, backgroundColor: w(0.2) },
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  eyebrow: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { marginTop: 4, color: '#fff', fontSize: 20, fontWeight: '500', letterSpacing: -0.4 },
  close: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  fieldLabel: { color: w(0.5), fontSize: 12 },
  input: {
    height: 44,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.05),
    paddingHorizontal: 12,
    color: '#fff',
    fontSize: 14,
    fontFamily: MONO,
  },
  textarea: { height: 84, paddingTop: 12, textAlignVertical: 'top' },
  two: { flexDirection: 'row', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: R.full, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipOn: { borderColor: w(0.4), backgroundColor: w(0.1) },
  chipOff: { borderColor: w(0.1) },
  chipTxt: { fontSize: 12 },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.full, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  catChipOn: { borderColor: w(0.4), backgroundColor: w(0.1) },
  catChipOff: { borderColor: w(0.1) },
  catDot: { height: 8, width: 8, borderRadius: 4 },
  catChipTxt: { fontSize: 12 },
  aiToggle: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    borderWidth: 1,
    padding: 12,
  },
  aiToggleOn: { borderColor: 'rgba(204,255,0,0.4)', backgroundColor: 'rgba(204,255,0,0.1)' },
  aiToggleOff: { borderColor: w(0.1), backgroundColor: w(0.05) },
  aiToggleTitle: { color: '#fff', fontSize: 12 },
  aiToggleHint: { marginTop: 4, color: w(0.45), fontSize: 12 },
  track: { width: 36, height: 20, borderRadius: R.full },
  knob: { position: 'absolute', top: 2, height: 16, width: 16, borderRadius: R.full },
  footer: { marginTop: 20, flexDirection: 'row', gap: 8 },
  saveBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: R.lg,
    backgroundColor: C.lime,
  },
  saveTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  delBtn: {
    height: 44,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,68,0,0.4)',
  },
});
