import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import type { PendingChange } from '@/lib/agent-types';

import { Icon } from '../Icon';
import { CATS, MONO, R, SANS, SHADOW, TERM } from '../tokens';
import { Press } from '../ui';
import { decide, type Entry, newChat, send, toggleChange, undo, useAgent } from './store';

/**
 * Plan with AI v2 — a conversation with an agent that works in front of you.
 *
 *   your message            right, a quiet bubble
 *   its words               left, plain text, written as they stream in
 *   what it is doing        one mono line per tool: spinner → ✓, with what it found
 *   a question              in its own words; suggested answers sit above the box,
 *                           and typing anything else answers it too
 *   changes                 one card: each change with a checkbox, clashes called
 *                           out, Approve / Reject. The same blocks are drawn on
 *                           the calendar as drafts while the card is open.
 *   after approving         a receipt per change, with Undo
 *
 * Visual: the dark "Ask Find Time" card from the B artboard.
 */

const STARTERS = [
  'Plan my week: finish the investor deck and fit in 3 gym sessions',
  'Find 2 hours for deep work tomorrow',
  "I'm away from the 17th to the 22nd",
];

export function AgentPanel({ onClose, docked }: { onClose: () => void; docked: boolean }) {
  const s = useAgent();
  const [draft, setDraft] = useState('');
  const scroller = useRef<ScrollView>(null);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 30);
    return () => clearTimeout(t);
  }, [s.log]);

  const submit = (text = draft) => {
    if (!text.trim() || s.busy) return;
    setDraft('');
    void send(text);
  };

  const openPending = s.pending;
  const lastPendingId = [...s.log].reverse().find((e) => e.kind === 'pending')?.id;

  return (
    <View style={[styles.wrap, docked ? styles.docked : styles.full]}>
      <View style={[styles.card, SHADOW.lg]}>
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>
            Plan with AI
          </Text>
          <Text style={styles.headNote} numberOfLines={1}>
            ● nothing saved without your OK
          </Text>
          <Press onPress={newChat} hoverBg="rgba(255,255,255,0.08)" style={styles.headBtn} accessibilityRole="button" aria-label="New conversation">
            <Text style={styles.headBtnTxt}>New</Text>
          </Press>
          <Press onPress={onClose} hoverBg="rgba(255,255,255,0.08)" style={styles.headIcon} accessibilityRole="button" aria-label="Close">
            <Icon name="close" size={16} color={TERM.muted} />
          </Press>
        </View>

        <ScrollView ref={scroller} style={styles.log} contentContainerStyle={styles.logInner} keyboardShouldPersistTaps="handled">
          {s.log.length === 0 && (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Tell me what your week needs.</Text>
              <Text style={styles.emptyText}>
                I&apos;ll look at your calendar, ask if something matters, and draft the blocks on your grid. Nothing is
                saved until you approve it.
              </Text>
              <View style={styles.starters}>
                {STARTERS.map((t) => (
                  <Press key={t} onPress={() => submit(t)} hoverBg="rgba(255,255,255,0.06)" style={styles.starter} accessibilityRole="button">
                    <Text style={styles.starterTxt}>{t}</Text>
                  </Press>
                ))}
              </View>
            </View>
          )}

          {s.log.map((e, i) => (
            <Row
              key={e.id}
              e={e}
              prev={s.log[i - 1]}
              live={e.kind === 'pending' && e.id === lastPendingId && !!openPending}
              onPeek={docked ? undefined : onClose}
            />
          ))}

          {s.busy && !s.log.some((e) => (e.kind === 'tool' && e.status === 'running') || (e.kind === 'assistant' && e.streaming)) && (
            <View style={styles.thinking}>
              <ActivityIndicator size="small" color={TERM.faint} />
              <Text style={styles.toolTxt}>thinking…</Text>
            </View>
          )}
        </ScrollView>

        {s.question && !s.busy && (
          <View style={styles.suggest}>
            {s.question.options.map((o) => (
              <Press key={o} onPress={() => submit(o)} hoverBg="rgba(255,255,255,0.06)" style={styles.chip} accessibilityRole="button">
                <Text style={styles.chipTxt}>{o}</Text>
              </Press>
            ))}
          </View>
        )}

        <View style={styles.composer}>
          <Text style={styles.prompt}>›</Text>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={
              s.question ? 'Answer, or say something else…' : openPending ? 'Approve above, or tell me what to change…' : 'Plan, move or protect time…'
            }
            placeholderTextColor={TERM.faint}
            multiline
            style={styles.input}
            onKeyPress={(e) => {
              const ne = e.nativeEvent as unknown as { key: string; shiftKey?: boolean };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                submit();
              }
            }}
            aria-label="Message"
          />
          <Press
            onPress={() => submit()}
            disabled={!draft.trim() || s.busy}
            style={styles.send}
            accessibilityRole="button"
            aria-label="Send">
            <Icon name="arrow-right" size={14} color={TERM.bg} />
          </Press>
        </View>
      </View>
    </View>
  );
}

