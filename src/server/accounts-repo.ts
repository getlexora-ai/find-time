import type { ApiAccount } from '@/lib/api-types';

import { query, queryOne, tx } from './db';
import { revokeAccount } from './google/oauth';

/**
 * Reads/writes for the "Calendars" section of the sidebar: connected Google
 * accounts, their calendars, and the read-enabled toggle. Server-only.
 */

export async function getUserProfile(
  userId: string,
): Promise<{ id: string; name: string; email: string } | null> {
  return queryOne<{ id: string; name: string; email: string }>(
    `select id, name, email from users where id = $1`,
    [userId],
  );
}

export async function listAccountsWithCalendars(userId: string): Promise<ApiAccount[]> {
  const accounts = await query<{
    id: string;
    email: string;
    display_name: string;
    accent_color: string;
    sync_status: string;
    sync_error: string | null;
    last_sync_at: Date | null;
  }>(
    `select id, email, display_name, accent_color, sync_status, sync_error, last_sync_at
       from connected_accounts
      where user_id = $1 and provider = 'google'
      order by "order", created_at`,
    [userId],
  );
  if (accounts.length === 0) return [];

  const cals = await query<{
    id: string;
    connected_account_id: string;
    provider_calendar_id: string;
    name: string;
    color: string;
    is_primary: boolean;
    read_enabled: boolean;
  }>(
    `select id, connected_account_id, provider_calendar_id, name, color, is_primary, read_enabled
       from calendars
      where user_id = $1
      order by is_primary desc, name`,
    [userId],
  );

  return accounts.map((a) => ({
    id: a.id,
    email: a.email,
    displayName: a.display_name,
    accentColor: a.accent_color,
    syncStatus: a.sync_status,
    syncError: a.sync_error,
    lastSyncAt: a.last_sync_at ? a.last_sync_at.toISOString() : null,
    calendars: cals
      .filter((c) => c.connected_account_id === a.id)
      .map((c) => ({
        id: c.id,
        providerCalendarId: c.provider_calendar_id,
        name: c.name,
        color: c.color,
        isPrimary: c.is_primary,
        readEnabled: c.read_enabled,
      })),
  }));
}

export async function accountBelongsTo(userId: string, accountId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `select id from connected_accounts where id = $1 and user_id = $2`,
    [accountId, userId],
  );
  return Boolean(row);
}

export async function deleteAccount(userId: string, accountId: string): Promise<boolean> {
  if (!(await accountBelongsTo(userId, accountId))) return false;
  await revokeAccount(accountId); // best-effort, never throws
  await tx(async (c) => {
    // connected_account_id is ON DELETE SET NULL on calendar_events, so drop the
    // imported rows explicitly before the account (and its calendars) go.
    await c.query(`delete from calendar_events where connected_account_id = $1`, [accountId]);
    await c.query(`delete from connected_accounts where id = $1`, [accountId]);
  });
  return true;
}

export async function setCalendarReadEnabled(
  userId: string,
  calendarId: string,
  enabled: boolean,
): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update calendars set read_enabled = $3 where id = $1 and user_id = $2 returning id`,
    [calendarId, userId, enabled],
  );
  if (!row) return false;
  // Hide/show its events immediately; a re-sync brings them back if re-enabled.
  if (!enabled) {
    await queryOne(
      `update calendar_events set deleted_at = now()
        where calendar_id = $1 and deleted_at is null returning id`,
      [calendarId],
    ).catch(() => {});
  }
  return true;
}
