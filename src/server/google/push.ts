import { randomUUID } from 'node:crypto';

import { query, queryOne } from '../db';
import { wallClockNow } from '../wall-clock';
import { getCalendarEntry } from './calendar';
import { getValidAccessToken } from './oauth';

/**
 * Write-back (docs/calendar-spec.md §11). Each of your blocks has a calendar
 * (Morgen's pattern): "Find Time only", or one of your Google calendars you can
 * write to. A block with a Google calendar becomes a private event there: you
 * see it in Google, and colleagues booking you see the time as taken.
 *
 * Where the copy goes is the row's own `calendar_id` (null = Find Time only).
 * It is set when the block is made — your primary calendar while "Copy to
 * Google" (scheduler_profiles.push_focus) is on, else none — and changed per
 * block in the editor (setCopyCalendar). Toggling the switch never touches
 * existing blocks' copies. The same column is how pull sync recognises the copy
 * when it comes back (sync.ts upsertEvent matches the calendar's Google id +
 * provider_event_id), so a copy on any calendar is never imported a second time.
 *
 * A proposal is not on this path: it has no row until it is accepted.
 * Repeating blocks are not pushed: Google would hand each occurrence back to
 * pull sync as a separate event, doubling them.
 *
 * Never throws. A failure is recorded on the row (sync_state 'push_failed',
 * sync_error), the local change stands, and the person is told (`pushFailed`).
 */

const API = 'https://www.googleapis.com/calendar/v3';
const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

type EvRow = {
  title: string;
  location?: string | null;
  start_at: Date;
  end_at: Date;
  all_day: boolean;
  origin: string;
  flexibility?: string | null;
  is_draft: boolean;
  rrule: string | null;
  task_id?: string | null;
  habit_id?: string | null;
  deleted_at: Date | null;
  provider_event_id: string | null;
  calendar_id: string | null;
};

type Target = { accountId: string; calendarId: string; providerCalendarId: string; zone: string };

/** Google's public-holiday calendars: read-only, never a place for your blocks. */
const HOLIDAY = /#holiday@group\.v\.calendar\.google\.com$/;
const WRITE_ROLES = new Set(['owner', 'writer']);

/** A Google calendar Find Time may put your blocks on (calendarList accessRole). */
export function canWriteTo(entry: { id: string; accessRole?: string }): boolean {
  return WRITE_ROLES.has(entry.accessRole ?? '') && !HOLIDAY.test(entry.id);
}

const DAY_MS = 86_400_000;

/**
 * Free or busy, for the Google copy (Reclaim's defence, simplest honest form).
 * A session the planner made and may still move (origin 'ai', flexibility
 * 'flexible') is shown FREE while it is more than a day away, so a colleague
 * can still book that time and the planner moves the session; inside 24 hours
 * it turns BUSY and holds. Everything else is busy from the start: focus
 * blocks, events you made, and any session you placed or moved by hand (the
 * planner won't move it, so a booking over it would just collide). Only the Google copy changes: our own row stays
 * opaque, so Find Time's planner still sees the block as taken.
 *
 * Both times are wall-clock (see wall-clock.ts).
 */
type FreeAware = { task_id?: string | null; habit_id?: string | null; origin?: string; flexibility?: string | null; start_at: Date };

export function copyTransparency(ev: FreeAware, wallNow: number): 'opaque' | 'transparent' {
  const movable = (ev.task_id != null || ev.habit_id != null) && ev.origin === 'ai' && ev.flexibility === 'flexible';
  return movable && ev.start_at.getTime() - wallNow > DAY_MS ? 'transparent' : 'opaque';
}

/**
 * A copy written as free that should be busy by now: it was last written
 * (remote_updated_at, Google's `updated` from that write) while more than a day
 * away, and it is within the day now. Rows pushed before this existed have no
 * remote_updated_at and were written busy.
 */
export function needsFlip(
  ev: FreeAware & { remote_updated_at: Date | null },
  zone: string,
  now: number = Date.now(),
): boolean {
  if (!ev.remote_updated_at) return false;
  const wasFree = copyTransparency(ev, wallClockNow(zone, ev.remote_updated_at.getTime())) === 'transparent';
  return wasFree && copyTransparency(ev, wallClockNow(zone, now)) === 'opaque';
}

/** Should this row have a copy in Google (given it has a calendar)? */
export function wantsCopy(ev: Pick<EvRow, 'origin' | 'deleted_at' | 'is_draft' | 'rrule'>): boolean {
  return ev.origin !== 'imported' && ev.deleted_at == null && !ev.is_draft && ev.rrule == null;
}

