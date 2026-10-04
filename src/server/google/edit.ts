import { query, queryOne } from '../db';
import { getValidAccessToken } from './oauth';

/**
 * Moving, resizing or deleting an imported event from the grid — only one sync
 * marked editable (map.ts editableHere: timed, one-off, yours, no other guests).
 *
 * Google first, then the local row: if Google refuses, nothing changes here and
 * the caller says why. `If-Match` with the stored etag means an event edited in
 * Google since the last sync is never overwritten (412 → refresh). No guests,
 * so `sendUpdates=none` emails no one.
 */

const API = 'https://www.googleapis.com/calendar/v3';

type Target = {
  provider_event_id: string;
  provider_calendar_id: string;
  connected_account_id: string;
  provider_etag: string | null;
  timezone: string | null;
};

export type RemoteResult = { ok: true } | { ok: false; status: number; error: string };

async function targetOf(userId: string, id: string): Promise<Target | null> {
  return queryOne<Target>(
    `select e.provider_event_id, c.provider_calendar_id, e.connected_account_id, e.provider_etag,
            (select timezone from scheduler_profiles where user_id = e.user_id) as timezone
       from calendar_events e join calendars c on c.id = e.calendar_id
      where e.id = $1 and e.user_id = $2 and e.origin = 'imported' and e.provider_editable`,
    [id, userId],
  );
}

function refused(status: number): RemoteResult {
  if (status === 412) return { ok: false, status: 409, error: 'This event changed in Google Calendar. Refresh and try again.' };
  if (status === 401 || status === 403) {
    return { ok: false, status: 409, error: 'Google didn’t allow this change. Reconnect Google Calendar, or change it there.' };
  }
  return { ok: false, status: 502, error: 'Google Calendar didn’t take the change. Try again.' };
}

/** Write new times to Google. Times are wall-clock in the user's zone (ISO with Z, see api-adapter.ts). */
export async function moveRemote(userId: string, id: string, startISO: string, endISO: string): Promise<RemoteResult> {
  const t = await targetOf(userId, id);
  if (!t) return { ok: false, status: 409, error: 'This event can only be changed in Google Calendar.' };
  const zone = t.timezone || 'Europe/Berlin';
  const token = await getValidAccessToken(t.connected_account_id);
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(t.provider_calendar_id)}/events/${encodeURIComponent(t.provider_event_id)}?sendUpdates=none`,
    {
      method: 'PATCH',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        ...(t.provider_etag ? { 'if-match': t.provider_etag } : {}),
      },
      body: JSON.stringify({
        start: { dateTime: startISO.slice(0, 19), timeZone: zone },
        end: { dateTime: endISO.slice(0, 19), timeZone: zone },
      }),
    },
  );
  if (!res.ok) return refused(res.status);
  const g = (await res.json()) as { etag?: string };
  // The next write needs the etag Google just issued, not the one it replaced.
  await query(`update calendar_events set provider_etag = $3 where id = $1 and user_id = $2`, [id, userId, g.etag ?? null]);
  return { ok: true };
}

/** Delete in Google. Already gone there (404/410) counts as done. */
export async function deleteRemote(userId: string, id: string): Promise<RemoteResult> {
  const t = await targetOf(userId, id);
  if (!t) return { ok: false, status: 409, error: 'This event can only be deleted in Google Calendar.' };
  const token = await getValidAccessToken(t.connected_account_id);
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(t.provider_calendar_id)}/events/${encodeURIComponent(t.provider_event_id)}?sendUpdates=none`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${token}`, ...(t.provider_etag ? { 'if-match': t.provider_etag } : {}) },
    },
  );
  if (res.ok || res.status === 404 || res.status === 410) return { ok: true };
  return refused(res.status);
}
