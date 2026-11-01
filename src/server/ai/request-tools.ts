import type { ApiHabit, ApiTask } from '../../lib/api-types.ts';
import { saidLength, saidOften, type Said } from './grounded.ts';
import { CATEGORIES } from './preferences.ts';
import { checkTimeOff } from './time-off.ts';
import type { ToolDef } from './llm.ts';
import {
  TOOL_ADD_HABIT,
  TOOL_ADD_TASK,
  TOOL_DELETE,
  TOOL_HABIT_UPDATE,
  TOOL_PLAN_SETTINGS,
  TOOL_PLAN_WEEK,
  TOOL_POSTPONE,
  TOOL_TASK_DONE,
  TOOL_TASK_UPDATE,
  TOOL_TIME_OFF,
  TOOL_TRAVEL,
} from './tools/names.ts';
import type { Draft, Understood } from './understand.ts';

/**
 * The planner's input forms. Each tool here is one exact request: the model
 * fills the fields, code checks them, and what comes out is the same
 * { name, args } the handlers (tools/) run. Nothing is rewritten into a
 * sentence on the way, so a length, a date or a name can't be lost in between.
 *
 * Something missing comes back to the model as `missing`, and the model asks.
 * The planner never words a question and never fills a gap.
 *
 * Pure: no DB, no clock, so agent.check.mjs runs every path.
 */

const nul = (type: string, description: string) => ({ type: [type, 'null'], description });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const oneOf = (values: readonly string[], description: string) => ({ type: ['string', 'null'], enum: [...values, null], description });

const DAY = 'YYYY-MM-DD';
const WINDOWS = ['morning', 'afternoon', 'evening'] as const;
const category = oneOf(CATEGORIES, 'what kind of thing it is');
const forWindow = oneOf(WINDOWS, 'only if said');
const nullEffort = oneOf(['light', 'hard'], 'only if said it is easy or draining');

