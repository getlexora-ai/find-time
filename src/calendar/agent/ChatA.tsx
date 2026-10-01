import { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '../Icon';
import { MONO, N, R, SANS, SHADOW } from '../tokens';
import { Press } from '../ui';
import { groupLog, PlanTiles, Steps, Suggestions, Typing } from './parts';
import { decide, newChat, send, undo, useAgent } from './store';

/**
 * Direction A — part of the calendar. A light Nexus panel: same white, same
 * hairlines, same ink as the grid, so it reads as one more instrument beside
 * the week rather than another app. The plan is drawn as the calendar's own
 * coloured tiles.
 */

const STARTERS = ['Plan my week around the investor deck', 'Find 2 hours for deep work tomorrow', "I'm away from the 17th to the 22nd"];

export function ChatA({ onClose, docked }: { onClose: () => void; docked: boolean }) {
  const st = useAgent();
  const { draft, setDraft, submit, scroller } = useComposer();
  const items = groupLog(st.log);
  const lastPending = [...st.log].reverse().find((e) => e.kind === 'pending')?.id;
  const thinking = st.busy && !st.log.some((e) => (e.kind === 'tool' && e.status === 'running') || (e.kind === 'assistant' && e.streaming));

  return (
    <View style={[a.wrap, docked ? a.docked : a.full]}>
      <View style={a.head}>
        <View style={a.mark}>
          <Icon name="magic" size={13} color={N.onInk} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={a.title}>Plan with AI</Text>
          <Text style={a.sub}>Drafts appear on your week. Nothing is saved until you add it.</Text>
        </View>
        <Press onPress={newChat} hoverBg={N.hover} style={a.iconBtn} accessibilityRole="button" aria-label="New conversation">
          <Icon name="refresh-plain" size={14} color={N.muted} />
        </Press>
        <Press onPress={onClose} hoverBg={N.hover} style={a.iconBtn} accessibilityRole="button" aria-label="Close">
          <Icon name="close" size={15} color={N.muted} />
        </Press>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={a.log} keyboardShouldPersistTaps="handled">
        {st.log.length === 0 && (
          <View style={a.empty}>
            <Text style={a.emptyTitle}>What should this week make room for?</Text>
            <View style={{ gap: 6, marginTop: 14 }}>
              {STARTERS.map((t) => (
                <Press key={t} onPress={() => submit(t)} hoverBg={N.sunken} style={[a.starter, SHADOW.sm]} accessibilityRole="button">
                  <Text style={a.starterTxt}>{t}</Text>
                  <Icon name="arrow-right" size={12} color={N.faint} />
                </Press>
              ))}
            </View>
          </View>
        )}

        {items.map((it) => {
          switch (it.kind) {
            case 'user':
              return (
                <View key={it.id} style={a.user}>
                  <Text style={a.userTxt}>{it.text}</Text>
                </View>
              );
            case 'assistant':
              return (
                <Text key={it.id} style={a.asst}>
                  {it.text.trim()}
                </Text>
              );
            case 'question':
              return (
                <Text key={it.id} style={[a.asst, a.question]}>
                  {it.question.question}
                </Text>
              );
            case 'steps':
              return (
                <View key={it.id} style={a.steps}>
                  <Steps tools={it.tools} />
                </View>
              );
            case 'pending': {
              const live = it.id === lastPending && !!st.pending;
              const n = it.changes.filter((c) => st.include[c.id] !== false).length;
              return (
                <View key={it.id} style={[a.plan, SHADOW.md, !live && a.planDone]}>
                  <View style={a.planHead}>
                    <Text style={a.planTitle}>
                      {live ? `Plan · ${it.changes.length} block${it.changes.length === 1 ? '' : 's'}` : it.decided === 'rejected' ? 'Plan · not added' : 'Plan · added'}
                    </Text>
                    {live && <Text style={a.planHint}>tap a block to leave it out</Text>}
                  </View>
                  <PlanTiles changes={it.changes} live={live} />
                  {live && (
                    <View style={a.planActions}>
                      <Press onPress={() => void decide(true)} disabled={!n || st.busy} style={[a.primary, SHADOW.md]} accessibilityRole="button">
                        <Text style={a.primaryTxt}>{n === it.changes.length ? `Add ${n} to calendar` : `Add ${n}`}</Text>
                      </Press>
                      <Press onPress={() => void decide(false)} disabled={st.busy} hoverBg={N.hover} style={a.ghost} accessibilityRole="button">
                        <Text style={a.ghostTxt}>Not now</Text>
                      </Press>
                    </View>
                  )}
                  {live && !docked && (
                    <Press onPress={onClose} hoverBg={N.hover} style={a.peek} accessibilityRole="button">
                      <Text style={a.peekTxt}>See it on the calendar</Text>
                    </Press>
                  )}
                </View>
              );
            }
            case 'applied':
              return (
                <View key={it.id} style={a.receipt}>
                  <View style={[a.receiptDot, it.undone && { backgroundColor: N.ghost }]} />
                  <Text style={[a.receiptTxt, it.undone && a.undone]}>{it.summary}</Text>
                  {!it.undone && (
                    <Press onPress={() => void undo(it.id)} hoverBg={N.hover} style={a.undoBtn} accessibilityRole="button">
                      <Text style={a.undoTxt}>Undo</Text>
                    </Press>
                  )}
                </View>
              );
            case 'error':
              return (
                <Text key={it.id} style={a.err}>
                  {it.text}
                </Text>
              );
          }
        })}
        {thinking && <Typing />}
      </ScrollView>

      <View style={a.bottom}>
        {st.question && !st.busy && <Suggestions options={st.question.options} onPick={(o) => submit(o)} />}
        <View style={[a.composer, SHADOW.sm]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder={st.question ? 'Answer, or tell me something else' : st.pending ? 'Change something, e.g. "gym in the evening"' : 'Ask for time, a plan, a change…'}
            placeholderTextColor={N.faint}
            style={a.input}
            onKeyPress={enterToSend(submit)}
            aria-label="Message"
          />
          <Press onPress={() => submit()} disabled={!draft.trim() || st.busy} style={a.send} accessibilityRole="button" aria-label="Send">
            <Icon name="arrow-right" size={14} color={N.onInk} />
          </Press>
        </View>
      </View>
    </View>
  );
}

export function useComposer() {
  const st = useAgent();
  const [draft, setDraft] = useState('');
  const scroller = useRef<ScrollView>(null);
  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 30);
    return () => clearTimeout(t);
  }, [st.log]);
  const submit = (text = draft) => {
    if (!text.trim() || st.busy) return;
    setDraft('');
    void send(text);
  };
  return { draft, setDraft, submit, scroller };
}

