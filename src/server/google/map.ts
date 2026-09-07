import type { GEvent } from './calendar';

/**
 * Google `events` resource -> a `calendar_events` row (db/003). Pure; see
 * map.check.mjs.
 *
 * Deliberately lossy for v1 (pull-only, read-only in Find Time):
 *  - category is always 'other' (Google has no field that maps cleanly)
 *  - flexibility is 'fixed' (imported meetings are not the scheduler's to move)
 *  - recurring events are stored as the series master with `recurrence_unsupported`
 *    = true; occurrences are NOT expanded (schema has the flag, recurrence.ts
 *    honours it). `singleEvents=false` on the API call keeps this one row per series.
 */

export type CalendarEventRow = {
  user_id: string;
  calendar_id: string;
  connected_account_id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string;
  all_day: boolean;
  time_zone: string;
  status: 'confirmed' | 'tentative' | 'cancelled';
  rrule: string | null;
  recurrence_unsupported: boolean;
  provider_event_id: string;
  provider_recurring_event_id: string | null;
  provider_etag: string | null;
  provider_sequence: number | null;
  remote_updated_at: string | null;
};

export type MapResult =
  | { providerEventId: string; deleted: true }
  | { providerEventId: string; deleted: false; row: CalendarEventRow };

const DAY_MS = 86_400_000;

function rruleOf(recurrence: string[] | undefined): string | null {
  const line = recurrence?.find((r) => r.startsWith('RRULE:'));
  return line ? line.slice('RRULE:'.length) : null;
}

export function toRow(
  g: GEvent,
  ctx: { userId: string; calendarId: string; connectedAccountId: string },
): MapResult {
  if (g.status === 'cancelled') return { providerEventId: g.id, deleted: true };

  const allDay = Boolean(g.start?.date);
  let startAt: string;
  let endAt: string;
  let timeZone: string;

  if (allDay) {
    // Google all-day: start.date inclusive, end.date exclusive. Store as instants
    // and let the client read them as wall-clock (api-adapter slices the string).
    const s = g.start!.date!;
    startAt = `${s}T00:00:00.000Z`;
    const e = g.end?.date ?? new Date(Date.parse(`${s}T00:00:00.000Z`) + DAY_MS).toISOString().slice(0, 10);
    endAt = `${e}T00:00:00.000Z`;
    timeZone = g.start!.timeZone ?? 'UTC';
  } else {
    startAt = g.start?.dateTime ?? new Date().toISOString();
    endAt = g.end?.dateTime ?? new Date(Date.parse(startAt) + 3600_000).toISOString();
    timeZone = g.start?.timeZone ?? 'UTC';
  }

  return {
    providerEventId: g.id,
    deleted: false,
    row: {
      user_id: ctx.userId,
      calendar_id: ctx.calendarId,
      connected_account_id: ctx.connectedAccountId,
      title: g.summary?.trim() || '(no title)',
      description: g.description ?? null,
      location: g.location ?? null,
      start_at: startAt,
      end_at: endAt,
      all_day: allDay,
      time_zone: timeZone,
      status: g.status ?? 'confirmed',
      rrule: rruleOf(g.recurrence),
      recurrence_unsupported: Boolean(g.recurrence?.length),
      provider_event_id: g.id,
      provider_recurring_event_id: g.recurringEventId ?? null,
      provider_etag: g.etag ?? null,
      provider_sequence: g.sequence ?? null,
      remote_updated_at: g.updated ?? null,
    },
  };
}
