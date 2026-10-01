import type { ApiAccount } from '@/lib/api-types';

import { addDays, iso, startOfWeek, today } from '../cal-date';
import type { CalEvent } from '../types';

/**
 * Dev-only fixture for `/preview`: the current week, built to exercise every
 * rule in docs/calendar-spec.md — each kind, every height band, a 4-way
 * overlap (+n), a clash, repeats, an overnight block, events before and after
 * your hours, a block clipped by the window, single- and multi-day all-day
 * events, Google events from two calendars, and one hidden calendar.
 */
export function previewEvents(): CalEvent[] {
  const mon = startOfWeek(today());
  const d = (n: number) => iso(addDays(mon, n));
  let id = 1;
  const E = (
    day: number,
    start: string,
    end: string,
    title: string,
    kind: CalEvent['kind'],
    cat: CalEvent['cat'],
    extra: Partial<CalEvent> = {},
  ): CalEvent => ({ id: id++, date: d(day), start, end, title, kind, cat, project: '', notes: '', ...extra });

  const work = { imported: true, calendarId: 'cal_work' };
  const family = { imported: true, calendarId: 'cal_family' };

  return [
    // repeats
    E(0, '08:45', '09:00', 'Standup', 'routine', 'sync', { rrule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' }),
    E(0, '17:30', '18:30', 'Gym', 'routine', 'admin', { rrule: 'FREQ=WEEKLY;BYDAY=MO,WE,FR' }),
    E(0, '12:30', '13:15', 'Lunch', 'break', 'admin', { rrule: 'FREQ=DAILY' }),

    // Mon
    E(0, '09:00', '11:00', 'Q4 roadmap draft', 'focus', 'deep'),
    E(0, '11:30', '12:15', 'Team sync', 'event', 'sync', work),
    E(0, '15:00', '15:15', 'Reply to brief', 'task', 'admin'),

    // Tue
    E(1, '10:30', '11:30', 'Customer call', 'event', 'sync', work),
    E(1, '13:30', '16:00', 'Onboarding spec', 'focus', 'deep'),
    E(1, '16:15', '16:30', 'Timesheets', 'task', 'admin'),
    E(1, '23:00', '23:45', 'Late call with Sydney', 'event', 'sync', work),

    // Wed
    E(2, '04:30', '05:30', 'Airport run', 'event', 'admin', family),
    E(2, '09:00', '12:00', 'Research synthesis', 'focus', 'research'),
    E(2, '14:00', '15:00', 'Design review', 'event', 'design', work),
    E(2, '15:15', '16:45', 'Focus block', 'ai', 'deep'),

    // Thu — a clash and a four-way overlap
    E(3, '09:00', '12:00', 'Write launch plan', 'focus', 'deep'),
    E(3, '10:30', '11:30', 'Board prep', 'event', 'sync', work),
    E(3, '13:30', '14:30', '1:1 with Sam', 'event', 'sync', work),
    E(3, '13:30', '14:00', 'Vendor call', 'event', 'sync'),
    E(3, '13:45', '14:30', 'Hiring sync', 'event', 'sync', work),
    E(3, '14:00', '14:45', 'Expense review', 'task', 'admin'),

    // Fri — a proposal and a block that runs past midnight
    E(4, '10:00', '10:30', '1:1 with Sam', 'ai', 'sync'),
    E(4, '13:00', '15:00', 'Deck review', 'focus', 'design'),
    E(4, '16:30', '17:00', 'Weekly review', 'task', 'admin'),
    E(4, '21:00', '01:00', 'Release night', 'event', 'deep', { endDate: d(5) }),

    // weekend
    E(5, '11:00', '13:00', 'Family brunch', 'event', 'admin', family),
    E(6, '05:00', '07:30', 'Flight to Lisbon', 'event', 'admin', family),

    // all-day
    E(2, '00:00', '00:00', 'Berlin offsite', 'event', 'sync', { ...work, allDay: true, endDate: d(4) }),
    E(5, '00:00', '00:00', "Mum's birthday", 'event', 'admin', { ...family, allDay: true, endDate: d(6) }),
    E(5, '00:00', '00:00', 'Public holiday', 'event', 'admin', {
      imported: true,
      calendarId: 'cal_holidays',
      allDay: true,
      endDate: d(6),
    }),
  ];
}

export function previewAccounts(): ApiAccount[] {
  return [
    {
      id: 'acct_1',
      email: 'you@example.com',
      displayName: 'You',
      accentColor: 'lime',
      syncStatus: 'ok',
      syncError: null,
      lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      calendars: [
        { id: 'cal_work', providerCalendarId: 'primary', name: 'Work', color: '#4285F4', isPrimary: true, readEnabled: true },
        { id: 'cal_family', providerCalendarId: 'family', name: 'Family', color: '#33B679', isPrimary: false, readEnabled: true },
        { id: 'cal_holidays', providerCalendarId: 'holidays', name: 'Holidays in Germany', color: '#8E24AA', isPrimary: false, readEnabled: false },
      ],
    },
  ];
}
