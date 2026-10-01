import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import type { DraftBlock, PendingChange } from '@/lib/agent-types';

import { fromIso, MO, WD, wdIndex } from '../cal-date';
import { Icon } from '../Icon';
import { BREAK_COLOR, CATS, MONO, N, R, SANS } from '../tokens';
import { Press } from '../ui';
import { type Entry, toggleChange, useAgent } from './store';

/**
 * Pieces every chat design shares, so the three directions differ in look and
 * layout only — never in what the conversation says or does.
 */

export type ToolEntry = Extract<Entry, { kind: 'tool' }>;
export type Item = Entry | { kind: 'steps'; id: string; tools: ToolEntry[] };

/** Consecutive tool lines become one "steps" group. */
export function groupLog(log: Entry[]): Item[] {
  const out: Item[] = [];
  for (const e of log) {
    const last = out[out.length - 1];
    if (e.kind === 'tool') {
      if (last?.kind === 'steps') last.tools.push(e);
      else out.push({ kind: 'steps', id: `s-${e.id}`, tools: [e] });
    } else out.push(e);
  }
  return out;
}

const dayLabel = (d: string) => {
  const x = fromIso(d);
  return `${WD[wdIndex(x)]} ${x.getDate()} ${MO[x.getMonth()].slice(0, 3)}`;
};

export const colorOf = (b: DraftBlock) => (b.kind === 'break' ? BREAK_COLOR : CATS[b.category].color);

/**
 * Steps: while the agent works you watch the checklist fill in; once it is done
 * it folds to one line ("Checked 4 things") you can open again.
 */
