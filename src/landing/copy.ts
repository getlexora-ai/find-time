/**
 * Every string on the landing page, lifted verbatim from
 * design/from_user/landing.html so a copy change never has to touch layout.
 *
 * Nothing here is invented. landing.html contains **no waitlist or signup copy at
 * all** — its CTAs open the mock "new time block" modal — so this file has none
 * either. That copy is a product decision still open with the user (plan §10 Q2).
 */

import type { IconName } from '@/design/Icon';

export const META = {
  title: 'Find Time — AI Productivity Management',
  description:
    'Organize your day in seconds, prioritize what matters, and find time for anything with AI-assisted planning.',
} as const;

export const MARQUEE =
  'YOUR DAY HAS SPACE // PRIORITIZE WHAT MATTERS // PLAN IN SECONDS // LEARN SOMETHING NEW // FIND TIME FOR ANYTHING //';

export const HEADER = {
  brand: 'FIND TIME',
  homeLabel: 'Find Time home',
  nav: [
    { label: 'PLANNER', anchor: 'planner' },
    { label: 'HOW IT WORKS', anchor: 'features' },
    { label: 'FOCUS', anchor: 'focus' },
  ],
  cta: 'START PLANNING',
} as const;

export const HERO = {
  eyebrow: 'AI PRODUCTIVITY DASHBOARD / WEB + APP',
  headlineTop: 'FIND TIME FOR',
  headlineAccent: 'WHAT MATTERS.',
  body: 'See your entire day in one place. Plan from the web dashboard, make quick updates in the mobile app, and let AI protect your focus across both.',
  primaryCta: 'PLAN MY DAY',
  secondaryCta: 'SEE 40 SEC DEMO',
} as const;

/** The `xl`-only left aside. Ambient telemetry — no interaction. */
export const TELEMETRY = [
  'DAY.247',
  'WK.36',
  'CAP.08H',
  'FOC.04',
  'BRK.03',
  'UTC.14:22',
  'PRIORITY.A',
  'ENERGY.78',
  'STATUS.OPEN',
] as const;

export const PLANNER = {
  urlBar: 'APP.FINDTIME.AI / DASHBOARD',
  date: 'TODAY / SEPTEMBER 04',
  dateMeta: 'THURSDAY · 7H 30M AVAILABLE',
  regenerateLabel: 'Regenerate schedule',
  gutter: ['08:00', '09:30', '11:00', '12:30', '14:00', '16:00'],
  recovery: 'RECOVERY WINDOW · 45M',
  buffer: '90M BUFFER PROTECTED',
  addTask: 'ADD TASK',
} as const;

export type ScheduleItem = {
  title: string;
  meta: string;
  duration: string;
  icon: IconName;
  /** the icon tile fill */
  tile: string;
  /** lime-tinted rows are the AI-placed ones */
  accent?: boolean;
};

export const SCHEDULE: ScheduleItem[] = [
  {
    title: 'German practice',
    meta: '08:00–08:35 · High energy',
    duration: '35M',
    icon: 'book',
    tile: '#ccff00',
    accent: true,
  },
  {
    title: 'Deep work · Product brief',
    meta: '08:45–10:45 · Focus protected',
    duration: '2H',
    icon: 'bolt',
    tile: '#ff4400',
  },
  {
    title: 'Team sync',
    meta: '11:00–11:30 · Calendar event',
    duration: '30M',
    icon: 'users',
    tile: '#c8c8ff',
  },
];

/** Rendered after the recovery divider (landing.html splits the list around it). */
export const SCHEDULE_AFTER_RECOVERY: ScheduleItem[] = [
  {
    title: 'Admin batch',
    meta: '13:15–14:00 · 6 small tasks',
    duration: '45M',
    icon: 'inbox',
    tile: '#ffd600',
  },
];

/**
 * The AI-placed German-study blocks the landing walkthrough animates into the
 * planner (see `useDemoSequence`). Sanctioned deviation from landing.html — the
 * user asked for a German-learning demo on the dashboard mock. See
 * HANDOFF-landing.md.
 */
export const SCHEDULE_AI: ScheduleItem[] = [
  {
    title: 'German · Vocabulary drill',
    meta: '14:15–14:45 · Spaced repetition',
    duration: '30M',
    icon: 'book',
    tile: '#ccff00',
    accent: true,
  },
  {
    title: 'German · Speaking practice',
    meta: '16:00–16:30 · Out loud, low stakes',
    duration: '30M',
    icon: 'chat',
    tile: '#ccff00',
    accent: true,
  },
];

/** AI-response block state, shared by the phone mock and `useDemoSequence`. */
export type AiResponseState = 'default' | 'thinking' | 'answered';

/** The landing dashboard walkthrough (`useDemoSequence`). Not in landing.html. */
export const DEMO = {
  prompt: 'Plan my German learning this week',
  aiRows: SCHEDULE_AI.length,
} as const;