/* ───────────────────────── one line of the conversation ───────────────────────── */

function Row({ e, prev, live, onPeek }: { e: Entry; prev?: Entry; live: boolean; onPeek?: () => void }) {
  const gap = prev && (prev.kind === 'tool') !== (e.kind === 'tool') ? 14 : e.kind === 'tool' ? 2 : 10;
  switch (e.kind) {
    case 'user':
      return (
        <View style={[styles.userRow, { marginTop: gap }]}>
          <Text style={styles.userTxt}>{e.text}</Text>
        </View>
      );
    case 'assistant':
      return (
        <Text style={[styles.asst, { marginTop: gap }]}>
          {e.text.trim()}
          {e.streaming && <Text style={styles.caret}> ▍</Text>}
        </Text>
      );
    case 'question':
      return <Text style={[styles.asst, { marginTop: gap }]}>{e.question.question}</Text>;
    case 'tool':
      return (
        <View style={[styles.tool, { marginTop: gap }]}>
          {e.status === 'running' ? (
            <ActivityIndicator size="small" color={TERM.faint} style={styles.toolIcon} />
          ) : (
            <Text style={[styles.toolMark, e.status === 'error' && styles.toolMarkErr]}>{e.status === 'error' ? '!' : '✓'}</Text>
          )}
          <Text style={styles.toolTxt} numberOfLines={2}>
            {e.label}
            {!!e.detail && <Text style={styles.toolDetail}>{`  ·  ${e.detail}`}</Text>}
          </Text>
        </View>
      );
    case 'pending':
      return <PendingCard changes={e.changes} decided={e.decided} live={live} gap={gap} onPeek={onPeek} />;
    case 'applied':
      return (
        <View style={[styles.receipt, { marginTop: gap }]}>
          <Text style={[styles.toolMark, e.undone && styles.toolMarkUndone]}>{e.undone ? '↺' : '✓'}</Text>
          <Text style={[styles.receiptTxt, e.undone && styles.undone]} numberOfLines={2}>
            {e.summary}
          </Text>
          {!e.undone && (
            <Press onPress={() => void undo(e.id)} hoverBg="rgba(255,255,255,0.08)" style={styles.undoBtn} accessibilityRole="button">
              <Text style={styles.undoTxt}>UNDO</Text>
            </Press>
          )}
        </View>
      );
    case 'error':
      return <Text style={[styles.err, { marginTop: gap }]}>{e.text}</Text>;
  }
}

