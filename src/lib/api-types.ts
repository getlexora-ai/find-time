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
  /** RFC 5545 rule body, no "RRULE:" prefix. null = a one-off. */
  rrule: string | null;
  projectLabel: string | null;
  notes: string | null;
  /** The source calendar (calendars.id). null = Find Time's own block. Optional
   *  so older cached payloads still parse. */
  calendarId?: string | null;
  /** Google all-day event: start/end are midnights, end exclusive. */
  allDay?: boolean;
  location?: string | null;
  /** Google "show as free" — does not block time or clash. */
  free?: boolean;
  /** Your answer to the invite; null when you are not a guest. */
  rsvp?: 'needsAction' | 'declined' | 'tentative' | 'accepted' | null;
  videoUrl?: string | null;
  /** number of guests, rooms excluded */
  guests?: number | null;
  /** a task you ticked off */
  done?: boolean;
  /** yyyy-mm-dd occurrences removed from this series */
  exdates?: string[];
  /** set on a one-off that replaced an occurrence of a Find Time series */
  seriesId?: string | null;
  /** the task this block is a session of ("plan my week") */
  taskId?: string | null;
  /** the habit this block is a session of ("gym 3× a week") */
  habitId?: string | null;
};

export type EventInput = {
  title: string;
  start: string;
  end: string;
  allDay?: boolean;
  done?: boolean;
  exdates?: string[];
  seriesId?: string | null;
  category?: string;
  itemType?: string;
  flexibility?: string;
  origin?: string;
  isDraft?: boolean;
  rrule?: string | null;
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
  /** Name and email live in Clerk only; read them with Clerk's useUser. */
  user: { id: string } | null;
  accounts: ApiAccount[];
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
  /** "plan my week": the task this block is a session of */
  taskId?: string;
  /** "plan my week": the habit this block is a session of */
  habitId?: string;
};

/** A backlog task (db/002 `tasks`) — what "plan my week" places. */
export type ApiTask = {
  id: string;
  title: string;
  status: 'backlog' | 'scheduled' | 'in-progress' | 'done' | 'archived';
  /** time still needed, minutes */
  durationMin: number;
  /** exclusive instant: midnight after the due day */
  dueBy: string | null;
  preferBy: string | null;
  /** inclusive instant: no session starts before it (a start date, or a postpone) */
  notBefore: string | null;
  priority: 'low' | 'medium' | 'high';
  /** how draining it is: counts against the day's budget of demanding work */
  effort: 'light' | 'normal' | 'hard';
  preferredWindow: 'morning' | 'afternoon' | 'evening' | null;
  splittable: boolean;
  minChunkMin: number;
  category: string;
  completedAt: string | null;
};

/** A weekly rhythm (db/020 `habits`) — "gym 3× a week", planned ahead per week. */
export type ApiHabit = {
  id: string;
  title: string;
  category: string;
  durationMin: number;
  /** sessions per calendar week, 1–7 — the ideal */
  perWeek: number;
  /** the fewest that still count ("at least 2"); null = perWeek */
  minPerWeek: number | null;
  preferredWindow: 'morning' | 'afternoon' | 'evening' | null;
};

/** GET /api/tasks — the open backlog and the habits, for the Tasks screen. */
export type TasksResponse = { tasks: ApiTask[]; habits: ApiHabit[] };

/** PATCH /api/tasks/[id] — one action per request. */
export type TaskPatch =
  | { done: true }
  | { postpone: '1h' | '3h' | 'tomorrow' | 'next-week' }
  /** null clears a not-before: "start any time" */
  | { notBefore: string | null };

/** PATCH /api/tasks/[id] and /api/habits/[id] — what changed, and how many blocks came off the calendar. */
export type TaskActionResponse = { task?: ApiTask | null; cleared: number };

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
  /** present when the turn blocked out time away (vacation, travel, a day off).
   *  Wall-clock span as the user said it; `days` is how many calendar blocks it made. */
  timeOff?: { title: string; startISO: string; endISO: string; days: number };
  /** present when the turn deleted blocks, after the user said yes to the list */
  deleted?: { count: number };
  /** the user has reported this reply (POST /api/ai/report) */
  reported?: boolean;
  /** what the agent actually did for this turn, in order — never invented client-side */
  trace?: TraceStep[];
};

