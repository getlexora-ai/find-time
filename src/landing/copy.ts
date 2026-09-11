/**
 * Every string on the landing page, so a copy change never has to touch layout.
 *
 * The page was first a verbatim port of design/from_user/landing.html (an AI day
 * planner), then a productivity-agent page (branch `agent-landing`). This branch
 * (`calendar-landing`, HANDOFF-landing.md §11) keeps the agent's connectors and
 * privacy story but sells the pain it starts with: planning and scheduling your
 * calendar. META / MARQUEE / HEADER / HERO / TELEMETRY / FOOTER, WEEK, PROBLEM and
 * CONNECTORS … ECOSYSTEM are that copy. HUB backs the unmounted ConnectorHub.
 * PLANNER, SCHEDULE*, DEMO, PHONE, WIDGETS, MODAL and TOASTS are still the
 * landing.html copy; they back mock components kept in the tree but not mounted.
 *
 * The page shows what it does, not how it is built: no pipeline, no storage
 * schema, no roadmap.
 */

import type { IconName } from '@/design/Icon';

export const META = {
  title: 'Find Time — the AI calendar planner that plans and schedules your week',
  description:
    'Tell Find Time what your week needs. It books the meetings, protects your focus time and fits in the goals that keep slipping — around your real calendar, with context from your email, Slack and tasks. Nothing leaves your own tools. Private beta.',
} as const;

export const MARQUEE =
  'PLANS YOUR WEEK // BOOKS THE MEETING // PROTECTS YOUR FOCUS // FITS IN YOUR GOALS // NO MORE BACK-AND-FORTH // YOUR CALENDAR NEVER LEAVES //';

export const HEADER = {
  brand: 'FIND TIME',
  homeLabel: 'Find Time home',
  nav: [
    { label: 'PROBLEM', anchor: 'problem' },
    { label: 'HOW IT PLANS', anchor: 'workflows' },
    { label: 'CONNECTORS', anchor: 'connectors' },
    { label: 'PRIVACY', anchor: 'privacy' },
  ],
  cta: 'WAITLIST',
} as const;

export const HERO = {
  eyebrow: 'AI CALENDAR PLANNER / WEB + APP / PRIVATE BY DESIGN',
  headlineTop: 'STOP PLAYING CALENDAR TETRIS.',
  headlineAccent: 'FIND TIME PLANS YOUR WEEK.',
  body: 'Say what your week needs in one sentence. Find Time books the meetings, guards your focus time and fits in the goals that keep slipping — around your real calendar, with context from your email, Slack and tasks. Nothing leaves your own tools.',
  primaryCta: 'JOIN THE WAITLIST',
  secondaryCta: 'SEE HOW IT PLANS',
  stats: [
    { value: '01', label: 'SENTENCE TO PLAN YOUR WEEK' },
    { value: '00', label: 'DOUBLE BOOKINGS' },
    { value: '00', label: 'WORDS LEAVE YOUR ECOSYSTEM' },
  ],
} as const;

/** The `2xl`-only left aside. Ambient telemetry — no interaction. */
export const TELEMETRY = [
  'WK.37',
  'CAL.ON',
  'MTG.15',
  'FOCUS.4.5H',
  'GOALS.03',
  'CONFLICTS.00',
  'EGRESS.00',
  'WALLET.OFF',
  'STATUS.PLANNING',
] as const;

export type WeekBlock = {
  /** 0 = Monday */
  day: number;
  /** decimal hours, 13.5 = 13:30 */
  start: number;
  end: number;
  /** short enough to sit in a ~56px day column */
  label: string;
};

/** The hero diagram (components/WeekBoard.tsx): a packed week, one ask, and the
 *  blocks Find Time drops into the gaps. `placed` must not overlap `meetings`. */
