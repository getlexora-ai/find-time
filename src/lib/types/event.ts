export type EventItemType = "event" | "task" | "deepwork" | "break";
export type EventCategory =
  | "deep-work"
  | "design"
  | "research"
  | "meeting"
  | "admin"
  | "learning"
  | "break"
  | "other";
export type EventOrigin = "manual" | "ai" | "imported" | "signal";
export type EventFlexibility = "fixed" | "flexible" | "protected";

export interface CalendarEvent {
  id: string;
  userId: string;
  calendarId: string | null;
  connectedAccountId: string | null;
  title: string;
  description: string | null;
  location: string | null;
  start: string;
  end: string;
  allDay: boolean;
  timezone: string;
  itemType: EventItemType;
  category: EventCategory;
  projectId: string | null;
  taskId: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  origin: EventOrigin;
  isDraft: boolean;
  draftBatchId: string | null;
  suggestionId: string | null;
  flexibility: EventFlexibility;
  requiresFocus: boolean;
  reminders: { minutesBefore: number; channel: "in-app" | "browser" | "email" }[];
  createdAt: string;
  updatedAt: string;
}
