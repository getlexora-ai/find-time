export type SignalKind =
  | "commitment"
  | "deadline"
  | "meeting-request"
  | "task"
  | "follow-up"
  | "travel"
  | "ignore";

export interface EmailSignal {
  id: string;
  userId: string;
  connectedAccountId: string;
  messageId: string;
  threadId: string;
  from: string;
  fromName: string;
  subject: string;
  receivedAt: string;
  snippet: string;
  sourceQuote: string;
  kind: SignalKind;
  extractedTitle: string;
  suggestedDurationMin: number | null;
  dueBy: string | null;
  confidence: number;
  status: "new" | "accepted" | "converted" | "ignored" | "snoozed";
  createdTaskId: string | null;
  createdEventId: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
