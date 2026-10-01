import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { AgentEvent, AgentQuestion, AgentRequest, DraftBlock, PendingChange, UndoOp } from '@/lib/agent-types';
import { apiFetch } from '@/lib/api';

import { isPreview, refresh as refreshEvents } from '../cal-store';
import { scriptedTurn, scriptedUndo } from './scripted';

/**
 * Plan with AI v2 — the conversation on the client (server: src/server/agent).
 *
 * The panel renders `log`; the server only ever sees `items` (the model's own
 * transcript) plus this turn's message / approvals / answer. While changes wait
 * for Approve, `drafts()` hands their blocks to the grid as ghost tiles.
 */

export type Entry =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | { kind: 'tool'; id: string; label: string; status: 'running' | 'done' | 'error'; detail?: string }
  | { kind: 'question'; id: string; question: AgentQuestion }
  | { kind: 'pending'; id: string; changes: PendingChange[]; decided?: 'approved' | 'rejected' | 'partial' }
  | { kind: 'applied'; id: string; summary: string; undo: UndoOp[]; undone?: boolean }
  | { kind: 'error'; id: string; text: string };

export type AgentState = {
  items: unknown[];
  log: Entry[];
  /** changes waiting for Approve; their ids are the model's call ids */
  pending: PendingChange[] | null;
  /** per pending id: included in the approval? (default yes) */
  include: Record<string, boolean>;
  question: AgentQuestion | null;
  busy: boolean;
};

const KEY = 'ft-agent-v2';
const EMPTY: AgentState = { items: [], log: [], pending: null, include: {}, question: null, busy: false };

let state: AgentState = EMPTY;
const listeners = new Set<() => void>();
const set = (patch: Partial<AgentState> | ((s: AgentState) => Partial<AgentState>)) => {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  listeners.forEach((l) => l());
};
const persist = () => {
  const { busy: _busy, ...rest } = state;
  AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => {});
};

export function useAgent(): AgentState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

/** Blocks the grid should draw as drafts right now. */
export function draftsOf(s: AgentState): DraftBlock[] {
  if (!s.pending) return [];
  return s.pending.filter((c) => s.include[c.id] !== false).flatMap((c) => c.blocks);
}

let seq = 0;
const uid = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

void (async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw && !state.log.length) set({ ...EMPTY, ...(JSON.parse(raw) as Partial<AgentState>), busy: false });
  } catch {
    // a corrupt saved chat starts fresh
  }
})();

export function newChat() {
  set(EMPTY);
  persist();
}

export function toggleChange(id: string) {
  set((s) => ({ include: { ...s.include, [id]: s.include[id] === false } }));
}

/* ───────────────────────── a turn ───────────────────────── */

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Apply one streamed event to the log. */
function apply(e: AgentEvent, turn: { textId: string | null }) {
  switch (e.type) {
    case 'text': {
      if (!turn.textId) {
        turn.textId = uid();
        const id = turn.textId;
        set((s) => ({ log: [...s.log, { kind: 'assistant', id, text: e.delta, streaming: true }] }));
      } else {
        const id = turn.textId;
        set((s) => ({
          log: s.log.map((x) => (x.id === id && x.kind === 'assistant' ? { ...x, text: x.text + e.delta } : x)),
        }));
      }
      return;
    }
    case 'tool': {
      // A tool line closes the text before it, so text after the tools starts a new bubble.
      turn.textId = null;
      // An applied change is shown once, as its receipt — not also as a tool line.
      if (state.log.some((x) => x.kind === 'applied' && x.id === e.id)) return;
      set((s) => {
        const i = s.log.findIndex((x) => x.kind === 'tool' && x.id === e.id);
        const entry: Entry = { kind: 'tool', id: e.id, label: e.label, status: e.status, detail: e.detail };
        if (i === -1) return { log: [...s.log, entry] };
        const log = [...s.log];
        log[i] = entry;
        return { log };
      });
      return;
    }
    case 'question':
      turn.textId = null;
      set((s) => ({ question: e.question, log: [...s.log, { kind: 'question', id: e.question.id, question: e.question }] }));
      return;
    case 'pending':
      turn.textId = null;
      set((s) => ({
        pending: e.changes,
        include: Object.fromEntries(e.changes.map((c) => [c.id, true])),
        log: [...s.log, { kind: 'pending', id: uid(), changes: e.changes }],
      }));
      return;
    case 'applied':
      set((s) => ({
        log: [
          ...s.log.filter((x) => !(x.kind === 'tool' && x.id === e.id)),
          { kind: 'applied', id: e.id, summary: e.summary, undo: e.undo },
        ],
      }));
      return;
    case 'done':
      set({ items: e.items });
      return;
    case 'error':
      set((s) => ({ log: [...s.log, { kind: 'error', id: uid(), text: e.message }] }));
      return;
  }
}

