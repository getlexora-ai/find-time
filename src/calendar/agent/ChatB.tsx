import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '../Icon';
import { MONO, N, R, SANS, SHADOW } from '../tokens';
import { Press } from '../ui';
import { enterToSend, useComposer } from './ChatA';
import { groupLog, PlanTiles, Steps, Suggestions, Typing } from './parts';
import { decide, newChat, undo, useAgent } from './store';

/**
 * Direction B — the calendar is the chat. No panel: a prompt bar floats over
 * the bottom of the week, the conversation is a compact card above it, and the
 * plan's drafts sit on the grid itself, so your eyes never leave the calendar.
 * Collapse the card and only the bar (and a "3 drafts waiting" pill) remain.
 */
export function ChatB({
  expanded,
  onExpand,
  onCollapse,
  phone,
  side = 'center',
}: {
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  phone: boolean;
  /** which side of the week to sit on — away from the drafts, so they stay visible */
  side?: 'left' | 'center' | 'right';
}) {
  const st = useAgent();
  const { draft, setDraft, submit, scroller } = useComposer();
  const items = groupLog(st.log);
  const lastPending = [...st.log].reverse().find((e) => e.kind === 'pending')?.id;
  const thinking = st.busy && !st.log.some((e) => (e.kind === 'tool' && e.status === 'running') || (e.kind === 'assistant' && e.streaming));
  const showCard = expanded && st.log.length > 0;
  const pendingN = st.pending ? st.pending.filter((c) => st.include[c.id] !== false).length : 0;

  const go = (t?: string) => {
    onExpand();
    submit(t);
  };

  return (
    <View
      pointerEvents="box-none"
      style={[b.dock, !phone && side === 'left' && b.dockLeft, !phone && side === 'right' && b.dockRight, phone && b.dockPhone]}>
      {showCard && (
        <View style={[b.card, SHADOW.lg]}>
          <View style={b.cardHead}>
            <Text style={b.cardTitle}>Plan with AI</Text>
            <Press onPress={newChat} hoverBg={N.hover} style={b.headBtn} accessibilityRole="button">
              <Text style={b.headBtnTxt}>New</Text>
            </Press>
            <Press onPress={onCollapse} hoverBg={N.hover} style={b.iconBtn} accessibilityRole="button" aria-label="Minimise">
              <Icon name="arrow-down" size={14} color={N.muted} />
            </Press>
          </View>
          <ScrollView ref={scroller} style={b.thread} contentContainerStyle={b.threadInner} keyboardShouldPersistTaps="handled">
            {items.map((it) => {
              switch (it.kind) {
                case 'user':
                  return (
                    <Text key={it.id} style={b.user}>
                      {it.text}
                    </Text>
                  );
                case 'assistant':
                  return (
                    <Text key={it.id} style={b.asst}>
                      {it.text.trim()}
                    </Text>
                  );
                case 'question':
                  return (
                    <Text key={it.id} style={[b.asst, { fontWeight: '500' }]}>
                      {it.question.question}
                    </Text>
                  );
                case 'steps':
                  return <Steps key={it.id} tools={it.tools} />;
                case 'pending': {
                  const live = it.id === lastPending && !!st.pending;
                  return (
                    <View key={it.id} style={[b.plan, !live && { opacity: 0.6 }]}>
                      <Text style={b.planTitle}>
                        {live ? 'On your week as drafts' : it.decided === 'rejected' ? 'Not added' : 'Added'}
                      </Text>
                      <PlanTiles changes={it.changes} live={live} />
                    </View>
                  );
                }
                case 'applied':
                  return (
                    <View key={it.id} style={b.receipt}>
                      <Text style={[b.receiptTxt, it.undone && b.undone]}>✓ {it.summary}</Text>
                      {!it.undone && (
                        <Press onPress={() => void undo(it.id)} hoverBg={N.hover} style={b.undo} accessibilityRole="button">
                          <Text style={b.undoTxt}>Undo</Text>
                        </Press>
                      )}
                    </View>
                  );
                case 'error':
                  return (
                    <Text key={it.id} style={b.err}>
                      {it.text}
                    </Text>
                  );
              }
            })}
            {thinking && <Typing />}
          </ScrollView>
          {!!st.pending && (
            <View style={b.approveBar}>
              <Text style={b.approveTxt}>
                {pendingN} of {st.pending.length} selected
              </Text>
              <Press onPress={() => void decide(false)} disabled={st.busy} hoverBg={N.hover} style={b.ghost} accessibilityRole="button">
                <Text style={b.ghostTxt}>Discard</Text>
              </Press>
              <Press onPress={() => void decide(true)} disabled={!pendingN || st.busy} style={[b.primary, SHADOW.md]} accessibilityRole="button">
                <Text style={b.primaryTxt}>Add to calendar</Text>
              </Press>
            </View>
          )}
          {st.question && !st.busy && (
            <View style={{ paddingHorizontal: 14, paddingBottom: 10 }}>
              <Suggestions options={st.question.options} onPick={(o) => go(o)} />
            </View>
          )}
        </View>
      )}

      {!expanded && !!st.pending && (
        <Press onPress={onExpand} style={[b.pill, SHADOW.md]} accessibilityRole="button">
          <View style={b.pillDot} />
          <Text style={b.pillTxt}>
            {st.pending.length} draft{st.pending.length === 1 ? '' : 's'} waiting · Review
          </Text>
        </Press>
      )}

      <View style={[b.bar, SHADOW.lg]}>
        <View style={b.barMark}>
          <Icon name="magic" size={14} color={N.onInk} />
        </View>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onFocus={onExpand}
          placeholder={st.question ? 'Answer, or say something else' : 'Ask Find Time to plan, move or protect time'}
          placeholderTextColor={N.faint}
          style={b.input}
          onKeyPress={enterToSend(() => go())}
          aria-label="Ask Find Time"
        />
        {!phone && <Text style={b.kbd}>↵</Text>}
        <Press onPress={() => go()} disabled={!draft.trim() || st.busy} style={b.send} accessibilityRole="button" aria-label="Send">
          <Icon name="arrow-right" size={14} color={N.onInk} />
        </Press>
      </View>
    </View>
  );
}

