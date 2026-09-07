import { randomUUID } from 'node:crypto';

import { queryOne } from '../db';
import { collectEvents, listCalendars, SyncTokenExpired } from './calendar';
import { getValidAccessToken } from './oauth';
import { toRow, type CalendarEventRow } from './map';

/**
 * Pull-only Google Calendar sync. Called after connect and on the calendar
 * screen's mount (throttled by the /api/calendar/sync route).
 *
 * ponytail: on-demand pull only. The upgrade path is a `sync_state='pending_push'`
 * worklist pushed back with `If-Match: <etag>`, `events.watch` channels
 * (calendar_sync_state.channel_*), and a scheduled worker. None of that here.
 */

const FULL_SYNC_LOOKBACK_DAYS = 60;
const READ_ROLES = new Set(['owner', 'writer', 'reader']);

export type SyncResult = { imported: number; deleted: number; calendars: number };

export async function syncAccount(userId: string, accountId: string): Promise<SyncResult> {
  try {
    const token = await getValidAccessToken(accountId);
    const calendars = await upsertCalendars(userId, accountId, token);

    let imported = 0;
    let deleted = 0;
    for (const cal of calendars) {
      if (!cal.readEnabled) continue;
      const r = await syncCalendar(userId, accountId, cal, token);
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
    const name = c.summaryOverride || c.summary || c.id;
    const existing = await queryOne<{ id: string; read_enabled: boolean }>(
      `select id, read_enabled from calendars
        where connected_account_id = $1 and provider_calendar_id = $2`,
      [accountId, c.id],
    );
    const id = existing?.id ?? `cal_${randomUUID()}`;
    await queryOne(
      `insert into calendars
         (id, user_id, connected_account_id, provider_calendar_id, name, is_primary, color)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (connected_account_id, provider_calendar_id) do update set
         name = excluded.name, is_primary = excluded.is_primary
       returning id`,
      [id, userId, accountId, c.id, name, Boolean(c.primary), c.backgroundColor ?? 'lime'],
    );
    rows.push({ id, providerCalendarId: c.id, readEnabled: existing?.read_enabled ?? true });
  }
  return rows;
}

async function syncCalendar(
  userId: string,
  accountId: string,
  cal: CalRow,
  token: string,
): Promise<{ imported: number; deleted: number }> {
  const state = await queryOne<{ sync_token: string | null }>(
    `select sync_token from calendar_sync_state where calendar_id = $1`,
    [cal.id],
  );

  const timeMin = new Date(Date.now() - FULL_SYNC_LOOKBACK_DAYS * 86_400_000).toISOString();
  let full = !state?.sync_token;
  let page: Awaited<ReturnType<typeof collectEvents>>;
  try {
    page = await collectEvents(token, cal.providerCalendarId, {
      syncToken: state?.sync_token ?? undefined,
      timeMin,
    });
  } catch (err) {
    if (!(err instanceof SyncTokenExpired)) throw err;
    full = true;
    page = await collectEvents(token, cal.providerCalendarId, { timeMin });
  }

  let imported = 0;
  let deleted = 0;
  for (const g of page.events) {
    const mapped = toRow(g, { userId, calendarId: cal.id, connectedAccountId: accountId });
    if (mapped.deleted) {
      const res = await queryOne<{ id: string }>(
        `update calendar_events set deleted_at = now(), sync_state = 'synced'
          where calendar_id = $1 and provider_event_id = $2 and deleted_at is null
          returning id`,
        [cal.id, mapped.providerEventId],
      );
      if (res) deleted++;
    } else {
      await upsertEvent(mapped.row);
      imported++;
    }
  }

  await queryOne(
    `insert into calendar_sync_state
       (calendar_id, sync_token, sync_token_at, last_full_sync_at, last_incremental_at, last_error, consecutive_errors)
     values ($1, $2, now(), $3, now(), null, 0)
     on conflict (calendar_id) do update set
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
  'title',
  'description',
  'location',
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
] as const;

async function upsertEvent(row: CalendarEventRow): Promise<void> {
  const values = EVENT_COLS.map((c) => row[c as keyof CalendarEventRow]);

  const setList = EVENT_COLS.map((c, i) => `${c} = $${i + 3}`).join(', ');
  const updated = await queryOne<{ id: string }>(
    `update calendar_events set ${setList}, deleted_at = null, sync_state = 'synced'
      where calendar_id = $1 and provider_event_id = $2
      returning id`,
    [row.calendar_id, row.provider_event_id, ...values],
  );
  if (updated) return;

  const cols = ['id', 'user_id', 'calendar_id', 'connected_account_id', 'item_type', 'category', 'origin', 'flexibility', 'sync_state', ...EVENT_COLS];
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  await queryOne(
    `insert into calendar_events (${cols.join(', ')}) values (${ph}) returning id`,
    [
      `evt_${randomUUID()}`,
      row.user_id,
      row.calendar_id,
      row.connected_account_id,
      'event',
      'other',
      'imported',
      'fixed',
      'synced',
      ...values,
    ],
  );
}
