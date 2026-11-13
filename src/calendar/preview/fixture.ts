import { AGENT_TOOLS } from '@/lib/agent-tools';
import type { ApiAccount, ApiHabit, ApiTask, ChatMessage, SessionSummary, ToolUi } from '@/lib/api-types';

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
    E(2, '15:15', '16:45', 'Draft pitch deck', 'ai', 'deep'),

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
      accentColor: 'lime',
      syncStatus: 'ok',
      syncError: null,
      lastSyncAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      calendars: [
        { id: 'cal_work', providerCalendarId: 'primary', name: 'Work', color: '#4285F4', isPrimary: true, readEnabled: true },
        { id: 'cal_family', providerCalendarId: 'family', name: 'Family', color: '#33B679', isPrimary: false, readEnabled: true },
        { id: 'cal_holidays', providerCalendarId: 'en.german#holiday@group.v.calendar.google.com', name: 'Holidays in Germany', color: '#8E24AA', isPrimary: false, readEnabled: true },
      ],
    },
  ];
}

/* ───────────────────────── Plan with AI ───────────────────────── */

/** A short conversation for the AI panel in `/preview`, on the fixture week. */
export function previewChat(): {
  history: ChatMessage[];
  reply: (text: string) => ChatMessage;
  tools: ToolUi[];
  chats: { summary: SessionSummary; messages: ChatMessage[] }[];
} {
  const at = (date: string, hm: string) => `${date}T${hm}:00.000Z`;
  const t = new Date();
  const d = (n: number) => {
    const x = new Date(t.getFullYear(), t.getMonth(), t.getDate() + n);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const now = new Date().toISOString();
  return {
    tools: AGENT_TOOLS,
    history: [
      { id: 'u1', role: 'user', text: 'Make room for 2h of deep work on the launch plan before Friday', createdAt: now },
      {
        id: 'a1',
        role: 'assistant',
        text: 'The best fit is **tomorrow, 09:30 – 11:30**. Your morning is clear and it lands before Friday\'s review. I haven\'t booked anything yet.',
        createdAt: now,
        trace: [
          { tool: 'read_calendar', label: 'Checked your next 3 weeks', detail: '12 fixed blocks this week · freest Sat · busiest Tue', ms: 180 },
          { tool: 'apply_rules', label: 'Applied your rules', detail: '2 rules · 3 learned habits' },
          { tool: 'propose_blocks', label: 'Read “Make room for 2h of deep work on the…”', detail: 'launch plan · 120 min · before Fri', ms: 1640 },
          { tool: 'rank_slots', label: 'Scored free slots', detail: '27 candidates · 120 min · picked 1' },
        ],
        proposals: [
          {
            id: 'p1',
            title: 'Launch plan — deep work',
            startISO: at(d(1), '09:30'),
            endISO: at(d(1), '11:30'),
            category: 'deep',
            reason: 'it is your longest free stretch in working hours before Friday',
            alternatives: [
              { startISO: at(d(1), '14:00'), endISO: at(d(1), '16:00') },
              { startISO: at(d(2), '09:00'), endISO: at(d(2), '11:00') },
            ],
          },
        ],
      },
      { id: 'u2', role: 'user', text: 'And never book me before 9', createdAt: now },
      {
        id: 'a2',
        role: 'assistant',
        text: 'Done. I will keep everything after **09:00** from now on.',
        createdAt: now,
        savedRule: { id: 'r1', label: 'No bookings before 09:00' },
        trace: [
          { tool: 'read_calendar', label: 'Checked your next 3 weeks', detail: '12 fixed blocks this week · freest Sat · busiest Tue', ms: 150 },
          { tool: 'apply_rules', label: 'Applied your rules', detail: '2 rules · 3 learned habits' },
          { tool: 'record_rule', label: 'Read “And never book me before 9”', detail: 'rule · nothing before 09:00', ms: 920 },
          { tool: 'save_rule', label: 'Saved a rule', detail: 'No bookings before 09:00' },
        ],
      },
    ],
    // Past chats for the history list: today, yesterday, this week, earlier.
    chats: [
      ['pv1', 0, 2, 'Gym three times a week', 'Habit saved: Gym, 3 times a week, mornings. I will plan the sessions each week.', 'Gym 3x a week, mornings'],
      ['pv2', 0, 5, 'Block Friday afternoon for errands', 'Friday 14:00–18:00 is blocked as time off.', 'Block Friday afternoon for errands'],
      ['pv3', 1, 3, 'Plan my week', 'I placed 4 of your 5 tasks. The tax return does not fit before Thursday; it needs 3 h and you have 1 h 30 free.', 'Plan my week'],
      ['pv4', 3, 1, 'Move the design review', 'The design review moves to Thursday 14:00. Nothing else changes.', 'Move the design review to Thursday'],
      ['pv5', 9, 4, 'How much free time next week?', 'You have 14 h free next week in working hours, most of it on Wednesday and Friday.', 'How much free time do I have next week?'],
      ['pv6', 20, 2, 'No meetings before 10', 'Rule saved: no bookings before 10:00.', 'Never book me before 10'],
    ].map(([id, daysAgo, hoursAgo, title, line, asked]) => {
      const at = new Date(t.getTime() - (daysAgo as number) * 86_400_000 - (hoursAgo as number) * 3_600_000).toISOString();
      return {
        summary: { id: id as string, title: title as string, lastMessageAt: at, lastLine: line as string },
        messages: [
          { id: `${id}u`, role: 'user', text: asked as string, createdAt: at },
          { id: `${id}a`, role: 'assistant', text: line as string, createdAt: at },
        ],
      };
    }),
    reply: () => ({
      id: `a_${Date.now()}`,
      role: 'assistant',
      text: 'How long should it be?',
      createdAt: new Date().toISOString(),
      question: { text: 'How long should it be?', options: ['30 min', '1 hour', '2 hours'] },
      trace: [
        { tool: 'read_calendar', label: 'Checked your next 3 weeks', detail: '13 fixed blocks this week · freest Sat · busiest Tue', ms: 160 },
        { tool: 'apply_rules', label: 'Applied your rules', detail: '3 rules · 3 learned habits' },
        { tool: 'propose_blocks', label: 'Read “gym at 6”', detail: 'Gym · 18:00 · length missing', ms: 1210 },
        { tool: 'ask', label: 'Needs one detail', detail: 'asked rather than guessed' },
      ],
    }),
  };
}

/** The Tasks page: a backlog with a deadline, one on hold, one already planned, and two habits. */
export function previewTaskData(): { tasks: ApiTask[]; habits: ApiHabit[] } {
  const day = (n: number) => `${iso(addDays(today(), n))}T00:00:00.000Z`;
  const base = { preferBy: null, notBefore: null, priority: 'medium', effort: 'normal', preferredWindow: null, splittable: false, minChunkMin: 30, category: 'deep-work', completedAt: null } as const;
  return {
    tasks: [
      { ...base, id: 't1', title: 'Write the quarterly report', status: 'scheduled', durationMin: 300, dueBy: day(3), splittable: true, effort: 'hard' },
      { ...base, id: 't2', title: 'Tax return', status: 'backlog', durationMin: 180, dueBy: day(20), notBefore: day(7), category: 'admin', effort: 'light' },
      { ...base, id: 't3', title: 'Review the onboarding flow', status: 'backlog', durationMin: 90, dueBy: null, priority: 'high', category: 'design' },
    ],
    habits: [
      { id: 'h1', title: 'Gym', category: 'personal', durationMin: 60, perWeek: 3, minPerWeek: 2, preferredWindow: 'morning' },
      { id: 'h2', title: 'Read papers', category: 'research', durationMin: 45, perWeek: 2, minPerWeek: null, preferredWindow: null },
    ],
  };
}
