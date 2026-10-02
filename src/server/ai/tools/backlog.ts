import { STEP } from '@/lib/agent-tools';
import { listEvents } from '@/server/events-repo';
import { createHabit, findHabits, updateHabit as saveHabit } from '@/server/habits-repo';
import { finishTask, postponeTask as savePostpone, stopHabit } from '@/server/task-actions';
import { type ApiTask, createTask, findOpenTasks, updateTask as saveTask } from '@/server/tasks-repo';
import { blocksTime } from '../find-time';
import { MAX_HORIZON_DAYS, type PlanInput, dueLabel, habitWeeks, planWeek as buildPlan, startLabel, travelPadding, verifyPlan } from '../plan-week';
import { saveProposals } from '../repo';
import { ZERO_FEATURES } from '../scoring';
import { categoryOr, doneLabel, habitText, hoursText, iso, plural, toChatProposal, toPlanTask, type ToolHandler, type TurnCtx } from './context';
import {
  TOOL_ADD_HABIT,
  TOOL_ADD_TASK,
  TOOL_HABIT_UPDATE,
  TOOL_LIST_TASKS,
  TOOL_PLAN_WEEK,
  TOOL_POSTPONE,
  TOOL_TASK_DONE,
  TOOL_TASK_UPDATE,
  asISO,
  asString,
  clampInt,
} from './names';

/** The backlog: tasks and habits, and "plan my week" that fits them into the calendar. */

const WINDOWS = ['morning', 'afternoon', 'evening'] as const;
const windowOf = (v: unknown) => WINDOWS.find((w) => w === v) ?? null;

/** The open task a sentence names, first match; the reply when there is none. */
async function namedTask(args: Record<string, unknown>, ctx: TurnCtx): Promise<{ task: ApiTask } | { reply: string }> {
  const match = asString(args.match, '');
  const found = match ? await findOpenTasks(ctx.userId, match).catch(() => []) : [];
  return found[0] ? { task: found[0] } : { reply: `I can't find an open task called "${match}". Say "my tasks" to see them.` };
}

export const addTask: ToolHandler = async (args, ctx) => {
  try {
    const t = await createTask(ctx.userId, {
      title: asString(args.title, '').slice(0, 120),
      durationMin: clampInt(args.durationMin, 15, 40 * 60, 60),
      dueBy: asISO(args.dueByISO),
      notBefore: asISO(args.notBeforeISO),
      priority: (['low', 'medium', 'high'] as const).find((p) => p === args.priority) ?? 'medium',
      effort: args.effort === 'hard' || args.effort === 'light' ? args.effort : 'normal',
      preferredWindow: windowOf(args.preferredWindow),
      splittable: args.splittable === true,
      category: categoryOr(asString(args.category, 'deep-work'), 'deep-work'),
    });
    ctx.step({ tool: TOOL_ADD_TASK, label: doneLabel(TOOL_ADD_TASK, 'Added a task'), detail: ctx.summary });
    const due = t.dueBy ? `, due ${dueLabel(t.dueBy)}` : '';
    const from = t.notBefore ? `, not before ${startLabel(Date.parse(t.notBefore))}` : '';
    return { reply: `Added "${t.title}" — ${hoursText(t.durationMin)}${due}${from}. Say "plan my week" when you want it on the calendar.` };
  } catch (err) {
    console.error('ai/chat addTask', err);
    return { reply: "I couldn't save that task just now, so nothing was added. Try again in a moment." };
  }
};

export const listTasks: ToolHandler = async (_args, { openTasks, habits, now, step }) => {
  step({ tool: TOOL_LIST_TASKS, label: doneLabel(TOOL_LIST_TASKS, 'Your tasks'), detail: `${openTasks.length} open · ${plural(habits.length, 'habit')}` });
  const habitLines = habits.length ? `\n\nHabits:\n${habits.map((h) => `• ${h.title} — ${habitText(h)}`).join('\n')}` : '';
  if (!openTasks.length) return { reply: `No open tasks. Add one with "Add task: write the report, 3h, due Friday".${habitLines}` };

  const lines = openTasks.slice(0, 10).map((t) => {
    const bits = [
      hoursText(t.durationMin),
      t.dueBy ? `due ${dueLabel(t.dueBy)}` : '',
      t.notBefore && Date.parse(t.notBefore) > now.getTime() ? `not before ${startLabel(Date.parse(t.notBefore))}` : '',
      t.priority !== 'medium' ? `${t.priority} priority` : '',
      t.effort !== 'normal' ? t.effort : '',
    ].filter(Boolean);
    return `• ${t.title} — ${bits.join(', ')}`;
  });
  const more = openTasks.length > 10 ? `\n…and ${openTasks.length - 10} more.` : '';
  return { reply: `${plural(openTasks.length, 'open task')}:\n${lines.join('\n')}${more}${habitLines}` };
};

