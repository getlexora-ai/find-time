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
