import { deleteEvent } from './events-repo';
import { type ApiHabit, futureHabitBlockIds, updateHabit } from './habits-repo';
import { type ApiTask, futureBlockIds, updateTask } from './tasks-repo';

/**
 * What finishing, postponing or stopping does to the calendar, in one place,
 * so the chat ("done with the report") and the Tasks screen behave the same.
 * Each clears the item's own future Find Time blocks that no longer make
 * sense — never anything imported or someone else's. Returns how many went.
 */

async function clear(userId: string, ids: string[]): Promise<number> {
  let n = 0;
  for (const id of ids) if (await deleteEvent(userId, id).catch(() => false)) n++;
  return n;
}

/** Mark a task done; its upcoming sessions stop holding time. */
export async function finishTask(userId: string, task: ApiTask, nowISO: string): Promise<{ task: ApiTask | null; cleared: number }> {
  const updated = await updateTask(userId, task.id, { status: 'done' });
  const cleared = await clear(userId, await futureBlockIds(userId, task.id, nowISO));
  return { task: updated, cleared };
}

/** Hold a task until `atISO`; its sessions before then come off the calendar. */
export async function postponeTask(
  userId: string,
  task: ApiTask,
  atISO: string,
  nowISO: string,
): Promise<{ task: ApiTask | null; cleared: number }> {
  const updated = await updateTask(userId, task.id, { notBefore: atISO });
  const cleared = await clear(userId, await futureBlockIds(userId, task.id, nowISO, atISO));
  return { task: updated, cleared };
}

/** Stop a habit; its upcoming sessions come off the calendar, past ones stay as history. */
export async function stopHabit(userId: string, habit: ApiHabit, nowISO: string): Promise<{ cleared: number }> {
  await updateHabit(userId, habit.id, { active: false });
  return { cleared: await clear(userId, await futureHabitBlockIds(userId, habit.id, nowISO)) };
}

/** Postpone presets, as the Tasks screen offers them (FluidCalendar's 1h / 3h / 1d / 1w). */
export const POSTPONE_PRESETS = ['1h', '3h', 'tomorrow', 'next-week'] as const;
export type PostponePreset = (typeof POSTPONE_PRESETS)[number];

const MIN = 60_000;
const DAY = 86_400_000;

/** The instant a preset postpones to, on the wall-clock calendar. */
export function presetInstant(preset: PostponePreset, nowMs: number): number {
  const today = Math.floor(nowMs / DAY) * DAY;
  if (preset === '1h' || preset === '3h') {
    const h = preset === '1h' ? 1 : 3;
    return Math.ceil((nowMs + h * 60 * MIN) / (15 * MIN)) * 15 * MIN;
  }
  if (preset === 'tomorrow') return today + DAY;
  // Next Monday.
  const monBased = (new Date(today).getUTCDay() + 6) % 7;
  return today + (7 - monBased) * DAY;
}