/** "Done with the report": its future sessions are cleared so finished work stops holding time. */
export const taskDone: ToolHandler = async (args, ctx) => {
  const named = await namedTask(args, ctx);
  if (!('task' in named)) return named;
  const t = named.task;
  try {
    const { cleared: n } = await finishTask(ctx.userId, t, ctx.nowISO);
    ctx.step({ tool: TOOL_TASK_DONE, label: doneLabel(TOOL_TASK_DONE, 'Finished a task'), detail: `${t.title} · ${plural(n, 'future block')} cleared` });
    return {
      ...(n ? { deleted: { count: n } } : {}),
      reply: `Done — "${t.title}".${n ? ` Cleared ${plural(n, 'upcoming session')} from your calendar.` : ''}`,
    };
  } catch (err) {
    console.error('ai/chat taskDone', err);
    return { reply: "I couldn't mark that done just now. Try again in a moment." };
  }
};

export const updateTask: ToolHandler = async (args, ctx) => {
  const named = await namedTask(args, ctx);
  if (!('task' in named)) return named;
  const t = named.task;
  const patch: Parameters<typeof saveTask>[2] = {};
  const due = asISO(args.dueByISO);
  if (due) patch.dueBy = due;
  if (typeof args.durationMin === 'number') patch.durationMin = clampInt(args.durationMin, 15, 40 * 60, t.durationMin);
  if (args.splittable === true) patch.splittable = true;
  if (args.effort === 'hard' || args.effort === 'light') patch.effort = args.effort;
  try {
    const u = await saveTask(ctx.userId, t.id, patch);
    if (!u) throw new Error('no change');
    const what = [
      patch.dueBy ? `due ${dueLabel(patch.dueBy)}` : '',
      patch.durationMin ? hoursText(patch.durationMin) : '',
      patch.splittable ? 'can be split across days' : '',
      patch.effort ? `${patch.effort} — it counts ${patch.effort === 'hard' ? 'more' : 'less'} toward a full day` : '',
    ].filter(Boolean);
    ctx.step({ tool: TOOL_TASK_UPDATE, label: doneLabel(TOOL_TASK_UPDATE, 'Changed a task'), detail: `${u.title} · ${what.join(', ')}` });
    return { reply: `Updated "${u.title}": ${what.join(', ')}. Say "replan" to fit it in again.` };
  } catch (err) {
    console.error('ai/chat updateTask', err);
    return { reply: "I couldn't change that task just now. Try again in a moment." };
  }
};

/** "Postpone the report a week": sessions before the new start come off now. */
export const postponeTask: ToolHandler = async (args, ctx) => {
  const at = asISO(args.notBeforeISO);
  const named = await namedTask(args, ctx);
  if (!('task' in named)) return named;
  if (!at) return { reply: `I can't find an open task called "${asString(args.match, '')}". Say "my tasks" to see them.` };
  const t = named.task;
  try {
    const { cleared: n } = await savePostpone(ctx.userId, t, at, ctx.nowISO);
    const label = asString(args.label, startLabel(Date.parse(at)));
    ctx.step({ tool: TOOL_POSTPONE, label: doneLabel(TOOL_POSTPONE, 'Postponed a task'), detail: `${t.title} · not before ${label}${n ? ` · ${n} cleared` : ''}` });
    const late = t.dueBy && Date.parse(at) >= Date.parse(t.dueBy) ? ` That's after it's due (${dueLabel(t.dueBy)}) — move the due date too?` : '';
    return {
      ...(n ? { deleted: { count: n } } : {}),
      reply: `Okay — "${t.title}" won't start before ${label}.${n ? ` Took ${plural(n, 'earlier session')} off your calendar.` : ''}${late} Say "replan" to fit it in again.`,
    };
  } catch (err) {
    console.error('ai/chat postpone', err);
    return { reply: "I couldn't postpone that just now. Try again in a moment." };
  }
};

export const addHabit: ToolHandler = async (args, ctx) => {
  const perWeek = clampInt(args.perWeek, 1, 7, 3);
  const minPerWeek = typeof args.minPerWeek === 'number' ? clampInt(args.minPerWeek, 1, perWeek, perWeek) : null;
  try {
    const h = await createHabit(ctx.userId, {
      title: asString(args.title, '').slice(0, 120),
      perWeek,
      minPerWeek: minPerWeek && minPerWeek < perWeek ? minPerWeek : null,
      durationMin: clampInt(args.durationMin, 5, 480, 60),
      preferredWindow: windowOf(args.preferredWindow),
      category: categoryOr(asString(args.category, 'personal'), 'personal'),
    });
    ctx.step({ tool: TOOL_ADD_HABIT, label: doneLabel(TOOL_ADD_HABIT, 'Added a habit'), detail: ctx.summary });
    return { reply: `Added "${h.title}" — ${habitText(h)}. Say "plan my week" to put this week's sessions on the calendar.` };
  } catch (err) {
    console.error('ai/chat addHabit', err);
    return { reply: "I couldn't save that habit just now, so nothing was added. Try again in a moment." };
  }
};

