import { randomUUID } from 'node:crypto';

import type { ApiEvent, EventInput } from '@/lib/api-types';

import { query, queryOne } from './db';

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
  project_label: string | null;
  description: string | null;
};

const COLS = `id, title, start_at, end_at, category, item_type, flexibility,
              origin, is_draft, project_label, description`;

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
    projectLabel: r.project_label,
    notes: r.description,
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
  return rows.map(toApi);
}

export async function createEvent(userId: string, input: EventInput): Promise<ApiEvent> {
  const row = await queryOne<Row>(
    `insert into calendar_events
       (id, user_id, title, start_at, end_at, time_zone, category, item_type,
        flexibility, origin, is_draft, project_label, description)
     values ($1,$2,$3,$4,$5,'Europe/Berlin',$6,$7,$8,$9,$10,$11,$12)
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
      input.projectLabel ?? null,
      input.notes ?? null,
    ],
  );
  return toApi(row!);
}

const PATCHABLE: Record<string, string> = {
  title: 'title',
  start: 'start_at',
  end: 'end_at',
  category: 'category',
  itemType: 'item_type',
  flexibility: 'flexibility',
  origin: 'origin',
  isDraft: 'is_draft',
  projectLabel: 'project_label',
  notes: 'description',
};

export async function updateEvent(
  userId: string,
  id: string,
  patch: Partial<EventInput>,
): Promise<ApiEvent | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (key in patch) {
      params.push((patch as Record<string, unknown>)[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (sets.length === 0) {
    return queryOne<Row>(
      `select ${COLS} from calendar_events where id = $1 and user_id = $2 and deleted_at is null`,
      [id, userId],
    ).then((r) => (r ? toApi(r) : null));
  }
  const row = await queryOne<Row>(
    `update calendar_events set ${sets.join(', ')}
     where id = $1 and user_id = $2 and deleted_at is null
     returning ${COLS}`,
    params,
  );
  return row ? toApi(row) : null;
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
