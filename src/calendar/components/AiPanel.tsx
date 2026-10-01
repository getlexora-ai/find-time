import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import type { ChatMessage, ChatProposal, RejectReason, ReportReason } from '@/lib/api-types';

import {
  REJECT_REASONS,
  REPORT_REASONS,
  acceptAlternative,
  acceptProposal,
  loadHistory,
  loadTools,
  rejectProposal,
  reportReply,
  resetSession,
  sendMessage,
  useAgentTools,
} from '../agent-store';
import { Icon } from '../Icon';

import { BREAK_COLOR, CATS, N, R, SANS, SHADOW, T, tint, TINT } from '../tokens';
import { NEXUS_SURFACE, Press, Txt } from '../ui';
import { useResponsive } from '../useResponsive';
import { DayStrip, FadeIn, type Live, Shimmer, StepIcon, Trace, useToolLook, Working } from './AiParts';

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
 *
 * Replies that go wrong in ways a slot can't — misreading the request, ignoring
 * a rule — get a quiet "Report" link underneath. That goes to a review queue
 * (/api/ai/report), not straight into the agent, and the panel says so.
 *
 * Shell (quiet calendar, 2026-10-01): on desktop the panel is docked beside the
 * grid — the week stays in view and usable while you talk, the way Reclaim's
 * chat sits next to its planner. On a phone it is a light bottom sheet. It uses
 * the calendar's own colours: your turns in the deep-work tint, proposals drawn
 * like the proposal tile on the grid (dashed accent on white).
 */

/**
 * First things to say, each tagged with the tool it will most likely reach —
 * the icon and colour come from the server's registry, like every other row.
 */
