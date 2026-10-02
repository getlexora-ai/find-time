import type { ApiAccount } from '@/lib/api-types';

import { query, queryOne, tx } from './db';
import { listCalendars } from './google/calendar';
import { getValidAccessToken, revokeAccount, userInfo } from './google/oauth';

/**
 * Reads/writes for the "Calendars" section of the sidebar: connected Google
 * accounts, their calendars, and the read-enabled toggle. Server-only.
 */

/**
 * The account's email and calendar names are not stored; with `live` they are
 * read from Google for this response (the settings screen). Without it — the
 * sync route only needs ids — they come back empty.
 */
export async function listAccountsWithCalendars(
  userId: string,
  opts: { live?: boolean } = {},
): Promise<ApiAccount[]> {
  const accounts = await query<{
    id: string;
    accent_color: string;
    sync_status: string;
    sync_error: string | null;
    last_sync_at: Date | null;
  }>(
    `select id, accent_color, sync_status, sync_error, last_sync_at
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
    color: string;
    is_primary: boolean;
    read_enabled: boolean;
  }>(
    `select id, connected_account_id, provider_calendar_id, color, is_primary, read_enabled
       from calendars
      where user_id = $1
      order by is_primary desc, created_at`,
    [userId],
  );

  const live = new Map(
    await Promise.all(accounts.map(async (a) => [a.id, opts.live ? await liveAccount(a.id) : null] as const)),
  );

  return accounts.map((a) => ({
    id: a.id,
    email: live.get(a.id)?.email ?? 'Google account',
    displayName: live.get(a.id)?.name ?? '',
    accentColor: a.accent_color,
    syncStatus: a.sync_status,
    syncError: a.sync_error,
    lastSyncAt: a.last_sync_at ? a.last_sync_at.toISOString() : null,
    calendars: cals
      .filter((c) => c.connected_account_id === a.id)
      .map((c) => ({
        id: c.id,
        providerCalendarId: c.provider_calendar_id,
        name: live.get(a.id)?.calendars.get(c.provider_calendar_id) ?? 'Calendar',
        color: c.color,
        isPrimary: c.is_primary,
        readEnabled: c.read_enabled,
      })),
  }));
}

/** Email, name and calendar names straight from Google; null when Google can't answer. */
async function liveAccount(
  accountId: string,
): Promise<{ email: string; name: string; calendars: Map<string, string> } | null> {
  try {
    const token = await getValidAccessToken(accountId);
    const [me, cals] = await Promise.all([userInfo(token), listCalendars(token)]);
    return {
      email: me.email,
      name: me.name,
      calendars: new Map(cals.map((c) => [c.id, c.summaryOverride || c.summary || c.id])),
    };
  } catch (err) {
    console.warn(`[accounts] live info for ${accountId}:`, err instanceof Error ? err.message : err);
    return null;
  }
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
  // Hide its events immediately. On re-enable, drop the sync token so the next
  // sync is a full one — an incremental sync only returns changed events, so the
  // hidden ones would never come back.
  if (!enabled) {
    await queryOne(
      `update calendar_events set deleted_at = now()
        where calendar_id = $1 and deleted_at is null returning id`,
      [calendarId],
    ).catch(() => {});
  } else {
    await queryOne(
      `update calendar_sync_state set sync_token = null where calendar_id = $1 returning calendar_id`,
      [calendarId],
    );
  }
  return true;
}