/**
 * One real step of a turn, as the server ran it: reading the calendar, applying
 * rules, the tool the model chose, scoring slots, saving. `detail` carries the
 * real numbers ("18 blocks · next 14 days").
 */
export type TraceStep = {
  /** a key in the tool registry (GET /api/ai/tools): a pipeline step, or the tool the model called */
  tool: string;
  label: string;
  detail?: string;
  ms?: number;
};

/**
 * How one tool or pipeline step looks in the chat. The server owns this list
 * (src/lib/agent-tools.ts, served at GET /api/ai/tools) so a new tool brings
 * its own label, icon, colour and shortcut — the panel draws what it is sent.
 */
export type ToolUi = {
  key: string;
  /** past tense, for the trace: "Read your calendar" / the tool's name: "Find time" */
  label: string;
  /** present tense, while it runs: "Reading your calendar" */
  running: string;
  /** an icon name the app ships (src/design/solar-icons.ts); unknown names fall back */
  icon: string;
  /** a calendar category colour key */
  color: 'deep' | 'sync' | 'design' | 'research' | 'admin';
  /** offered as a composer shortcut: tapping it starts the sentence with `seed` */
  shortcut?: { label: string; seed: string };
};

export type ToolsResponse = { tools: ToolUi[] };

/**
 * POST /api/ai/chat with `Accept: application/x-ndjson`: one event per line as
 * the turn runs. `start` when a step begins, `step` when it finishes (with its
 * numbers), then exactly one `message` or `error`.
 */
export type ChatStreamEvent =
  | { type: 'start'; tool: string; label: string }
  | { type: 'step'; step: TraceStep }
  | { type: 'message'; sessionId: string; message: ChatMessage }
  | { type: 'error'; sessionId?: string; error: string };

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
  /**
   * The user's own words on the correction, if the UI offers a free-text box.
   * Track B: stored only at capture_profile='full' and dropped entirely from
   * beta onwards — see docs/training-capture.md §3.
   */
  reasonNote?: string;
};

export type FeedbackResponse = {
  ok: boolean;
  /** plain-language notes on what the agent changed its mind about, if anything */
  notes: string[];
};

// ── POST /api/ai/report — "that reply was wrong" ────────────────────────────

/**
 * What was wrong with an agent reply. About the turn as a whole — a bad slot
 * has its own path (RejectReason). Mirrors REPORT_REASON_CODES in
 * src/server/ai/capture-core.ts.
 */
export type ReportReason =
  | 'misunderstood'
  | 'ignored-rule'
  | 'wrong-info'
  | 'unhelpful'
  | 'inappropriate'
  | 'other';

export type ReportRequest = {
  /** the assistant message being reported */
  messageId: string;
  reason: ReportReason;
  /** optional, ≤120 chars. Track B: dropped at capture_profile='anon'. */
  note?: string;
};

export type ReportResponse = { ok: boolean };

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
  /** Working hours per weekday ('mon'..'sun'), hours as numbers; null = day off.
   *  The calendar hatches everything outside these. */
  workHours?: Record<string, { start: number; end: number } | null>;
};

/** GET/PATCH /api/calendar/settings — scheduler_profiles (db/019). */
export type CalendarSettings = {
  /** IANA zone every time is shown in */
  timezone: string;
  /** "your hours": the span the grid draws, hours 0–24 */
  window: { start: number; end: number };
  /** 'mon'..'sun'; null = a day off */
  workHours: Record<string, { start: number; end: number } | null>;
  /** 1 = Monday, 0 = Sunday */
  weekStart: 0 | 1;
  clock24: boolean;
  /** null = the app's default */
  weekTargetH: number | null;
  focusGoalH: number | null;
  /** write focus blocks to Google as busy */
  pushFocus: boolean;
  /** a connected account granted the write scope */
  canWriteGoogle: boolean;
};
