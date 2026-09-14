/**
 * Wire shapes shared by the API routes (src/server/) and the client
 * (src/calendar/api-adapter.ts). No imports — safe to pull into the app bundle.
 */

export type ApiEvent = {
  id: string;
  title: string;
  /** ISO instant, treated as naive wall-clock (server runs UTC). */
  start: string;
  end: string;
  category: string;
  itemType: string;
  flexibility: string;
  origin: string;
  isDraft: boolean;
  projectLabel: string | null;
  notes: string | null;
};

export type EventInput = {
  title: string;
  start: string;
  end: string;
  category?: string;
  itemType?: string;
  flexibility?: string;
  origin?: string;
  isDraft?: boolean;
  projectLabel?: string | null;
  notes?: string | null;
};

/** GET /api/calendar/accounts — Google connections for the "Calendars" panel. */
export type ApiCalendar = {
  id: string;
  providerCalendarId: string;
  name: string;
  color: string;
  isPrimary: boolean;
  readEnabled: boolean;
};

export type ApiAccount = {
  id: string;
  email: string;
  displayName: string;
  accentColor: string;
  syncStatus: string;
  syncError: string | null;
  lastSyncAt: string | null;
  calendars: ApiCalendar[];
};

export type AccountsResponse = {
  signedIn: boolean;
  user: { id: string; name: string; email: string } | null;
  accounts: ApiAccount[];
};

/** POST /api/ai/find-time — one proposed block to add to the calendar. */
export type FindTimeProposal = {
  title: string;
  /** ISO instant, UTC wall-clock (same convention as ApiEvent.start). */
  startISO: string;
  endISO: string;
  category: string;
};

export type FindTimeResponse = {
  proposals: FindTimeProposal[];
  /** one-sentence, first-person explanation for the user */
  rationale: string;
  /** how many blocks the request asked for (proposals may be fewer) */
  requested: number;
};

// ── POST /api/ai/chat — the conversational agent ────────────────────────────

/**
 * A proposed block inside a chat turn.
 *
 * `id` is the `ai_suggestions` row id and is the whole point: the client must
 * send it back with the outcome, otherwise "the user moved this block to 2pm"
 * cannot be matched to "we proposed 9am", and the correction teaches nothing.
 */
export type ChatProposal = {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  category: string;
  /** the scorer's own reason for this slot, in plain words */
  reason: string;
  /** ranked runners-up the user can switch to in one tap */
  alternatives: { startISO: string; endISO: string }[];
};

/** Why a proposal was turned down. An unlabelled rejection teaches nothing. */
export type RejectReason =
  | 'too-early'
  | 'too-late'
  | 'wrong-day'
  | 'back-to-back'
  | 'needs-prep'
  | 'too-long'
  | 'too-short'
  | 'not-needed'
  | 'other';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
  /** present when the turn placed time */
  proposals?: ChatProposal[];
  /** present when the agent needs one answer before it can place anything */
  question?: { text: string; options: string[] };
  /** present when the turn saved a standing rule */
  savedRule?: { id: string; label: string };
};

export type ChatRequest = {
  /** omit to start a new conversation */
  sessionId?: string;
  message: string;
};

export type ChatResponse = {
  sessionId: string;
  message: ChatMessage;
};

/** GET /api/ai/chat?sessionId=… — rehydrate an open conversation. */
export type ChatHistoryResponse = {
  sessionId: string | null;
  messages: ChatMessage[];
};

// ── POST /api/ai/feedback — closing the loop ────────────────────────────────

export type FeedbackRequest = {
  suggestionId: string;
  outcome: 'accepted' | 'edited' | 'rejected';
  /** where the block actually ended up, for outcome='edited' */
  finalStartISO?: string;
  finalEndISO?: string;
  /** required in practice for outcome='rejected' — see RejectReason */
  reasonCode?: RejectReason;
};

export type FeedbackResponse = {
  ok: boolean;
  /** plain-language notes on what the agent changed its mind about, if anything */
  notes: string[];
};

// ── /api/ai/preferences — what the agent believes, in the open ──────────────

/**
 * `rule` items were stated by the user and are enforced as hard filters.
 * `learned` items were inferred from corrections and only ever reorder
 * candidates. Keeping them visibly distinct matters: a wrongly-inferred hard
 * rule is far more damaging than a wrongly-inferred soft one.
 */
export type PreferenceItem = {
  id: string;
  text: string;
  source: 'rule' | 'learned';
  /** how many corrections back this inference; 0 for stated rules */
  evidence: number;
  /** learned items below this are recorded but not yet acted on */
  active: boolean;
};

export type PreferencesResponse = {
  items: PreferenceItem[];
};
