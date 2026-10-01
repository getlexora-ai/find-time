import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Logo } from '@/design/Logo';

import { Icon } from '../Icon';
import { CATS, MONO, N, R, SANS, SHADOW } from '../tokens';
import { Press } from '../ui';
import { enterToSend, useComposer } from './ChatA';
import { groupLog, type Item, PlanTiles, Steps, Suggestions, Typing } from './parts';
import { decide, newChat, undo, useAgent } from './store';

/**
 * Direction C — a messaging app. Bubbles on both sides, an avatar, a typing
 * indicator, rich cards inside the conversation. Warmer: the deep-work blue is
 * the conversation's colour, and the plan arrives as a card of coloured tiles.
 */

const BLUE = CATS.deep.color;
const CANVAS = '#F4F6FB';

const STARTERS = ['Plan my week around the investor deck', 'Find 2 hours for deep work tomorrow', "I'm away from the 17th to the 22nd"];

export function ChatC({ onClose, docked }: { onClose: () => void; docked: boolean }) {
  const st = useAgent();
  const { draft, setDraft, submit, scroller } = useComposer();
  const items = groupLog(st.log);
  const lastPending = [...st.log].reverse().find((e) => e.kind === 'pending')?.id;
  const thinking = st.busy && !st.log.some((e) => e.kind === 'assistant' && e.streaming);

  return (
    <View style={[c.wrap, docked ? c.docked : c.full]}>
      <View style={c.head}>
        <Avatar size={34} />
        <View style={{ flex: 1 }}>
          <Text style={c.name}>Find Time</Text>
          <View style={c.statusRow}>
            <View style={c.online} />
            <Text style={c.status}>plans inside your calendar</Text>
          </View>
        </View>
        <Press onPress={newChat} hoverBg={N.hover} style={c.iconBtn} accessibilityRole="button" aria-label="New conversation">
          <Icon name="pen" size={15} color={N.ink2} />
        </Press>
        <Press onPress={onClose} hoverBg={N.hover} style={c.iconBtn} accessibilityRole="button" aria-label="Close">
          <Icon name="close" size={16} color={N.ink2} />
        </Press>
      </View>

      <ScrollView ref={scroller} style={{ flex: 1, backgroundColor: CANVAS }} contentContainerStyle={c.log} keyboardShouldPersistTaps="handled">
        {st.log.length === 0 && (
          <View style={c.hello}>
            <Avatar size={48} />
            <Text style={c.helloTitle}>Hi — what does your week need?</Text>
            <Text style={c.helloTxt}>I&apos;ll check your calendar, ask if something matters, and put a plan on your week for you to approve.</Text>
            <View style={{ gap: 6, marginTop: 14, alignSelf: 'stretch' }}>
              {STARTERS.map((t) => (
                <Press key={t} onPress={() => submit(t)} hoverBg="#EEF2FF" style={c.starter} accessibilityRole="button">
                  <Text style={c.starterTxt}>{t}</Text>
                </Press>
              ))}
            </View>
          </View>
        )}

        {items.map((it, i) => (
          <Bubble key={it.id} it={it} first={isFirstOfRun(items, i)} live={it.kind === 'pending' && it.id === lastPending && !!st.pending} />
        ))}

        {thinking && (
          <View style={c.agentRow}>
            <Avatar size={26} />
            <View style={[c.agentBubble, SHADOW.sm, { paddingVertical: 8 }]}>
              <Typing />
            </View>
          </View>
        )}
      </ScrollView>

      <View style={c.bottom}>
        {st.question && !st.busy && <Suggestions tone="bubble" options={st.question.options} onPick={(o) => submit(o)} />}
        <View style={c.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            multiline
            placeholder="Message Find Time"
            placeholderTextColor={N.faint}
            style={c.input}
            onKeyPress={enterToSend(submit)}
            aria-label="Message"
          />
          <Press onPress={() => submit()} disabled={!draft.trim() || st.busy} style={c.send} accessibilityRole="button" aria-label="Send">
            <Icon name="arrow-right" size={15} color="#fff" />
          </Press>
        </View>
      </View>
    </View>
  );
}

/** Agent turns group under one avatar, like a messaging thread. */
function isFirstOfRun(items: Item[], i: number) {
  const agent = (x?: Item) => !!x && x.kind !== 'user';
  return agent(items[i]) && !agent(items[i - 1]);
}

function Avatar({ size }: { size: number }) {
  return (
    <View style={[c.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Logo size={Math.round(size * 0.5)} color="#fff" />
    </View>
  );
}

function Bubble({ it, first, live }: { it: Item; first: boolean; live: boolean }) {
  const st = useAgent();
  if (it.kind === 'user') {
    return (
      <View style={c.userRow}>
        <View style={c.userBubble}>
          <Text style={c.userTxt}>{it.text}</Text>
        </View>
      </View>
    );
  }
  let body: React.ReactNode = null;
  switch (it.kind) {
    case 'assistant':
      body = (
        <View style={[c.agentBubble, SHADOW.sm]}>
          <Text style={c.agentTxt}>{it.text.trim()}</Text>
        </View>
      );
      break;
    case 'question':
      body = (
        <View style={[c.agentBubble, SHADOW.sm]}>
          <Text style={[c.agentTxt, { fontWeight: '500' }]}>{it.question.question}</Text>
        </View>
      );
      break;
    case 'steps':
      body = (
        <View style={c.stepsChip}>
          <Steps tools={it.tools} tone="bubble" />
        </View>
      );
      break;
    case 'pending': {
      const n = it.changes.filter((ch) => st.include[ch.id] !== false).length;
      body = (
        <View style={[c.card, SHADOW.md, !live && { opacity: 0.6 }]}>
          <View style={c.cardHead}>
            <Text style={c.cardTitle}>{live ? 'Your plan' : it.decided === 'rejected' ? 'Plan not added' : 'Plan added'}</Text>
            <Text style={c.cardMeta}>{it.changes.length} BLOCKS</Text>
          </View>
          <PlanTiles changes={it.changes} live={live} tone="bubble" />
          {live && (
            <View style={c.cardActions}>
              <Press onPress={() => void decide(true)} disabled={!n || st.busy} style={c.cardPrimary} accessibilityRole="button">
                <Text style={c.cardPrimaryTxt}>{n === it.changes.length ? 'Add all' : `Add ${n}`}</Text>
              </Press>
              <Press onPress={() => void decide(false)} disabled={st.busy} hoverBg={N.hover} style={c.cardGhost} accessibilityRole="button">
                <Text style={c.cardGhostTxt}>No thanks</Text>
              </Press>
            </View>
          )}
        </View>
      );
      break;
    }
    case 'applied':
      body = (
        <View style={c.receipt}>
          <Text style={[c.receiptTxt, it.undone && { textDecorationLine: 'line-through', color: N.faint }]}>✓ {it.summary}</Text>
          {!it.undone && (
            <Press onPress={() => void undo(it.id)} hoverBg="#E0E7FF" style={c.undo} accessibilityRole="button">
              <Text style={c.undoTxt}>Undo</Text>
            </Press>
          )}
        </View>
      );
      break;
    case 'error':
      body = <Text style={c.err}>{it.text}</Text>;
      break;
  }
  return (
    <View style={c.agentRow}>
      {first ? <Avatar size={26} /> : <View style={{ width: 26 }} />}
      <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-start' }}>{body}</View>
    </View>
  );
}

const c = StyleSheet.create({
  wrap: { backgroundColor: N.surface, zIndex: 60 },
  docked: { width: 420, borderLeftWidth: 1, borderLeftColor: N.line },
  full: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: N.line, backgroundColor: N.surface },
  name: { fontFamily: SANS, fontSize: 14, lineHeight: 18, fontWeight: '600', color: N.ink },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  online: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' },
  status: { fontFamily: SANS, fontSize: 11, lineHeight: 15, color: N.muted },
  iconBtn: { width: 32, height: 32, borderRadius: R.full, alignItems: 'center', justifyContent: 'center' },
  avatar: { backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },

  log: { padding: 14, gap: 6 },
  hello: { alignItems: 'center', paddingTop: 20, paddingHorizontal: 6 },
  helloTitle: { marginTop: 12, fontFamily: SANS, fontSize: 18, lineHeight: 24, fontWeight: '600', color: N.ink, textAlign: 'center' },
  helloTxt: { marginTop: 4, fontFamily: SANS, fontSize: 13, lineHeight: 19, color: N.muted, textAlign: 'center' },
  starter: { borderRadius: R.full, borderWidth: 1, borderColor: '#C7D2FE', backgroundColor: N.surface, paddingHorizontal: 14, paddingVertical: 9 },
  starterTxt: { fontFamily: SANS, fontSize: 13, lineHeight: 18, color: '#1E40AF', textAlign: 'center' },

  userRow: { alignItems: 'flex-end', marginTop: 8 },
  userBubble: { maxWidth: '82%', backgroundColor: BLUE, borderRadius: 18, borderBottomRightRadius: 6, paddingHorizontal: 13, paddingVertical: 9 },
  userTxt: { fontFamily: SANS, fontSize: 14, lineHeight: 20, color: '#fff' },
  agentRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 2 },
  agentBubble: { maxWidth: '100%', backgroundColor: N.surface, borderRadius: 18, borderBottomLeftRadius: 6, paddingHorizontal: 13, paddingVertical: 9 },
  agentTxt: { fontFamily: SANS, fontSize: 14, lineHeight: 21, color: N.ink },
  stepsChip: { borderRadius: R.lg, backgroundColor: '#E9EDF7', paddingHorizontal: 10, paddingVertical: 7 },

  card: { alignSelf: 'stretch', backgroundColor: N.surface, borderRadius: 16, padding: 12, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  cardTitle: { fontFamily: SANS, fontSize: 15, lineHeight: 20, fontWeight: '600', color: N.ink },
  cardMeta: { fontFamily: MONO, fontSize: 10, color: N.faint },
  cardActions: { flexDirection: 'row', gap: 8 },
  cardPrimary: { flex: 1, height: 38, borderRadius: R.full, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
  cardPrimaryTxt: { fontFamily: SANS, fontSize: 14, fontWeight: '600', color: '#fff' },
  cardGhost: { height: 38, paddingHorizontal: 14, borderRadius: R.full, alignItems: 'center', justifyContent: 'center' },
  cardGhostTxt: { fontFamily: SANS, fontSize: 14, fontWeight: '500', color: N.ink2 },

  receipt: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: R.full, backgroundColor: '#EEF2FF', paddingLeft: 12, paddingRight: 4, paddingVertical: 4 },
  receiptTxt: { fontFamily: SANS, fontSize: 12, lineHeight: 17, color: '#1E3A8A' },
  undo: { borderRadius: R.full, paddingHorizontal: 10, paddingVertical: 4 },
  undoTxt: { fontFamily: SANS, fontSize: 12, fontWeight: '600', color: '#1E40AF' },
  err: { fontFamily: SANS, fontSize: 12, color: N.accentInk },

  bottom: { padding: 10, gap: 8, backgroundColor: CANVAS },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderRadius: 22, backgroundColor: N.surface, borderWidth: 1, borderColor: '#DCE1EC', paddingLeft: 14, paddingRight: 5, paddingVertical: 5 },
  input: { flex: 1, minHeight: 32, maxHeight: 120, paddingVertical: 7, fontFamily: SANS, fontSize: 14, lineHeight: 19, color: N.ink, outlineStyle: 'none' } as object,
  send: { width: 34, height: 34, borderRadius: 17, backgroundColor: BLUE, alignItems: 'center', justifyContent: 'center' },
});