export function Steps({
  tools,
  tone = 'light',
}: {
  tools: ToolEntry[];
  tone?: 'light' | 'dark' | 'bubble';
}) {
  const running = tools.some((t) => t.status === 'running');
  const [open, setOpen] = useState(false);
  const c = TONE[tone];
  const shown = running || open;
  return (
    <View>
      {!running && (
        <Press onPress={() => setOpen(!open)} style={s.stepsHead} accessibilityRole="button" aria-expanded={open}>
          <View style={[s.stepsDot, { backgroundColor: c.ok }]} />
          <Text style={[s.stepsHeadTxt, { color: c.muted }]}>
            {summary(tools)}
          </Text>
          <Icon name={open ? 'arrow-down' : 'arrow-right'} size={11} color={c.faint} />
        </Press>
      )}
      {shown && (
        <View style={[s.stepsList, !running && { marginTop: 4 }]}>
          {tools.map((t) => (
            <View key={t.id} style={s.step}>
              {t.status === 'running' ? (
                <ActivityIndicator size="small" color={c.faint} style={s.spin} />
              ) : (
                <Text style={[s.stepMark, { color: t.status === 'error' ? N.accent : c.ok }]}>{t.status === 'error' ? '!' : '✓'}</Text>
              )}
              <Text style={[s.stepTxt, { color: c.muted }]} numberOfLines={2}>
                {t.label}
                {!!t.detail && <Text style={{ color: c.faint }}>{`  ${t.detail}`}</Text>}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function summary(tools: ToolEntry[]) {
  const checks = tools.filter((t) => !/^Drafting|^Applying|^You answered/.test(t.label)).length;
  const drafts = tools.filter((t) => /^Drafting/.test(t.label)).length;
  const parts = [checks && `Checked ${checks} thing${checks === 1 ? '' : 's'}`, drafts && `drafted ${drafts}`].filter(Boolean);
  return parts.join(' · ') || `${tools.length} step${tools.length === 1 ? '' : 's'}`;
}

/**
 * The plan, drawn the way the calendar draws blocks: a solid tile in the
 * category's colour, day and time beside it. Tap a tile to leave it out.
 */
export function PlanTiles({
  changes,
  live,
  tone = 'light',
}: {
  changes: PendingChange[];
  live: boolean;
  tone?: 'light' | 'dark' | 'bubble';
}) {
  const st = useAgent();
  const c = TONE[tone];
  return (
    <View style={s.tiles}>
      {changes.map((ch) => {
        const on = st.include[ch.id] !== false;
        const b = ch.blocks[0];
        const color = b ? colorOf(b) : N.faint;
        return (
          <Press
            key={ch.id}
            disabled={!live}
            onPress={() => toggleChange(ch.id)}
            accessibilityRole="checkbox"
            aria-checked={on}
            aria-label={ch.summary}
            style={s.tileRow}>
            <View style={[s.tile, on ? { backgroundColor: color } : { borderColor: color, borderWidth: 1.5, borderStyle: 'dashed' }]}>
              <Text style={[s.tileTitle, { color: on ? '#fff' : color }]} numberOfLines={1}>
                {b?.title ?? ch.summary}
              </Text>
              {!!b && (
                <Text style={[s.tileTime, { color: on ? 'rgba(255,255,255,0.85)' : color }]}>
                  {b.start}–{b.end}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[s.tileDay, { color: on ? c.text : c.faint }, !on && s.struck]}>
                {b ? dayLabel(b.date) : ch.action}
                {ch.action === 'move' ? ' · move' : ch.action === 'delete' ? ' · remove' : ''}
              </Text>
              {!!ch.clash && <Text style={s.clash}>{`Overlaps ${ch.clash.replace(/^overlaps /, '')}`}</Text>}
            </View>
            {live && (
              <View style={[s.check, { borderColor: c.faint }, on && { backgroundColor: c.text, borderColor: c.text }]}>
                {on && <Icon name="check" size={10} color={c.bg} />}
              </View>
            )}
          </Press>
        );
      })}
    </View>
  );
}

/** Suggested replies — shortcuts, never the only way to answer. */
export function Suggestions({
  options,
  onPick,
  tone = 'light',
}: {
  options: string[];
  onPick: (o: string) => void;
  tone?: 'light' | 'dark' | 'bubble';
}) {
  const c = TONE[tone];
  return (
    <View style={s.sugg}>
      {options.map((o) => (
        <Press key={o} onPress={() => onPick(o)} hoverBg={c.hover} style={[s.chip, { borderColor: c.chipLine }]} accessibilityRole="button">
          <Text style={[s.chipTxt, { color: c.text }]}>{o}</Text>
        </Press>
      ))}
    </View>
  );
}

/** Three dots while it thinks — the one animation-like cue, drawn static (no motion needed to read it). */
export function Typing({ tone = 'light' }: { tone?: 'light' | 'dark' | 'bubble' }) {
  const c = TONE[tone];
  return (
    <View style={s.typing} accessibilityLabel="Thinking">
      {[0.35, 0.6, 0.85].map((o) => (
        <View key={o} style={[s.typingDot, { backgroundColor: c.muted, opacity: o }]} />
      ))}
    </View>
  );
}

export const TONE = {
  light: { bg: N.surface, text: N.ink, muted: N.ink2, faint: N.faint, ok: '#16A34A', hover: N.hover, chipLine: N.lineStrong },
  bubble: { bg: '#FFFFFF', text: N.ink, muted: N.ink2, faint: N.faint, ok: '#16A34A', hover: N.hover, chipLine: '#C4B5FD' },
  dark: { bg: '#111111', text: '#FFFFFF', muted: '#A3A3A3', faint: '#737373', ok: '#4ADE80', hover: 'rgba(255,255,255,0.06)', chipLine: '#404040' },
} as const;

const s = StyleSheet.create({
  stepsHead: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', paddingVertical: 2 },
  stepsDot: { width: 6, height: 6, borderRadius: 3 },
  stepsHeadTxt: { fontFamily: MONO, fontSize: 11, lineHeight: 15 },
  stepsList: { gap: 3 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  spin: { width: 12, height: 14, transform: [{ scale: 0.6 }] },
  stepMark: { width: 12, fontFamily: MONO, fontSize: 11, lineHeight: 15, textAlign: 'center' },
  stepTxt: { flex: 1, fontFamily: MONO, fontSize: 11, lineHeight: 15 },

  tiles: { gap: 6 },
  tileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.md },
  tile: { width: 148, borderRadius: R.md, paddingHorizontal: 9, paddingVertical: 6, gap: 1 },
  tileTitle: { fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '600' },
  tileTime: { fontFamily: MONO, fontSize: 10, lineHeight: 13 },
  tileDay: { fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '500' },
  struck: { textDecorationLine: 'line-through' },
  clash: { marginTop: 2, fontFamily: SANS, fontSize: 11, lineHeight: 15, color: N.accentInk },
  check: { width: 16, height: 16, borderRadius: R.xs, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

  sugg: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderRadius: R.full, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  chipTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 16, fontWeight: '500' },

  typing: { flexDirection: 'row', gap: 4, paddingVertical: 6 },
  typingDot: { width: 6, height: 6, borderRadius: 3 },
});
