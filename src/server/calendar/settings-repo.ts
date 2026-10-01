import type { CalendarSettings } from '@/lib/api-types';

import { query, queryOne } from '../db';
import { DEFAULT_WORK_HOURS } from '../ai/preferences';

/**
 * The calendar's settings live on `scheduler_profiles` (db/019) next to the
 * working hours the AI plans with, so the grid and the AI read one source and
 * every device shows the same thing.
 */

const WRITE_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type Row = {
  timezone: string | null;
  work_hours: Record<string, { start: number; end: number } | null> | null;
  day_window: { start?: number; end?: number } | null;
  week_start: number | null;
  clock24: boolean | null;
  week_target_h: string | null;
  focus_goal_h: string | null;
  push_focus: boolean | null;
};

export async function getSettings(userId: string): Promise<CalendarSettings> {
  const row = await queryOne<Row>(
    `select timezone, work_hours, day_window, week_start, clock24, week_target_h, focus_goal_h, push_focus
       from scheduler_profiles where user_id = $1`,
    [userId],
  );
  const scopes = await query<{ scope: string | null }>(
    `select t.scope from oauth_tokens t
       join connected_accounts a on a.id = t.connected_account_id
      where a.user_id = $1`,
    [userId],
  );
  const wh = row?.work_hours && Object.keys(row.work_hours).length ? row.work_hours : DEFAULT_WORK_HOURS;
  return {
    timezone: row?.timezone || 'Europe/Berlin',
    window: { start: row?.day_window?.start ?? 6, end: row?.day_window?.end ?? 22 },
    workHours: Object.fromEntries(DAYS.map((d) => [d, d in wh ? wh[d] ?? null : null])),
    weekStart: row?.week_start === 0 ? 0 : 1,
    clock24: row?.clock24 ?? true,
    weekTargetH: row?.week_target_h != null ? Number(row.week_target_h) : null,
    focusGoalH: row?.focus_goal_h != null ? Number(row.focus_goal_h) : null,
    pushFocus: row?.push_focus ?? false,
    canWriteGoogle: scopes.some((s) => (s.scope ?? '').split(' ').includes(WRITE_SCOPE)),
  };
}

const isHour = (n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 24;

/** Validate a patch; returns an error message or null. */
export function checkPatch(p: Partial<CalendarSettings>): string | null {
  if (p.timezone !== undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: p.timezone });
    } catch {
      return 'Unknown time zone.';
    }
  }
  if (p.window !== undefined) {
    const { start, end } = p.window;
    if (!isHour(start) || !isHour(end) || end - start < 4) return 'Your hours must span at least 4 hours.';
  }
  if (p.workHours !== undefined) {
    for (const [k, v] of Object.entries(p.workHours)) {
      if (!(DAYS as readonly string[]).includes(k)) return `Unknown day ${k}.`;
      if (v && (!isHour(v.start) || !isHour(v.end) || v.end <= v.start)) return `Working hours for ${k} must end after they start.`;
    }
  }
  if (p.weekStart !== undefined && p.weekStart !== 0 && p.weekStart !== 1) return 'Week starts Monday (1) or Sunday (0).';
  for (const k of ['weekTargetH', 'focusGoalH'] as const) {
    const v = p[k];
    if (v !== undefined && v !== null && (typeof v !== 'number' || v < 0 || v > 168)) return `${k} must be 0–168 hours.`;
  }
  return null;
}

export async function patchSettings(userId: string, p: Partial<CalendarSettings>): Promise<void> {
  const cols: string[] = [];
  const vals: unknown[] = [];
  const add = (col: string, v: unknown, cast = '') => {
    vals.push(v);
    cols.push(`${col} = $${vals.length + 1}${cast}`);
  };
  if (p.timezone !== undefined) add('timezone', p.timezone);
  if (p.window !== undefined) add('day_window', JSON.stringify(p.window), '::jsonb');
  if (p.workHours !== undefined) add('work_hours', JSON.stringify(p.workHours), '::jsonb');
  if (p.weekStart !== undefined) add('week_start', p.weekStart);
  if (p.clock24 !== undefined) add('clock24', p.clock24);
  if (p.weekTargetH !== undefined) add('week_target_h', p.weekTargetH);
  if (p.focusGoalH !== undefined) add('focus_goal_h', p.focusGoalH);
  if (p.pushFocus !== undefined) add('push_focus', p.pushFocus);
  if (!cols.length) return;

  await queryOne(`insert into scheduler_profiles (user_id) values ($1) on conflict (user_id) do nothing returning user_id`, [
    userId,
  ]);
  const before = p.timezone !== undefined ? await queryOne<{ timezone: string }>(
    `select timezone from scheduler_profiles where user_id = $1`,
    [userId],
  ) : null;
  await queryOne(`update scheduler_profiles set ${cols.join(', ')} where user_id = $1 returning user_id`, [userId, ...vals]);

  // A new zone changes every Google time's wall-clock: re-sync each calendar in
  // full on its next pull (sync.ts treats a non-'instances' mode as "re-sync").
  if (before && before.timezone !== p.timezone) {
    await query(
      `update calendar_sync_state s set sync_token = null, sync_mode = 'resync'
         from calendars c where c.id = s.calendar_id and c.user_id = $1`,
      [userId],
    );
  }
}