const STARTERS: { text: string; tool: string }[] = [
  { text: 'Make room for 2h of deep work on Thursday', tool: 'propose_blocks' },
  { text: 'Put the gym at 18:00 on Friday', tool: 'place_at' },
  { text: 'Never book me before 10', tool: 'record_rule' },
  { text: "I'm away Friday afternoon", tool: 'block_time_off' },
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

/** "Thu 17 Sep 18:00 → Tue 22 Sep 18:00" — a span of time away, both ends in full. */
function fmtAway(startISO: string, endISO: string) {
  const end = (iso: string) => {
    const d = new Date(iso);
    return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${iso.slice(11, 16)}`;
  };
  return `${end(startISO)} → ${end(endISO)}`;
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
  // message id -> report form is open
  const [reporting, setReporting] = useState<string | null>(null);
  // message ids reported this session; history marks older ones via `reported`
  const [reported, setReported] = useState<Record<string, true>>({});

  const scroller = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);
  const [tool, setTool] = useState<string | null>(null);
  // Once now, and again after the fade-ins and an opening trace have grown the thread.
  const toBottom = useCallback(() => {
    requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
    setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 700);
  }, []);

  // How the tools look — from the server's registry, fetched once.
  const registry = useAgentTools();
  const look = useToolLook();
  const shortcuts = registry.filter((t) => t.shortcut);
  useEffect(() => {
    void loadTools();
  }, []);

  /** The turn in flight, as the server streams it. */
  const [live, setLive] = useState<Live>({ done: [], current: null });

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
        {
          id: localId,
          role: 'user',
          text: body,
          createdAt: new Date().toISOString(),
        },
      ]);
      setText('');
      setTool(null);
      setSending(true);
      setLive({ done: [], current: null });
      toBottom();

      try {
        const reply = await sendMessage(body, (e) => {
          setLive((l) =>
            e.type === 'start'
              ? { ...l, current: { tool: e.tool, label: e.label } }
              : { done: [...l.done, e.step], current: l.current?.tool === e.step.tool ? null : l.current },
          );
          toBottom();
        });
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
      setDecisions((d) => ({
        ...d,
        [p.id]: { kind: 'added', label: fmtSlot(p.startISO, p.endISO) },
      }));
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

  const onReport = useCallback(
    async (messageId: string, reason: ReportReason, note: string) => {
      const ok = await reportReply(messageId, reason, note);
      if (!ok) {
        toast("Couldn't send that report. Try again.");
        return;
      }
      setReporting(null);
      setReported((r) => ({ ...r, [messageId]: true }));
      toast('Reported. Thanks. It goes to review.');
    },
    [toast],
  );

  const startOver = useCallback(() => {
    resetSession();
    setMessages([]);
    setDecisions({});
    setRejecting(null);
    setReporting(null);
    setReported({});
    toast('Started a new conversation');
  }, [toast]);

  const empty = !booting && messages.length === 0;
  const lastBot = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  const panel = (
    <View
      {...NEXUS_SURFACE}
      role="complementary"
      aria-label="Plan with AI"
      style={[styles.panel, isDesktop ? styles.panelDocked : styles.panelSheet]}>
      {!isDesktop && <View style={styles.grab} />}
      <View style={styles.head}>
        <Icon name="magic" size={16} color={N.ink} />
        <Txt style={styles.headTitle}>Plan with AI</Txt>
        <View style={styles.spacer} />
        {messages.length > 0 && (
          <Press onPress={startOver} hoverBg={N.hover} style={styles.iconBtn} aria-label="New conversation">
            <Icon name="pen" size={17} color={N.ink2} />
          </Press>
        )}
        <Press onPress={onClose} hoverBg={N.hover} style={styles.iconBtn} aria-label="Close">
          <Icon name="close" size={18} color={N.ink2} />
        </Press>
        {sending && (
          <View style={styles.headBar}>
            <Shimmer />
          </View>
        )}
      </View>

      <ScrollView
        ref={scroller}
        style={styles.thread}
        contentContainerStyle={[styles.threadPad, empty && styles.threadEmpty]}
        onContentSizeChange={toBottom}>
        {booting && (
          <View style={styles.thinking}>
            <ActivityIndicator size="small" color={N.muted} />
          </View>
        )}
        {empty && (
          <View style={styles.intro}>
            <View style={[styles.introMark, MARK_BG]}>
              <Icon name="magic" size={24} color={N.onInk} />
            </View>
            <Txt style={styles.introTitle}>What should we plan?</Txt>
            <Txt style={styles.introTxt}>
              Tell me what to make room for. I only move what is flexible, never a protected block, and nothing is
              booked until you say so.
            </Txt>
            <View style={styles.starters}>
              {STARTERS.map((st, i) => (
                <FadeIn key={st.text} delay={120 + i * 60}>
                  <Press onPress={() => void send(st.text)} hoverBg={N.sunken} lift style={styles.starter}>
                    <StepIcon tool={st.tool} size={28} />
                    <Txt style={styles.starterTxt}>{st.text}</Txt>
                    <Icon name="arrow-right" size={14} color={N.faint} />
                  </Press>
                </FadeIn>
              ))}
            </View>
          </View>
        )}

        {messages.map((m) => (
          <MessageRow
            key={m.id}
            latest={m.id === lastBot}
            message={m}
            decisions={decisions}
            rejecting={rejecting}
            onAccept={onAccept}
            onAcceptAlt={onAcceptAlt}
            onReject={onReject}
            onOpenReject={setRejecting}
            onAnswer={(a) => void send(a)}
            reported={Boolean(m.reported || reported[m.id])}
            reporting={reporting === m.id}
            onOpenReport={setReporting}
            onReport={onReport}
          />
        ))}

        {sending && <Working live={live} />}
      </ScrollView>

      <View style={styles.composer}>
        <View style={[styles.inputBox, SHADOW.sm]}>
          <View style={styles.tools}>
            {shortcuts.map((t) => {
              const sc = t.shortcut!;
              const { icon, color } = look(t.key);
              const on = tool === t.key;
              return (
                <Press
                  key={t.key}
                  onPress={() => {
                    setTool(t.key);
                    setText(sc.seed);
                    input.current?.focus();
                  }}
                  hoverBg={on ? undefined : N.sunken}
                  accessibilityRole="button"
                  aria-label={`Start with: ${sc.seed.trim()}`}
                  style={[styles.tool, on && { backgroundColor: tint(color, 0.14), borderColor: tint(color, 0.4) }]}>
                  <Icon name={icon} size={13} color={color} />
                  <Txt style={[styles.toolTxt, on && { color: N.ink }]}>{sc.label}</Txt>
                </Press>
              );
            })}
          </View>
          <TextInput
            ref={input}
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (!v) setTool(null);
            }}
            multiline
            autoFocus={isDesktop}
            placeholder={messages.length ? 'Reply…' : 'What would you like to plan?'}
            placeholderTextColor={N.faint}
            style={[styles.input, INPUT_RESET]}
            onKeyPress={(e) => {
              // Enter sends, Shift+Enter breaks the line (web).
              const ne = e.nativeEvent as unknown as {
                key: string;
                shiftKey?: boolean;
                preventDefault?: () => void;
              };
              if (Platform.OS === 'web' && ne.key === 'Enter' && !ne.shiftKey) {
                (e as unknown as { preventDefault: () => void }).preventDefault();
                void send(text);
              }
            }}
            onSubmitEditing={() => void send(text)}
            blurOnSubmit={false}
          />
          <View style={styles.inputRow}>
            <Txt style={styles.inputHint}>{isDesktop ? 'Enter to send · Shift+Enter for a new line' : ' '}</Txt>
            <Press
              onPress={() => void send(text)}
              disabled={sending || !text.trim()}
              hoverBg={N.inkHover}
              style={[styles.send, (sending || !text.trim()) && styles.sendOff]}
              aria-label="Send">
              <Icon name="arrow-right-up" size={16} color={sending || !text.trim() ? N.faint : N.onInk} />
            </Press>
          </View>
        </View>
      </View>
    </View>
  );

  if (isDesktop) return panel;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={styles.backdrop} accessibilityLabel="Close">
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetWrap}>
          {panel}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** Removes the browser's focus outline on the bare input; the card around it is the field. */
const INPUT_RESET = Platform.select({
  web: { outlineStyle: 'none' } as unknown as TextStyle,
  default: {},
});

/** "**Friday 2 Oct, 11:00–12:00** works" → the bold run in ink 600. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <Text style={styles.botTxt}>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <Text key={i} style={styles.botStrong}>
            {p.slice(2, -2)}
          </Text>
        ) : (
          p
        ),
      )}
    </Text>
  );
}

/** A one-line, centred note that something happened ("Rule saved"). */
function Status({ icon, children }: { icon: 'check' | 'stars' | 'calendar-mark'; children: React.ReactNode }) {
  return (
    <View style={styles.status}>
      <Icon name={icon} size={14} color={BREAK_COLOR} />
      <Txt style={styles.statusTxt}>{children}</Txt>
    </View>
  );
}

function MessageRow({
  latest,
  message,
  decisions,
  rejecting,
  onAccept,
  onAcceptAlt,
  onReject,
  onOpenReject,
  onAnswer,
  reported,
  reporting,
  onOpenReport,
  onReport,
}: {
  latest: boolean;
  message: ChatMessage;
  decisions: Record<string, Decision>;
  rejecting: string | null;
  onAccept: (p: ChatProposal) => void;
  onAcceptAlt: (p: ChatProposal, alt: { startISO: string; endISO: string }) => void;
  onReject: (p: ChatProposal, reason: RejectReason, label: string) => void;
  onOpenReject: (id: string | null) => void;
  onAnswer: (text: string) => void;
  reported: boolean;
  reporting: boolean;
  onOpenReport: (id: string | null) => void;
  onReport: (messageId: string, reason: ReportReason, note: string) => Promise<void>;
}) {
  if (message.role === 'user') {
    return (
      <FadeIn>
        <View style={styles.userRow}>
          <View style={styles.userBubble}>
            <Txt style={styles.userTxt}>{message.text}</Txt>
          </View>
        </View>
      </FadeIn>
    );
  }

  return (
    <FadeIn>
      <View style={styles.botRow}>
        {!!message.trace?.length && <Trace steps={message.trace} open={latest} />}
        {message.savedRule && <Status icon="stars">{`Rule saved · ${message.savedRule.label}`}</Status>}

        {/* Only rendered when the blocks were actually written — the server sets
          timeOff after the last one saves, never on a failed attempt. */}
        {message.timeOff && (
          <Status icon="calendar-mark">
            {`${message.timeOff.title} blocked · ${fmtAway(message.timeOff.startISO, message.timeOff.endISO)}`}
          </Status>
        )}

        {message.text.length > 0 && <Rich text={message.text} />}

        {message.question?.options?.length ? (
          <View style={styles.chipRow}>
            {message.question.options.map((o) => (
              <Press key={o} onPress={() => onAnswer(o)} hoverBg={N.sunken} style={styles.chip}>
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

        {/* Client-side error bubbles (`err_…`) never reached the server, so
          there is no turn behind them to report. */}
        {!message.id.startsWith('err_') &&
          (reported ? (
            <View style={styles.reportRow}>
              <Icon name="flag" size={12} color={N.faint} />
              <Txt style={styles.reportTxt}>Reported</Txt>
            </View>
          ) : reporting ? (
            <ReportBox
              onCancel={() => onOpenReport(null)}
              onSubmit={(reason, note) => onReport(message.id, reason, note)}
            />
          ) : (
            <Press
              onPress={() => onOpenReport(message.id)}
              hoverBg={N.hover}
              style={styles.reportLink}
              aria-label="Report this reply">
              <Icon name="flag" size={12} color={N.faint} />
              <Txt style={styles.reportTxt}>Report</Txt>
            </Press>
          ))}
      </View>
    </FadeIn>
  );
}

function ReportBox({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (reason: ReportReason, note: string) => Promise<void>;
}) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!reason || sending) return;
    setSending(true);
    try {
      await onSubmit(reason, note);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.box}>
      <Txt style={styles.boxLabel}>What went wrong with this reply?</Txt>
      <View style={styles.chipRow}>
        {REPORT_REASONS.map((r) => {
          const on = reason === r.code;
          return (
            <Press
              key={r.code}
              onPress={() => setReason(r.code)}
              hoverBg={on ? undefined : N.sunken}
              style={[styles.chip, on && styles.chipOn]}
              aria-label={r.label}>
              <Txt style={[styles.chipTxt, on && styles.chipTxtOn]}>{r.label}</Txt>
            </Press>
          );
        })}
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        maxLength={120}
        placeholder="What should it have done? (optional)"
        placeholderTextColor={N.faint}
        style={styles.reportInput}
      />
      <Txt style={styles.boxHint}>
        Reports go to review. To change how I schedule right now, just tell me in the chat.
      </Txt>
      <View style={styles.btnRow}>
        <Press
          onPress={() => void submit()}
          disabled={!reason || sending}
          hoverBg={N.inkHover}
          style={[styles.primary, (!reason || sending) && styles.sendOff]}>
          <Txt style={styles.primaryTxt}>{sending ? 'Sending…' : 'Send report'}</Txt>
        </Press>
        <Press onPress={onCancel} hoverBg={N.sunken} style={styles.secondary}>
          <Txt style={styles.secondaryTxt}>Cancel</Txt>
        </Press>
      </View>
    </View>
  );
}

/**
 * A proposed slot, drawn as the grid draws it: dashed accent on white while it
 * waits for you, the deep-work tint once it is on your calendar, faded if you
 * turned it down.
 */
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
    const added = decision.kind === 'added';
    return (
      <View style={[styles.tile, added ? styles.tileAdded : styles.tileSkipped]}>
        <Txt style={styles.tileTitle}>{proposal.title}</Txt>
        <View style={styles.tileMetaRow}>
          <Icon name={added ? 'check' : 'close'} size={13} color={added ? BREAK_COLOR : N.faint} />
          <Txt style={styles.tileTime}>{added ? `Added · ${decision.label}` : `Skipped · ${decision.label}`}</Txt>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.card, SHADOW.sm]}>
      <View style={[styles.tile, styles.tileProposed]}>
        <Txt style={styles.tileTitle}>{proposal.title}</Txt>
        <Txt
          style={[
            styles.tileTime,
            styles.tileTimeProposed,
          ]}>{`${fmtSlot(proposal.startISO, proposal.endISO)} · proposed`}</Txt>
      </View>
      <DayStrip startISO={proposal.startISO} endISO={proposal.endISO} />
      {/* The scorer's own reason. Showing it is what makes the feedback
          below about the right thing — the user can disagree with the
          reasoning, not just the outcome. */}
      <Txt style={styles.why}>Because {proposal.reason}.</Txt>

      {rejecting ? (
        <View style={styles.box}>
          <Txt style={styles.boxLabel}>What was wrong with it?</Txt>
          <View style={styles.chipRow}>
            {REJECT_REASONS.map((r) => (
              <Press
                key={r.code}
                onPress={() => onReject(proposal, r.code, r.label)}
                hoverBg={N.sunken}
                style={styles.chip}>
                <Txt style={styles.chipTxt}>{r.label}</Txt>
              </Press>
            ))}
          </View>
        </View>
      ) : (
        <>
          {proposal.alternatives.length > 0 && (
            <View style={styles.alts}>
              <Txt style={styles.altLabel}>Or another time</Txt>
              <View style={styles.chipRow}>
                {proposal.alternatives.map((a) => (
                  <Press
                    key={a.startISO}
                    onPress={() => onAcceptAlt(proposal, a)}
                    hoverBg={N.sunken}
                    style={styles.chip}>
                    <Txt style={styles.chipTxt}>{fmtSlot(a.startISO, a.endISO)}</Txt>
                  </Press>
                ))}
              </View>
            </View>
          )}
          <View style={styles.btnRow}>
            <Press onPress={() => onAccept(proposal)} hoverBg={N.inkHover} style={styles.primary}>
              <Txt style={styles.primaryTxt}>Add to calendar</Txt>
            </Press>
            <Press onPress={() => onOpenReject(proposal.id)} hoverBg={N.sunken} style={styles.secondary}>
              <Txt style={styles.secondaryTxt}>Not this</Txt>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

const USER_TINT = tint(CATS.deep.color, TINT);

/** The welcome mark: the palette as one gradient (web); deep blue elsewhere. */
const MARK_BG = (Platform.select({
  web: {
    backgroundImage: `linear-gradient(135deg, ${CATS.deep.color}, ${CATS.sync.color} 55%, ${CATS.design.color})`,
  } as unknown as ViewStyle,
  default: { backgroundColor: CATS.deep.color },
}) ?? {}) as ViewStyle;

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: N.scrim },
  sheetWrap: { width: '100%', height: '88%' },
  panel: { backgroundColor: N.surface, minHeight: 0 },
  // Docked: a column beside the grid, ruled once on the left. No backdrop, no shadow —
  // it is part of the page, not over it.
  panelDocked: {
    width: 400,
    height: '100%',
    borderLeftWidth: 1,
    borderLeftColor: N.line,
  },
  panelSheet: {
    flex: 1,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    overflow: 'hidden',
  },
  grab: {
    alignSelf: 'center',
    marginTop: 8,
    height: 4,
    width: 36,
    borderRadius: R.full,
    backgroundColor: N.ghost,
  },

  headBar: { position: 'absolute', left: 0, right: 0, bottom: -1 },
  head: {
    height: 60,
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 18,
    paddingRight: 10,
    borderBottomWidth: 1,
    borderBottomColor: N.line,
  },
  headTitle: {
    fontFamily: SANS,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
    color: N.ink,
  },
  spacer: { flex: 1 },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  thread: { flex: 1, minHeight: 0 },
  threadPad: { padding: 18, gap: 18 },
  threadEmpty: { flexGrow: 1, justifyContent: 'center' },

  intro: { alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  introMark: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  introTitle: { fontFamily: SANS, ...T.heading, color: N.ink },
  introTxt: {
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 21,
    color: N.muted,
    textAlign: 'center',
  },
  starters: { alignSelf: 'stretch', gap: 6, marginTop: 10 },
  starter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: N.line,
    backgroundColor: N.surface,
  },
  starterIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  starterTxt: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 20,
    color: N.ink,
  },

  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '88%',
    borderRadius: R.xl,
    backgroundColor: USER_TINT,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userTxt: { fontFamily: SANS, fontSize: 14, lineHeight: 21, color: N.ink },

  botRow: { gap: 12, alignItems: 'stretch' },
  botTxt: { fontFamily: SANS, fontSize: 14, lineHeight: 22, color: N.ink },
  botStrong: { fontWeight: '600' },

  status: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    maxWidth: '100%',
  },
  statusTxt: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: N.ink2,
    flexShrink: 1,
  },

  card: {
    borderRadius: R.xl,
    backgroundColor: N.surface,
    padding: 10,
    gap: 10,
  },
  tile: {
    borderRadius: R.md,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  tileProposed: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: N.accent,
    backgroundColor: N.surface,
  },
  tileAdded: { backgroundColor: USER_TINT },
  tileSkipped: { backgroundColor: N.sunken, opacity: 0.8 },
  tileTitle: { fontFamily: SANS, ...T.tile, color: N.ink },
  tileMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tileTime: {
    fontFamily: SANS,
    ...T.time,
    color: N.ink2,
    fontVariant: ['tabular-nums'],
  },
  tileTimeProposed: { color: N.accentInk },
  why: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 19,
    color: N.muted,
    paddingHorizontal: 2,
  },

  alts: { gap: 6 },
  altLabel: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    color: N.muted,
    paddingHorizontal: 2,
  },
  btnRow: { flexDirection: 'row', gap: 8 },
  primary: {
    flex: 1,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.lg,
    backgroundColor: N.ink,
  },
  primaryTxt: {
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: '600',
    color: N.onInk,
  },
  secondary: {
    height: 36,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: N.lineStrong,
    backgroundColor: N.surface,
  },
  secondaryTxt: {
    fontFamily: SANS,
    fontSize: 13,
    fontWeight: '500',
    color: N.ink,
  },

  box: { gap: 10, borderRadius: R.lg, backgroundColor: N.sunken, padding: 12 },
  boxLabel: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: N.ink,
  },
  boxHint: { fontFamily: SANS, fontSize: 12, lineHeight: 17, color: N.muted },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: N.lineStrong,
    backgroundColor: N.surface,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipTxt: {
    fontFamily: SANS,
    fontSize: 13,
    lineHeight: 18,
    color: N.ink,
    fontVariant: ['tabular-nums'],
  },
  chipOn: { borderColor: N.ink, backgroundColor: N.ink },
  chipTxtOn: { color: N.onInk },

  reportLink: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: R.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginLeft: -8,
  },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
  },
  reportTxt: { fontFamily: SANS, fontSize: 12, color: N.faint },
  reportInput: {
    minHeight: 36,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: N.lineStrong,
    backgroundColor: N.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: N.ink,
    fontSize: 13,
    fontFamily: SANS,
  },

  thinking: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  thinkingTxt: { fontFamily: SANS, fontSize: 13, color: N.muted },

  composer: { padding: 14, paddingTop: 6 },
  inputBox: {
    borderRadius: R.xl,
    backgroundColor: N.surface,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    gap: 6,
  },
  input: {
    minHeight: 44,
    maxHeight: 140,
    color: N.ink,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: SANS,
    textAlignVertical: 'top',
  },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: R.full,
    borderWidth: 1,
    borderColor: N.line,
  },
  toolTxt: {
    fontFamily: SANS,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: N.ink2,
  },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inputHint: {
    flex: 1,
    fontFamily: SANS,
    fontSize: 11,
    lineHeight: 14,
    color: N.faint,
  },
  send: {
    height: 34,
    width: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 17,
    backgroundColor: N.ink,
  },
  sendOff: { backgroundColor: N.sunken },
});
