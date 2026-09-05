export type AccountProvider = "google" | "microsoft" | "imap" | "todoist" | "google-tasks" | "notion";
export type AccountKind = "mail" | "calendar" | "tasks" | "mail+calendar";
export type SyncStatus = "idle" | "syncing" | "live" | "error" | "paused";

export interface ConnectedAccount {
  id: string;
  userId: string;
  provider: AccountProvider;
  kind: AccountKind;
  authType: "oauth" | "password";
  email: string;
  displayName: string;
  accentColor: "lime" | "periwinkle" | "ember" | "amber" | "white";
  isPrimary: boolean;
  order: number;
  scopes: string[];
  syncStatus: SyncStatus;
  syncError: string | null;
  lastSyncAt: string | null;
  messageCount: number;
  createdAt: string;
}

export interface Calendar {
  id: string;
  connectedAccountId: string;
  userId: string;
  providerCalendarId: string;
  name: string;
  color: string;
  isPrimary: boolean;
  readEnabled: boolean;
  writeEnabled: boolean;
  isWriteTarget: boolean;
  timezone: string;
}