export const WEEK: {
  label: string;
  title: string;
  replayLabel: string;
  status: Record<'before' | 'planning' | 'done', string>;
  askLabel: string;
  ask: string;
  days: string[];
  from: number;
  to: number;
  gutter: string[];
  meetings: WeekBlock[];
  placed: WeekBlock[];
  before: string;
  after: string;
} = {
  label:
    'Diagram: a work week already full of meetings. From one request, Find Time places two focus blocks, three German sessions and a booked one-to-one into the free gaps, with no conflicts.',
  title: 'THIS WEEK / SEP 14–18',
  replayLabel: 'Replay the planning',
  status: { before: 'UNPLANNED', planning: 'PLANNING…', done: 'PLANNED' },
  askLabel: 'YOU ASK',
  ask: 'Plan my week: finish the launch brief, German three times, and a 1:1 with Sam.',
  days: ['MON', 'TUE', 'WED', 'THU', 'FRI'],
  from: 8,
  to: 18,
  gutter: ['08', '10', '12', '14', '16', '18'],
  meetings: [
    { day: 0, start: 9, end: 10, label: 'SYNC' },
    { day: 0, start: 13, end: 14, label: 'CLIENT' },
    { day: 0, start: 15.5, end: 16.5, label: 'HIRING' },
    { day: 1, start: 9, end: 9.5, label: 'STANDUP' },
    { day: 1, start: 10, end: 11.5, label: 'REVIEW' },
    { day: 1, start: 14, end: 15, label: 'PITCH' },
    { day: 1, start: 16, end: 17, label: 'VENDOR' },
    { day: 2, start: 9, end: 9.5, label: 'STANDUP' },
    { day: 2, start: 13, end: 14, label: 'KICKOFF' },
    { day: 2, start: 15, end: 16, label: 'ROADMAP' },
    { day: 3, start: 9, end: 9.5, label: 'STANDUP' },
    { day: 3, start: 11, end: 12, label: 'SPRINT' },
    { day: 3, start: 15, end: 16, label: 'SALES' },
    { day: 4, start: 9.5, end: 10.5, label: 'RETRO' },
    { day: 4, start: 14, end: 15.5, label: 'DEMO' },
  ],
  placed: [
    { day: 0, start: 10.5, end: 12.5, label: 'FOCUS' },
    { day: 1, start: 8, end: 8.75, label: 'GERMAN' },
    { day: 2, start: 10, end: 12.5, label: 'FOCUS' },
    { day: 3, start: 8, end: 8.75, label: 'GERMAN' },
    { day: 3, start: 14, end: 14.5, label: '1:1 SAM' },
    { day: 4, start: 8, end: 8.75, label: 'GERMAN' },
  ],
  before: '15 MEETINGS · 0H FOCUS · 0 GERMAN',
  after: '4.5H FOCUS · 3× GERMAN · 1:1 BOOKED · 0 CONFLICTS',
};

/** The pain section (components/PainPoints.tsx). Four pictures of a calendar
 *  going wrong, each with one line on what Find Time does instead. */