export const enterToSend = (submit: () => void) => (e: unknown) => {
  const ne = (e as { nativeEvent: { key: string; shiftKey?: boolean } }).nativeEvent;
  if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
    (e as { preventDefault: () => void }).preventDefault();
    submit();
  }
};

const a = StyleSheet.create({
  wrap: { backgroundColor: N.surface, zIndex: 60 },
  docked: { width: 400, borderLeftWidth: 1, borderLeftColor: N.line },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: N.line },
  mark: { width: 28, height: 28, borderRadius: R.sm, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: SANS, fontSize: 14, lineHeight: 18, fontWeight: '600', color: N.ink },
  sub: { fontFamily: SANS, fontSize: 11, lineHeight: 15, color: N.muted },
  iconBtn: { width: 30, height: 30, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },

  log: { padding: 16, gap: 12 },
  empty: { paddingTop: 6 },
  emptyTitle: { fontFamily: SANS, fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.5, color: N.ink },
  starter: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.md, backgroundColor: N.surface, paddingHorizontal: 12, paddingVertical: 10 },
  starterTxt: { flex: 1, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink2 },

  user: { alignSelf: 'flex-end', maxWidth: '85%', borderRadius: R.lg, backgroundColor: N.ink, paddingHorizontal: 12, paddingVertical: 8 },
  userTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 19, color: N.onInk },
  asst: { fontFamily: SANS, fontSize: 14, lineHeight: 21, color: N.ink },
  question: { fontWeight: '500' },
  steps: { borderLeftWidth: 1, borderLeftColor: N.line, paddingLeft: 10 },

  plan: { borderRadius: R.lg, backgroundColor: N.surface, padding: 12, gap: 10 },
  planDone: { opacity: 0.6 },
  planHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  planTitle: { fontFamily: SANS, fontSize: 13, lineHeight: 18, fontWeight: '600', color: N.ink },
  planHint: { fontFamily: MONO, fontSize: 10, color: N.faint },
  planActions: { flexDirection: 'row', gap: 8, marginTop: 2 },
  primary: { flex: 1, height: 36, borderRadius: R.md, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
  primaryTxt: { fontFamily: SANS, fontSize: 13, fontWeight: '500', color: N.onInk },
  ghost: { height: 36, paddingHorizontal: 14, borderRadius: R.md, alignItems: 'center', justifyContent: 'center' },
  ghostTxt: { fontFamily: SANS, fontSize: 13, fontWeight: '500', color: N.ink2 },
  peek: { height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: R.md },
  peekTxt: { fontFamily: SANS, fontSize: 12, color: N.ink2 },

  receipt: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  receiptDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  receiptTxt: { flex: 1, fontFamily: SANS, fontSize: 12, lineHeight: 17, color: N.ink2 },
  undone: { color: N.faint, textDecorationLine: 'line-through' },
  undoBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.sm },
  undoTxt: { fontFamily: SANS, fontSize: 12, fontWeight: '500', color: N.ink },
  err: { fontFamily: SANS, fontSize: 12, lineHeight: 17, color: N.accentInk },

  bottom: { padding: 12, gap: 8, borderTopWidth: 1, borderTopColor: N.line },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: R.lg, backgroundColor: N.surface, paddingLeft: 12, paddingRight: 6, paddingVertical: 6 },
  input: { flex: 1, minHeight: 30, maxHeight: 120, paddingVertical: 6, fontFamily: SANS, fontSize: 13, lineHeight: 18, color: N.ink, outlineStyle: 'none' } as object,
  send: { width: 30, height: 30, borderRadius: R.md, backgroundColor: N.ink, alignItems: 'center', justifyContent: 'center' },
});
