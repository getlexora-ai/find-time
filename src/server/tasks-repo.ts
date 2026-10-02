import { randomUUID } from 'node:crypto';

import type { ApiTask } from '@/lib/api-types';

import { query, queryOne } from './db';

/**
 * The backlog "plan my week" works from: the `tasks` table (db/002), until now
 * created but never read. A task's calendar blocks are ordinary events carrying
 * `calendar_events.task_id`; this module never writes events itself.
 */

export type { ApiTask };

type Row = {
  id: string;
  title: string;
  status: string;
  duration_min: number;
  due_by: Date | null;
  prefer_by: Date | null;
  not_before: Date | null;
  priority: string;
  effort: string;
  preferred_window: string | null;
  splittable: boolean;
  min_chunk_min: number;
  category: string;
  completed_at: Date | null;
};

const COLS = `id, title, status, duration_min, due_by, prefer_by, not_before, priority, effort, preferred_window,
              splittable, min_chunk_min, category, completed_at`;

/** Statuses still waiting for time. */
const OPEN = ['backlog', 'scheduled', 'in-progress'];

function toApi(r: Row): ApiTask {
  return {
    id: r.id,
    title: r.title,
    status: r.status as ApiTask['status'],
    durationMin: r.duration_min,
    dueBy: r.due_by ? r.due_by.toISOString() : null,
    preferBy: r.prefer_by ? r.prefer_by.toISOString() : null,
    notBefore: r.not_before ? r.not_before.toISOString() : null,
    priority: r.priority as ApiTask['priority'],
    effort: (r.effort as ApiTask['effort']) ?? 'normal',
    preferredWindow: (r.preferred_window as ApiTask['preferredWindow']) ?? null,
    splittable: r.splittable,
    minChunkMin: r.min_chunk_min,
    category: r.category,
    completedAt: r.completed_at ? r.completed_at.toISOString() : null,
  };
}

export async function listOpenTasks(userId: string): Promise<ApiTask[]> {
  const rows = await query<Row>(
    `select ${COLS} from tasks
      where user_id = $1 and status = any($2::text[])
      order by due_by asc nulls last, created_at asc`,
    [userId, OPEN],
  );
  return rows.map(toApi);
}

/** One task by id, any status, or null. */
export async function getTask(userId: string, id: string): Promise<ApiTask | null> {
  const row = await queryOne<Row>(`select ${COLS} from tasks where id = $1 and user_id = $2`, [id, userId]);
  return row ? toApi(row) : null;
}

export type TaskInput = {
  title: string;
  durationMin: number;
  dueBy?: string | null;
  preferBy?: string | null;
  notBefore?: string | null;
  priority?: ApiTask['priority'];
  effort?: ApiTask['effort'];
  preferredWindow?: ApiTask['preferredWindow'];
  splittable?: boolean;
  minChunkMin?: number;
  category?: string;
};

export async function createTask(userId: string, input: TaskInput): Promise<ApiTask> {
  const row = await queryOne<Row>(
    `insert into tasks
       (id, user_id, title, duration_min, due_by, prefer_by, priority, preferred_window,
        splittable, min_chunk_min, category, not_before, effort)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     returning ${COLS}`,
    [
      `tsk_${randomUUID()}`,
      userId,
      input.title,
      input.durationMin,
      input.dueBy ?? null,
      input.preferBy ?? null,
      input.priority ?? 'medium',
      input.preferredWindow ?? null,
      input.splittable ?? false,
      input.minChunkMin ?? 30,
      input.category ?? 'deep-work',
      input.notBefore ?? null,
      input.effort ?? 'normal',
    ],
  );
  return toApi(row!);
}

const PATCHABLE: Record<string, string> = {
  title: 'title',
  durationMin: 'duration_min',
  dueBy: 'due_by',
  preferBy: 'prefer_by',
  notBefore: 'not_before',
  priority: 'priority',
  effort: 'effort',
  preferredWindow: 'preferred_window',
  splittable: 'splittable',
  minChunkMin: 'min_chunk_min',
  category: 'category',
  status: 'status',
};

