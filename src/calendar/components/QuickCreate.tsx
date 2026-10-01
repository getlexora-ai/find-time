import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { createEventAsync, SAVE_FAILED } from '../cal-store';
import { fromIso, MO, toMin, WD, wdIndex } from '../cal-date';
import { useHours, workFor } from '../hours';
import { Icon } from '../Icon';
import { KINDS, PICKABLE } from '../kinds';
import type { ComposePreset, Slot } from '../state';
import { durLabel, N, R, SANS, T } from '../tokens';
import type { EventKind } from '../types';
import { Button, Label, Mono, Txt } from '../ui';
import { Chip, DEFAULT_CAT } from './ComposeSheet';
import { Popover } from './Popover';

/**
 * Click or drag on empty grid → this (spec §7). Title, kind, Enter.
 * "More" carries everything into the full sheet.
 */
export function QuickCreate({
  slot,
  onClose,
  onMore,
  toast,
}: {
  slot: Slot;
  onClose: () => void;
  onMore: (preset: ComposePreset) => void;
  toast: (m: string) => void;
}) {
  const hours = useHours();
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<EventKind>('event');
  const d = fromIso(slot.date);
  const dur = toMin(slot.end) - toMin(slot.start);
  const work = workFor(hours, wdIndex(d));
  const offHours =
    !work || toMin(slot.start) < work.start * 60 || toMin(slot.end) > work.end * 60;

  const save = () => {
    const t = title.trim() || 'Untitled';
    onClose();
    createEventAsync({
      date: slot.date,
      start: slot.start,
      end: slot.end,
      title: t,
      kind,
      cat: DEFAULT_CAT[kind],
    }).then(
      () => toast(`Added · ${WD[wdIndex(d)]} ${slot.start}`),
      () => toast(SAVE_FAILED),
    );
  };

  return (
    <Popover anchor={slot.anchor} width={340} estHeight={250} onClose={onClose} label="New block">
      <Label>New block</Label>
      <Mono style={styles.when}>
        {WD[wdIndex(d)]} {d.getDate()} {MO[d.getMonth()].slice(0, 3)} · {slot.start}–{slot.end} · {durLabel(dur)}
      </Mono>
      {offHours && <Txt style={styles.note}>Outside your working hours — that is fine, it is your time.</Txt>}

      <TextInput
        value={title}
        onChangeText={setTitle}
        autoFocus
        onSubmitEditing={save}
        returnKeyType="done"
        placeholder="Add a title, press Enter"
        placeholderTextColor={N.faint}
        style={styles.input}
        aria-label="Title"
      />

      <View style={styles.chips}>
        {PICKABLE.map((k) => (
          <Chip key={k} on={k === kind} onPress={() => setKind(k)} icon={KINDS[k].icon} label={KINDS[k].label} />
        ))}
      </View>

      <View style={styles.footer}>
        <Button
          variant="ghost"
          label="More options"
          onPress={() => {
            onClose();
            onMore({ end: slot.end, kind, title: title.trim() || undefined });
          }}
          icon={<Icon name="pen" size={14} color={N.ink2} />}
        />
        <View style={{ flex: 1 }} />
        <Button variant="primary" label="Save" onPress={save} />
      </View>
    </Popover>
  );
}

const styles = StyleSheet.create({
  when: { marginTop: 6, fontSize: 11, color: N.ink2 },
  note: { marginTop: 6, fontFamily: SANS, ...T.caption, color: N.muted },
  input: {
    marginTop: 14,
    height: 40,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: N.lineStrong,
    paddingHorizontal: 12,
    fontFamily: SANS,
    fontSize: 14,
    color: N.ink,
  },
  chips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  footer: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
