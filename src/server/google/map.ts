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

/** Literal `YYYY-MM-DDTHH:MM:SS` prefix of an RFC3339 string, re-stamped as Z. */
function literalAsZ(dateTime: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(dateTime);
  return m ? `${m[1]}T${m[2]}.000Z` : null;
}

/**
 * Google returns a timed event as a true instant carrying a real offset
 * (`2026-09-09T09:00:00+02:00`). Everything downstream reads an ISO string as
 * *wall-clock* — `api-adapter.ts` slices `HH:MM` straight out of it — so we must
 * store the event's local clock re-stamped as `Z`, exactly like the all-day
 * branch below. Storing the raw offset lets the `timestamptz` column normalise
 * it to `07:00Z`, which renders a 09:00 Berlin meeting two hours early and lets
 * the find-time placer book straight over it.
 */
function wallClockIso(dateTime: string, zone: string | undefined): string {
  // With no IANA zone the offset in the string already states the local clock,
  // so the literal prefix is precisely the wall-clock we want.
  if (!zone) return literalAsZ(dateTime) ?? dateTime;

  const ms = Date.parse(dateTime);
  if (!Number.isFinite(ms)) return literalAsZ(dateTime) ?? dateTime;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(ms);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`;
  } catch {
    // Unknown IANA zone — fall back to the offset already in the string.
    return literalAsZ(dateTime) ?? dateTime;
  }
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
    const zone = g.start?.timeZone ?? g.end?.timeZone;
    const rawStart = g.start?.dateTime ?? new Date().toISOString();
    const rawEnd = g.end?.dateTime ?? new Date(Date.parse(rawStart) + 3600_000).toISOString();
    startAt = wallClockIso(rawStart, zone);
    endAt = wallClockIso(rawEnd, g.end?.timeZone ?? zone);
    timeZone = zone ?? 'UTC';
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
