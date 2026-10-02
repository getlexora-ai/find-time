import { randomUUID } from 'node:crypto';

import type { ApiEvent, EventInput } from '@/lib/api-types';

import { query, queryOne } from './db';
import { BUSY, liveDetails } from './google/live-details';

export type { ApiEvent, EventInput };

type Row = {
  id: string;
  title: string;
  start_at: Date;
  end_at: Date;
  category: string;
  item_type: string;
  flexibility: string;
  origin: string;
  is_draft: boolean;
  rrule: string | null;
  project_label: string | null;
  description: string | null;
  calendar_id: string | null;
  all_day: boolean;
  location: string | null;
  transparency: string;
  response_status: string | null;
  conference_url: string | null;
  attendee_count: number | null;
  done_at: Date | null;
  exdates: Date[] | null;
  recurrence_parent_id: string | null;
  task_id: string | null;
  habit_id: string | null;
  provider_event_id: string | null;
};

const COLS = `id, title, start_at, end_at, category, item_type, flexibility,
              origin, is_draft, rrule, project_label, description,
              calendar_id, all_day, location, transparency, response_status,
              conference_url, attendee_count, done_at, exdates, recurrence_parent_id, task_id, habit_id,
              provider_event_id`;

/**
 * Imported rows carry no content (google/map.ts); fill title, notes, location
 * and video link from Google for this response only.
 */
async function withDetails(userId: string, rows: Row[]): Promise<Row[]> {
  const imported = rows.filter((r) => r.origin === 'imported' && r.calendar_id && r.provider_event_id);
  if (imported.length === 0) return rows;
  const live = await liveDetails(
    userId,
    imported.map((r) => ({
      calendarId: r.calendar_id!,
      providerEventId: r.provider_event_id!,
      start: r.start_at,
      end: r.end_at,
    })),
  );
  return rows.map((r) =>
    imported.includes(r) ? { ...r, ...(live.get(`${r.calendar_id}:${r.provider_event_id}`) ?? BUSY) } : r,
  );
}

function toApi(r: Row): ApiEvent {
  return {
    id: r.id,
    title: r.title,
    start: r.start_at.toISOString(),
    end: r.end_at.toISOString(),
    category: r.category,
    itemType: r.item_type,
    flexibility: r.flexibility,
    origin: r.origin,
    isDraft: r.is_draft,
    rrule: r.rrule,
    projectLabel: r.project_label,
    notes: r.description,
    calendarId: r.calendar_id,
    allDay: r.all_day,
    location: r.location,
    free: r.transparency === 'transparent',
    rsvp: (r.response_status as ApiEvent['rsvp']) ?? null,
    videoUrl: r.conference_url,
    guests: r.attendee_count,
    done: r.done_at != null,
    // Wall-clock dates (see api-adapter.ts): the date part of each instant.
    exdates: (r.exdates ?? []).map((d) => d.toISOString().slice(0, 10)),
    seriesId: r.recurrence_parent_id,
    taskId: r.task_id,
    habitId: r.habit_id,
  };
}

