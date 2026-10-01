/**
 * Wire types for Plan with AI v2 (POST /api/agent). Shared by the server loop
 * (src/server/agent/) and the panel (src/calendar/agent/). No imports.
 *
 * The conversation is stateless on the server: the client holds `items` (the
 * model's own transcript, opaque to the UI) and sends it back every turn,
 * together with exactly one of: a new message, approval decisions, or an answer.
 * Nothing is stored at the model provider (`store: false`).
 */

/** One block the agent wants to add or move — drawn as a ghost tile on the grid. */
export type DraftBlock = {
  title: string;
  /** yyyy-mm-dd, wall-clock in the user's zone */
  date: string;
  /** HH:MM */
  start: string;
  end: string;
  kind: 'event' | 'focus' | 'task' | 'routine' | 'break';
  category: 'deep' | 'design' | 'research' | 'sync' | 'admin';
  /** server id of the event this replaces (a move) — its tile is drawn faded */
  replaces?: string;
  /** server id being deleted — drawn struck through */
  removes?: string;
};

/** A change waiting for Approve. One per approval-gated tool call. */
export type PendingChange = {
  /** the model's call id; the client answers with approvals[id] */
  id: string;
  action: 'add' | 'move' | 'change' | 'delete' | 'time-off';
  /** one human line: 'Add "Deck review" · Thu 2 Oct 09:00–11:00' */
  summary: string;
  /** " overlaps Board prep (10:30–11:30)" — computed in code, never by the model */
  clash?: string;
  blocks: DraftBlock[];
};

export type AgentQuestion = { id: string; question: string; options: string[] };

/** Streamed to the client as NDJSON, one per line. */
export type AgentEvent =
  /** a chunk of the assistant's reply, as it is written */
  | { type: 'text'; delta: string }
  /** a tool the agent is using: shown as one line, spinner → ✓ */
  | { type: 'tool'; id: string; status: 'running' | 'done' | 'error'; label: string; detail?: string }
  /** changes that need Approve before anything is written */
  | { type: 'pending'; changes: PendingChange[] }
  /** a question with suggested answers; typing anything else also answers it */
  | { type: 'question'; question: AgentQuestion }
  /** what an approved change did, for the receipt + Undo */
  | { type: 'applied'; id: string; summary: string; eventIds: string[]; undo: UndoOp[] }
  /** end of the turn: the transcript to send back next time */
  | { type: 'done'; items: unknown[] }
  | { type: 'error'; message: string };

/** How to reverse one applied change, run by the client against /api/events. */
export type UndoOp =
  | { op: 'delete'; id: string }
  | { op: 'restore'; id: string; patch: { title: string; start: string; end: string } }
  | { op: 'recreate'; input: { title: string; start: string; end: string; category: string; itemType: string; flexibility: string } };

export type AgentRequest = {
  items: unknown[];
  /** the user's IANA zone, for the date table */
  timeZone: string;
  message?: string;
  /** call id → approved? Every pending id must be present. */
  approvals?: Record<string, boolean>;
  /** call id of the open question → the answer (a chip or free text) */
  answers?: Record<string, string>;
};