async function turn(body: Omit<AgentRequest, 'items' | 'timeZone'>) {
  if (state.busy) return;
  set({ busy: true, question: null });
  const t = { textId: null as string | null };
  const before = state.items;
  let gotDone = false;
  const onEvent = (e: AgentEvent) => {
    if (e.type === 'done') gotDone = true;
    apply(e, t);
  };
  try {
    if (isPreview()) {
      await scriptedTurn(body, onEvent);
    } else {
      const res = await apiFetch('/api/agent', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, items: before, timeZone: timeZone() } satisfies AgentRequest),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(err?.error ?? `The assistant is unavailable (${res.status}).`);
      }
      await readLines(res, (line) => onEvent(JSON.parse(line) as AgentEvent));
    }
    if (!gotDone) throw new Error('The reply was cut off. Try again.');
  } catch (err) {
    apply({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' }, t);
  } finally {
    set((s) => ({
      busy: false,
      log: s.log.map((x) => (x.kind === 'assistant' && x.streaming ? { ...x, streaming: false } : x)),
    }));
    persist();
    if (state.log.some((x) => x.kind === 'applied')) void refreshEvents();
  }
}

/** NDJSON reader: streams where the platform can (web), whole body where it can't (native). */
async function readLines(res: Response, onLine: (l: string) => void) {
  const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
  if (!reader) {
    for (const l of (await res.text()).split('\n')) if (l.trim()) onLine(l);
    return;
  }
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (line.trim()) onLine(line);
    }
  }
  if (buf.trim()) onLine(buf);
}

/** Send what the user typed. With a question open, it is the answer. */
export function send(text: string) {
  const msg = text.trim();
  if (!msg || state.busy) return;
  // While changes wait, typing is a revision request: the pending ones are declined.
  const approvals = state.pending ? Object.fromEntries(state.pending.map((c) => [c.id, false])) : undefined;
  set((s) => ({
    log: [
      ...s.log.map((x) => (x.kind === 'pending' && !x.decided ? { ...x, decided: 'rejected' as const } : x)),
      { kind: 'user', id: uid(), text: msg },
    ],
    pending: null,
  }));
  if (state.question) {
    const q = state.question;
    return turn({ answers: { [q.id]: msg } });
  }
  return turn({ message: msg, approvals });
}

/** Approve the included changes, reject the rest. */
export function decide(approve: boolean) {
  if (!state.pending || state.busy) return;
  const approvals = Object.fromEntries(state.pending.map((c) => [c.id, approve && state.include[c.id] !== false]));
  const n = Object.values(approvals).filter(Boolean).length;
  const decided = !approve || n === 0 ? 'rejected' : n === state.pending.length ? 'approved' : 'partial';
  set((s) => ({
    pending: null,
    log: s.log.map((x) => (x.kind === 'pending' && !x.decided ? { ...x, decided } : x)),
  }));
  return turn({ approvals });
}

/** Undo one applied change, against the events API. */
export async function undo(entryId: string) {
  const entry = state.log.find((x): x is Extract<Entry, { kind: 'applied' }> => x.kind === 'applied' && x.id === entryId);
  if (!entry || entry.undone) return;
  try {
    if (isPreview()) {
      await scriptedUndo(entry.undo.flatMap((op) => (op.op === 'delete' ? [op.id] : [])));
    } else {
      for (const op of entry.undo) {
        const res =
          op.op === 'delete'
            ? await apiFetch(`/api/events/${op.id}`, { method: 'DELETE' })
            : op.op === 'restore'
              ? await apiFetch(`/api/events/${op.id}`, {
                  method: 'PATCH',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(op.patch),
                })
              : await apiFetch('/api/events', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(op.input),
                });
        if (!res.ok) throw new Error(String(res.status));
      }
    }
    set((s) => ({ log: s.log.map((x) => (x.id === entryId && x.kind === 'applied' ? { ...x, undone: true } : x)) }));
    persist();
    void refreshEvents();
  } catch {
    set((s) => ({ log: [...s.log, { kind: 'error', id: uid(), text: "Couldn't undo that. Check your connection and try again." }] }));
  }
}