const b = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center', gap: 10, paddingHorizontal: 16, zIndex: 70 },
  dockPhone: { bottom: 8, paddingHorizontal: 8 },
  dockLeft: { alignItems: 'flex-start' },
  dockRight: { alignItems: 'flex-end' },
  card: { width: '100%', maxWidth: 560, maxHeight: 440, borderRadius: R.xl, backgroundColor: N.surface, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 14, paddingRight: 6, height: 40, borderBottomWidth: 1, borderBottomColor: N.line },
  cardTitle: { flex: 1, fontFamily: SANS, fontSize: 13, fontWeight: '600', color: N.ink },
  headBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm },
  headBtnTxt: { fontFamily: SANS, fontSize: 12, color: N.ink2 },
  iconBtn: { width: 28, height: 28, borderRadius: R.sm, alignItems: 'center', justifyContent: 'center' },
  thread: { flexGrow: 0 },
  threadInner: { padding: 14, gap: 10 },
  user: { alignSelf: 'flex-end', maxWidth: '85%', fontFamily: SANS, fontSize: 13, lineHeight: 19, color: N.ink2, backgroundColor: N.sunken, borderRadius: R.lg, paddingHorizontal: 11, paddingVertical: 7, overflow: 'hidden' },
  asst: { fontFamily: SANS, fontSize: 14, lineHeight: 21, color: N.ink },
  plan: { gap: 8 },
  planTitle: { fontFamily: MONO, fontSize: 10, letterSpacing: 0.6, color: N.faint, textTransform: 'uppercase' },
  receipt: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  receiptTxt: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 17, color: N.ink2 },
  undone: { color: N.faint, textDecorationLine: 'line-through' },
  undo: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.sm },
  undoTxt: { fontFamily: SANS, fontSize: 12, fontWeight: '500', color: N.ink },
  err: { fontFamily: SANS, fontSize: 12, color: N.accentInk },
  approveBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderTopWidth: 1, borderTopColor: N.line },
  approveTxt: { flex: 1, fontFamily: SANS, fontSize: 12, color: N.muted },
  ghost: { height: 34, paddingHorizontal: 12, borderRadius: R.md, justifyContent: 'center' },
  ghostTxt: { fontFamily: SANS, fontSize: 13, fontWeight: '500', color: N.ink2 },
  primary: { height: 34, paddingHorizontal: 14, borderRadius: R.md, backgroundColor: N.ink, justifyContent: 'center' },
  primaryTxt: { fontFamily: SANS, fontSize: 13, fontWeight: '500', color: N.onInk },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.full, backgroundColor: N.surface, paddingHorizontal: 14, paddingVertical: 8 },
  pillDot: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderStyle: 'dashed', borderColor: N.accent },
  pillTxt: { fontFamily: SANS, fontSize: 12, fontWeight: '500', color: N.ink },
  bar: { width: '100%', maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: R.xl, backgroundColor: N.surface, paddingLeft: 8, paddingRight: 8, height: 52 },
  barMark: { width: 34, height: 34, borderRadius: R.md, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  input: { flex: 1, height: 40, fontFamily: SANS, fontSize: 14, color: N.ink, outlineStyle: 'none' } as object,
  kbd: { fontFamily: MONO, fontSize: 11, color: N.faint, borderWidth: 1, borderColor: N.line, borderRadius: R.xs, paddingHorizontal: 5, paddingVertical: 1 },
  send: { width: 34, height: 34, borderRadius: R.md, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
});
