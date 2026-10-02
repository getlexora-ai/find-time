import { randomUUID } from 'node:crypto';

import type { ApiHabit } from '@/lib/api-types';

import { query, queryOne } from './db';

/**
 * Habits (db/020): "gym 3× a week" as a weekly target that "plan my week"
 * fills ahead, instead of one task that rolls forward when it is done
 * (docs/fluidcalendar-lessons.md, trap 18). A habit's sessions are ordinary
 * events carrying `calendar_events.habit_id`; this module never writes events
 * itself, except to link or retire them.
 */

export type { ApiHabit };

type Row = {
  id: string;
  title: string;
  category: string;
  duration_min: number;
  per_week: number;
  min_per_week: number | null;
  preferred_window: string | null;
};

const COLS = `id, title, category, duration_min, per_week, min_per_week, preferred_window`;

function toApi(r: Row): ApiHabit {
  return {
    id: r.id,
    title: r.title,
    category: r.category,
    durationMin: r.duration_min,
    perWeek: r.per_week,
    minPerWeek: r.min_per_week,
    preferredWindow: (r.preferred_window as ApiHabit['preferredWindow']) ?? null,
  };
}

export async function listHabits(userId: string): Promise<ApiHabit[]> {
  const rows = await query<Row>(
    `select ${COLS} from habits where user_id = $1 and active order by created_at asc`,
    [userId],
  );
  return rows.map(toApi);
}

/** One active habit by id, or null. */
export async function getHabit(userId: string, id: string): Promise<ApiHabit | null> {
  const row = await queryOne<Row>(`select ${COLS} from habits where id = $1 and user_id = $2 and active`, [id, userId]);
  return row ? toApi(row) : null;
}

export type HabitInput = {
  title: string;
  durationMin: number;
  perWeek: number;
  minPerWeek?: number | null;
  category?: string;
  preferredWindow?: ApiHabit['preferredWindow'];
};

export async function createHabit(userId: string, input: HabitInput): Promise<ApiHabit> {
  const row = await queryOne<Row>(
    `insert into habits (id, user_id, title, category, duration_min, per_week, preferred_window, min_per_week)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning ${COLS}`,
    [
      `hab_${randomUUID()}`,
      userId,
      input.title,
      input.category ?? 'personal',
      input.durationMin,
      input.perWeek,
      input.preferredWindow ?? null,
      input.minPerWeek ?? null,
    ],
  );
  return toApi(row!);
}

const PATCHABLE: Record<string, string> = {
  title: 'title',
  durationMin: 'duration_min',
  perWeek: 'per_week',
  minPerWeek: 'min_per_week',
  category: 'category',
  preferredWindow: 'preferred_window',
};

export async function updateHabit(
  userId: string,
  id: string,
  patch: Partial<HabitInput> & { active?: boolean },
): Promise<ApiHabit | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (key in patch) {
      params.push((patch as Record<string, unknown>)[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if ('active' in patch) {
    params.push(patch.active);
    sets.push(`active = $${params.length}`);
  }
  if (!sets.length) return null;
  sets.push('updated_at = now()');
  const row = await queryOne<Row>(
    `update habits set ${sets.join(', ')} where id = $1 and user_id = $2 returning ${COLS}`,
    params,
  );
  return row ? toApi(row) : null;
}

/** Active habits whose title contains `words`: exact match first. */
export async function findHabits(userId: string, words: string): Promise<ApiHabit[]> {
  const w = words.trim().toLowerCase();
  if (!w) return [];
  const rows = await query<Row>(
    `select ${COLS} from habits
      where user_id = $1 and active and lower(title) like '%' || $2 || '%'
      order by (lower(title) = $2) desc, created_at asc
      limit 5`,
    [userId, w.replace(/[%_\\]/g, (c) => `\\${c}`)],
  );
  return rows.map(toApi);
}

/**
 * Attach a block the client just created from an accepted proposal to its
 * habit — the same match as `linkBlockToTask`: the newest unlinked AI block
 * with that title at that start.
 */
export async function linkBlockToHabit(
  userId: string,
  habitId: string,
  match: { title: string; startISO: string },
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `update calendar_events set habit_id = $2
      where id = (
        select id from calendar_events
         where user_id = $1 and habit_id is null and task_id is null and deleted_at is null
           and origin = 'ai' and title = $3 and start_at = $4
           and created_at > now() - interval '1 hour'
         order by created_at desc limit 1)
      returning id`,
    [userId, habitId, match.title, match.startISO],
  );
  return row?.id ?? null;
}

/** Retire the block an accepted re-planned habit session replaces — the same habit's own block only. */
export async function retireReplacedHabitBlock(userId: string, eventId: string, habitId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update calendar_events set deleted_at = now()
      where id = $1 and user_id = $2 and habit_id = $3 and origin = 'ai' and deleted_at is null
      returning id`,
    [eventId, userId, habitId],
  );
  return Boolean(row);
}

/** Future sessions of a habit — what to clear when the user stops it. */
export async function futureHabitBlockIds(userId: string, habitId: string, nowISO: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select id from calendar_events
      where user_id = $1 and habit_id = $2 and deleted_at is null and start_at >= $3 and origin = 'ai'`,
    [userId, habitId, nowISO],
  );
  return rows.map((r) => r.id);
}