export const PROBLEM = {
  eyebrow: 'THE PROBLEM',
  title: 'YOUR CALENDAR FILLS ITSELF. NOBODY PLANS IT.',
  body: 'Meetings land wherever there’s a gap. The work that matters gets whatever is left.',
  fixLabel: 'FIND TIME',
  thread: {
    tag: 'THE BACK-AND-FORTH',
    count: '7 EMAILS · 1 MEETING',
    messages: [
      { you: true, text: 'Does Tuesday at 3 work?' },
      { you: false, text: 'Can’t, sorry — Thursday morning?' },
      { you: true, text: 'I’m out Thursday. Friday?' },
      { you: false, text: 'Friday’s full. Next week?' },
    ],
    fix: 'Finds the hour everyone has free and sends one invite.',
  },
  packed: {
    tag: 'NO ROOM TO THINK',
    count: '0H FOCUS',
    from: 9,
    to: 18,
    hours: ['09', '12', '15', '18'],
    blocks: [
      { start: 9, end: 10 },
      { start: 10, end: 11.5 },
      { start: 11.75, end: 12.5 },
      { start: 12.5, end: 13.5 },
      { start: 13.75, end: 14.75 },
      { start: 14.75, end: 15.5 },
      { start: 15.75, end: 16.75 },
      { start: 17, end: 18 },
    ],
    gapsLabel: 'GAPS',
    gaps: ['15M', '15M', '15M', '15M'],
    fix: 'Groups the meetings that can move and guards two hours for deep work.',
  },
  slip: {
    tag: 'THE GOAL THAT SLIPS',
    count: '3 WEEKS · 0 SESSIONS',
    goal: 'GERMAN',
    weeks: ['WK 35', 'WK 36', 'WK 37'],
    state: 'PUSHED',
    fix: 'Fits it into the gaps you really have — every week.',
  },
  cascade: {
    tag: 'ONE CHANGE, THREE CLASHES',
    count: '3 CONFLICTS',
    moved: 'CLIENT CALL MOVED  14:00 → 16:00',
    clashes: ['Focus block · launch brief', '1:1 with Sam', 'Admin batch'],
    clashTag: 'CLASH',
    fix: 'Replans the rest of the day in one go.',
  },
} as const;

export type ConnectorKey = 'email' | 'slack' | 'calendar' | 'cloud' | 'browser' | 'docs' | 'tasks' | 'meetings';

export type Connector = {
  key: ConnectorKey;
  icon: IconName;
  /** short enough to sit in a hub node */
  name: string;
  apps: string;
  can: string;
  /** switched on in the Connections preview at rest */
  on: boolean;
};

/** Something the agent can never be connected to. */
export type Blocked = { icon: IconName; name: string };

/** The Connections screen preview (components/Connectors.tsx). The items also
 *  feed the hero hub, the workflow steps and the ecosystem diagram. */
export const CONNECTORS: {
  eyebrow: string;
  title: string;
  body: string;
  windowUrl: string;
  panelTitle: string;
  count: (on: number, total: number) => string;
  items: Connector[];
  blockedTitle: string;
  blockedTag: string;
  blocked: Blocked[];
  caption: string;
} = {
  eyebrow: 'CONNECTORS',
  title: 'YOUR CALENDAR, PLUS EVERYTHING THAT FILLS IT.',
  body: 'Calendar is the core. Switch on email, Slack and tasks and it plans around what lands there too. It can’t reach anything you leave off.',
  windowUrl: 'APP.FINDTIME.AI / CONNECTIONS',
  panelTitle: 'CONNECTIONS',
  count: (on, total) => `${on} OF ${total} ON`,
  items: [
    { key: 'calendar', icon: 'calendar-mark', name: 'CALENDAR', apps: 'Google · Outlook', can: 'READ · BOOK · MOVE · PROTECT', on: true },
    { key: 'email', icon: 'letter', name: 'EMAIL', apps: 'Gmail · Outlook', can: 'SPOTS REQUESTS · SENDS INVITES', on: true },
    { key: 'slack', icon: 'hashtag', name: 'SLACK', apps: 'Channels · DMs · threads', can: 'POSTS OPTIONS · CONFIRMS', on: true },
    { key: 'tasks', icon: 'checklist', name: 'TASKS', apps: 'Linear · Asana · Todoist', can: 'DEADLINES → TIME BLOCKS', on: true },
    { key: 'meetings', icon: 'video', name: 'MEETINGS', apps: 'Zoom · Google Meet · Teams', can: 'NOTES · BOOKS FOLLOW-UPS', on: false },
    { key: 'docs', icon: 'notebook', name: 'DOCS', apps: 'Notion · Google Docs', can: 'AGENDAS · PREP NOTES', on: false },
    { key: 'cloud', icon: 'cloud', name: 'CLOUD', apps: 'Google Drive · Dropbox · OneDrive', can: 'ATTACHES THE RIGHT FILE', on: false },
    { key: 'browser', icon: 'browser', name: 'BROWSER', apps: 'Any site you point it at', can: 'CHECKS VENUES · TRAVEL', on: false },
  ],
  blockedTitle: 'OFF LIMITS · CAN’T BE CONNECTED',
  blockedTag: 'NEVER',
  blocked: [
    { icon: 'wallet', name: 'WALLETS' },
    { icon: 'contacts', name: 'CONTACTS' },
    { icon: 'key', name: 'PASSWORDS' },
    { icon: 'card', name: 'PAYMENT CARDS' },
  ],
  caption: 'PREVIEW · THE CONNECTIONS SCREEN IN THE APP · TAP A TOOL TO SWITCH IT',
};

