import type { CatKey } from './tokens';
import type { CalEvent, EventKind } from './types';

/**
 * Seed fixtures — ported verbatim from design/from_user/calendar.html `EVENTS`.
 * ~55 events across three Sept 2026 weeks, including the deliberate Wed 11:00
 * double-book, a 6-event day → `+3 more`, protected focus blocks and an
 * AI-suggested Friday window. Keep TODAY / NOW_MIN so the board mockups line up
 * (HANDOFF.md §6).
 */
export const TODAY = new Date(2026, 8, 9); // Wed 9 Sep 2026
export const NOW_MIN = 14 * 60 + 22; // 14:22 — matches the UTC.14:22 telemetry

let uid = 100;
const E = (
  date: string,
  start: string,
  end: string,
  title: string,
  cat: CatKey,
  extra: Partial<CalEvent> = {},
): CalEvent => ({
  id: ++uid,
  date,
  start,
  end,
  title,
  cat,
  project: '',
  kind: 'event' as EventKind,
  notes: '',
  ...extra,
});

export function seedEvents(): CalEvent[] {
  return [
    /* ── previous weeks ── */
    E('2026-08-31', '10:00', '11:00', 'Q3 close · quarter kickoff', 'sync', { project: 'Mobile launch' }),
    E('2026-09-01', '09:30', '10:30', 'Sprint planning', 'sync', { project: 'Mobile launch' }),
    E('2026-09-01', '14:00', '15:30', 'Persona workshop', 'research', { project: 'User research' }),
    E('2026-09-02', '11:00', '11:30', 'Product team sync', 'sync'),
    E('2026-09-02', '13:00', '14:30', 'Wireframe pass · settings', 'design', { project: 'Website v2' }),
    E('2026-09-03', '09:00', '11:00', 'Deep work · pricing model', 'deep', { kind: 'focus', project: 'Website v2' }),
    E('2026-09-03', '16:00', '16:30', '1:1 with Maya', 'sync'),
    E('2026-09-04', '10:00', '11:00', 'Design review', 'design', { project: 'Website v2' }),
    E('2026-09-04', '14:00', '15:00', 'Weekly review & plan', 'admin'),

    /* ── current week: Sep 7 – 13 ── */
    E('2026-09-07', '09:00', '10:30', 'Define mobile onboarding flow', 'deep', {
      kind: 'focus',
      project: 'Mobile launch',
      notes: 'Map the first-session journey and the activation moment.',
    }),
    E('2026-09-07', '11:00', '11:30', 'Standup', 'sync'),
    E('2026-09-07', '13:00', '14:00', 'Prototype empty states', 'design', { project: 'Website v2' }),
    E('2026-09-07', '15:00', '16:00', 'Interview · Priya, ops lead', 'research', { project: 'User research' }),

    E('2026-09-08', '08:30', '09:00', 'Inbox + triage', 'admin'),
    E('2026-09-08', '09:30', '11:30', 'Deep work · activation metrics', 'deep', { kind: 'focus', project: 'Mobile launch' }),
    E('2026-09-08', '12:00', '12:45', 'Lunch and reset', 'admin', { kind: 'break' }),
    E('2026-09-08', '14:00', '15:00', 'Prototype review', 'design', { project: 'Mobile launch' }),
    E('2026-09-08', '16:00', '16:30', 'Design critique', 'design', { project: 'Website v2' }),
    E('2026-09-08', '17:00', '17:30', 'Write weekly notes', 'admin'),

    E('2026-09-09', '09:00', '10:30', 'Define mobile onboarding flow', 'deep', {
      kind: 'focus',
      project: 'Mobile launch',
      notes: 'Second pass — turn the map into a clickable flow.',
    }),
    E('2026-09-09', '11:00', '11:30', 'Product team sync', 'sync', {
      conflict: true,
      notes: 'Weekly team alignment. 30 min, agenda in Notion.',
    }),
    E('2026-09-09', '11:00', '12:00', 'Roadmap review with Maya', 'sync', {
      conflict: true,
      notes: 'Q4 scope. Maya can also do Thursday 14:00.',
    }),
    E('2026-09-09', '12:00', '12:45', 'Lunch and reset', 'admin', { kind: 'break' }),
    E('2026-09-09', '13:00', '13:50', 'Review research patterns', 'research', { project: 'User research' }),
    E('2026-09-09', '15:00', '16:00', 'Prototype review', 'design', { project: 'Mobile launch' }),

    E('2026-09-10', '09:30', '10:00', 'Standup', 'sync'),
    E('2026-09-10', '10:00', '11:00', 'Stakeholder review', 'sync', { flexible: true }),
    E('2026-09-10', '13:00', '14:00', 'Draft launch checklist', 'admin', { flexible: true }),
    E('2026-09-10', '15:30', '16:30', 'Usability test · session 2', 'research', { project: 'User research' }),

    E('2026-09-11', '09:00', '09:30', 'Standup', 'sync'),
    E('2026-09-11', '10:00', '11:30', 'Design system audit', 'design', { project: 'Website v2' }),
    E('2026-09-11', '11:45', '13:15', 'Focus window · suggested', 'deep', { kind: 'ai' }),
    E('2026-09-11', '14:00', '15:00', 'Weekly review & plan', 'admin'),

    E('2026-09-12', '10:00', '11:30', 'Write the launch case study', 'admin'),

    /* ── next weeks ── */
    E('2026-09-14', '09:00', '10:30', 'Onboarding spec review', 'deep', { kind: 'focus', project: 'Mobile launch' }),
    E('2026-09-14', '11:00', '11:30', 'Standup', 'sync'),
    E('2026-09-15', '10:00', '11:00', 'Beta launch go / no-go', 'sync', { project: 'Mobile launch' }),
    E('2026-09-15', '14:00', '15:00', 'Usability test · session 3', 'research', { project: 'User research' }),
    E('2026-09-16', '09:00', '11:00', 'Deep work · activation metrics', 'deep', { kind: 'focus' }),
    E('2026-09-16', '11:00', '11:30', 'Product team sync', 'sync'),
    E('2026-09-16', '15:00', '16:00', 'Prototype review', 'design'),
    E('2026-09-17', '13:00', '14:00', 'Press kit copy', 'admin'),
    E('2026-09-18', '10:00', '10:45', 'Sprint retro', 'sync'),
    E('2026-09-18', '12:00', '13:00', 'Team lunch', 'admin', { kind: 'break' }),
    E('2026-09-21', '09:00', '11:00', 'Mobile beta ships', 'deep', { kind: 'focus', project: 'Mobile launch' }),
    E('2026-09-23', '11:00', '11:30', 'Product team sync', 'sync'),
    E('2026-09-24', '10:00', '10:30', 'Investor update', 'admin'),
    E('2026-09-25', '14:00', '15:00', 'Weekly review & plan', 'admin'),
    E('2026-09-28', '09:30', '10:30', 'Sprint planning', 'sync'),
    E('2026-09-29', '11:00', '12:30', 'Roadmap workshop', 'sync', { project: 'Mobile launch' }),
    E('2026-09-30', '11:00', '11:30', 'Product team sync', 'sync'),
    E('2026-10-01', '09:00', '10:00', 'Q4 kickoff', 'sync'),
  ];
}

/** Next id for events created at runtime (continues the seed sequence). */
export function nextId() {
  return ++uid;
}