export async function updateTask(
  userId: string,
  id: string,
  patch: Partial<TaskInput> & { status?: ApiTask['status'] },
): Promise<ApiTask | null> {
  const sets: string[] = [];
  const params: unknown[] = [id, userId];
  for (const [key, col] of Object.entries(PATCHABLE)) {
    if (key in patch) {
      params.push((patch as Record<string, unknown>)[key]);
      sets.push(`${col} = $${params.length}`);
    }
  }
  if (patch.status === 'done') sets.push('completed_at = coalesce(completed_at, now())');
  else if (patch.status) sets.push('completed_at = null');
  if (!sets.length) return null;
  const row = await queryOne<Row>(
    `update tasks set ${sets.join(', ')} where id = $1 and user_id = $2 returning ${COLS}`,
    params,
  );
  return row ? toApi(row) : null;
}

/**
 * Open tasks whose title contains `words` — how "done with the report" finds
 * its task. Exact matches first, then the closest-due.
 */
export async function findOpenTasks(userId: string, words: string): Promise<ApiTask[]> {
  const w = words.trim().toLowerCase();
  if (!w) return [];
  const rows = await query<Row>(
    `select ${COLS} from tasks
      where user_id = $1 and status = any($2::text[]) and lower(title) like '%' || $3 || '%'
      order by (lower(title) = $3) desc, due_by asc nulls last, created_at asc
      limit 5`,
    [userId, OPEN, w.replace(/[%_\\]/g, (c) => `\\${c}`)],
  );
  return rows.map(toApi);
}

/**
 * Attach a block the client just created from an accepted proposal to its
 * task. The client creates the event itself (cal-store), so the server finds
 * it by what it knows: the newest of this user's AI blocks with that title at
 * that start, not yet linked. Returns the event id, or null if none matched.
 */
export async function linkBlockToTask(
  userId: string,
  taskId: string,
  match: { title: string; startISO: string },
): Promise<string | null> {
  const row = await queryOne<{ id: string }>(
    `update calendar_events set task_id = $2
      where id = (
        select id from calendar_events
         where user_id = $1 and task_id is null and deleted_at is null
           and origin = 'ai' and title = $3 and start_at = $4
           and created_at > now() - interval '1 hour'
         order by created_at desc limit 1)
      returning id`,
    [userId, taskId, match.title, match.startISO],
  );
  if (!row) return null;
  await query(
    `update tasks set status = 'scheduled', scheduled_event_id = coalesce(scheduled_event_id, $3)
      where id = $1 and user_id = $2 and status = 'backlog'`,
    [taskId, userId, row.id],
  );
  return row.id;
}

/**
 * Future, undone blocks of a task — what to clear when the task is finished,
 * or (with `beforeISO`) the ones a postpone leaves too early.
 */
export async function futureBlockIds(userId: string, taskId: string, nowISO: string, beforeISO?: string): Promise<string[]> {
  const rows = await query<{ id: string }>(
    `select id from calendar_events
      where user_id = $1 and task_id = $2 and deleted_at is null and start_at >= $3 and origin = 'ai'
        and ($4::timestamptz is null or start_at < $4)`,
    [userId, taskId, nowISO, beforeISO ?? null],
  );
  return rows.map((r) => r.id);
}

/**
 * Retire the block an accepted re-planned session replaces. Scoped to the same
 * task and to Find Time's own blocks, so a stale id can never delete anything
 * else.
 */
export async function retireReplacedBlock(userId: string, eventId: string, taskId: string): Promise<boolean> {
  const row = await queryOne<{ id: string }>(
    `update calendar_events set deleted_at = now()
      where id = $1 and user_id = $2 and task_id = $3 and origin = 'ai' and deleted_at is null
      returning id`,
    [eventId, userId, taskId],
  );
  return Boolean(row);
}
