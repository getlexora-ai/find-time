/**
 * Plan with AI — the chat column of the Prism Dashboard
 * (https://claude.ai/artifact/GD4WVtPC7cQ2RUqZwShEXh#dashboard, `aiHTML`).
 *
 * Built from the artifact's own markup — gradient strip, ink bubbles, a step
 * rail, the proposal tray (date tile · title · time · day strip), a gradient
 * "Add N to calendar", composer with intent chips — and extended to every
 * state the agent really returns: live steps while a turn runs, a question
 * with options, rules / time off / deletions, a set of linked changes, an
 * error with Retry, other times, Discard with a reason, and Report.
 *
 * Everything shown comes from the server's reply or the calendar store:
 * nothing here says "added" unless a block was written this turn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  acceptAlternative,
  acceptProposal,
  applyChanges,
  loadHistory,
  loadTools,
  rejectProposal,
  REJECT_REASONS,
  REPORT_REASONS,
  reportReply,
  resetSession,
  sendMessage,
  useAgentTools,
} from '@/calendar/agent-store';
import { toMin } from '@/calendar/cal-date';
import { localIdFor, useCalEvents } from '@/calendar/cal-store';
import { useHours } from '@/calendar/hours';
import type { ApiTask, ChangeItem, ChangeSet, ChatMessage, ChatProposal, RejectReason, ReportReason, TraceStep } from '@/lib/api-types';

import './ai.css';
import type { Toast } from './Week.web';

/* ───────────────────────── helpers ───────────────────────── */

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Proposal times are wall-clock ISO: the UTC fields ARE the local time. */
const wall = (s: string) => new Date(s);
const hhmm = (s: string) => s.slice(11, 16);
const isoMin = (s: string) => Number(s.slice(11, 13)) * 60 + Number(s.slice(14, 16));
const dayLabel = (s: string) => {
  const d = wall(s);
  return `${DOW[d.getUTCDay()]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`;
};
const slot = (a: string, b: string) => `${dayLabel(a)} · ${hhmm(a)}–${hhmm(b)}`;
const len = (a: string, b: string) => {
  const m = Math.round((wall(b).getTime() - wall(a).getTime()) / 60000);
  const h = Math.floor(m / 60);
  return h && m % 60 ? `${h}\u00a0h\u00a0${m % 60}` : h ? `${h}\u00a0h` : `${m}\u00a0min`;
};
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const plain = (t: string) => t.replace(/\*\*/g, '');

/** The registry's colour keys, in Prism's palette. */
const TOOL_C: Record<string, string> = {
  deep: 'var(--blue)',
  sync: 'var(--violet)',
  design: 'var(--pink)',
  research: '#0e9fb8',
  admin: '#b7791f',
};

/** "**Friday 2 Oct, 11:00–12:00** works" → the bold run in ink. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p,
      )}
    </>
  );
}

const Svg = {
  send: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  close: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m4 4 8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 3.5v9M3.5 8h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  spark: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M8 1.8c.4 2.9 1.4 4 4.2 4.4-2.8.5-3.8 1.5-4.2 4.4-.4-2.9-1.4-3.9-4.2-4.4C6.6 5.8 7.6 4.7 8 1.8ZM12.6 10.4c.2 1.3.7 1.8 1.9 2-1.2.2-1.7.7-1.9 2-.2-1.3-.7-1.8-1.9-2 1.2-.2 1.7-.7 1.9-2Z" fill="currentColor" />
    </svg>
  ),
  check: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m3.5 8.4 2.8 2.6 6.2-6.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  chev: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="m4.5 6.5 3.5 3.5 3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/** Local-only state layered over a server message. */
type Decision = { kind: 'added' | 'declined'; label: string };
type Live = { done: TraceStep[]; current: { tool: string; label: string } | null };

/* ───────────────────────── the panel ───────────────────────── */

