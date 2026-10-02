import { STEP } from '@/lib/agent-tools';
import { addHabit, addTask, listTasks, planWeek, postponeTask, taskDone, updateHabit, updateTask } from './backlog';
import { deleteBlocks, placeAt, propose, timeOff } from './blocks';
import { doneLabel, type ToolHandler } from './context';
import { planSettings, recordRule, setTravel } from './settings';
import {
  TOOL_ADD_HABIT,
  TOOL_ADD_TASK,
  TOOL_ANSWER,
  TOOL_ASK,
  TOOL_DELETE,
  TOOL_HABIT_UPDATE,
  TOOL_LIST_TASKS,
  TOOL_PLACE_AT,
  TOOL_PLAN_SETTINGS,
  TOOL_PLAN_WEEK,
  TOOL_POSTPONE,
  TOOL_PROPOSE,
  TOOL_RULE,
  TOOL_TASK_DONE,
  TOOL_TASK_UPDATE,
  TOOL_TIME_OFF,
  TOOL_TRAVEL,
  type ToolName,
  asString,
} from './names';

/**
 * Every tool Plan with AI can run, and the code that runs it. Typed as a
 * Record over ToolName, so a tool without a handler does not compile.
 *
 * Handlers carry the action out; the turn (turn.ts) only loads the calendar,
 * picks the handler from what understand.ts read, and stores the reply. A
 * model, when added, produces the same { name, args } and lands here too.
 */

/** Asked back rather than guessed: understand.ts already wrote the question. */
const ask: ToolHandler = async (args, { step }) => {
  step({ tool: STEP.ask, label: doneLabel(STEP.ask, 'Needs one detail'), detail: 'asked rather than guessed' });
  const options = Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === 'string').slice(0, 4) : [];
  const question = { text: asString(args.question, 'Could you say a bit more?'), options };
  return { kind: 'question', question, reply: question.text };
};

/** Explain, confirm or decline in words. */
const answer: ToolHandler = async (args) => ({ reply: asString(args.reply) || "I'm not sure how to help with that one." });

export const TOOLS: Record<ToolName, ToolHandler> = {
  [TOOL_PROPOSE]: propose,
  [TOOL_PLACE_AT]: placeAt,
  [TOOL_TIME_OFF]: timeOff,
  [TOOL_DELETE]: deleteBlocks,
  [TOOL_ASK]: ask,
  [TOOL_ANSWER]: answer,
  [TOOL_RULE]: recordRule,
  [TOOL_TRAVEL]: setTravel,
  [TOOL_PLAN_SETTINGS]: planSettings,
  [TOOL_ADD_TASK]: addTask,
  [TOOL_LIST_TASKS]: listTasks,
  [TOOL_TASK_DONE]: taskDone,
  [TOOL_TASK_UPDATE]: updateTask,
  [TOOL_POSTPONE]: postponeTask,
  [TOOL_PLAN_WEEK]: planWeek,
  [TOOL_ADD_HABIT]: addHabit,
  [TOOL_HABIT_UPDATE]: updateHabit,
};

export const toolFor = (name: string): ToolHandler | undefined => TOOLS[name as ToolName];