/** "Gym 3x a week instead" changes it; "stop running" ends it and clears its upcoming sessions. */
export const updateHabit: ToolHandler = async (args, ctx) => {
  const match = asString(args.match, '');
  const h = match ? (await findHabits(ctx.userId, match).catch(() => []))[0] : undefined;
  if (!h) return { reply: `I can't find a habit called "${match}". Say "my habits" to see them.` };

  if (args.stop === true) {
    try {
      const { cleared: n } = await stopHabit(ctx.userId, h, ctx.nowISO);
      ctx.step({ tool: TOOL_HABIT_UPDATE, label: 'Stopped a habit', detail: `${h.title} · ${n} upcoming cleared` });
      return { ...(n ? { deleted: { count: n } } : {}), reply: `Stopped "${h.title}".${n ? ` Cleared ${plural(n, 'upcoming session')}.` : ''}` };
    } catch (err) {
      console.error('ai/chat stopHabit', err);
      return { reply: "I couldn't stop that habit just now. Try again in a moment." };
    }
  }

  const patch: Parameters<typeof saveHabit>[2] = {};
  if (typeof args.perWeek === 'number') {
    patch.perWeek = clampInt(args.perWeek, 1, 7, h.perWeek);
    const min = typeof args.minPerWeek === 'number' ? clampInt(args.minPerWeek, 1, patch.perWeek, patch.perWeek) : null;
    patch.minPerWeek = min && min < patch.perWeek ? min : null;
  }
  if (typeof args.durationMin === 'number') patch.durationMin = clampInt(args.durationMin, 5, 480, h.durationMin);
  try {
    const u = await saveHabit(ctx.userId, h.id, patch);
    if (!u) throw new Error('no change');
    ctx.step({ tool: TOOL_HABIT_UPDATE, label: doneLabel(TOOL_HABIT_UPDATE, 'Changed a habit'), detail: `${u.title} · ${habitText(u)}` });
    return { reply: `Updated "${u.title}": ${habitText(u)}. Say "replan" to fit it in again.` };
  } catch (err) {
    console.error('ai/chat updateHabit', err);
    return { reply: "I couldn't change that habit just now. Try again in a moment." };
  }
};

/**
 * "Plan my week": every open task and habit into the free time (plan-week.ts),
 * shown as proposals. A plan that fails its own check (verifyPlan) is never shown.
 */
