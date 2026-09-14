/**
 * Client side of the scheduling agent: the conversation, and — the part that
 * matters — reporting back what the user actually did with each proposal.
 *
 * Every accept, every switch to a different slot, every rejection goes to
 * POST /api/ai/feedback keyed by the proposal's own id. A block created without
 * that call still lands on the calendar, but the agent learns nothing from it,
 * which is exactly the hole this replaces.
 */

import type {
  ChatHistoryResponse,
  ChatMessage,
  ChatProposal,
  ChatResponse,
  FeedbackResponse,
  PreferenceItem,
  PreferencesResponse,
  RejectReason,
} from '@/lib/api-types';
import { apiFetch } from '@/lib/api';

import { createAgentBlock } from './cal-store';

const SESSION_KEY = 'ft.agent.session';

/** The open conversation id, kept in memory for the app's lifetime. */
let sessionId: string | null = null;

export function currentSessionId(): string | null {
  return sessionId;
}

export function resetSession(): void {
  sessionId = null;
  try {
    globalThis.localStorage?.removeItem(SESSION_KEY);
  } catch {
    // no localStorage on native — the in-memory id is enough there
  }
}

function rememberSession(id: string): void {
  sessionId = id;
  try {
    globalThis.localStorage?.setItem(SESSION_KEY, id);
  } catch {
    // ignore
  }
}

function restoreSession(): string | null {
  if (sessionId) return sessionId;
  try {
    const v = globalThis.localStorage?.getItem(SESSION_KEY);
    if (v) sessionId = v;
  } catch {
    // ignore
  }
  return sessionId;
}

export class AgentError extends Error {}

/** Send one turn. Returns the assistant's reply. */
export async function sendMessage(text: string): Promise<ChatMessage> {
  const res = await apiFetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: restoreSession() ?? undefined, message: text }),
  });
  const data = (await res.json().catch(() => ({}))) as Partial<ChatResponse> & { error?: string };
  if (!res.ok || !data.message) {
    throw new AgentError(data.error ?? 'Find time hit a snag. Try again.');
  }
  if (data.sessionId) rememberSession(data.sessionId);
  return data.message;
}

/** Rehydrate the open thread, so reopening the panel doesn't lose the context. */
export async function loadHistory(): Promise<ChatMessage[]> {
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
  return { ok: true, notes };
}

/** Turn a proposal down, with the reason that makes it mean something. */
export async function rejectProposal(
  p: ChatProposal,
  reason: RejectReason,
): Promise<string[]> {
  return reportFeedback({ suggestionId: p.id, outcome: 'rejected', reasonCode: reason });
}

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