/** The Google event for a block. Times are wall-clock, see api-adapter.ts. */
export function copyBody(
  ev: Pick<EvRow, 'title' | 'start_at' | 'end_at' | 'all_day' | 'location'>,
  zone: string,
  transparency: 'opaque' | 'transparent' = 'opaque',
) {
  const wall = (d: Date) => d.toISOString().slice(0, 19);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return {
    summary: ev.title,
    description: 'From Find Time.',
    start: ev.all_day ? { date: day(ev.start_at) } : { dateTime: wall(ev.start_at), timeZone: zone },
    end: ev.all_day ? { date: day(ev.end_at) } : { dateTime: wall(ev.end_at), timeZone: zone },
    transparency,
    visibility: 'private',
    // only sent when set: a PATCH without it leaves Google's copy alone
    ...(ev.location ? { location: ev.location } : {}),
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
 * What changing a block's calendar takes, in order: take the copy off the old
 * calendar (when there is one), then point the row at the new one. Pure, for
 * push.check.mjs; setCopyCalendar does it.
 */
export function copyMoveSteps(
  ev: Pick<EvRow, 'calendar_id' | 'provider_event_id'>,
  to: string | null,
): ('remove-old' | 'set-calendar')[] {
  if (ev.calendar_id === to) return [];
  return ev.provider_event_id && ev.calendar_id ? ['remove-old', 'set-calendar'] : ['set-calendar'];
}

/**
 * Push / update / remove the Google copy of event `id` as its state now
 * requires. False when Google didn't take it; true also when there is nothing
 * to do (Find Time only, a repeat, someone else's event).
 */
export async function pushEvent(userId: string, id: string): Promise<boolean> {
  try {
    const ev = await queryOne<EvRow>(
      `select title, location, start_at, end_at, all_day, origin, flexibility, is_draft, rrule, task_id, habit_id,
              deleted_at, provider_event_id, calendar_id
         from calendar_events where id = $1 and user_id = $2`,
      [id, userId],
    );
    if (!ev || ev.origin === 'imported') return true;
    const target = ev.calendar_id ? await targetOf(userId, ev.calendar_id) : null;

    if (target == null || !wantsCopy(ev)) {
      // It was pushed before and no longer qualifies (deleted, turned into a
      // repeat, the account lost write access): take the copy down. The
      // calendar choice stays, so a repeat made one-off again is copied again.
      if (ev.provider_event_id && ev.calendar_id) await removeRemote(userId, id, ev);
      return true;
    }

    const token = await getValidAccessToken(target.accountId);
    const path = `/calendars/${encodeURIComponent(target.providerCalendarId)}/events`;
    const body = copyBody(ev, target.zone, copyTransparency(ev, wallClockNow(target.zone)));
    const res = await sendCopy((method, url, b) => gsend(token, method, url, b), path, ev.provider_event_id, body);
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const out = (await res.json()) as { id: string; etag?: string; updated?: string };
    // remote_updated_at: when this copy was last written — what needsFlip reads
    // to know whether it went out as free.
    await queryOne(
      `update calendar_events
          set provider_event_id = $3, provider_etag = $4, remote_updated_at = coalesce($5::timestamptz, now()),
              sync_state = 'synced', sync_error = null
        where id = $1 and user_id = $2 returning id`,
      [id, userId, out.id, out.etag ?? null, out.updated ?? null],
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

export type CopyResult = { ok: true } | { ok: false; status: number; error: string };

/**
 * Whether a block may be copied to `calendarId`: yours, on an account that
 * granted calendar.events, and one Google says you can write to (asked live:
 * the access role is not stored). Holiday calendars never.
 */
export async function canCopyTo(userId: string, calendarId: string): Promise<boolean> {
  const target = await targetOf(userId, calendarId);
  if (!target) return false;
  try {
    const entry = await getCalendarEntry(await getValidAccessToken(target.accountId), target.providerCalendarId);
    return canWriteTo(entry);
  } catch {
    return false;
  }
}

/**
 * Change which calendar a block is copied to (null = Find Time only). The copy
 * on the old calendar is deleted first; the caller's pushEvent then makes it on
 * the new one. If Google won't delete the old copy, nothing changes: a copy
 * left behind would show the time twice.
 */
export async function setCopyCalendar(userId: string, id: string, calendarId: string | null): Promise<CopyResult> {
  const ev = await queryOne<EvRow>(
    `select title, location, start_at, end_at, all_day, origin, is_draft, rrule,
            deleted_at, provider_event_id, calendar_id
       from calendar_events where id = $1 and user_id = $2 and deleted_at is null`,
    [id, userId],
  );
  if (!ev) return { ok: false, status: 404, error: 'Not found.' };
  if (ev.origin === 'imported') return { ok: false, status: 409, error: 'This event belongs to its Google calendar.' };
  const steps = copyMoveSteps(ev, calendarId);
  if (steps.length === 0) return { ok: true };
  if (calendarId && !(await canCopyTo(userId, calendarId))) {
    return { ok: false, status: 400, error: "Find Time can't add events to that calendar." };
  }
  if (steps.includes('remove-old')) {
    try {
      await removeRemote(userId, id, ev);
    } catch {
      return { ok: false, status: 502, error: "Google didn't remove the copy from the old calendar. Try again." };
    }
  }
  await queryOne(
    `update calendar_events set calendar_id = (select id from calendars where id = $3 and user_id = $2),
            provider_event_id = null, provider_etag = null, remote_updated_at = null
      where id = $1 and user_id = $2 returning id`,
    [id, userId, calendarId],
  );
  return { ok: true };
}

export type MeetResult =
  | { ok: true; url: string }
  | { ok: false; status: number; error: string; code?: 'needs-write-back' | 'repeats' | 'imported' };

/**
 * A Google Meet link for one of your blocks. Meet links only exist on Google
 * Calendar events, so the block's Google copy is made first (on the block's own
 * calendar), then Google is asked to attach a Meet to it
 * (conferenceData.createRequest). No guests are added and nobody is emailed
 * (sendUpdates=none). The link is kept on the row (conference_url), like any
 * other field of your own block.
 */
export async function createMeet(userId: string, id: string): Promise<MeetResult> {
  const ev = await queryOne<{ origin: string; rrule: string | null; deleted_at: Date | null; calendar_id: string | null }>(
    `select origin, rrule, deleted_at, calendar_id from calendar_events where id = $1 and user_id = $2`,
    [id, userId],
  );
  if (!ev || ev.deleted_at) return { ok: false, status: 404, error: 'Not found.' };
  if (ev.origin === 'imported') {
    return { ok: false, status: 409, code: 'imported', error: 'This event belongs to Google Calendar. Add a Meet link there.' };
  }
  if (ev.rrule) {
    return { ok: false, status: 409, code: 'repeats', error: "Repeating blocks aren't copied to Google, so they can't get a Meet link. Paste a link instead." };
  }
  const target = ev.calendar_id ? await targetOf(userId, ev.calendar_id) : null;
  if (!target) {
    return {
      ok: false,
      status: 409,
      code: 'needs-write-back',
      error: 'Meet links come from Google Calendar. Copy this block to a Google calendar first.',
    };
  }
  if (!(await pushEvent(userId, id))) return { ok: false, status: 502, error: "Google didn't take the block. Try again." };
  const row = await queryOne<{ provider_event_id: string | null }>(
    `select provider_event_id from calendar_events where id = $1 and user_id = $2`,
    [id, userId],
  );
  if (!row?.provider_event_id) return { ok: false, status: 502, error: "Google didn't take the block. Try again." };

  const token = await getValidAccessToken(target.accountId);
  const url = `${API}/calendars/${encodeURIComponent(target.providerCalendarId)}/events/${encodeURIComponent(row.provider_event_id)}`;
  type GEv = { hangoutLink?: string; conferenceData?: { entryPoints?: { entryPointType: string; uri: string }[] } };
  const linkOf = (g: GEv) => g.hangoutLink ?? g.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ?? null;

  const res = await fetch(`${url}?conferenceDataVersion=1&sendUpdates=none`, {
    method: 'PATCH',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      conferenceData: { createRequest: { requestId: randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    }),
  });
  if (!res.ok) return { ok: false, status: 502, error: `Google couldn't create a Meet link (${res.status}). Try again.` };
  let link = linkOf((await res.json()) as GEv);
  // Google may still be making it ("pending"): look again, briefly.
  for (let i = 0; !link && i < 3; i++) {
    await new Promise((r) => setTimeout(r, 700));
    const again = await fetch(`${url}?conferenceDataVersion=1`, { headers: { authorization: `Bearer ${token}` } });
    if (again.ok) link = linkOf((await again.json()) as GEv);
  }
  if (!link) return { ok: false, status: 504, error: 'Google is still making the Meet link. Try again in a moment.' };
  await queryOne(`update calendar_events set conference_url = $3 where id = $1 and user_id = $2 returning id`, [id, userId, link]);
  return { ok: true, url: link };
}

/**
 * Turn planned sessions busy in Google once they are within a day
 * (copyTransparency). There is no background worker: this runs where the app
 * already talks to Google, on each calendar pull (/api/calendar/sync — whenever
 * the calendar is opened). A session nobody opens the app before stays free in
 * Google until the next pull.
 */
export async function flipNearSessions(userId: string): Promise<number> {
  const profile = await queryOne<{ timezone: string | null }>(`select timezone from scheduler_profiles where user_id = $1`, [userId]);
  const zone = profile?.timezone || 'Europe/Berlin';
  const now = wallClockNow(zone);
  const rows = await query<{
    id: string;
    task_id: string | null;
    habit_id: string | null;
    origin: string;
    flexibility: string | null;
    start_at: Date;
    remote_updated_at: Date | null;
  }>(
    `select id, task_id, habit_id, origin, flexibility, start_at, remote_updated_at from calendar_events
      where user_id = $1 and origin <> 'imported' and deleted_at is null and provider_event_id is not null
        and (task_id is not null or habit_id is not null)
        and start_at <= $2 and end_at >= $3`,
    [userId, new Date(now + DAY_MS).toISOString(), new Date(now).toISOString()],
  );
  const due = rows.filter((r) => needsFlip(r, zone));
  for (const r of due) await pushEvent(userId, r.id);
  return due.length;
}

/**
 * Try upcoming copies that Google didn't take again (runs beside
 * flipNearSessions, on each calendar pull). A row that failed before blocks had
 * their own calendar has no calendar_id and would read as "Find Time only"
 * forever: it gets the default calendar (primary, only while "Copy to Google"
 * is on), else its failure flag is cleared — there is nothing to copy.
 */
export async function retryFailedPushes(userId: string): Promise<number> {
  const fallback = await defaultCopyCalendar(userId);
  await query(
    `update calendar_events
        set calendar_id = $2::text, sync_state = case when $2::text is null then 'local' else sync_state end,
            sync_error = case when $2::text is null then null else sync_error end
      where user_id = $1 and sync_state = 'push_failed' and calendar_id is null
        and origin <> 'imported' and deleted_at is null and end_at >= now()
        and rrule is null and not is_draft`,
    [userId, fallback],
  );
  const rows = await query<{ id: string }>(
    `select id from calendar_events
      where user_id = $1 and sync_state = 'push_failed' and origin <> 'imported' and end_at >= now()
      order by start_at limit 20`,
    [userId],
  );
  for (const r of rows) await pushEvent(userId, r.id);
  return rows.length;
}

/** Delete the Google copy. The block keeps its calendar choice (calendar_id). */
async function removeRemote(userId: string, id: string, ev: Pick<EvRow, 'calendar_id' | 'provider_event_id'>) {
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
    `update calendar_events set provider_event_id = null, provider_etag = null, remote_updated_at = null,
            sync_state = 'local', sync_error = null
      where id = $1 and user_id = $2 returning id`,
    [id, userId],
  );
}

/** One of your calendars, on an account that granted the write scope. Null otherwise, and for holiday calendars. */
async function targetOf(userId: string, calendarId: string): Promise<Target | null> {
  const row = await queryOne<{ account_id: string; provider_calendar_id: string; timezone: string | null }>(
    `select c.connected_account_id as account_id, c.provider_calendar_id, p.timezone
       from calendars c
       join oauth_tokens t on t.connected_account_id = c.connected_account_id
       left join scheduler_profiles p on p.user_id = c.user_id
      where c.id = $1 and c.user_id = $2 and position($3 in coalesce(t.scope, '')) > 0
      limit 1`,
    [calendarId, userId, WRITE_SCOPE],
  );
  if (!row || HOLIDAY.test(row.provider_calendar_id)) return null;
  return { accountId: row.account_id, calendarId, providerCalendarId: row.provider_calendar_id, zone: row.timezone || 'Europe/Berlin' };
}

/** Your primary calendar on the first account that granted the write scope, and whether "Copy to Google" is on. */
async function primaryCalendar(userId: string): Promise<{ calendarId: string; pushFocus: boolean } | null> {
  const row = await queryOne<{ calendar_id: string; push_focus: boolean | null }>(
    `select c.id as calendar_id, p.push_focus
       from connected_accounts a
       join oauth_tokens t on t.connected_account_id = a.id
       join calendars c on c.connected_account_id = a.id and c.is_primary
       left join scheduler_profiles p on p.user_id = a.user_id
      where a.user_id = $1 and position($2 in coalesce(t.scope, '')) > 0
      order by a."order", a.created_at
      limit 1`,
    [userId, WRITE_SCOPE],
  );
  return row ? { calendarId: row.calendar_id, pushFocus: Boolean(row.push_focus) } : null;
}

/**
 * Where a new block is copied when nobody chose: your primary calendar while
 * "Copy to Google" is on. Writable by the canCopyTo rule without asking Google:
 * primaryCalendar requires the write scope, and an account's own primary
 * calendar is always accessRole 'owner' and never a holiday calendar. Accounts
 * in the same order as the editor's list (accounts-repo), so both pick one.
 */
export async function defaultCopyCalendar(userId: string): Promise<string | null> {
  const p = await primaryCalendar(userId);
  return p?.pushFocus ? p.calendarId : null;
}

async function gsend(token: string, method: 'POST' | 'PATCH', path: string, body: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}