export const REQUEST_TOOLS: ToolDef[] = [
  {
    name: 'add_task',
    description: 'One piece of work to get done, with a length and maybe a deadline ("tax return, 3h, by Friday"). The planner places it later. A deadline is optional: never ask for one.',
    strict: true,
    input_schema: obj({
      title: { type: 'string', description: "short, in the user's words, no dates or lengths" },
      duration_min: nul('integer', 'total minutes of work, exactly as said: 10 hours is 600'),
      due: nul('string', `${DAY}: the last day it can be finished. "before the 12th" is the 11th. Only if said.`),
      not_before: nul('string', `${DAY}: the first day work can start. Only if said.`),
      priority: oneOf(['low', 'high'], 'only if said'),
      effort: nullEffort,
      preferred_window: forWindow,
      category,
    }),
  },
  {
    name: 'update_task',
    description: 'Change a task already on the list: its deadline, how long it takes, how draining it is, or that it can be split.',
    strict: true,
    input_schema: obj({
      match: { type: 'string', description: 'the task, as listed' },
      due: nul('string', `${DAY}, the new last day, only if changing`),
      duration_min: nul('integer', 'new total minutes, only if changing'),
      effort: nullEffort,
      splittable: { type: ['boolean', 'null'], description: 'true only if they said it can be split' },
    }),
  },
  {
    name: 'finish_task',
    description: 'The user finished a task on the list.',
    strict: true,
    input_schema: obj({ match: { type: 'string', description: 'the task, as listed' } }),
  },
  {
    name: 'postpone_task',
    description: 'Do not start a listed task before a day. Its deadline does not change.',
    strict: true,
    input_schema: obj({ match: { type: 'string', description: 'the task, as listed' }, not_before: nul('string', `${DAY}, the first day it can start`) }),
  },
  {
    name: 'add_habit',
    description: 'Something new that repeats every week ("run 3x a week, 45 min"). Needs only how often and how long. "every morning" or "a day" is 7 a week. Never ask when, unless they said it matters.',
    strict: true,
    input_schema: obj({
      title: { type: 'string', description: "short, in the user's words" },
      per_week: nul('integer', '1-7 sessions a week'),
      min_per_week: nul('integer', 'only if they gave a range: "2-3 times" is 3 with a minimum of 2'),
      duration_min: nul('integer', 'minutes per session'),
      preferred_window: forWindow,
      category,
    }),
  },
  {
    name: 'update_habit',
    description: 'Change a habit already on the list (how often, how long), or stop it.',
    strict: true,
    input_schema: obj({
      match: { type: 'string', description: 'the habit, as listed' },
      per_week: nul('integer', 'new sessions a week, only if changing'),
      duration_min: nul('integer', 'new minutes per session, only if changing'),
      stop: { type: 'boolean', description: 'true to stop it for good' },
    }),
  },
  {
    name: 'time_off',
    description: 'The user is away, off, ill or travelling for whole days. Nothing is planned on those days.',
    strict: true,
    input_schema: obj({
      from: nul('string', `${DAY}, first day`),
      to: nul('string', `${DAY}, last day; null when it is one day`),
      title: { type: 'string', description: "'Time off', or the trip's name: 'Paris trip'" },
    }),
  },
  {
    name: 'plan_week',
    description: 'Plan every open task and habit onto the calendar ("plan my week", "sort out my week", "replan"). The user approves the result.',
    strict: true,
    input_schema: obj({}),
  },
  {
    name: 'clear_blocks',
    description: "Clear a day or a range, or everything with a name in it, from Find Time's own blocks. The app lists them and the user confirms.",
    strict: true,
    input_schema: obj({
      match: { type: 'string', description: "words from the title; '' = everything in the range" },
      from: nul('string', `${DAY}, first day`),
      to: nul('string', `${DAY}, last day; null when it is one day`),
    }),
  },
  {
    name: 'set_travel',
    description: 'How many minutes it takes the user to get anywhere: kept free around in-person events. Not a buffer. 0 turns it off.',
    strict: true,
    input_schema: obj({ minutes: { type: 'integer', description: '0-180' } }),
  },
  {
    name: 'set_focus',
    description: 'How much demanding work a day ("no more than 3 hours of focus a day"), and whether hard tasks cluster or spread.',
    strict: true,
    input_schema: obj({
      daily_minutes: nul('integer', 'minutes of focus a day, only if said'),
      hard_work: oneOf(['cluster', 'spread'], 'only if said'),
    }),
  },
];

export const REQUEST_TOOL_NAMES = new Set(REQUEST_TOOLS.map((t) => t.name));