export function AiPanel({
  tasks,
  onClose,
  onApplied,
  toast,
  focusKey,
}: {
  /** open tasks, for first-visit suggestions built from your real backlog */
  tasks: ApiTask[];
  onClose: () => void;
  /** a block landed: show its day on the grid */
  onApplied: (firstISO: string) => void;
  toast: Toast;
  /** bumps when the panel is asked to take focus (the band button, "/") */
  focusKey: number;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [booting, setBooting] = useState(true);
  const [sending, setSending] = useState(false);
  const [live, setLive] = useState<Live>({ done: [], current: null });
  const [text, setText] = useState('');
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  // error message id → the sentence that failed, so Retry sends it again
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [reported, setReported] = useState<Record<string, true>>({});
  const busy = useRef(new Set<string>());

  const scroller = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const toBottom = useCallback((jump?: boolean) => {
    requestAnimationFrame(() => {
      const el = scroller.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: jump ? 'auto' : 'smooth' });
    });
  }, []);

  useEffect(() => {
    void loadTools();
    let on = true;
    void loadHistory().then((h) => {
      if (!on) return;
      setMessages(h);
      setBooting(false);
      // reopening lands on the latest message, not the top of the chat
      toBottom(true);
    });
    return () => {
      on = false;
    };
  }, [toBottom]);

  useEffect(() => {
    input.current?.focus();
  }, [focusKey]);

  // The textarea grows with what you write, up to a few lines.
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(140, el.scrollHeight)}px`;
  }, [text]);

  const send = useCallback(
    async (raw: string) => {
      const body = raw.trim();
      if (!body || sending) return;
      setMessages((m) => [...m, { id: `local_${Date.now()}`, role: 'user', text: body, createdAt: new Date().toISOString() }]);
      setText('');
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
        const id = `err_${Date.now()}`;
        setFailed((f) => ({ ...f, [id]: body }));
        setMessages((m) => [
          ...m,
          { id, role: 'assistant', text: err instanceof Error ? err.message : 'Something went wrong.', createdAt: new Date().toISOString() },
        ]);
      } finally {
        setSending(false);
        toBottom();
      }
    },
    [sending, toBottom],
  );

  const decide = (id: string, d: Decision) => setDecisions((x) => ({ ...x, [id]: d }));

  /** Add the ticked proposals of one reply, in order. A second click can't add twice. */
  const addMany = useCallback(
    async (list: ChatProposal[]) => {
      const todo = list.filter((p) => !busy.current.has(p.id));
      todo.forEach((p) => busy.current.add(p.id));
      let ok = 0;
      let first: string | null = null;
      for (const p of todo) {
        const res = await acceptProposal(p).finally(() => busy.current.delete(p.id));
        if (!res.ok) continue;
        ok++;
        first ??= p.startISO;
        decide(p.id, { kind: 'added', label: p.repeat ? `${slot(p.startISO, p.endISO)} · repeats ${p.repeat.label}` : slot(p.startISO, p.endISO) });
        if (res.notes.length) toast(res.notes[0]);
      }
      if (first) onApplied(first);
      if (!ok) toast("Couldn't add that. Check your connection and try again.");
      else toast(ok < todo.length ? `${ok} of ${todo.length} added. The rest couldn't be saved.` : `${plural(ok, 'block')} added to your calendar`);
    },
    [onApplied, toast],
  );

  const addAlt = useCallback(
    async (p: ChatProposal, alt: { startISO: string; endISO: string }) => {
      if (busy.current.has(p.id)) return;
      busy.current.add(p.id);
      const res = await acceptAlternative(p, alt).finally(() => busy.current.delete(p.id));
      if (!res.ok) return toast("Couldn't add that. Check your connection and try again.");
      decide(p.id, { kind: 'added', label: slot(alt.startISO, alt.endISO) });
      onApplied(alt.startISO);
      toast(res.notes[0] ?? `Added · ${slot(alt.startISO, alt.endISO)}`);
    },
    [onApplied, toast],
  );

  const discard = useCallback(
    async (list: ChatProposal[], reason: RejectReason, label: string) => {
      list.forEach((p) => decide(p.id, { kind: 'declined', label }));
      const notes = (await Promise.all(list.map((p) => rejectProposal(p, reason)))).flat();
      if (notes.length) toast(notes[0]);
    },
    [toast],
  );

  const apply = useCallback(
    async (set: ChangeSet) => {
      if (busy.current.has(set.id)) return;
      busy.current.add(set.id);
      const res = await applyChanges(set).finally(() => busy.current.delete(set.id));
      if (!res.done) return toast("Couldn't apply those changes. Nothing was changed.");
      decide(set.id, { kind: 'added', label: `${plural(res.done, 'change')} applied${res.failed ? ` · ${res.failed} couldn't be made` : ''}` });
      const first = set.items.find((i) => i.startISO)?.startISO;
      if (first) onApplied(first);
    },
    [onApplied, toast],
  );

  const report = useCallback(
    async (id: string, reason: ReportReason, note: string) => {
      const ok = await reportReply(id, reason, note);
      if (!ok) {
        toast("Couldn't send that report. Try again.");
        return false;
      }
      setReported((r) => ({ ...r, [id]: true }));
      toast('Reported. Thanks, it goes to review.');
      return true;
    },
    [toast],
  );

  const newChat = () => {
    resetSession();
    setMessages([]);
    setDecisions({});
    setFailed({});
    setReported({});
    input.current?.focus();
  };

  // The last unanswered question can be answered with 1–3 while the composer is empty.
  const lastIdx = messages.length - 1;
  const openQ = !sending && lastIdx >= 0 && messages[lastIdx].role === 'assistant' ? messages[lastIdx].question : undefined;

  const tools = useAgentTools();
  const shortcuts = tools.filter((t) => t.shortcut);
  const [more, setMore] = useState(false);
  const shown = more ? shortcuts : shortcuts.slice(0, 3);
  const empty = !booting && messages.length === 0;

  return (
    <aside className="ai" aria-label="Plan with AI">
      <div className="ai-top">
        <h3>
          Plan with <em>AI</em>
        </h3>
        {messages.length === 0 && <small title="Nothing is booked until you add it">Proposals only</small>}
        {messages.length > 0 && (
          <button type="button" className="ai-new" onClick={newChat} title="Start a new chat. This one is kept.">
            {Svg.plus}
            New chat
          </button>
        )}
        <button type="button" className="ai-x" onClick={onClose} aria-label="Close Plan with AI" title="Close">
          {Svg.close}
        </button>
        {sending && <i className="ai-bar" aria-hidden />}
      </div>

      <div className="msgs" ref={scroller} aria-live="polite">
        {booting && <div className="ai-boot">Opening your last chat…</div>}
        {empty && <Start tasks={tasks} onSend={(t) => void send(t)} />}

        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={m.id} className="me">
              {m.text}
            </div>
          ) : (
            <Reply
              key={m.id}
              m={m}
              answered={i < lastIdx}
              decisions={decisions}
              failedText={failed[m.id]}
              reported={Boolean(m.reported || reported[m.id])}
              onAnswer={(a) => void send(a)}
              onSomethingElse={() => input.current?.focus()}
              onAdd={addMany}
              onAlt={addAlt}
              onDiscard={discard}
              onApply={apply}
              onDecline={(set) => decide(set.id, { kind: 'declined', label: 'Nothing changed' })}
              onReport={report}
              onRetry={(t) => {
                setMessages((ms) => ms.filter((x) => x.id !== m.id));
                void send(t);
              }}
            />
          ),
        )}

        {sending && <Working live={live} />}
      </div>

      <form
        className="compose"
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}>
        <textarea
          ref={input}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send(text);
            } else if (openQ && !text && /^[1-9]$/.test(e.key) && openQ.options[Number(e.key) - 1]) {
              e.preventDefault();
              void send(openQ.options[Number(e.key) - 1]);
            }
          }}
          placeholder={openQ ? 'Pick an option, or type your own…' : messages.length ? 'Reply…' : 'Ask to fit something in…'}
          aria-label="Message Plan with AI"
        />
        <div className="r">
          {shown.map((t) => (
            <button
              key={t.key}
              type="button"
              className="chip"
              style={{ ['--tc' as string]: TOOL_C[t.color] ?? 'var(--blue)' }}
              onClick={() => {
                setText(t.shortcut!.seed);
                input.current?.focus();
              }}
              title={`Start with “${t.shortcut!.seed.trim()}”`}>
              <i aria-hidden />
              {t.shortcut!.label}
            </button>
          ))}
          {shortcuts.length > 3 && (
            <button type="button" className="chip more" onClick={() => setMore((v) => !v)} aria-expanded={more}>
              {more ? 'Less' : `+${shortcuts.length - 3}`}
            </button>
          )}
          <button type="submit" className="send" aria-label="Send" disabled={sending || !text.trim()}>
            {Svg.send}
          </button>
        </div>
      </form>
    </aside>
  );
}