function PendingCard({
  changes,
  decided,
  live,
  gap,
  onPeek,
}: {
  changes: PendingChange[];
  decided?: 'approved' | 'rejected' | 'partial';
  live: boolean;
  gap: number;
  /** phone: hide the panel to see the drafts on the calendar (the plan stays pending) */
  onPeek?: () => void;
}) {
  const s = useAgent();
  const n = changes.filter((c) => s.include[c.id] !== false).length;
  return (
    <View style={[styles.pending, { marginTop: gap }, !live && styles.pendingDone]}>
      <Text style={styles.pendingHead}>
        {live
          ? `◌ ${changes.length} CHANGE${changes.length === 1 ? '' : 'S'} · WAITING FOR YOUR OK`
          : decided === 'rejected'
            ? '✕ NOT APPLIED'
            : decided === 'partial'
              ? '◐ SOME APPLIED'
              : '✓ APPROVED'}
      </Text>
      {changes.map((c) => {
        const on = s.include[c.id] !== false;
        const cat = c.blocks[0]?.category;
        return (
          <Press
            key={c.id}
            disabled={!live}
            onPress={() => toggleChange(c.id)}
            hoverBg="rgba(255,255,255,0.04)"
            accessibilityRole="checkbox"
            aria-checked={on}
            style={styles.change}>
            {live && (
              <View style={[styles.check, on && styles.checkOn]}>{on && <Icon name="check" size={10} color={TERM.bg} />}</View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.changeTop}>
                {!!cat && <View style={[styles.catDot, { backgroundColor: CATS[cat].color }]} />}
                <Text style={[styles.changeTxt, !on && styles.changeOff]}>{c.summary}</Text>
              </View>
              {!!c.clash && <Text style={styles.clash}>⚠ {c.clash}</Text>}
            </View>
          </Press>
        );
      })}
      {live && (
        <View style={styles.actions}>
          <Press onPress={() => void decide(true)} disabled={n === 0 || s.busy} style={styles.approve} accessibilityRole="button">
            <Text style={styles.approveTxt}>{n === changes.length ? 'Approve' : `Approve ${n}`}</Text>
          </Press>
          <Press onPress={() => void decide(false)} disabled={s.busy} hoverBg="rgba(255,255,255,0.06)" style={styles.reject} accessibilityRole="button">
            <Text style={styles.rejectTxt}>Reject</Text>
          </Press>
        </View>
      )}
      {live && onPeek && (
        <Press onPress={onPeek} hoverBg="rgba(255,255,255,0.06)" style={styles.peek} accessibilityRole="button">
          <Text style={styles.peekTxt}>See on calendar →</Text>
        </Press>
      )}
      {live && <Text style={styles.pendingNote}>Drafts are on your calendar. Tell me what to change, or approve.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { zIndex: 60 },
  docked: { width: 420, padding: 16, paddingLeft: 0 },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, padding: 8 },
  card: { flex: 1, minHeight: 0, borderRadius: R.xl, backgroundColor: TERM.bg, overflow: 'hidden' },

  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    height: 46,
    backgroundColor: TERM.head,
    borderBottomWidth: 1,
    borderBottomColor: TERM.line,
  },
  title: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '500', color: TERM.text },
  headNote: { flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 10, lineHeight: 14, color: TERM.ok },
  headBtn: { height: 26, paddingHorizontal: 9, borderRadius: R.sm, justifyContent: 'center', borderWidth: 1, borderColor: TERM.cardLine },
  headBtnTxt: { fontFamily: MONO, fontSize: 10, color: TERM.soft },
  headIcon: { width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },

  log: { flex: 1 },
  logInner: { padding: 16, paddingBottom: 20 },

  empty: { paddingTop: 8 },
  emptyTitle: { fontFamily: SANS, fontSize: 17, lineHeight: 24, fontWeight: '500', color: TERM.text, letterSpacing: -0.3 },
  emptyText: { marginTop: 6, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: TERM.muted },
  starters: { marginTop: 16, gap: 6 },
  starter: { borderRadius: R.md, borderWidth: 1, borderColor: TERM.cardLine, paddingHorizontal: 12, paddingVertical: 9 },
  starterTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 17, color: TERM.soft },

  userRow: { alignSelf: 'flex-end', maxWidth: '86%', borderRadius: R.lg, backgroundColor: TERM.bubble, paddingHorizontal: 12, paddingVertical: 8 },
  userTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 19, color: TERM.text },
  asst: { fontFamily: SANS, fontSize: 14, lineHeight: 21, color: TERM.text },
  caret: { color: TERM.faint },

  tool: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingLeft: 2 },
  toolIcon: { width: 12, height: 14, transform: [{ scale: 0.6 }] },
  toolMark: { width: 12, fontFamily: MONO, fontSize: 11, lineHeight: 16, color: TERM.ok, textAlign: 'center' },
  toolMarkErr: { color: TERM.wait },
  toolMarkUndone: { color: TERM.faint },
  toolTxt: { flex: 1, fontFamily: MONO, fontSize: 11, lineHeight: 16, color: TERM.muted },
  toolDetail: { color: TERM.faint },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },

  pending: { borderRadius: R.lg, borderWidth: 1, borderColor: TERM.cardLine, backgroundColor: TERM.card, padding: 12, gap: 4 },
  pendingDone: { opacity: 0.7 },
  pendingHead: { fontFamily: MONO, fontSize: 10, lineHeight: 14, color: TERM.wait, marginBottom: 4 },
  change: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6, borderRadius: R.sm },
  check: {
    width: 15,
    height: 15,
    marginTop: 1,
    borderRadius: R.xs,
    borderWidth: 1,
    borderColor: TERM.faint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: TERM.text, borderColor: TERM.text },
  changeTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  catDot: { width: 7, height: 7, borderRadius: 4 },
  changeTxt: { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: TERM.text },
  changeOff: { color: TERM.faint, textDecorationLine: 'line-through' },
  clash: { marginTop: 3, fontFamily: MONO, fontSize: 10, lineHeight: 14, color: TERM.wait },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  approve: { flex: 1, height: 34, borderRadius: R.md, backgroundColor: TERM.text, alignItems: 'center', justifyContent: 'center' },
  approveTxt: { fontFamily: SANS, fontSize: 13, fontWeight: '500', color: TERM.bg },
  reject: { flex: 1, height: 34, borderRadius: R.md, borderWidth: 1, borderColor: '#404040', alignItems: 'center', justifyContent: 'center' },
  rejectTxt: { fontFamily: SANS, fontSize: 13, fontWeight: '500', color: TERM.soft },
  peek: { marginTop: 6, height: 32, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  peekTxt: { fontFamily: MONO, fontSize: 11, color: TERM.soft },
  pendingNote: { marginTop: 6, fontFamily: MONO, fontSize: 10, lineHeight: 14, color: TERM.faint },

  receipt: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 2 },
  receiptTxt: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 17, color: TERM.soft },
  undone: { color: TERM.faint, textDecorationLine: 'line-through' },
  undoBtn: { borderRadius: R.sm, paddingHorizontal: 8, paddingVertical: 4 },
  undoTxt: { fontFamily: MONO, fontSize: 10, color: TERM.text },

  err: { fontFamily: SANS, fontSize: 12, lineHeight: 17, color: TERM.wait },

  suggest: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingTop: 10 },
  chip: { borderRadius: R.full, borderWidth: 1, borderColor: '#404040', paddingHorizontal: 11, paddingVertical: 6 },
  chipTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: TERM.text },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    margin: 12,
    marginTop: 10,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: TERM.cardLine,
  },
  prompt: { fontFamily: MONO, fontSize: 13, lineHeight: 30, color: TERM.ok, fontWeight: '600' },
  input: {
    flex: 1,
    minHeight: 30,
    maxHeight: 120,
    paddingTop: 6,
    paddingBottom: 6,
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: TERM.text,
    outlineStyle: 'none',
  } as object,
  send: { width: 30, height: 30, borderRadius: R.md, backgroundColor: TERM.text, alignItems: 'center', justifyContent: 'center' },
});