export type RequestCtx = { said: Said; saidDay: string | null; tasks: ApiTask[]; habits: ApiHabit[]; nowISO: string };
export type RequestOutcome = { done: Understood } | { feedback: Record<string, unknown> };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const nextDay = (s: string) => new Date(Date.parse(`${s}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const dateOf = (v: unknown) => (typeof v === 'string' && DATE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v) ? v : null);
const intIn = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : null);
const cleanTitle = (v: unknown) => {
  const s = String(v ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, 120);
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const hours = (min: number) => (min < 60 ? `${min} min` : `${Math.round((min / 60) * 10) / 10}h`);

export const missing = (fields: string[], extra: Record<string, unknown> = {}): RequestOutcome => ({
  feedback: { missing: fields, ...extra, next: 'Say what you understood, then ask for all of this in one question. Never fill it in yourself.' },
});
const problem = (error: string, extra: Record<string, unknown> = {}): RequestOutcome => ({ feedback: { error, ...extra } });
const done = (name: string, args: Record<string, unknown>, summary: string, draft: Draft | null = null): RequestOutcome => ({ done: { name, args, draft, summary } as Understood });

/** The one listed thing a name points at, or what to tell the model. */
function pick<T extends { title: string }>(list: T[], match: unknown, what: string): { item: T } | { outcome: RequestOutcome } {
  const q = String(match ?? '').trim().toLowerCase();
  const titles = list.map((t) => t.title);
  const exact = list.filter((t) => t.title.toLowerCase() === q);
  const hits = exact.length ? exact : list.filter((t) => q && (t.title.toLowerCase().includes(q) || q.includes(t.title.toLowerCase())));
  if (hits.length === 1) return { item: hits[0] };
  if (hits.length > 1) return { outcome: missing([`which ${what}`], { options: hits.map((t) => t.title).slice(0, 4) }) };
  return { outcome: problem(`There is no ${what} called "${q}". Check the list, or ask the user which they meant.`, { listed: titles }) };
}

/** One form → the action, or what the model must fix or ask. Null: not one of these tools. */
export function readRequest(name: string, args: Record<string, unknown>, c: RequestCtx): RequestOutcome | null {
  switch (name) {
    case 'add_task': {
      const title = cleanTitle(args.title);
      if (!title) return missing(['what the task is']);
      if (c.tasks.some((t) => t.title.toLowerCase() === title.toLowerCase())) return problem(`"${title}" is already a task. Use update_task to change it.`);
      const durationMin = intIn(args.duration_min, 15, 40 * 60);
      if (!durationMin || !saidLength(c.said)) return missing(['how long it takes']);
      const notBefore = dateOf(args.not_before);
      const due = !dateOf(args.due) ? null : notBefore ? dateOf(args.due) : (c.saidDay ?? dateOf(args.due));
      if (due && notBefore && notBefore > due) return problem('not_before is after the deadline. Ask the user which is right.');
      const priority = args.priority === 'low' || args.priority === 'high' ? args.priority : 'medium';
      return done(
        TOOL_ADD_TASK,
        {
          title,
          category: args.category ?? 'deep-work',
          priority,
          durationMin,
          splittable: durationMin > 120,
          ...(due ? { dueByISO: `${nextDay(due)}T00:00:00.000Z` } : {}),
          ...(notBefore ? { notBeforeISO: `${notBefore}T00:00:00.000Z` } : {}),
          ...(args.effort ? { effort: args.effort } : {}),
          ...(args.preferred_window ? { preferredWindow: args.preferred_window } : {}),
          reply: '',
        },
        [title, hours(durationMin), due ? `due ${due}` : 'no due date', notBefore ? `not before ${notBefore}` : ''].filter(Boolean).join(' · '),
      );
    }
    case 'update_task': {
      const found = pick(c.tasks, args.match, 'task');
      if ('outcome' in found) return found.outcome;
      const due = dateOf(args.due) ? (c.saidDay ?? dateOf(args.due)) : null;
      const durationMin = intIn(args.duration_min, 15, 40 * 60);
      if (durationMin && !saidLength(c.said)) return missing(['how long it takes now']);
      const changes = {
        ...(due ? { dueByISO: `${nextDay(due)}T00:00:00.000Z` } : {}),
        ...(durationMin ? { durationMin } : {}),
        ...(args.effort ? { effort: args.effort } : {}),
        ...(args.splittable === true ? { splittable: true } : {}),
      };
      if (!Object.keys(changes).length) return missing(['what should change']);
      return done(TOOL_TASK_UPDATE, { match: found.item.title, ...changes, reply: '' }, `${found.item.title} · ${Object.keys(changes).join(', ')}`);
    }
    case 'finish_task': {
      const found = pick(c.tasks, args.match, 'task');
      if ('outcome' in found) return found.outcome;
      return done(TOOL_TASK_DONE, { match: found.item.title, reply: '' }, `done · ${found.item.title}`);
    }
    case 'postpone_task': {
      const found = pick(c.tasks, args.match, 'task');
      if ('outcome' in found) return found.outcome;
      const at = c.saidDay ?? dateOf(args.not_before);
      if (!at) return missing(['until when']);
      return done(TOOL_POSTPONE, { match: found.item.title, notBeforeISO: `${at}T00:00:00.000Z`, label: at, reply: '' }, `${found.item.title} · not before ${at}`);
    }
    case 'add_habit': {
      const title = cleanTitle(args.title);
      if (!title) return missing(['what the habit is']);
      if (c.habits.some((h) => h.title.toLowerCase() === title.toLowerCase())) return problem(`"${title}" is already a habit. Use update_habit to change it.`);
      const perWeek = intIn(args.per_week, 1, 7);
      const durationMin = intIn(args.duration_min, 5, 480);
      const gaps = [!perWeek || !saidOften(c.said) ? 'how often' : '', !durationMin || !saidLength(c.said) ? 'how long each session is' : ''].filter(Boolean);
      if (gaps.length) return missing(gaps);
      const lowest = intIn(args.min_per_week, 1, perWeek!);
      return done(
        TOOL_ADD_HABIT,
        {
          title,
          category: args.category ?? 'personal',
          perWeek,
          durationMin,
          ...(lowest && lowest < perWeek! ? { minPerWeek: lowest } : {}),
          ...(args.preferred_window ? { preferredWindow: args.preferred_window } : {}),
          reply: '',
        },
        `${title} · ${perWeek}x a week · ${hours(durationMin!)}`,
      );
    }
    case 'update_habit': {
      const found = pick(c.habits, args.match, 'habit');
      if ('outcome' in found) return found.outcome;
      if (args.stop === true) return done(TOOL_HABIT_UPDATE, { match: found.item.title, stop: true, reply: '' }, `stop · ${found.item.title}`);
      const perWeek = intIn(args.per_week, 1, 7);
      const durationMin = intIn(args.duration_min, 5, 480);
      if (!perWeek && !durationMin) return missing(['what should change']);
      return done(TOOL_HABIT_UPDATE, { match: found.item.title, ...(perWeek ? { perWeek } : {}), ...(durationMin ? { durationMin } : {}), reply: '' }, `${found.item.title} · ${perWeek ? `${perWeek}x a week` : ''} ${durationMin ? hours(durationMin) : ''}`.trim());
    }
    case 'time_off': {
      const from = dateOf(args.from);
      if (!from) return missing(['which days']);
      const to = dateOf(args.to) ?? from;
      const checked = checkTimeOff(from, to, c.nowISO);
      if (!checked.ok) return problem(checked.reason);
      const title = cleanTitle(args.title) || 'Time off';
      const range = from === to ? from : `${from} to ${to}`;
      return done(TOOL_TIME_OFF, { startISO: from, endISO: to, title, reply: `Blocked ${title}: ${range}.` }, `${title} · ${range}`);
    }
    case 'plan_week':
      return done(TOOL_PLAN_WEEK, { reply: '' }, 'plan every open task and habit');
    case 'clear_blocks': {
      const match = String(args.match ?? '').trim().toLowerCase();
      const from = dateOf(args.from);
      // Clearing everything with no day would be the whole calendar.
      if (!match && !from) return missing(['which day to clear']);
      const to = dateOf(args.to) ?? from;
      const draft: Draft = { tool: TOOL_DELETE, match, ...(from ? { from, to: nextDay(to!) } : {}) };
      return done(
        TOOL_DELETE,
        { confirm: false, match, ...(from ? { earliestISO: `${from}T00:00:00.000Z`, latestISO: `${nextDay(to!)}T00:00:00.000Z` } : {}) },
        `delete · ${match ? `"${match}"` : 'everything'} · ${from ?? 'next 3 weeks'}`,
        draft,
      );
    }
    case 'set_travel': {
      const minutes = intIn(args.minutes, 0, 180);
      if (minutes === null) return missing(['how many minutes']);
      return done(TOOL_TRAVEL, { minutes, reply: '' }, `travel · ${minutes} min`);
    }
    case 'set_focus': {
      const dailyBudgetMin = intIn(args.daily_minutes, 60, 12 * 60);
      const hardWork = args.hard_work === 'cluster' || args.hard_work === 'spread' ? args.hard_work : undefined;
      if (!dailyBudgetMin && !hardWork) return missing(['how many hours a day']);
      return done(TOOL_PLAN_SETTINGS, { ...(dailyBudgetMin ? { dailyBudgetMin } : {}), ...(hardWork ? { hardWork } : {}), reply: '' }, `focus · ${dailyBudgetMin ? hours(dailyBudgetMin) : hardWork}`);
    }
    default:
      return null;
  }
}