/* ───────────────────────── first visit ───────────────────────── */

/**
 * No chat yet: what it can do, said with your own backlog where there is one
 * ("Find time for Write the quarterly report"), never a canned "deep work".
 */
function Start({ tasks, onSend }: { tasks: ApiTask[]; onSend: (t: string) => void }) {
  const h = new Date().getHours();
  const hello = h < 5 ? 'Late one?' : h < 12 ? 'Good morning.' : h < 18 ? 'Good afternoon.' : 'Good evening.';
  const toPlan = tasks.filter((t) => t.status === 'backlog' && t.durationMin > 0);
  const ideas: { text: string; c: string; k: string }[] = [
    ...toPlan.slice(0, 2).map((t) => ({ text: `Find time for ${t.title}`, c: TOOL_C.deep, k: 'Your task' })),
    ...(toPlan.length > 2 ? [{ text: 'Plan my week', c: TOOL_C.deep, k: `${toPlan.length} tasks` }] : []),
    { text: 'Make room for 2h of deep work on Thursday', c: TOOL_C.deep, k: 'Find time' },
    { text: 'Put the gym at 18:00 on Friday', c: TOOL_C.sync, k: 'At a time' },
    { text: 'Never book me before 10', c: TOOL_C.research, k: 'Rule' },
    { text: "I'm away Friday afternoon", c: TOOL_C.admin, k: 'Time off' },
  ].slice(0, 4);

  return (
    <div className="ai-start">
      <span className="ai-mark lg" aria-hidden>
        {Svg.spark}
      </span>
      <p className="eyebrow">{hello}</p>
      <h4>
        What should we <em>plan?</em>
      </h4>
      <p className="ai-sub">Say it in your own words. I only suggest times. Nothing is booked until you add it, and I never move a protected block.</p>
      <ul className="ai-ideas">
        {ideas.map((x) => (
          <li key={x.text}>
            <button type="button" onClick={() => onSend(x.text)} style={{ ['--tc' as string]: x.c }}>
              <i aria-hidden />
              <span>{x.text}</span>
              <small>{x.k}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────────────────── steps ───────────────────────── */

function useLook() {
  const tools = useAgentTools();
  return (key: string) => TOOL_C[tools.find((t) => t.key === key)?.color ?? 'deep'] ?? 'var(--blue)';
}

/** A turn in flight: every row is an event the server streamed, nothing on a timer. */
function Working({ live }: { live: Live }) {
  const look = useLook();
  return (
    <div className="bot">
      <span className="ai-mark" aria-hidden>
        {Svg.spark}
      </span>
      <div className="steps-ai live" role="status">
        {live.done.map((s, i) => (
          <span key={i} className="ok" style={{ ['--tc' as string]: look(s.tool) }}>
            {s.label}
            {s.detail ? <small>{s.detail}</small> : null}
          </span>
        ))}
        <span className="run">{live.current?.label ?? (live.done.length ? 'Putting it together' : 'Reading your message')}…</span>
      </div>
    </div>
  );
}

/** What the turn did, collapsed to "4 steps · 2.1 s" once it is done. */
function Steps({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(false);
  const look = useLook();
  const ms = steps.reduce((s, x) => s + (x.ms ?? 0), 0);
  return (
    <div className={`steps-ai${open ? '' : ' shut'}`}>
      <button type="button" className="steps-h" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {plural(steps.length, 'step')}
        {ms > 0 ? ` · ${(ms / 1000).toFixed(1)} s` : ''}
        {Svg.chev}
      </button>
      {open &&
        steps.map((s, i) => (
          <span key={i} className="ok" style={{ ['--tc' as string]: look(s.tool) }}>
            {s.label}
            {s.detail ? <small>{s.detail}</small> : null}
          </span>
        ))}
    </div>
  );
}

/* ───────────────────────── one reply ───────────────────────── */

function Reply({
  m,
  answered,
  decisions,
  failedText,
  reported,
  onAnswer,
  onSomethingElse,
  onAdd,
  onAlt,
  onDiscard,
  onApply,
  onDecline,
  onReport,
  onRetry,
}: {
  m: ChatMessage;
  /** someone already replied after it: its question no longer takes answers */
  answered: boolean;
  decisions: Record<string, Decision>;
  failedText?: string;
  reported: boolean;
  onAnswer: (t: string) => void;
  onSomethingElse: () => void;
  onAdd: (l: ChatProposal[]) => Promise<void>;
  onAlt: (p: ChatProposal, a: { startISO: string; endISO: string }) => Promise<void>;
  onDiscard: (l: ChatProposal[], r: RejectReason, label: string) => Promise<void>;
  onApply: (s: ChangeSet) => Promise<void>;
  onDecline: (s: ChangeSet) => void;
  onReport: (id: string, r: ReportReason, note: string) => Promise<boolean>;
  onRetry: (t: string) => void;
}) {
  const [reporting, setReporting] = useState(false);
  const isErr = m.id.startsWith('err_');

  if (isErr) {
    return (
      <div className="bot">
        <span className="ai-mark" aria-hidden>
          {Svg.spark}
        </span>
        <div className="card warn" role="alert">
          <b>{m.text}</b>
          <span>Nothing on your calendar was changed.</span>
          {failedText && (
            <div className="acts">
              <button type="button" className="btn ink sm" onClick={() => onRetry(failedText)}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="bot">
      <span className="ai-mark" aria-hidden>
        {Svg.spark}
      </span>
      <div className="bot-in">
        {!!m.trace?.length && <Steps steps={m.trace} />}

        {m.savedRule && <Done>Rule saved · {m.savedRule.label}</Done>}
        {m.timeOff && (
          <Done>
            {m.timeOff.title} blocked · {dayLabel(m.timeOff.startISO)} {hhmm(m.timeOff.startISO)} → {dayLabel(m.timeOff.endISO)} {hhmm(m.timeOff.endISO)}
          </Done>
        )}
        {m.deleted && m.deleted.count > 0 && <Done>{plural(m.deleted.count, 'block')} deleted</Done>}

        {m.text && (
          <p className="say">
            <Rich text={m.text} />
          </p>
        )}

        {m.question?.options?.length ? (
          <div className={`ask${answered ? ' past' : ''}`} role="group" aria-label={m.question.text}>
            {m.question.options.map((o, i) => (
              <button key={o} type="button" disabled={answered} onClick={() => onAnswer(o)}>
                <kbd>{i + 1}</kbd>
                {o}
              </button>
            ))}
            {!answered && (
              <button type="button" className="else" onClick={onSomethingElse}>
                <kbd>…</kbd>Something else
              </button>
            )}
          </div>
        ) : null}

        {!!m.proposals?.length && <Tray list={m.proposals} decisions={decisions} onAdd={onAdd} onAlt={onAlt} onDiscard={onDiscard} />}

        {m.changes && <Changes set={m.changes} decision={decisions[m.changes.id]} onApply={onApply} onDecline={onDecline} />}

        {reporting && !reported ? (
          <ReportBox
            onCancel={() => setReporting(false)}
            onSend={async (r, note) => {
              if (await onReport(m.id, r, note)) setReporting(false);
            }}
          />
        ) : (
          <div className="meta">
            <button type="button" onClick={() => void navigator.clipboard?.writeText(plain(m.text))}>
              Copy
            </button>
            {reported ? (
              <span>Reported</span>
            ) : (
              <button type="button" onClick={() => setReporting(true)}>
                Report
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return (
    <div className="done-row" role="status">
      <i aria-hidden>{Svg.check}</i>
      <span>{children}</span>
    </div>
  );
}

/* ───────────────────────── proposal tray ───────────────────────── */

/**
 * The artifact's tray: one row per proposed block — tick, date tile, title and
 * length, time, and the day it lands on — then one "Add N to calendar".
 * Rows you untick stay waiting; Discard asks why, once, for all of them.
 */
function Tray({
  list,
  decisions,
  onAdd,
  onAlt,
  onDiscard,
}: {
  list: ChatProposal[];
  decisions: Record<string, Decision>;
  onAdd: (l: ChatProposal[]) => Promise<void>;
  onAlt: (p: ChatProposal, a: { startISO: string; endISO: string }) => Promise<void>;
  onDiscard: (l: ChatProposal[], r: RejectReason, label: string) => Promise<void>;
}) {
  const waiting = list.filter((p) => !decisions[p.id]);
  const [off, setOff] = useState<Record<string, true>>({});
  const [alts, setAlts] = useState<string | null>(null);
  const [why, setWhy] = useState(false);
  const [working, setWorking] = useState(false);
  const picked = waiting.filter((p) => !off[p.id]);

  return (
    <div className="tray">
      {list.map((p) => {
        const d = decisions[p.id];
        const w = wall(p.startISO);
        return (
          <div key={p.id} className={`row${d ? ` ${d.kind}` : ''}`}>
            {d ? (
              <span className={`tick ${d.kind}`} aria-hidden>
                {d.kind === 'added' ? Svg.check : Svg.close}
              </span>
            ) : (
              <input
                type="checkbox"
                checked={!off[p.id]}
                onChange={() => setOff((o) => (o[p.id] ? Object.fromEntries(Object.entries(o).filter(([k]) => k !== p.id)) : { ...o, [p.id]: true }))}
                aria-label={`Include ${p.title}, ${slot(p.startISO, p.endISO)}`}
              />
            )}
            <span className="dt" aria-hidden>
              <small>{DOW[w.getUTCDay()]}</small>
              <b>{w.getUTCDate()}</b>
            </span>
            <span className="w">
              <div>
                <span className="t">{p.title}</span> · {len(p.startISO, p.endISO)} <span className="tm">{hhmm(p.startISO)}–{hhmm(p.endISO)}</span>
              </div>
              {d ? (
                <span className="st">{d.kind === 'added' ? `Added · ${d.label}` : `Skipped · ${d.label}`}</span>
              ) : (
                <>
                  <DayStrip startISO={p.startISO} endISO={p.endISO} />
                  {p.repeat && (
                    <span className="st">
                      Repeats {p.repeat.label}
                      {p.repeat.count ? ` · ${p.repeat.count} times` : ''}
                    </span>
                  )}
                  {p.reason && <span className="because">Because {p.reason}.</span>}
                  {p.alternatives.length > 0 &&
                    (alts === p.id ? (
                      <span className="alts">
                        {p.alternatives.map((a) => (
                          <button key={a.startISO} type="button" className="chip" onClick={() => void onAlt(p, a)}>
                            {slot(a.startISO, a.endISO)}
                          </button>
                        ))}
                      </span>
                    ) : (
                      <button type="button" className="link" onClick={() => setAlts(p.id)}>
                        Other times ({p.alternatives.length})
                      </button>
                    ))}
                </>
              )}
            </span>
          </div>
        );
      })}

      {waiting.length > 0 &&
        (why ? (
          <div className="acts col">
            <span className="q">What was wrong with {waiting.length === 1 ? 'it' : 'them'}?</span>
            <div className="chips">
              {REJECT_REASONS.map((r) => (
                <button key={r.code} type="button" className="chip" onClick={() => void onDiscard(waiting, r.code, r.label)}>
                  {r.label}
                </button>
              ))}
              <button type="button" className="chip ghost" onClick={() => setWhy(false)}>
                Back
              </button>
            </div>
          </div>
        ) : (
          <div className="acts">
            <button
              type="button"
              className="btn grad sm"
              disabled={!picked.length || working}
              onClick={() => {
                setWorking(true);
                void onAdd(picked).finally(() => setWorking(false));
              }}>
              {working ? 'Adding…' : picked.length === 1 ? 'Add to calendar' : `Add ${picked.length} to calendar`}
            </button>
            <button type="button" className="btn line sm" onClick={() => setWhy(true)}>
              Discard
            </button>
          </div>
        ))}
    </div>
  );
}

/**
 * The day a proposal lands on, across your hours: what is already there and
 * where the new block would go (dashed). Same store the grid reads.
 */
function DayStrip({ startISO, endISO }: { startISO: string; endISO: string }) {
  const events = useCalEvents();
  const hours = useHours();
  const day = startISO.slice(0, 10);
  const lo = hours.start * 60;
  const hi = hours.end * 60;
  const span = Math.max(60, hi - lo);
  const at = (m: number) => ((Math.min(hi, Math.max(lo, m)) - lo) / span) * 100;
  const s = isoMin(startISO);
  const e = isoMin(endISO) || 24 * 60;
  const others = useMemo(
    () => events.filter((x) => x.date === day && !x.allDay && x.kind !== 'ai' && toMin(x.end) > lo && toMin(x.start) < hi),
    [events, day, lo, hi],
  );
  return (
    <span className="strip-d" title={`${dayLabel(startISO)}: ${plural(others.length, 'other block')}`}>
      {others.map((x) => (
        <i key={x.id} style={{ left: `${at(toMin(x.start))}%`, width: `${at(toMin(x.end)) - at(toMin(x.start))}%` }} />
      ))}
      <i className="ai" style={{ left: `${at(s)}%`, width: `${Math.max(1.5, at(e) - at(s))}%` }} />
    </span>
  );
}

/* ───────────────────────── linked changes ───────────────────────── */

/** "Move Gym to 18:00, add German at 17:30": one Apply makes all of them. Titles come from the calendar. */
function Changes({
  set,
  decision,
  onApply,
  onDecline,
}: {
  set: ChangeSet;
  decision?: Decision;
  onApply: (s: ChangeSet) => Promise<void>;
  onDecline: (s: ChangeSet) => void;
}) {
  const events = useCalEvents();
  const [working, setWorking] = useState(false);
  const title = (it: ChangeItem) => {
    const id = it.eventId ? localIdFor(it.eventId) : undefined;
    return (id !== undefined && events.find((e) => e.id === id)?.title) || it.title || 'An event';
  };
  return (
    <div className="tray">
      {set.items.map((it, i) => (
        <div key={i} className={`row chg ${it.op}`}>
          <span className={`op ${it.op}`}>{it.op === 'add' ? 'Add' : it.op === 'delete' ? 'Remove' : 'Move'}</span>
          <span className="w">
            <div>
              <span className="t">{title(it)}</span>
            </div>
            <span className="mv">
              {it.op === 'move' ? (
                <>
                  <s>{slot(it.fromStartISO!, it.fromEndISO!)}</s> {Svg.arrow} {slot(it.startISO!, it.endISO!)}
                </>
              ) : it.op === 'delete' ? (
                <s>{slot(it.fromStartISO!, it.fromEndISO!)}</s>
              ) : (
                slot(it.startISO!, it.endISO!)
              )}
            </span>
          </span>
        </div>
      ))}
      {decision ? (
        <div className={`acts note ${decision.kind}`}>{decision.label}</div>
      ) : (
        <div className="acts">
          <button
            type="button"
            className="btn grad sm"
            disabled={working}
            onClick={() => {
              setWorking(true);
              void onApply(set).finally(() => setWorking(false));
            }}>
            {working ? 'Applying…' : set.items.length === 1 ? 'Apply' : `Apply all ${set.items.length}`}
          </button>
          <button type="button" className="btn line sm" onClick={() => onDecline(set)}>
            Not this
          </button>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── report ───────────────────────── */

function ReportBox({ onCancel, onSend }: { onCancel: () => void; onSend: (r: ReportReason, note: string) => Promise<void> }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  return (
    <div className="card report">
      <b>What went wrong with this reply?</b>
      <div className="chips">
        {REPORT_REASONS.map((r) => (
          <button key={r.code} type="button" className="chip" aria-pressed={reason === r.code} onClick={() => setReason(r.code)}>
            {r.label}
          </button>
        ))}
      </div>
      <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="What should it have done? (optional)" />
      <span>Reports go to review. To change how I plan right now, just tell me in the chat.</span>
      <div className="acts">
        <button
          type="button"
          className="btn ink sm"
          disabled={!reason || sending}
          onClick={() => {
            if (!reason) return;
            setSending(true);
            void onSend(reason, note).finally(() => setSending(false));
          }}>
          {sending ? 'Sending…' : 'Send report'}
        </button>
        <button type="button" className="btn line sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** The local day a proposal lands on, for the grid to jump to. */
export const dayOf = (startISO: string) => {
  const d = wall(startISO);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
