import type {
  User,
  SchedulerProfile,
  NotificationPrefs,
  ConnectedAccount,
  Calendar,
  CalendarEvent,
  Task,
  Project,
  EmailSignal,
  Notification,
  AISession,
  AIMessage,
  PlanDraft,
  AISuggestion,
  Constraint,
} from "@/lib/types";

export interface Store {
  users: Map<string, User>;
  schedulerProfiles: Map<string, SchedulerProfile>;
  notificationPrefs: Map<string, NotificationPrefs>;
  connectedAccounts: Map<string, ConnectedAccount>;
  calendars: Map<string, Calendar>;
  events: Map<string, CalendarEvent>;
  tasks: Map<string, Task>;
  projects: Map<string, Project>;
  signals: Map<string, EmailSignal>;
  notifications: Map<string, Notification>;
  aiSessions: Map<string, AISession>;
  aiMessages: Map<string, AIMessage>;
  planDrafts: Map<string, PlanDraft>;
  aiSuggestions: Map<string, AISuggestion>;
  constraints: Map<string, Constraint>;
}

function createEmptyStore(): Store {
  return {
    users: new Map(),
    schedulerProfiles: new Map(),
    notificationPrefs: new Map(),
    connectedAccounts: new Map(),
    calendars: new Map(),
    events: new Map(),
    tasks: new Map(),
    projects: new Map(),
    signals: new Map(),
    notifications: new Map(),
    aiSessions: new Map(),
    aiMessages: new Map(),
    planDrafts: new Map(),
    aiSuggestions: new Map(),
    constraints: new Map(),
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __ftStore: Store | undefined;
  // eslint-disable-next-line no-var
  var __ftStoreSeeded: boolean | undefined;
}

export function getStore(): Store {
  if (!globalThis.__ftStore) {
    globalThis.__ftStore = createEmptyStore();
  }
  return globalThis.__ftStore;
}

export function isSeeded() {
  return globalThis.__ftStoreSeeded ?? false;
}

export function markSeeded() {
  globalThis.__ftStoreSeeded = true;
}

export function listBy<T extends { userId: string }>(
  collection: Map<string, T>,
  userId: string,
): T[] {
  return Array.from(collection.values()).filter((row) => row.userId === userId);
}
