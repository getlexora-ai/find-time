import { randomUUID } from 'node:crypto';

import { query, queryOne } from '../db';
import { collectEvents, listCalendars, SyncTokenExpired } from './calendar';
import { getValidAccessToken } from './oauth';
import { toRow, type CalendarEventRow } from './map';
import { copyTransparency, pushEvent } from './push';
import { wallClockNow } from '../wall-clock';

/**
 * Pull-only Google Calendar sync. Called after connect and on the calendar
 * screen's mount (throttled by the /api/calendar/sync route).
 *
 * Pull is on demand. The one thing pushed back is opt-in: Find Time blocks written
 * to Google as busy (push.ts). `events.watch` channels and a scheduled worker
 * are still the upgrade path.
 */

const FULL_SYNC_LOOKBACK_DAYS = 60;
const READ_ROLES = new Set(['owner', 'writer', 'reader']);

export type SyncResult = { imported: number; deleted: number; calendars: number };

// One sync per account at a time. Connect starts a background sync and the
// calendar screen asks for one as it opens; two concurrent runs over the same
// rows made one fail and flash "Sync failed". A second caller joins the first.
const inFlight = new Map<string, Promise<SyncResult>>();

export function syncAccount(userId: string, accountId: string): Promise<SyncResult> {
  const running = inFlight.get(accountId);
  if (running) return running;
  const run = runSync(userId, accountId).finally(() => inFlight.delete(accountId));
  inFlight.set(accountId, run);
  return run;
}

