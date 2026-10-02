/**
 * Client side of the scheduling agent: the conversation, and — the part that
 * matters — reporting back what the user actually did with each proposal.
 *
 * Every accept, every switch to a different slot, every rejection goes to
 * POST /api/ai/feedback keyed by the proposal's own id. A block created without
 * that call still lands on the calendar, but the agent learns nothing from it,
 * which is exactly the hole this replaces.
 */

import { useSyncExternalStore } from 'react';

import type {
  ChatHistoryResponse,
  ChatMessage,
  ChatProposal,
  ChatResponse,
  ChatStreamEvent,
  ToolsResponse,
  ToolUi,
  FeedbackResponse,
  PreferenceItem,
  PreferencesResponse,
  RejectReason,
  ReportReason,
} from '@/lib/api-types';
import { apiFetch, currentUserId, onTokenGetter } from '@/lib/api';

import { createAgentBlock, refresh } from './cal-store';
import { refreshTasks, TASK_TOOLS } from './tasks-store';

/** Per user: two accounts on one browser must not reopen each other's thread. */
const sessionKey = () => `ft.agent.session:${currentUserId() ?? 'anon'}`;

/** The open conversation id, kept in memory for the app's lifetime. */
let sessionId: string | null = null;
let sessionOwner: string | null = null;

// A different account signed in: forget the last one's open conversation.
onTokenGetter(() => {
  if (currentUserId() === sessionOwner) return;
  sessionOwner = currentUserId();
  sessionId = null;
});

export function currentSessionId(): string | null {
  return sessionId;
}

export function resetSession(): void {
  sessionId = null;
  try {
    globalThis.localStorage?.removeItem(sessionKey());
  } catch {
    // no localStorage on native — the in-memory id is enough there
  }
}

function rememberSession(id: string): void {
  sessionId = id;
  try {
    globalThis.localStorage?.setItem(sessionKey(), id);
  } catch {
    // ignore
  }
}

function restoreSession(): string | null {
  if (sessionId) return sessionId;
  try {
    const v = globalThis.localStorage?.getItem(sessionKey());
    if (v) sessionId = v;
  } catch {
    // ignore
  }
  return sessionId;
}

export class AgentError extends Error {}

/** `/preview`: replay the canned reply's trace as a live stream would arrive. */
async function previewTurn(reply: ChatMessage, onEvent?: (e: TurnEvent) => void): Promise<ChatMessage> {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  for (const st of reply.trace ?? []) {
    const ui = tools.find((t) => t.key === st.tool);
    onEvent?.({ type: 'start', tool: st.tool, label: ui?.running ?? st.label });
    await wait(Math.min(1400, Math.max(450, st.ms ?? 450)));
    onEvent?.({ type: 'step', step: st });
  }
  await wait(250);
  return reply;
}

/**
 * `/preview` only: a canned conversation, so the panel can be designed and
 * screenshotted with no account and no network. Never set in the real app.
 */
let preview: { history: ChatMessage[]; reply: (text: string) => ChatMessage; tools: ToolUi[] } | null = null;
export function startPreviewChat(p: typeof preview): void {
  preview = p;
  if (p) setTools(p.tools);
}

/* ───────────────────────── the tool registry ───────────────────────── */

/**
 * How each tool and step looks, as the server describes it (GET
 * /api/ai/tools). The panel draws only from this — a tool added on the server
 * shows up with its own icon, colour and shortcut, no client release needed.
 */
let tools: ToolUi[] = [];
let toolsLoading: Promise<void> | null = null;
const toolListeners = new Set<() => void>();
function setTools(next: ToolUi[]) {
  tools = next;
  toolListeners.forEach((l) => l());
}

export function loadTools(): Promise<void> {
  if (preview || tools.length) return Promise.resolve();
  toolsLoading ??= apiFetch('/api/ai/tools')
    .then((r) => (r.ok ? (r.json() as Promise<ToolsResponse>) : null))
    .then((d) => {
      if (d?.tools?.length) setTools(d.tools);
    })
    .catch(() => {})
    .finally(() => {
      toolsLoading = null;
    });
  return toolsLoading;
}