export const planWeek: ToolHandler = async (_args, ctx) => {
  const { userId, sessionId, now, nowISO, profile, openTasks, habits, step } = ctx;
  if (!openTasks.length && !habits.length) {
    return { reply: 'There are no open tasks or habits to plan. Add one with "Add task: write the report, 3h, due Friday" or "Habit: gym 3x a week, 1h".' };
  }

  ctx.begin(STEP.rank);
  const planT0 = Date.now();
  let planEvents: Awaited<ReturnType<typeof listEvents>>;
  try {
    // A deadline can sit further out than the chat's horizon; a habit's week can have started before today.
    const weekStart = iso(new Date(Math.min(...habitWeeks(now.getTime()), now.getTime())));
    planEvents = await listEvents(userId, weekStart, iso(new Date(now.getTime() + MAX_HORIZON_DAYS * 86_400_000)));
  } catch (err) {
    console.error('ai/chat planWeek events', err);
    return { fail: 'Could not read your calendar.' };
  }

  const taskIds = new Set(openTasks.map((t) => t.id));
  const habitIds = new Set(habits.map((h) => h.id));
  type Ev = (typeof planEvents)[number];
  const ownBlock = (e: Ev) => Boolean((e.taskId && taskIds.has(e.taskId)) || (e.habitId && habitIds.has(e.habitId)));
  const isAway = (e: Ev) => e.itemType === 'away' || (e.allDay === true && blocksTime(e));
  // The plan doesn't move other blocks, so flexible ones count as busy here;
  // free, declined and all-day ones still don't (blocksTime).
  const others = planEvents.filter((e) => !ownBlock(e) && !isAway(e) && blocksTime({ ...e, flexibility: undefined }));
  const input: PlanInput = {
    nowISO,
    profile,
    tasks: openTasks.map(toPlanTask),
    habits: habits.map((h) => ({ ...h, minPerWeek: h.minPerWeek, category: categoryOr(h.category, 'personal') })),
    busy: others.map((e) => ({ start: e.start, end: e.end })),
    // Travel either side of in-person events (off unless the user set it).
    travel: travelPadding(others, profile.travelMin),
    away: planEvents.filter((e) => !ownBlock(e) && isAway(e)).map((e) => ({ start: e.start, end: e.end })),
    existing: planEvents.filter(ownBlock).map((e) => ({
      eventId: e.id,
      ...(e.taskId && taskIds.has(e.taskId) ? { taskId: e.taskId } : { habitId: e.habitId! }),
      startISO: e.start,
      endISO: e.end,
      // Fixed by the user, or moved there by hand (events-repo pins on move).
      pinned: e.flexibility !== 'flexible',
    })),
  };
  const plan = buildPlan(input);
  // Bad rows are left out or repaired by the planner, never guessed at; say so in the logs.
  if (plan.issues.length) console.warn('ai/chat planWeek input', plan.issues);
  const problems = verifyPlan(input, plan);
  const added = plan.blocks.filter((b) => b.status === 'new');
  const kept = plan.blocks.length - added.length;
  const what = [openTasks.length && plural(openTasks.length, 'task'), habits.length && plural(habits.length, 'habit')].filter(Boolean).join(' · ');
  step({
    tool: STEP.rank,
    label: doneLabel(TOOL_PLAN_WEEK, 'Planned your week'),
    detail: `${what} · ${added.length} new · ${kept} kept · ${plan.unplaced.length} don't fit`,
    ms: Date.now() - planT0,
  });

  if (problems.length) {
    // A double-book or a missed deadline offered with confidence is worse than no plan.
    console.error('ai/chat planWeek verify', problems);
    return { reply: "I couldn't build a plan that passes my own checks, so I haven't proposed anything. Try again, or tell me which task matters most." };
  }

  let proposals;
  if (added.length) {
    try {
      const stored = await saveProposals(
        userId,
        sessionId,
        { startISO: nowISO, endISO: added[added.length - 1].endISO },
        added.map((b) => ({
          title: b.title,
          category: b.category,
          startISO: b.startISO,
          endISO: b.endISO,
          score: b.score,
          features: b.features ?? ZERO_FEATURES,
          reason: b.reason,
          alternatives: [],
          ...(b.taskId ? { taskId: b.taskId } : {}),
          ...(b.habitId ? { habitId: b.habitId } : {}),
          ...(b.replacesEventId ? { replacesEventId: b.replacesEventId } : {}),
        })),
      );
      proposals = stored.map((p) => toChatProposal(p));
    } catch (err) {
      console.error('ai/chat planWeek save', err);
      return { fail: 'Could not save that plan. Try again.' };
    }
  }

  const taskSessions = added.filter((b) => b.taskId);
  const habitSessions = added.filter((b) => b.habitId);
  const placedTasks = new Set(taskSessions.map((b) => b.taskId)).size;
  const lines: string[] = [];
  if (added.length) {
    const parts = [
      taskSessions.length && `${plural(taskSessions.length, 'session')} for ${plural(placedTasks, 'task')}, most urgent first`,
      habitSessions.length && plural(habitSessions.length, 'habit session'),
    ].filter(Boolean);
    lines.push(`Here's the plan: ${parts.join(', and ')}.`);
  } else if (!plan.unplaced.length) {
    lines.push('Everything already has its time — nothing needs to change.');
  }
  if (kept && added.length) lines.push(`${plural(kept, 'session')} already on your calendar stay where ${kept === 1 ? 'it is' : 'they are'}.`);
  if (plan.moved.length) {
    const one = plan.moved.length === 1;
    lines.push(`${plan.moved.length} existing session${one ? ' has' : 's have'} to move (${plan.moved[0].why}) — adding the new time replaces the old one.`);
  }
  if (profile.travelMin > 0 && input.busy.length > others.length) {
    lines.push(`I kept ${hoursText(profile.travelMin)} free either side of in-person meetings for travel.`);
  }
  const needed = plan.unplaced.filter((u) => !u.optional);
  const leftOut = plan.unplaced.filter((u) => u.optional);
  for (const u of needed.slice(0, 4)) lines.push(`Couldn't fit ${u.title}: ${u.reason}.${u.options[0] ? ` Try "${u.options[0]}".` : ''}`);
  if (needed.length > 4) lines.push(`…and ${needed.length - 4} more that don't fit.`);
  // Low priority, no deadline: said once, as a group — not as failures.
  if (leftOut.length) lines.push(`Left out for now (low priority, no deadline): ${leftOut.map((u) => u.title).join(', ')}.`);
  for (const n of plan.notes.slice(0, 3)) lines.push(n);
  return { ...(proposals ? { kind: 'plan' as const, proposals } : {}), reply: lines.join('\n') };
};
