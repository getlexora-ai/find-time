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