/** The hero diagram (components/ConnectorHub.tsx). */
export const HUB = {
  label:
    'Diagram: Find Time connected to email, Slack, calendar, cloud drive, browser, docs, tasks and meetings. Wallets and contacts are never connected.',
  title: 'ONE AGENT / EVERY TOOL',
  status: '8 CONNECTORS',
  core: 'FIND TIME',
  never: 'NEVER CONNECTS',
} as const;

export type FlowStep = { c: ConnectorKey; text: string };
export type Flow = { tab: string; ask: string; steps: FlowStep[]; result: string };

/** The tabbed flowcharts (components/Workflows.tsx). Example tasks. */
export const WORKFLOWS: {
  eyebrow: string;
  title: string;
  body: string;
  askLabel: string;
  uses: string;
  flows: Flow[];
  videoTag: string;
  videoTitle: string;
} = {
  eyebrow: 'HOW IT PLANS',
  title: 'SAY IT ONCE. IT LANDS ON YOUR CALENDAR.',
  body: 'One sentence in. It checks your calendar, pulls in what your other tools know, and books the result — no dragging blocks around.',
  askLabel: 'YOU ASK',
  uses: 'USES',
  flows: [
    {
      tab: 'PLAN MY WEEK',
      ask: 'Plan my week around the launch — and keep German going.',
      steps: [
        { c: 'tasks', text: 'Pulls this week’s deadlines from Linear' },
        { c: 'calendar', text: 'Maps every meeting and every free gap' },
        { c: 'calendar', text: 'Places focus blocks before each deadline' },
        { c: 'calendar', text: 'Fits three German sessions into your mornings' },
      ],
      result: 'WEEK PLANNED',
    },
    {
      tab: 'BOOK A MEETING',
      ask: 'Find an hour with the design team this week and post it in #design.',
      steps: [
        { c: 'slack', text: 'Reads who’s in #design' },
        { c: 'calendar', text: 'Finds three slots everyone has free' },
        { c: 'slack', text: 'Posts the options to the channel' },
        { c: 'calendar', text: 'Books the one they pick and sends the invite' },
      ],
      result: 'MEETING BOOKED',
    },
    {
      tab: 'RESCHEDULE',
      ask: 'My 2pm client call moved to 4. Fix the rest of my day.',
      steps: [
        { c: 'calendar', text: 'Spots the three blocks the move now clashes with' },
        { c: 'calendar', text: 'Moves your focus block into the freed-up 2pm' },
        { c: 'calendar', text: 'Pushes the admin batch to tomorrow morning' },
        { c: 'email', text: 'Asks Sam to shift your 1:1 by 30 minutes' },
      ],
      result: 'DAY REPLANNED',
    },
    {
      tab: 'INBOX → CALENDAR',
      ask: 'Book every meeting that’s waiting in my inbox.',
      steps: [
        { c: 'email', text: 'Finds four emails asking for time' },
        { c: 'calendar', text: 'Checks each one against your week' },
        { c: 'email', text: 'Replies with times that actually work' },
        { c: 'calendar', text: 'Books the ones that confirm' },
      ],
      result: '4 MEETINGS BOOKED',
    },
  ],
  videoTag: 'LIVE IN BETA',
  videoTitle: 'WATCH IT PLAN A WEEK AROUND A REAL CALENDAR.',
};