export async function listEvents(
  userId: string,
  from?: string,
  to?: string,
): Promise<ApiEvent[]> {
  const where = ['user_id = $1', 'deleted_at is null'];
  const params: unknown[] = [userId];
  if (from) {
    params.push(from);
    where.push(`end_at >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    where.push(`start_at < $${params.length}`);
  }
  const rows = await query<Row>(
    `select ${COLS} from calendar_events where ${where.join(' and ')} order by start_at`,
    params,
  );
  return (await withDetails(userId, rows)).map(toApi);
}

export async function createEvent(userId: string, input: EventInput): Promise<ApiEvent> {
  const row = await queryOne<Row>(
    `insert into calendar_events
       (id, user_id, title, start_at, end_at, time_zone, category, item_type,
        flexibility, origin, is_draft, rrule, project_label, description,
        all_day, recurrence_parent_id, exdates)
     values ($1,$2,$3,$4,$5,
             coalesce((select timezone from scheduler_profiles where user_id = $2), 'Europe/Berlin'),
             $6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::timestamptz[])
     returning ${COLS}`,
    [
      `evt_${randomUUID()}`,
      userId,
      input.title,
      input.start,
      input.end,
      input.category ?? 'other',
      input.itemType ?? 'event',
      input.flexibility ?? 'flexible',
      input.origin ?? 'manual',
      input.isDraft ?? false,
      input.rrule ?? null,
      input.projectLabel ?? null,
      input.notes ?? null,
      input.allDay ?? false,
      input.seriesId ?? null,
      (input.exdates ?? []).map(dateToInstant),
    ],
  );
  return toApi(row!);
}

/** 'YYYY-MM-DD' → the wall-clock midnight instant exdates are keyed by. */
const dateToInstant = (d: string) => `${d.slice(0, 10)}T00:00:00.000Z`;

const PATCHABLE: Record<string, string> = {
  title: 'title',
  start: 'start_at',
  end: 'end_at',
  category: 'category',
  itemType: 'item_type',
  flexibility: 'flexibility',
  origin: 'origin',
  isDraft: 'is_draft',
  rrule: 'rrule',
  projectLabel: 'project_label',
  notes: 'description',
  allDay: 'all_day',
};

/** An event's origin, or null when it does not exist for this user. */
export async function getEventOrigin(userId: string, id: string): Promise<string | null> {
  const row = await queryOne<{ origin: string }>(
    `select origin from calendar_events where id = $1 and user_id = $2 and deleted_at is null`,
    [id, userId],
  );
  return row?.origin ?? null;
}

export async function updateEvent(
  userId: string,
  id: string,
  patch: Partial<EventInput>,
): Promise<ApiEvent | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  /** the placeholder each patched field went into */
  const ref: Record<string, string> = {};
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (key in patch) {
      params.push((patch as Record<string, unknown>)[key]);
      ref[key] = `$${params.length}`;
      sets.push(`${col} = ${ref[key]}`);
    }
  }
  // Moving a task or habit session by hand pins it: "plan my week" keeps a
  // block the user put somewhere themselves (docs/fluidcalendar-lessons.md,
  // pin-on-drag). Only when the time really changed, and only when the patch
  // doesn't set flexibility itself. Postgres reads the old row on the right of
  // SET, so the comparison is against where the block was.
  if (('start' in patch || 'end' in patch) && !('flexibility' in patch)) {
    const startRef = ref.start ? `${ref.start}::timestamptz` : 'start_at';
    const endRef = ref.end ? `${ref.end}::timestamptz` : 'end_at';
    sets.push(
      `flexibility = case when (task_id is not null or habit_id is not null) and origin = 'ai'
                           and (start_at is distinct from ${startRef} or end_at is distinct from ${endRef})
                          then 'fixed' else flexibility end`,
    );
  }
  // Not plain columns: `done` is a timestamp, `exdates` an instant array.
  if ('done' in patch) sets.push(patch.done ? 'done_at = coalesce(done_at, now())' : 'done_at = null');
  if ('exdates' in patch) {
    params.push((patch.exdates ?? []).map(dateToInstant));
    sets.push(`exdates = $${params.length}::timestamptz[]`);
  }
  if (sets.length === 0) {
    return queryOne<Row>(
      `select ${COLS} from calendar_events where id = $1 and user_id = $2 and deleted_at is null`,
      [id, userId],
    ).then(async (r) => (r ? toApi((await withDetails(userId, [r]))[0]) : null));
  }
  const row = await queryOne<Row>(
    `update calendar_events set ${sets.join(', ')}
     where id = $1 and user_id = $2 and deleted_at is null
     returning ${COLS}`,
    params,
  );
  return row ? toApi((await withDetails(userId, [row]))[0]) : null;
}

export async function deleteEvent(userId: string, id: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update calendar_events set deleted_at = now()
     where id = $1 and user_id = $2 and deleted_at is null
     returning id`,
    [id, userId],
  );
  return Boolean(row);
}
