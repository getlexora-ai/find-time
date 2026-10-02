import { STEP } from '@/lib/agent-tools';
import { addRule, savePlanSettings, saveTravelMin } from '../repo';
import { doneLabel, hoursText, type ToolHandler } from './context';
import { TOOL_PLAN_SETTINGS, TOOL_TRAVEL, asString, clampInt } from './names';

/** Standing preferences: rules ("never before 10"), travel time, how hard work is laid out. */

/** Must stay a subset of the `constraints_kind_ck` CHECK in db/001_core.sql. */
const RULE_KINDS = new Set(['work-hours', 'protected', 'no-meetings', 'leave-by', 'buffer']);
const WEEKDAY_CODES = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

/**
 * A rule the user stated in words is hard: they said it, so the scheduler
 * obeys it rather than trading it off. Only inferred preferences stay soft.
 */
export const recordRule: ToolHandler = async (args, ctx) => {
  const label = asString(args.label, 'New scheduling rule');
  // `constraints.kind` has a CHECK; an off-list value would fail the insert.
  const kindArg = asString(args.kind, 'work-hours');
  const rule: Record<string, unknown> = {};
  if (typeof args.day === 'string' && WEEKDAY_CODES.has(args.day)) rule.day = args.day;
  if (typeof args.startHour === 'number') rule.start = clampInt(args.startHour, 0, 24, 9);
  if (typeof args.endHour === 'number') rule.end = clampInt(args.endHour, 0, 24, 18);
  if (typeof args.minutes === 'number') rule.minutes = clampInt(args.minutes, 0, 120, 10);
  try {
    const saved = await addRule(ctx.userId, { kind: RULE_KINDS.has(kindArg) ? kindArg : 'work-hours', rule, hard: true, label });
    ctx.step({ tool: STEP.saveRule, label: doneLabel(STEP.saveRule, 'Saved a rule'), detail: saved.label });
    return { savedRule: { id: saved.id, label: saved.label }, reply: asString(args.reply) || `Saved — ${label}` };
  } catch (err) {
    // Never claim a rule that did not save; the user would believe the agent is bound by it.
    console.error('ai/chat addRule', err);
    return { reply: "I couldn't save that rule just now — try telling me again in a moment." };
  }
};

/** Minutes kept free either side of in-person events when planning; 0 turns it off. */
export const setTravel: ToolHandler = async (args, ctx) => {
  const minutes = clampInt(args.minutes, 0, 180, 0);
  try {
    await saveTravelMin(ctx.userId, minutes);
    ctx.step({ tool: TOOL_TRAVEL, label: doneLabel(TOOL_TRAVEL, 'Travel time'), detail: minutes ? `${hoursText(minutes)} each way` : 'off' });
    return {
      reply: minutes
        ? `Got it — I'll keep ${hoursText(minutes)} free before and after anything with an address when I plan your week. Video calls don't count.`
        : 'Okay — no travel time. In-person meetings get no extra room when I plan.',
    };
  } catch (err) {
    console.error('ai/chat travel', err);
    return { reply: "I couldn't save that just now. Try again in a moment." };
  }
};

/** Cluster or spread hard work, and the daily budget of it (plan-week.ts). */
export const planSettings: ToolHandler = async (args, ctx) => {
  const hardWork = args.hardWork === 'cluster' || args.hardWork === 'spread' ? args.hardWork : undefined;
  const dailyBudgetMin = typeof args.dailyBudgetMin === 'number' ? clampInt(args.dailyBudgetMin, 60, 12 * 60, 240) : undefined;
  try {
    await savePlanSettings(ctx.userId, { hardWork, dailyBudgetMin });
    ctx.step({ tool: TOOL_PLAN_SETTINGS, label: doneLabel(TOOL_PLAN_SETTINGS, 'Planning settings'), detail: ctx.summary });
    const bits = [
      hardWork === 'cluster' ? "I'll keep hard tasks together on the same days" : '',
      hardWork === 'spread' ? "I'll spread hard tasks across the week" : '',
      dailyBudgetMin ? `I'll keep demanding work under ${hoursText(dailyBudgetMin)} a day where the deadlines allow` : '',
    ].filter(Boolean);
    return { reply: `Got it — ${bits.join(', and ')}. Say "replan" to apply it.` };
  } catch (err) {
    console.error('ai/chat planSettings', err);
    return { reply: "I couldn't save that just now. Try again in a moment." };
  }
};
