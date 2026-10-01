import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { createEventAsync, SAVE_FAILED } from '../cal-store';
import { fromIso, MO, toMin, WD, wdIndex } from '../cal-date';
import { useHours, workFor } from '../hours';
import { Icon } from '../Icon';
import { KINDS, PICKABLE } from '../kinds';
import type { ComposePreset, Slot } from '../state';
import { CATS, durLabel, N, SANS } from '../tokens';
import type { EventKind } from '../types';
import { Button, Chip, INPUT, Txt } from '../ui';
import { DEFAULT_CAT } from './ComposeSheet';
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
    <Popover anchor={slot.anchor} width={360} estHeight={330} onClose={onClose} label="New block">
      <Txt style={styles.head}>New block</Txt>
      <Txt style={styles.when}>
        {WD[wdIndex(d)]} {d.getDate()} {MO[d.getMonth()].slice(0, 3)} · {slot.start} – {slot.end} · {durLabel(dur)}
      </Txt>
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
          <Chip
            key={k}
            on={k === kind}
            onPress={() => setKind(k)}
            icon={KINDS[k].icon}
            label={KINDS[k].label}
            color={CATS[DEFAULT_CAT[k]].color}
          />
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
  head: { fontFamily: SANS, fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: -0.3, color: N.ink },
  when: { marginTop: 4, fontFamily: SANS, fontSize: 14, lineHeight: 20, color: N.ink2, fontVariant: ['tabular-nums'] },
  note: { marginTop: 6, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.muted },
  input: { ...INPUT, marginTop: 16 },
  chips: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  footer: { marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
