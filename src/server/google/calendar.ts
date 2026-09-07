/**
 * Google Calendar API v3 — the read endpoints we need for pull sync. No SDK.
 * Server-only.
 */

const API = 'https://www.googleapis.com/calendar/v3';

export type GCalListEntry = {
  id: string;
  summary?: string;
  summaryOverride?: string;
  primary?: boolean;
  selected?: boolean;
  accessRole: string;
  backgroundColor?: string;
};

export type GDate = { date?: string; dateTime?: string; timeZone?: string };

export type GEvent = {
  id: string;
  status?: 'confirmed' | 'tentative' | 'cancelled';
  summary?: string;
  description?: string;
  location?: string;
  start?: GDate;
  end?: GDate;
  recurrence?: string[];
  recurringEventId?: string;
  etag?: string;
  sequence?: number;
  updated?: string;
};

/** Thrown on HTTP 410 — a stored syncToken has expired; caller must full-resync. */
export class SyncTokenExpired extends Error {
  constructor() {
    super('Google sync token expired (410)');
  }
}

async function gget<T>(accessToken: string, path: string, params: Record<string, string>): Promise<T> {
  const res = await fetch(`${API}${path}?${new URLSearchParams(params)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (res.status === 410) throw new SyncTokenExpired();
  if (!res.ok) {
    throw new Error(`Google Calendar ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

export async function listCalendars(accessToken: string): Promise<GCalListEntry[]> {
  const out: GCalListEntry[] = [];
  let pageToken: string | undefined;
  do {
    const page = await gget<{ items?: GCalListEntry[]; nextPageToken?: string }>(
      accessToken,
      '/users/me/calendarList',
      { maxResults: '250', ...(pageToken ? { pageToken } : {}) },
    );
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

/**
 * Every event of one calendar since `syncToken` (or since `timeMin` for a full
 * sync), following pagination. Returns the items plus the `nextSyncToken` to
 * store for next time. `showDeleted` so we see cancellations.
 */
export async function collectEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string; timeMin?: string },
): Promise<{ events: GEvent[]; nextSyncToken?: string }> {
  const events: GEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  const base: Record<string, string> = { maxResults: '2500', showDeleted: 'true', singleEvents: 'false' };
  if (opts.syncToken) base.syncToken = opts.syncToken;
  else if (opts.timeMin) base.timeMin = opts.timeMin;

  do {
    const page = await gget<{ items?: GEvent[]; nextPageToken?: string; nextSyncToken?: string }>(
      accessToken,
      `/calendars/${encodeURIComponent(calendarId)}/events`,
      { ...base, ...(pageToken ? { pageToken } : {}) },
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
    if (page.nextSyncToken) nextSyncToken = page.nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}
