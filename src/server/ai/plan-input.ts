import type { ApiEvent, ApiHabit, ApiTask } from '../../lib/api-types.ts';
import { blocksTime } from './find-time.ts';
import { type OnCalendar, holidaysIn } from './holidays.ts';
import { type PlanInput, travelPadding } from './plan-week.ts';
import type { AgentProfile } from './preferences.ts';
import { categoryOr, toPlanTask } from './tools/context.ts';

/**
 * The calendar, tasks and habits as the planner reads them. One place, so "plan
 * my week" and the read-only "will this fit?" lookup can never disagree.
 */
export function planInputFor(planEvents: (ApiEvent & OnCalendar)[], tasks: ApiTask[], habits: ApiHabit[], profile: AgentProfile, nowISO: string): { input: PlanInput; others: ApiEvent[] } {
  const taskIds = new Set(tasks.map((t) => t.id));
  const habitIds = new Set(habits.map((h) => h.id));
  const ownBlock = (e: ApiEvent) => Boolean((e.taskId && taskIds.has(e.taskId)) || (e.habitId && habitIds.has(e.habitId)));
  // A public holiday is neither away nor busy (blocksTime): it is a day off for work, below.
  const isAway = (e: ApiEvent) => e.itemType === 'away' || (e.allDay === true && blocksTime(e));
  // The plan doesn't move other blocks, so flexible ones count as busy here;
  // free, declined and all-day ones still don't (blocksTime).
  const others = planEvents.filter((e) => !ownBlock(e) && !isAway(e) && blocksTime({ ...e, flexibility: undefined }));
  return {
    others,
    input: {
      nowISO,
      profile,
      tasks: tasks.map(toPlanTask),
      habits: habits.map((h) => ({ ...h, minPerWeek: h.minPerWeek, category: categoryOr(h.category, 'personal') })),
      busy: others.map((e) => ({ start: e.start, end: e.end })),
      // Travel either side of in-person events (off unless the user set it).
      travel: travelPadding(others, profile.travelMin),
      away: planEvents.filter((e) => !ownBlock(e) && isAway(e)).map((e) => ({ start: e.start, end: e.end })),
      holidays: holidaysIn(planEvents),
      existing: planEvents.filter(ownBlock).map((e) => ({
        eventId: e.id,
        ...(e.taskId && taskIds.has(e.taskId) ? { taskId: e.taskId } : { habitId: e.habitId! }),
        startISO: e.start,
        endISO: e.end,
        // Fixed by the user, or moved there by hand (events-repo pins on move).
        pinned: e.flexibility !== 'flexible',
      })),
    },
  };
}
