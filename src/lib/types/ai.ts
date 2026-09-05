/** The parsed intent shape produced by /api/ai/parse — the SSR from spec 17. */
export type ScheduleIntent = "book" | "plan" | "edit" | "constraint" | "recurrence" | "query" | "preference";

export interface ScheduleItem {
  refId: string;
  title: string;
  durationMin: number;
  dueBy?: string;
  preferBy?: string;
  priority?: "low" | "medium" | "high";
  preferredWindow?: "morning" | "afternoon" | "evening";
  taskId?: string;
}

export interface Constraint {
  id: string;
  userId: string;
  kind: "work-hours" | "protected" | "no-meetings" | "leave-by" | "buffer" | "hard-bound";
  rule: Record<string, unknown>;
  hard: boolean;
  label: string;
  source: "onboarding" | "settings" | "nl";
  createdAt: string;
}

export interface Ambiguity {
  field: string;
  question: string;
  guess: string;
  options: string[];
}

export interface CalendarQuery {
  kind: "free-busy" | "list-events" | "capacity";
  start: string;
  end: string;
}

export interface PreferenceUpdate {
  field: string;
  value: unknown;
}

export interface ScheduleRequest {
  intent: ScheduleIntent;
  items: ScheduleItem[];
  constraints: Constraint[];
  ambiguities: Ambiguity[];
  query?: CalendarQuery;
  preferenceUpdate?: PreferenceUpdate;
  confidence: number;
}

export interface AISession {
  id: string;
  userId: string;
  title: string;
  startedAt: string;
  lastMessageAt: string;
  activeDraftBatchId: string | null;
}

export type AIMessageKind = "text" | "plan" | "question" | "answer" | "conflict";

export interface AIMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  kind: AIMessageKind;
  parsed: ScheduleRequest | null;
  ambiguities: Ambiguity[];
  suggestionIds: string[];
}

export type PlanDraftStatus = "pending" | "applied" | "discarded" | "superseded";

export interface ConflictReport {
  id: string;
  message: string;
  fallbacks: { label: string; action: string }[];
}

export interface PlanDraft {
  id: string;
  userId: string;
  sessionId: string | null;
  createdAt: string;
  horizonStart: string;
  horizonEnd: string;
  status: PlanDraftStatus;
  changeCount: number;
  conflictCount: number;
  appliedAt: string | null;
  undoneAt: string | null;
  conflicts: ConflictReport[];
}

export type SuggestionKind = "create" | "move" | "resize" | "delete" | "protect";
export type SuggestionStatus = "pending" | "accepted" | "edited" | "rejected" | "applied";

export interface AISuggestion {
  id: string;
  draftId: string;
  userId: string;
  index: number;
  kind: SuggestionKind;
  taskId: string | null;
  eventId: string | null;
  signalId: string | null;
  title: string;
  proposedStart: string;
  proposedEnd: string;
  previousStart: string | null;
  previousEnd: string | null;
  rationale: string;
  confidence: number;
  score: number;
  displacedFocus: boolean;
  displacedEventIds: string[];
  status: SuggestionStatus;
}