/** The privacy diagram (components/Ecosystem.tsx). Deliberately almost no prose:
 *  the diagram is the argument. */
export const ECOSYSTEM = {
  eyebrow: 'PRIVATE BY DESIGN',
  title: 'NO TEXT LEAVES YOUR ECOSYSTEM.',
  label:
    'Diagram: your tools, the Find Time agent and you sit inside one boundary. Nothing crosses it to ad networks, data brokers, model training or other companies. Wallets, contacts, passwords and payment cards are never connected.',
  inside: 'YOUR ECOSYSTEM',
  tools: 'YOUR TOOLS',
  core: 'FIND TIME',
  you: 'YOU',
  youSub: 'PLANS · BOOKINGS · INVITES',
  outsideTitle: 'OUTSIDE',
  outside: ['AD NETWORKS', 'DATA BROKERS', 'MODEL TRAINING', 'OTHER COMPANIES'],
  blockedTitle: 'NEVER CONNECTED',
  legend: { stays: 'STAYS INSIDE', blocked: 'NEVER CROSSES', never: 'NEVER CONNECTED' },
} as const;

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
  title: 'GET YOUR WEEK BACK.',
  body: 'Find Time is in private beta. Leave your email and we’ll tell you when a spot opens — no spam, one message.',
  placeholder: 'you@example.com',
  emailLabel: 'Email address',
  submit: 'REQUEST ACCESS',
  submitting: 'SENDING…',
  /** the dedicated /waitlist page (WaitlistScreen) */
  pageTitle: 'JOIN THE WAITLIST',
  pageBody:
    'Find Time is in private beta and we invite people in small batches. Add your email to hold a place. The two questions below are optional — they just help us decide who to invite next.',
  metaDescription:
    'Request early access to Find Time — the AI calendar planner that books your meetings, protects your focus and fits in your goals, without your data leaving your own tools. Private beta.',
  optional: 'OPTIONAL',
  nameLabel: 'Your name',
  namePlaceholder: 'Ada Lovelace',
  reasonLabel: 'Why do you want to use Find Time?',
  reasonPlaceholder: 'What does your week look like right now?',
  back: '← FIND TIME',
  success: 'You’re on the list. We’ll be in touch.',
  successAlready: 'You’re already on the list — hang tight.',
  errorInvalid: 'That doesn’t look like an email address.',
  errorServer: 'Something went wrong. Try again in a moment.',
  errorRateLimited: 'Too many attempts. Give it a few minutes and try again.',
  /** shown under the form; the two link labels map to /privacy and /terms */
  consent: 'By joining you accept our',
  consentPrivacy: 'Privacy Policy',
  consentAnd: 'and',
  consentTerms: 'Terms',
  /** honeypot field label — visually hidden, never shown */
  honeypotLabel: 'Company (leave blank)',
} as const;

/**
 * Cookie notice (issue #4). Notice-only while the site sets *only* strictly
 * necessary cookies (Clerk auth). Turn `OPTIONAL_COOKIES` on in
 * `components/CookieConsent.tsx` when analytics or any non-essential cookie
 * lands, and this becomes an accept / decline choice.
 */
export const COOKIES = {
  lead: 'Cookies.',
  body:
    'Find Time uses only cookies needed for the site to work — sign-in and security. ' +
    'No tracking or advertising cookies. See the',
  privacyLink: 'privacy policy',
  dismiss: 'Got it',
  dismissLabel: 'Dismiss cookie notice',
} as const;

/**
 * Not in landing.html — it has no footer at all. Built minimal and legally
 * necessary-shaped only; the real links, and whether these pages exist, are open
 * with the user (plan §10 Q5).
 */
export const FOOTER = {
  brand: 'FIND TIME',
  tagline: 'YOUR WEEK · PLANNED · NOTHING LEAVES',
  links: [
    { label: 'PRIVACY', href: '/privacy' },
    { label: 'TERMS', href: '/terms' },
  ],
  copyright: '© 2026 FIND TIME',
} as const;
