import { query, queryOne } from '../db';
import { getValidAccessToken } from './oauth';

/**
 * Write-back, opt-in (scheduler_profiles.push_focus, docs/calendar-spec.md §11).
 *
 * Every block you keep in Find Time, once the switch is on, becomes a private,
 * busy event on your primary Google calendar: you see it there, and colleagues
 * booking you see the time as taken. A proposal is not on this path: it has no
 * row until it is accepted. Repeating blocks are not pushed: Google would hand
 * each occurrence back to pull sync as a separate event, doubling them.
 *
 * Never throws. A failure is recorded on the row (sync_state 'push_failed',
 * sync_error), the local change stands, and the person is told (`pushFailed`).
 */

const API = 'https://www.googleapis.com/calendar/v3';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

type EvRow = {
  title: string;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  origin: string;
  is_draft: boolean;
  rrule: string | null;
  deleted_at: Date | null;
  provider_event_id: string | null;
  calendar_id: string | null;
};

type Target = { accountId: string; calendarId: string; providerCalendarId: string; zone: string };

/** Should this row have a copy in Google? */
export function wantsCopy(ev: Pick<EvRow, 'origin' | 'deleted_at' | 'is_draft' | 'rrule'>): boolean {
  return ev.origin !== 'imported' && ev.deleted_at == null && !ev.is_draft && ev.rrule == null;
}

/** The Google event for a block. Times are wall-clock, see api-adapter.ts. */
export function copyBody(ev: Pick<EvRow, 'title' | 'start_at' | 'end_at' | 'all_day'>, zone: string) {
  const wall = (d: Date) => d.toISOString().slice(0, 19);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    summary: ev.title,
    description: 'From Find Time.',
    start: ev.all_day ? { date: day(ev.start_at) } : { dateTime: wall(ev.start_at), timeZone: zone },
    end: ev.all_day ? { date: day(ev.end_at) } : { dateTime: wall(ev.end_at), timeZone: zone },
    transparency: 'opaque',
    visibility: 'private',
  };
}

type Send = (method: 'POST' | 'PATCH', path: string, body: unknown) => Promise<Response>;

/** Update the copy, or make it. Deleted by hand in Google since: make it again. */
export async function sendCopy(send: Send, path: string, providerEventId: string | null, body: unknown): Promise<Response> {
  if (providerEventId) {
    const res = await send('PATCH', `${path}/${encodeURIComponent(providerEventId)}`, body);
    if (res.status !== 404 && res.status !== 410) return res;
  }
  return send('POST', path, body);
}

/**
 * Push / update / remove the Google copy of event `id` as its state now
 * requires. False when Google didn't take it; true also when there is nothing
 * to do (the switch is off, a repeat, someone else's event).
 */
export async function pushEvent(userId: string, id: string): Promise<boolean> {
  try {
    const target = await targetFor(userId);
    const ev = await queryOne<EvRow>(
      `select title, start_at, end_at, all_day, origin, is_draft, rrule,
              deleted_at, provider_event_id, calendar_id
         from calendar_events where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (!ev || ev.origin === 'imported') return true;

    if (target == null || !wantsCopy(ev)) {
      // It was pushed before and no longer qualifies (deleted, turned into a
      // repeat, or write-back switched off): take the copy down.
      if (ev.provider_event_id && ev.calendar_id) await removeRemote(userId, id, ev);
      return true;
    }

    const token = await getValidAccessToken(target.accountId);
    const path = `/calendars/${encodeURIComponent(target.providerCalendarId)}/events`;
    const res = await sendCopy((method, url, body) => gsend(token, method, url, body), path, ev.provider_event_id, copyBody(ev, target.zone));
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { id: string; etag?: string };
    await queryOne(
      `update calendar_events
          set provider_event_id = $3, provider_etag = $4, calendar_id = $5,
              sync_state = 'synced', sync_error = null
        where id = $1 and user_id = $2 returning id`,
      [id, userId, out.id, out.etag ?? null, target.calendarId],
    );
    return true;
  } catch (err) {
    await queryOne(
      `update calendar_events set sync_state = 'push_failed', sync_error = $3
        where id = $1 and user_id = $2 returning id`,
      [id, userId, (err instanceof Error ? err.message : String(err)).slice(0, 500)],
    ).catch(() => {});
    return false;
  }
}

/** After the switch changes: every upcoming block of yours gets its copy, or loses it. */
export async function pushUpcoming(userId: string): Promise<void> {
  const rows = await query<{ id: string }>(
    `select id from calendar_events
      where user_id = $1 and origin <> 'imported' and deleted_at is null and end_at >= now()
      order by start_at limit 300`,
    [userId],
  );
  for (let i = 0; i < rows.length; i += 5) await Promise.all(rows.slice(i, i + 5).map((r) => pushEvent(userId, r.id)));
}

async function removeRemote(userId: string, id: string, ev: EvRow) {
  const cal = await queryOne<{ provider_calendar_id: string; connected_account_id: string }>(
    `select provider_calendar_id, connected_account_id from calendars where id = $1`,
    [ev.calendar_id],
  );
  if (!cal) return;
  const token = await getValidAccessToken(cal.connected_account_id);
  const res = await fetch(
    `${API}/calendars/${encodeURIComponent(cal.provider_calendar_id)}/events/${encodeURIComponent(ev.provider_event_id!)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
  );
  // 404/410: already gone in Google — that is the state we want.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google DELETE ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  await queryOne(
    `update calendar_events set provider_event_id = null, provider_etag = null, calendar_id = null,
            sync_state = 'local', sync_error = null
      where id = $1 and user_id = $2 returning id`,
    [id, userId],
  );
}

/** Your primary calendar on an account that granted the write scope, if write-back is on. */
async function targetFor(userId: string): Promise<Target | null> {
  const row = await queryOne<{
    push_focus: boolean;
    timezone: string | null;
    account_id: string;
    calendar_id: string;
    provider_calendar_id: string;
  }>(
    `select p.push_focus, p.timezone, a.id as account_id, c.id as calendar_id, c.provider_calendar_id
       from scheduler_profiles p
       join connected_accounts a on a.user_id = p.user_id
       join oauth_tokens t on t.connected_account_id = a.id
       join calendars c on c.connected_account_id = a.id and c.is_primary
      where p.user_id = $1 and position($2 in coalesce(t.scope, '')) > 0
      order by a.created_at
      limit 1`,
    [userId, WRITE_SCOPE],
  );
  if (!row?.push_focus) return null;
  return {
    accountId: row.account_id,
    calendarId: row.calendar_id,
    providerCalendarId: row.provider_calendar_id,
    zone: row.timezone || 'Europe/Berlin',
  };
}

async function gsend(token: string, method: 'POST' | 'PATCH', path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