export function useAgentTools(): ToolUi[] {
  return useSyncExternalStore(
    (l) => {
      toolListeners.add(l);
      return () => toolListeners.delete(l);
    },
    () => tools,
    () => tools,
  );
}

/** Live progress of a turn: a step began, or a step finished. */
export type TurnEvent = Extract<ChatStreamEvent, { type: 'start' | 'step' }>;

/**
 * Send one turn. Returns the assistant's reply; `onEvent` hears each step as
 * the server starts and finishes it (streamed as NDJSON). Where the platform
 * cannot read a body as a stream, the same lines arrive at once at the end.
 */
export async function sendMessage(text: string, onEvent?: (e: TurnEvent) => void): Promise<ChatMessage> {
  if (preview) return previewTurn(preview.reply(text), onEvent);

  const res = await apiFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' },
    body: JSON.stringify({ sessionId: restoreSession() ?? undefined, message: text }),
  });

  let data: Partial<ChatResponse> & { error?: string } = {};
  const onLine = (line: string) => {
    if (!line.trim()) return;
    let e: ChatStreamEvent;
    try {
      e = JSON.parse(line) as ChatStreamEvent;
    } catch {
      return;
    }
    if (e.type === 'start' || e.type === 'step') onEvent?.(e);
    else if (e.type === 'message') data = { sessionId: e.sessionId, message: e.message };
    else if (e.type === 'error') data = { sessionId: e.sessionId, error: e.error };
  };

  const streamed = (res.headers.get('content-type') ?? '').includes('ndjson');
  if (!streamed) {
    data = (await res.json().catch(() => ({}))) as typeof data;
  } else if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf('\n')) >= 0) {
        onLine(buf.slice(0, nl));
        buf = buf.slice(nl + 1);
      }
    }
    onLine(buf);
  } else {
    (await res.text()).split('\n').forEach(onLine);
  }
  // Kept before the error check: the server opens the conversation and saves
  // the message before it calls the model, so a failed reply still belongs to
  // that thread. Dropping the id here started a new conversation on the next
  // message, and everything said before it was gone.
  if (data.sessionId) rememberSession(data.sessionId);
  if (!data.message) {
    throw new AgentError(data.error ?? 'Find time hit a snag. Try again.');
  }
  // Time off and deletions are written server-side, so the calendar has not seen them yet.
  if (data.message.timeOff || data.message.deleted) void refresh();
  // A task or habit was added, changed or finished: the Tasks page re-reads.
  if (data.message.trace?.some((t) => TASK_TOOLS.has(t.tool))) void refreshTasks();
  return data.message;
}

/** Rehydrate the open thread, so reopening the panel doesn't lose the context. */
export async function loadHistory(): Promise<ChatMessage[]> {
  if (preview) return preview.history;
  const id = restoreSession();
  if (!id) return [];
  try {
    const res = await apiFetch(`/api/ai/chat?sessionId=${encodeURIComponent(id)}`);
    if (!res.ok) return [];
    const data = (await res.json()) as ChatHistoryResponse;
    if (!data.sessionId) {
      resetSession();
      return [];
    }
    return data.messages;
  } catch {
    return [];
  }
}

