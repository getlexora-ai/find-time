import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { ChatMessage, ChatProposal, RejectReason } from '@/lib/api-types';

import {
  REJECT_REASONS,
  acceptAlternative,
  acceptProposal,
  loadHistory,
  rejectProposal,
  resetSession,
  sendMessage,
} from '../agent-store';
import { Icon } from '../Icon';
import { useCalTheme } from '../theme-context';
import { C, R, rgba, w } from '../tokens';
import { MONO, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';

/**
 * Find time — the scheduling agent, as a conversation.
 *
 * This used to be a one-shot form: type a sentence, get blocks, accept or
 * dismiss, and every message started from nothing. You could not say "make it
 * 90 minutes" or "not Tuesday" without re-describing the whole request, and
 * because the panel threw the proposal away on close, nothing the user did with
 * it ever reached the agent.
 *
 * Two things changed here. The thread is now the unit of interaction, so
 * corrections are ordinary turns. And every proposal carries its server-side id,
 * so accepting it, switching to a runner-up, or turning it down with a reason
 * all report back (src/calendar/agent-store.ts) — which is what lets the agent
 * get better instead of just repeating itself politely.
 */

const STARTERS = [
  'Make room for 2h of deep work on Thursday',
  'Find three 45-minute review slots this week',
  'Never book me before 10',
];

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtSlot(startISO: string, endISO: string) {
  const d = new Date(startISO);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} · ${startISO.slice(
    11,
    16,
  )}–${endISO.slice(11, 16)}`;
}

/** Local-only view state layered over a server message. */
type Decision = { kind: 'added' | 'declined'; label: string };

export function AiPanel({
  prefill,
  onClose,
  onApplied,
  toast,
}: {
  prefill?: string;
  onClose: () => void;
  onApplied: (firstISO?: string, count?: number, asked?: number) => void;
  toast: (m: string) => void;
}) {
  const { theme } = useCalTheme();
  const { isDesktop } = useResponsive();

  const [text, setText] = useState(prefill ?? '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  // proposal id -> what the user did with it, so a decided card stops offering
  // buttons and shows the outcome instead.
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  // proposal id -> reason chips are open
  const [rejecting, setRejecting] = useState<string | null>(null);

  const scroller = useRef<ScrollView>(null);
  const toBottom = useCallback(() => {
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  }, []);

  useEffect(() => {
    let live = true;
    void loadHistory().then((history) => {
      if (!live) return;
      setMessages(history);
      setBooting(false);
      if (history.length) toBottom();
    });
    return () => {
      live = false;
    };
  }, [toBottom]);

  const send = useCallback(
    async (raw: string) => {
      const body = raw.trim();
      if (!body || sending) return;

      // Echo the user's turn immediately; the server assigns the real id.
      const localId = `local_${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: localId, role: 'user', text: body, createdAt: new Date().toISOString() },
      ]);
      setText('');
      setSending(true);
      toBottom();

      try {
        const reply = await sendMessage(body);
        setMessages((m) => [...m, reply]);
      } catch (err) {
        setMessages((m) => [
          ...m,
          {
            id: `err_${Date.now()}`,
            role: 'assistant',
            text: err instanceof Error ? err.message : 'Something went wrong.',
            createdAt: new Date().toISOString(),
          },
        ]);
      } finally {
        setSending(false);
        toBottom();
      }
    },
    [sending, toBottom],
  );

  const onAccept = useCallback(
    async (p: ChatProposal) => {
      const res = await acceptProposal(p);
      if (!res.ok) {
        toast('Could not add that block.');
        return;
      }
      setDecisions((d) => ({ ...d, [p.id]: { kind: 'added', label: fmtSlot(p.startISO, p.endISO) } }));
      onApplied(p.startISO, 1, 1);
      if (res.notes.length) toast(res.notes[0]);
    },
    [onApplied, toast],
  );

  const onAcceptAlt = useCallback(
    async (p: ChatProposal, alt: { startISO: string; endISO: string }) => {
      const res = await acceptAlternative(p, alt);
      if (!res.ok) {
        toast('Could not add that block.');
        return;
      }
      setDecisions((d) => ({
        ...d,
        [p.id]: { kind: 'added', label: fmtSlot(alt.startISO, alt.endISO) },
      }));
      onApplied(alt.startISO, 1, 1);
      if (res.notes.length) toast(res.notes[0]);
    },
    [onApplied, toast],
  );

  const onReject = useCallback(
    async (p: ChatProposal, reason: RejectReason, label: string) => {
      setRejecting(null);
      setDecisions((d) => ({ ...d, [p.id]: { kind: 'declined', label } }));
      const notes = await rejectProposal(p, reason);
      if (notes.length) toast(notes[0]);
    },
    [toast],
  );

  const startOver = useCallback(() => {
    resetSession();
    setMessages([]);
    setDecisions({});
    setRejecting(null);
    toast('Started a new conversation');
  }, [toast]);

  const empty = !booting && messages.length === 0;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={[
          styles.backdrop,
          { backgroundColor: C.scrim },
          isDesktop ? styles.backdropDrawer : styles.backdropSheet,
        ]}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            styles.panel,
            { backgroundColor: theme.panel, borderColor: theme.panelBorder },
            isDesktop ? styles.panelDrawer : styles.panelSheet,
          ]}>
          {/* the two concentric lime rings bleeding off the top-right corner */}
          <View
            pointerEvents="none"
            style={[styles.rings, isDesktop ? styles.ringsDrawer : styles.ringsSheet]}>
            <View style={[styles.ring, styles.ringOuter]} />
            <View style={[styles.ring, styles.ringInner]} />
          </View>

          <View style={[styles.head, { paddingHorizontal: isDesktop ? 24 : 20 }]}>
            {!isDesktop && <View style={styles.grab} />}
            <View style={styles.headRow}>
              <View>
                <View style={styles.eyebrowRow}>
                  <Icon name="magic" size={20} color={C.lime} />
                  <Txt style={styles.eyebrow}>Find time</Txt>
                </View>
                <Txt style={styles.title}>What needs a slot?</Txt>
              </View>
              <View style={styles.headBtns}>
                {messages.length > 0 && (
                  <Press
                    onPress={startOver}
                    hoverBg={w(0.1)}
                    style={styles.close}
                    aria-label="New conversation">
                    <Icon name="refresh" size={18} color={w(0.5)} />
                  </Press>
                )}
                <Press onPress={onClose} hoverBg={w(0.1)} style={styles.close} aria-label="Close">
                  <Icon name="close" size={20} color={w(0.5)} />
                </Press>
              </View>
            </View>
          </View>

          <ScrollView
            ref={scroller}
            style={styles.thread}
            contentContainerStyle={{ padding: isDesktop ? 24 : 20, paddingTop: 8, gap: 12 }}
            onContentSizeChange={toBottom}>
            {empty && (
              <View style={styles.intro}>
                <Txt style={styles.desc}>
                  Tell me what to make room for. I only reshuffle what is flexible and never touch a
                  protected block — and if I get it wrong, say so and I&apos;ll remember.
                </Txt>
                <View style={styles.chipRow}>
                  {STARTERS.map((s) => (
                    <Press key={s} onPress={() => void send(s)} hoverBg={w(0.05)} style={styles.chip}>
                      <Txt style={styles.chipTxt}>{s}</Txt>
                    </Press>
                  ))}
                </View>
              </View>
            )}

            {messages.map((m) => (
              <MessageRow
                key={m.id}
                message={m}
                decisions={decisions}
                rejecting={rejecting}
                onAccept={onAccept}
                onAcceptAlt={onAcceptAlt}
                onReject={onReject}
                onOpenReject={setRejecting}
                onAnswer={(a) => void send(a)}
              />
            ))}

            {sending && (
              <View style={styles.thinking}>
                <ActivityIndicator size="small" color={C.lime} />
                <Txt style={styles.thinkingTxt}>Reading your calendar…</Txt>
              </View>
            )}
          </ScrollView>

          <View style={[styles.composer, { paddingHorizontal: isDesktop ? 24 : 20 }]}>
            <View style={styles.inputBox}>
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                placeholder={messages.length ? 'Reply…' : 'Make room for 2h deep work on Thursday'}
                placeholderTextColor={w(0.25)}
                style={styles.input}
                onSubmitEditing={() => void send(text)}
                blurOnSubmit={false}
              />
              <Press
                onPress={() => void send(text)}
                disabled={sending || !text.trim()}
                hoverBg={C.limeHover}
                style={[styles.run, (sending || !text.trim()) && styles.runOff]}
                aria-label="Send">
                <Icon name="arrow-right-up" size={16} color={C.surface} />
              </Press>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MessageRow({
  message,
  decisions,
  rejecting,
  onAccept,
  onAcceptAlt,
  onReject,
  onOpenReject,
  onAnswer,
}: {
  message: ChatMessage;
  decisions: Record<string, Decision>;
  rejecting: string | null;
  onAccept: (p: ChatProposal) => void;
  onAcceptAlt: (p: ChatProposal, alt: { startISO: string; endISO: string }) => void;
  onReject: (p: ChatProposal, reason: RejectReason, label: string) => void;
  onOpenReject: (id: string | null) => void;
  onAnswer: (text: string) => void;
}) {
  if (message.role === 'user') {
    return (
      <View style={styles.userRow}>
        <View style={styles.userBubble}>
          <Txt style={styles.userTxt}>{message.text}</Txt>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.botRow}>
      {message.text.length > 0 && <Txt style={styles.botTxt}>{message.text}</Txt>}

      {message.savedRule && (
        <View style={styles.ruleCard}>
          <Icon name="stars" size={16} color={C.lime} />
          <Txt style={styles.ruleTxt}>{message.savedRule.label}</Txt>
        </View>
      )}

      {message.question?.options?.length ? (
        <View style={styles.chipRow}>
          {message.question.options.map((o) => (
            <Press key={o} onPress={() => onAnswer(o)} hoverBg={w(0.05)} style={styles.chip}>
              <Txt style={styles.chipTxt}>{o}</Txt>
            </Press>
          ))}
        </View>
      ) : null}

      {message.proposals?.map((p) => (
        <ProposalCard
          key={p.id}
          proposal={p}
          decision={decisions[p.id]}
          rejecting={rejecting === p.id}
          onAccept={onAccept}
          onAcceptAlt={onAcceptAlt}
          onReject={onReject}
          onOpenReject={onOpenReject}
        />
      ))}
    </View>
  );
}