export const PHONE = {
  statusTime: '9:41',
  eyebrow: 'AI PRIORITY ENGINE',
  title: 'YOUR REALISTIC DAY',
  capacityLabel: "TODAY'S CAPACITY",
  plannedLabel: '5H 50M PLANNED',
  freeLabel: '1H 40M FREE',
  askLabel: 'ASK FIND TIME',
  askValue: 'Plan my German learning this week',
  askAccessibilityLabel: 'Ask Find Time',
  submitLabel: 'Submit request',
  responseTitle: 'TIME FOUND',
  responseBody:
    'I moved email review to your admin batch and kept 08:00–08:35 for German, when your energy is strongest.',
  /** The canned reply the mock "ask" flow swaps in (landing.html `askAI`). */
  thinkingTitle: 'ANALYZING CALENDAR',
  thinkingBody: 'Checking priorities, energy, and flexible blocks…',
  answeredTitle: 'TIME FOUND',
  answeredBody:
    'I added two German blocks — a vocabulary drill at 14:15 and speaking practice at 16:00 — spaced from your 08:00 session and clear of your focus time.',
  changes: '2 CHANGES · 0 CONFLICTS',
  apply: 'APPLY PLAN',
  applied: 'APPLIED ✓',
} as const;

export const WIDGETS = {
  weeklyGoal: {
    label: 'WEEKLY GOAL / 04',
    value: '3.5H',
    caption: 'LANGUAGE LEARNING',
  },
  comment: {
    tag: 'COMMENT.02',
    body: "Keep this session short. Review yesterday's vocabulary first.",
    avatar: 'M',
    byline: 'MAYA · 2M AGO',
  },
  focus: {
    title: 'FOCUS MODE',
    ready: '25:00 READY',
    /** `${mm}:${ss} ACTIVE` while running */
    activeSuffix: 'ACTIVE',
    startLabel: 'Start focus timer',
    pauseLabel: 'Pause focus timer',
  },
  accuracy: {
    label: 'PLAN ACCURACY',
    value: '94.8%',
  },
} as const;

export const FEATURES = [
  {
    icon: 'calendar-mark' as IconName,
    title: 'PLAN AROUND REAL LIFE',
    body: 'Find Time balances meetings, energy, deadlines, breaks, and personal goals without overbooking you.',
  },
  {
    icon: 'sort-time' as IconName,
    title: 'PRIORITIES THAT ADAPT',
    body: 'When plans change, AI rearranges flexible tasks and keeps high-impact work protected.',
  },
  {
    icon: 'meditation' as IconName,
    title: 'MAKE PROGRESS DAILY',
    body: 'Build consistent time for language learning, health, reading, or any goal that usually gets postponed.',
    /** landing.html hangs the `#focus` anchor on the third card. */
    anchor: 'focus',
  },
];

export const MODAL = {
  eyebrow: 'NEW TIME BLOCK',
  title: 'What needs your time?',
  closeLabel: 'Close',
  fieldLabel: 'TASK OR GOAL',
  placeholder: 'e.g. Review French vocabulary',
  priorities: [
    { key: 'High', label: 'HIGH PRIORITY', hint: 'Protect this time' },
    { key: 'Flexible', label: 'FLEXIBLE', hint: 'Move if needed' },
  ],
  submit: 'FIND THE BEST TIME',
  /** the row the mock save appends to the planner */
  addedMeta: (priority: string) => `16:10–16:40 · ${priority} priority`,
  addedDuration: '30M',
} as const;

export const TOASTS = {
  taskAdded: 'Time found at 16:10. No conflicts.',
  askAnswered: 'A conflict-free time was found.',
  planApplied: 'Plan applied to your calendar.',
  regenerated: 'Day optimized. 25 extra minutes found.',
  focusComplete: 'Focus session complete.',
} as const;

/**
 * Not in landing.html — the mockup has no waitlist at all (every CTA opens a mock
 * modal). This copy is **placeholder**, written to be plain and claim nothing the
 * product can't back: pre-launch email capture, single opt-in, no promise of a
 * date. Final wording is the user's call (plan §10 Q2), and EU/DE targeting would
 * add a double-opt-in line (§10 Q4).
 */
export const WAITLIST = {
  anchor: 'waitlist' as const,
  eyebrow: 'EARLY ACCESS',
  title: 'JOIN THE WAITLIST',
  body: 'Find Time is in private beta. Leave your email and we’ll tell you when a spot opens — no spam, one message.',
  placeholder: 'you@example.com',
  emailLabel: 'Email address',
  submit: 'REQUEST ACCESS',
  submitting: 'SENDING…',
  success: 'You’re on the list. We’ll be in touch.',
  successAlready: 'You’re already on the list — hang tight.',
  errorInvalid: 'That doesn’t look like an email address.',
  errorServer: 'Something went wrong. Try again in a moment.',
  /** honeypot field label — visually hidden, never shown */
  honeypotLabel: 'Company (leave blank)',
} as const;

/**
 * Not in landing.html — it has no footer at all. Built minimal and legally
 * necessary-shaped only; the real links, and whether these pages exist, are open
 * with the user (plan §10 Q5). Nothing here makes a claim the mockup doesn't.
 */
export const FOOTER = {
  brand: 'FIND TIME',
  tagline: 'AI PRODUCTIVITY MANAGEMENT',
  links: [
    { label: 'PRIVACY', href: '/privacy' },
    { label: 'TERMS', href: '/terms' },
  ],
  copyright: '© 2026 FIND TIME',
} as const;