async function reportFeedback(body: Record<string, unknown>): Promise<string[]> {
  try {
    const res = await apiFetch('/api/ai/feedback', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as FeedbackResponse;
    return data.notes ?? [];
  } catch {
    // Losing one feedback report must never cost the user their block — the
    // event is already created by the time this runs.
    return [];
  }
}

export type AcceptResult = { ok: boolean; notes: string[] };

/**
 * Take a proposal as offered. Weak positive evidence — the agent picked the
 * slot and the user didn't object, which is not the same as the user choosing
 * it.
 */
export async function acceptProposal(p: ChatProposal): Promise<AcceptResult> {
  try {
    await createAgentBlock({
      title: p.title,
      category: p.category,
      startISO: p.startISO,
      endISO: p.endISO,
    });
  } catch {
    return { ok: false, notes: [] };
  }
  const notes = await reportFeedback({ suggestionId: p.id, outcome: 'accepted' });
  // A planned task or habit session may replace an older one server-side: show that.
  if (p.taskId || p.habitId) {
    void refresh();
    void refreshTasks();
  }
  return { ok: true, notes };
}

/**
 * Take one of the offered alternatives instead. This is the strongest signal
 * the system gets: two concrete slots were on screen and the user picked the
 * one the agent had ranked lower, which is a clean labelled pair for the
 * weight update — with no need to show anyone a deliberately worse option to
 * get it.
 */
export async function acceptAlternative(
  p: ChatProposal,
  alt: { startISO: string; endISO: string },
): Promise<AcceptResult> {
  try {
    await createAgentBlock({
      title: p.title,
      category: p.category,
      startISO: alt.startISO,
      endISO: alt.endISO,
    });
  } catch {
    return { ok: false, notes: [] };
  }
  const notes = await reportFeedback({
    suggestionId: p.id,
    outcome: 'edited',
    finalStartISO: alt.startISO,
    finalEndISO: alt.endISO,
  });
  if (p.taskId || p.habitId) {
    void refresh();
    void refreshTasks();
  }
  return { ok: true, notes };
}

/** Turn a proposal down, with the reason that makes it mean something. */
export async function rejectProposal(
  p: ChatProposal,
  reason: RejectReason,
): Promise<string[]> {
  return reportFeedback({ suggestionId: p.id, outcome: 'rejected', reasonCode: reason });
}

// ── reporting a reply ───────────────────────────────────────────────────────

/**
 * Flag an agent reply as wrong. Unlike `reportFeedback` this does NOT swallow
 * failure: the user explicitly asked for it to be sent, so the panel must not
 * say "reported" unless the server stored it.
 */
export async function reportReply(
  messageId: string,
  reason: ReportReason,
  note: string,
): Promise<boolean> {
  try {
    const res = await apiFetch('/api/ai/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ messageId, reason, note: note.trim() || undefined }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The report reasons offered in the UI, in the order they're shown. */
export const REPORT_REASONS: { code: ReportReason; label: string }[] = [
  { code: 'misunderstood', label: 'Misunderstood me' },
  { code: 'ignored-rule', label: 'Ignored my rule' },
  { code: 'wrong-info', label: 'Got something wrong' },
  { code: 'unhelpful', label: 'Not helpful' },
  { code: 'inappropriate', label: 'Inappropriate' },
  { code: 'other', label: 'Something else' },
];

// ── the learned model, in the open ──────────────────────────────────────────

export async function loadPreferences(): Promise<PreferenceItem[]> {
  try {
    const res = await apiFetch('/api/ai/preferences');
    if (!res.ok) return [];
    const data = (await res.json()) as PreferencesResponse;
    return data.items ?? [];
  } catch {
    return [];
  }
}

export async function forgetPreference(item: PreferenceItem): Promise<boolean> {
  try {
    const res = await apiFetch(
      `/api/ai/preferences?id=${encodeURIComponent(item.id)}&source=${item.source}`,
      { method: 'DELETE' },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function confirmPreference(item: PreferenceItem): Promise<boolean> {
  try {
    const res = await apiFetch('/api/ai/preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: item.id, verdict: 'confirmed' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The reject reasons offered in the UI, in the order they're shown. */
export const REJECT_REASONS: { code: RejectReason; label: string }[] = [
  { code: 'too-early', label: 'Too early' },
  { code: 'too-late', label: 'Too late' },
  { code: 'wrong-day', label: 'Wrong day' },
  { code: 'back-to-back', label: 'Too tight' },
  { code: 'too-long', label: 'Too long' },
  { code: 'not-needed', label: "Don't need it" },
];