async function runSync(userId: string, accountId: string): Promise<SyncResult> {
  try {
    const token = await getValidAccessToken(accountId);
    const calendars = await upsertCalendars(userId, accountId, token);
    const userZone = await zoneOf(userId);

    let imported = 0;
    let deleted = 0;
    for (const cal of calendars) {
      if (!cal.readEnabled) continue;
      const r = await syncCalendar(userId, accountId, cal, token, userZone);
      imported += r.imported;
      deleted += r.deleted;
    }

    await queryOne(
      `update connected_accounts
          set sync_status = 'live', last_sync_at = now(), sync_error = null
        where id = $1 returning id`,
      [accountId],
    );
    return { imported, deleted, calendars: calendars.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await queryOne(
      `update connected_accounts set sync_status = 'error', sync_error = $2 where id = $1 returning id`,
      [accountId, msg.slice(0, 500)],
    ).catch(() => {});
    throw err;
  }
}

type CalRow = { id: string; providerCalendarId: string; readEnabled: boolean };

async function upsertCalendars(
  userId: string,
  accountId: string,
  token: string,
): Promise<CalRow[]> {
  const remote = (await listCalendars(token)).filter((c) => READ_ROLES.has(c.accessRole));
  const rows: CalRow[] = [];
  for (const c of remote) {
    const existing = await queryOne<{ id: string; read_enabled: boolean }>(
      `select id, read_enabled from calendars
        where connected_account_id = $1 and provider_calendar_id = $2`,
      [accountId, c.id],
    );
    const id = existing?.id ?? `cal_${randomUUID()}`;
    await queryOne(
      `insert into calendars
         (id, user_id, connected_account_id, provider_calendar_id, is_primary, color)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (connected_account_id, provider_calendar_id) do update set
         is_primary = excluded.is_primary
       returning id`,
      [id, userId, accountId, c.id, Boolean(c.primary), c.backgroundColor ?? 'lime'],
    );
    rows.push({ id, providerCalendarId: c.id, readEnabled: existing?.read_enabled ?? true });
  }
  return rows;
}

/** The user's IANA zone — every Google time is converted into it. */
async function zoneOf(userId: string): Promise<string> {
  const row = await queryOne<{ timezone: string | null }>(
    `select timezone from scheduler_profiles where user_id = $1`,
    [userId],
  ).catch(() => null);
  return row?.timezone || 'Europe/Berlin';
}

async function syncCalendar(
  userId: string,
  accountId: string,
  cal: CalRow,
  token: string,
  userZone: string,
): Promise<{ imported: number; deleted: number }> {
  const state = await queryOne<{ sync_token: string | null; sync_mode: string | null }>(
    `select sync_token, sync_mode from calendar_sync_state where calendar_id = $1`,
    [cal.id],
  );

  // A calendar last synced in the old 'series' mode holds one unexpanded master
  // row per repeating event. Re-sync it once in full as single occurrences,
  // then drop those masters (below) — otherwise each series would show twice.
  const migrating = state != null && state.sync_mode !== 'instances';
  const syncToken = migrating ? undefined : state?.sync_token ?? undefined;

  const timeMin = new Date(Date.now() - FULL_SYNC_LOOKBACK_DAYS * 86_400_000).toISOString();
  let full = !syncToken;
  let page: Awaited<ReturnType<typeof collectEvents>>;
  try {
    page = await collectEvents(token, cal.providerCalendarId, { syncToken, timeMin, singleEvents: true });
  } catch (err) {
    if (!(err instanceof SyncTokenExpired)) throw err;
    full = true;
    page = await collectEvents(token, cal.providerCalendarId, { timeMin, singleEvents: true });
  }

  let imported = 0;
  let deleted = 0;
  if (migrating) {
    await queryOne(
      `update calendar_events set deleted_at = now(), sync_state = 'synced'
        where calendar_id = $1 and recurrence_unsupported = true and deleted_at is null
        returning id`,
      [cal.id],
    );
  }
  for (const g of page.events) {
    const mapped = toRow(g, { userId, calendarId: cal.id, connectedAccountId: accountId, userZone });
    if (mapped.deleted) {
      // Only Google's own events are deleted here. A cancelled copy of one of
      // your blocks (deleted by hand in Google, or push.ts taking it down) never
      // deletes the block: it just forgets the copy, and the next push makes it
      // again (sendCopy's "deleted by hand in Google: make it again").
      const res = await queryOne<{ id: string }>(
        `update calendar_events set deleted_at = now(), sync_state = 'synced'
          where calendar_id = $1 and provider_event_id = $2 and origin = 'imported' and deleted_at is null
          returning id`,
        [cal.id, mapped.providerEventId],
      );
      if (res) deleted++;
      await query(
        `update calendar_events e set provider_event_id = null, provider_etag = null, remote_updated_at = null
           from calendars c
          where c.id = e.calendar_id and c.user_id = $1 and c.provider_calendar_id = $2
            and e.user_id = $1 and e.provider_event_id = $3 and e.origin <> 'imported'`,
        [userId, cal.providerCalendarId, mapped.providerEventId],
      );
    } else {
      await upsertEvent(mapped.row, cal.providerCalendarId, userZone);
      imported++;
    }
  }

  await queryOne(
    `insert into calendar_sync_state
       (calendar_id, sync_token, sync_token_at, last_full_sync_at, last_incremental_at, last_error, consecutive_errors, sync_mode)
     values ($1, $2, now(), $3, now(), null, 0, 'instances')
     on conflict (calendar_id) do update set
       sync_mode = 'instances',
       sync_token = excluded.sync_token,
       sync_token_at = now(),
       last_full_sync_at = coalesce(excluded.last_full_sync_at, calendar_sync_state.last_full_sync_at),
       last_incremental_at = now(),
       last_error = null,
       consecutive_errors = 0`,
    [cal.id, page.nextSyncToken ?? state?.sync_token ?? null, full ? new Date().toISOString() : null],
  );

  return { imported, deleted };
}

const EVENT_COLS = [
  'start_at',
  'end_at',
  'all_day',
  'time_zone',
  'status',
  'rrule',
  'recurrence_unsupported',
  'provider_event_id',
  'provider_recurring_event_id',
  'provider_etag',
  'provider_sequence',
  'remote_updated_at',
  'transparency',
  'response_status',
  'attendee_count',
  'provider_editable',
] as const;

async function upsertEvent(row: CalendarEventRow, providerCalendarId: string, userZone: string): Promise<void> {
  const values = EVENT_COLS.map((c) => row[c as keyof CalendarEventRow]);

  const setList = EVENT_COLS.map((c, i) => `${c} = $${i + 3}`).join(', ');
  const updated = await queryOne<{ id: string }>(
    // Blanking the content columns scrubs rows synced before content stopped
    // being stored (see map.ts).
    `update calendar_events set ${setList}, title = '', description = null, location = null,
            conference_url = null, deleted_at = null, sync_state = 'synced'
      where calendar_id = $1 and provider_event_id = $2 and origin = 'imported'
      returning id`,
    [row.calendar_id, row.provider_event_id, ...values],
  );
  if (updated) return;

  // Our own block pushed to Google (push.ts) comes back in the feed: it is
  // already here under its own origin, live or deleted. Never import it. If it
  // was moved in Google, the new time is the latest word: the etag says so.
  // The row's calendar_id is the calendar its copy lives on, whichever one the
  // block was sent to, so this holds for copies outside the primary calendar too.
  // Matched by Google's calendar id, not our calendars row: the same Google
  // calendar listed under two connected accounts has two rows, and the copy
  // must not come back in through the other one.
  const ours = await queryOne<{
    id: string;
    provider_etag: string | null;
    deleted_at: Date | null;
    task_id: string | null;
    habit_id: string | null;
    origin: string;
    flexibility: string | null;
  }>(
    `select e.id, e.provider_etag, e.deleted_at, e.task_id, e.habit_id, e.origin, e.flexibility
       from calendar_events e join calendars c on c.id = e.calendar_id
      where e.user_id = $1 and c.user_id = $1 and c.provider_calendar_id = $2 and e.provider_event_id = $3
        and e.origin <> 'imported' limit 1`,
    [row.user_id, providerCalendarId, row.provider_event_id],
  );
  if (ours) {
    if (!ours.deleted_at && ours.provider_etag !== row.provider_etag) {
      await query(`update calendar_events set start_at = $2, end_at = $3, provider_etag = $4 where id = $1`, [
        ours.id,
        row.start_at,
        row.end_at,
        row.provider_etag,
      ]);
      // Moved in Google: free/busy depends on how far away it is now
      // (push.ts copyTransparency). Rewrite the copy when Google's no longer matches.
      const want = copyTransparency({ ...ours, start_at: new Date(row.start_at) }, wallClockNow(userZone));
      if (want !== row.transparency) await pushEvent(row.user_id, ours.id);
    }
    return;
  }

  const cols = ['id', 'user_id', 'calendar_id', 'connected_account_id', 'title', 'item_type', 'category', 'origin', 'flexibility', 'sync_state', ...EVENT_COLS];
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  await queryOne(
    `insert into calendar_events (${cols.join(', ')}) values (${ph}) returning id`,
    [
      `evt_${randomUUID()}`,
      row.user_id,
      row.calendar_id,
      row.connected_account_id,
      '',
      'event',
      'other',
      'imported',
      'fixed',
      'synced',
      ...values,
    ],
  );
}
