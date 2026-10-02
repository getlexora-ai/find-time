/**
 * The tools Plan with AI can call — one name per action. `understand.ts` reads
 * a sentence into one of these plus its arguments; `tools/index.ts` maps each
 * to the code that carries it out. A model, when one comes back, must return
 * the same shape and goes through the same handlers.
 *
 * Dependency-free so the .check.mjs harnesses can import it directly.
 */

export const TOOL_PROPOSE = 'propose_blocks';
export const TOOL_PLACE_AT = 'place_at';
export const TOOL_DELETE = 'delete_blocks';
export const TOOL_TIME_OFF = 'block_time_off';
export const TOOL_ASK = 'ask_clarification';
export const TOOL_ANSWER = 'answer';
export const TOOL_RULE = 'record_rule';
export const TOOL_TRAVEL = 'set_travel';
export const TOOL_PLAN_SETTINGS = 'plan_settings';
export const TOOL_ADD_TASK = 'add_task';
export const TOOL_LIST_TASKS = 'list_tasks';
export const TOOL_TASK_DONE = 'task_done';
export const TOOL_TASK_UPDATE = 'update_task';
export const TOOL_POSTPONE = 'postpone_task';
export const TOOL_PLAN_WEEK = 'plan_week';
export const TOOL_ADD_HABIT = 'add_habit';
export const TOOL_HABIT_UPDATE = 'update_habit';

export type ToolName =
  | typeof TOOL_PROPOSE
  | typeof TOOL_PLACE_AT
  | typeof TOOL_DELETE
  | typeof TOOL_TIME_OFF
  | typeof TOOL_ASK
  | typeof TOOL_ANSWER
  | typeof TOOL_RULE
  | typeof TOOL_TRAVEL
  | typeof TOOL_PLAN_SETTINGS
  | typeof TOOL_ADD_TASK
  | typeof TOOL_LIST_TASKS
  | typeof TOOL_TASK_DONE
  | typeof TOOL_TASK_UPDATE
  | typeof TOOL_POSTPONE
  | typeof TOOL_PLAN_WEEK
  | typeof TOOL_ADD_HABIT
  | typeof TOOL_HABIT_UPDATE;

/** An int argument clamped into a range, falling back to `dflt`. */
export function clampInt(n: unknown, lo: number, hi: number, dflt: number): number {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : dflt;
  return Math.min(hi, Math.max(lo, Math.round(x)));
}

/** A non-empty trimmed string argument, else `dflt`. */
export function asString(v: unknown, dflt = ''): string {
  return typeof v === 'string' && v.trim() ? v.trim() : dflt;
}

/** An ISO argument that parses, else null. */
export function asISO(v: unknown): string | null {
  return typeof v === 'string' && Number.isFinite(Date.parse(v)) ? v : null;
}
