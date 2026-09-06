import type { CalendarEvent } from './types';

/**
 * Seed events for the MVP. Times are generated relative to "now" so the calendar
 * always has something to show on first launch, on any day.
 *
 * In a later milestone this is replaced by a real per-user data source
 * (Clerk-authenticated, Postgres-backed).
 */
function at(dayOffset: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export function seedEvents(): CalendarEvent[] {
  return [
    { id: 's1', title: 'Team standup', start: at(0, 9, 30), end: at(0, 9, 45), category: 'meeting' },
    { id: 's2', title: 'Focus: spec draft', start: at(0, 10, 0), end: at(0, 12, 0), category: 'focus' },
    { id: 's3', title: 'Lunch', start: at(0, 12, 30), end: at(0, 13, 30), category: 'personal' },
    { id: 's4', title: 'Inbox & admin', start: at(0, 16, 0), end: at(0, 16, 45), category: 'admin' },
    { id: 's5', title: 'Design review', start: at(1, 11, 0), end: at(1, 12, 0), category: 'meeting' },
    { id: 's6', title: 'Focus: build calendar view', start: at(1, 14, 0), end: at(1, 16, 30), category: 'focus' },
    { id: 's7', title: '1:1 with manager', start: at(2, 10, 0), end: at(2, 10, 30), category: 'meeting' },
    { id: 's8', title: 'Gym', start: at(2, 18, 0), end: at(2, 19, 0), category: 'personal' },
    { id: 's9', title: 'Focus: planner engine', start: at(3, 9, 30), end: at(3, 12, 0), category: 'focus' },
    { id: 's10', title: 'Sprint planning', start: at(4, 13, 0), end: at(4, 14, 0), category: 'meeting' },
  ];
}