function ProposalCard({
  proposal,
  decision,
  rejecting,
  onAccept,
  onAcceptAlt,
  onReject,
  onOpenReject,
}: {
  proposal: ChatProposal;
  decision?: Decision;
  rejecting: boolean;
  onAccept: (p: ChatProposal) => void;
  onAcceptAlt: (p: ChatProposal, alt: { startISO: string; endISO: string }) => void;
  onReject: (p: ChatProposal, reason: RejectReason, label: string) => void;
  onOpenReject: (id: string | null) => void;
}) {
  if (decision) {
    return (
      <View style={[styles.card, decision.kind === 'declined' && styles.cardMuted]}>
        <View style={styles.cardBody}>
          <Txt style={styles.cardTitle}>{proposal.title}</Txt>
          <Txt style={decision.kind === 'added' ? styles.cardSlot : styles.cardSlotMuted}>
            {decision.kind === 'added' ? `Added · ${decision.label}` : `Skipped · ${decision.label}`}
          </Txt>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardBody}>
        <Txt style={styles.cardTitle}>{proposal.title}</Txt>
        <Txt style={styles.cardSlot}>{fmtSlot(proposal.startISO, proposal.endISO)}</Txt>
        {/* The scorer's own reason. Showing it is what makes the feedback
            below about the right thing — the user can disagree with the
            reasoning, not just the outcome. */}
        <Txt style={styles.cardWhy}>Because {proposal.reason}.</Txt>
      </View>

      {rejecting ? (
        <View style={styles.reasonBox}>
          <Txt style={styles.reasonLabel}>What was wrong with it?</Txt>
          <View style={styles.chipRow}>
            {REJECT_REASONS.map((r) => (
              <Press
                key={r.code}
                onPress={() => onReject(proposal, r.code, r.label)}
                hoverBg={w(0.05)}
                style={styles.chip}>
                <Txt style={styles.chipTxt}>{r.label}</Txt>
              </Press>
            ))}
          </View>
        </View>
      ) : (
        <>
          {proposal.alternatives.length > 0 && (
            <View style={styles.altBox}>
              <Txt style={styles.altLabel}>or</Txt>
              <View style={styles.chipRow}>
                {proposal.alternatives.map((a) => (
                  <Press
                    key={a.startISO}
                    onPress={() => onAcceptAlt(proposal, a)}
                    hoverBg={w(0.05)}
                    style={styles.chip}>
                    <Txt style={styles.chipTxt}>{fmtSlot(a.startISO, a.endISO)}</Txt>
                  </Press>
                ))}
              </View>
            </View>
          )}
          <View style={styles.cardBtns}>
            <Press onPress={() => onAccept(proposal)} hoverBg={C.limeHover} style={styles.applyBtn}>
              <Txt style={styles.applyTxt}>Add to calendar</Txt>
            </Press>
            <Press
              onPress={() => onOpenReject(proposal.id)}
              hoverBg={w(0.1)}
              style={styles.dismissBtn}>
              <Txt style={styles.dismissTxt}>Not this</Txt>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  backdropSheet: { justifyContent: 'flex-end' },
  backdropDrawer: { justifyContent: 'flex-start', alignItems: 'flex-end' },
  panel: {
    borderWidth: 1,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  panelSheet: { width: '100%', maxHeight: '88%', borderTopLeftRadius: R.xl2, borderTopRightRadius: R.xl2 },
  panelDrawer: { height: '100%', width: 432, borderTopLeftRadius: R.xl2, borderBottomLeftRadius: R.xl2 },
  rings: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  ringsSheet: { borderTopLeftRadius: R.xl2, borderTopRightRadius: R.xl2 },
  ringsDrawer: { borderTopLeftRadius: R.xl2, borderBottomLeftRadius: R.xl2 },
  ring: { position: 'absolute', borderWidth: 1, borderRadius: R.full },
  ringOuter: { right: -48, top: -48, height: 144, width: 144, borderColor: rgba(C.lime, 0.2) },
  ringInner: { right: -24, top: -24, height: 96, width: 96, borderColor: rgba(C.lime, 0.3) },
  grab: { alignSelf: 'center', marginBottom: 16, height: 4, width: 40, borderRadius: R.full, backgroundColor: w(0.2) },

  head: { paddingTop: 20, paddingBottom: 4 },
  headRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headBtns: { flexDirection: 'row', gap: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { color: C.lime, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.2 },
  title: { marginTop: 8, color: '#fff', fontSize: 20, fontWeight: '500', letterSpacing: -0.4 },
  close: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },

  thread: { flexGrow: 0, flexShrink: 1 },
  intro: { gap: 16 },
  desc: { color: w(0.45), fontSize: 12, lineHeight: 18 },

  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '86%',
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: rgba(C.lime, 0.3),
    backgroundColor: rgba(C.lime, 0.08),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  userTxt: { color: '#fff', fontSize: 13, lineHeight: 19 },

  botRow: { gap: 10, alignItems: 'stretch' },
  botTxt: { color: w(0.75), fontSize: 13, lineHeight: 20 },

  card: { borderRadius: R.xl2, borderWidth: 1, borderColor: 'rgba(204,255,0,0.3)', backgroundColor: 'rgba(204,255,0,0.06)', overflow: 'hidden' },
  cardMuted: { borderColor: w(0.1), backgroundColor: w(0.04) },
  cardBody: { padding: 14, gap: 4 },
  cardTitle: { color: '#fff', fontSize: 13, fontWeight: '500' },
  cardSlot: { color: C.lime, fontSize: 12, fontFamily: MONO },
  cardSlotMuted: { color: w(0.4), fontSize: 12, fontFamily: MONO },
  cardWhy: { marginTop: 4, color: w(0.45), fontSize: 12, lineHeight: 17 },

  altBox: { paddingHorizontal: 14, paddingBottom: 4, gap: 6 },
  altLabel: { color: w(0.35), fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  reasonBox: { paddingHorizontal: 14, paddingVertical: 12, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(204,255,0,0.2)' },
  reasonLabel: { color: w(0.6), fontSize: 12 },

  cardBtns: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(204,255,0,0.2)', padding: 12 },
  applyBtn: { flex: 1, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, backgroundColor: C.lime },
  applyTxt: { color: C.surface, fontSize: 12, fontWeight: '500' },
  dismissBtn: { height: 38, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, borderWidth: 1, borderColor: w(0.1) },
  dismissTxt: { color: w(0.6), fontSize: 12 },

  ruleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: rgba(C.lime, 0.3),
    backgroundColor: rgba(C.lime, 0.06),
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  ruleTxt: { flex: 1, color: '#fff', fontSize: 12 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: R.full, borderWidth: 1, borderColor: w(0.1), paddingHorizontal: 12, paddingVertical: 8 },
  chipTxt: { color: w(0.55), fontSize: 12 },

  thinking: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  thinkingTxt: { color: w(0.4), fontSize: 12 },

  composer: { borderTopWidth: 1, borderTopColor: w(0.08), paddingVertical: 14 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    borderRadius: R.xl,
    borderWidth: 1,
    borderColor: w(0.1),
    backgroundColor: w(0.06),
    padding: 10,
  },
  input: { flex: 1, minHeight: 36, maxHeight: 120, color: '#fff', fontSize: 13, lineHeight: 19, fontFamily: MONO, textAlignVertical: 'top' },
  run: { height: 36, width: 36, alignItems: 'center', justifyContent: 'center', borderRadius: R.lg, backgroundColor: C.lime },
  runOff: { opacity: 0.35 },
});
