/**
 * Every string on the landing page, so a copy change never has to touch layout.
 *
 * The page was first a verbatim port of design/from_user/landing.html (an AI day
 * planner). It now sells Find Time as a productivity agent that works across your
 * tools — email, Slack, calendar, cloud drive, browser, docs, tasks, meetings —
 * keeps your work inside them, and never connects to wallets, contacts, passwords
 * or cards (HANDOFF-landing.md §10). META / MARQUEE / HEADER / HERO / TELEMETRY /
 * FOOTER and CONNECTORS … ECOSYSTEM are that copy. PLANNER, SCHEDULE*, DEMO, PHONE,
 * WIDGETS, MODAL and TOASTS are still the landing.html copy; they back the mock
 * components that are kept in the tree but no longer mounted.
 *
 * The page shows what the agent does, not how it is built: no pipeline, no
 * storage schema, no roadmap.
 */

import type { IconName } from '@/design/Icon';

export const META = {
  title: 'Find Time — the productivity agent for your email, Slack, calendar and drive',
  description:
    'Find Time works across your email, Slack, calendar, cloud drive and browser to get the busywork done. Your work never leaves your ecosystem, and it never touches your wallet or contacts. Private beta.',
} as const;

export const MARQUEE =
  'CLEARS YOUR INBOX // ANSWERS SLACK // BOOKS THE MEETING // FILES THE DOC // RESEARCHES THE WEB // YOUR WORK NEVER LEAVES //';

export const HEADER = {
  brand: 'FIND TIME',
  homeLabel: 'Find Time home',
  nav: [
    { label: 'CONNECTORS', anchor: 'connectors' },
    { label: 'WHAT IT DOES', anchor: 'workflows' },
    { label: 'PRIVACY', anchor: 'privacy' },
  ],
  cta: 'WAITLIST',
} as const;

export const HERO = {
  eyebrow: 'PRODUCTIVITY AGENT / WEB + APP / PRIVATE BY DESIGN',
  headlineTop: 'IT DOES THE BUSYWORK.',
  headlineAccent: 'YOUR WORK NEVER LEAVES.',
  body: 'Find Time is a productivity agent that works across your email, Slack, calendar, cloud drive and browser. Say what you need and it gets done. Everything stays inside your own tools, and it never touches your wallet or your contacts.',
  primaryCta: 'JOIN THE WAITLIST',
  secondaryCta: 'SEE THE CONNECTORS',
  stats: [
    { value: '08', label: 'TOOLS IT WORKS ACROSS' },
    { value: '00', label: 'WORDS LEAVE YOUR ECOSYSTEM' },
    { value: '00', label: 'WALLETS OR CONTACTS TOUCHED' },
  ],
} as const;

/** The `2xl`-only left aside. Ambient telemetry — no interaction. */
export const TELEMETRY = [
  'EMAIL.ON',
  'SLACK.ON',
  'CAL.ON',
  'DRIVE.ON',
  'WEB.ON',
  'WALLET.OFF',
  'CONTACTS.OFF',
  'EGRESS.00',
  'STATUS.RUNNING',
] as const;

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
  title: 'PLUGS INTO THE TOOLS YOU ALREADY WORK IN.',
  body: 'Switch on the tools you want it to use. It works across all of them in one go, and it can’t reach anything you leave off.',
  windowUrl: 'APP.FINDTIME.AI / CONNECTIONS',
  panelTitle: 'CONNECTIONS',
  count: (on, total) => `${on} OF ${total} ON`,
  items: [
    { key: 'email', icon: 'letter', name: 'EMAIL', apps: 'Gmail · Outlook', can: 'READ · DRAFT · SEND', on: true },
    { key: 'slack', icon: 'hashtag', name: 'SLACK', apps: 'Channels · DMs · threads', can: 'READ · REPLY · POST', on: true },
    { key: 'calendar', icon: 'calendar-mark', name: 'CALENDAR', apps: 'Google · Outlook', can: 'READ · BOOK · MOVE', on: true },
    { key: 'cloud', icon: 'cloud', name: 'CLOUD', apps: 'Google Drive · Dropbox · OneDrive', can: 'FIND · READ · FILE', on: false },
    { key: 'browser', icon: 'browser', name: 'BROWSER', apps: 'Any site you point it at', can: 'SEARCH · READ · COMPARE', on: false },
    { key: 'docs', icon: 'notebook', name: 'DOCS', apps: 'Notion · Google Docs', can: 'WRITE · UPDATE', on: false },
    { key: 'tasks', icon: 'checklist', name: 'TASKS', apps: 'Linear · Asana · Todoist', can: 'CREATE · TRACK · CLOSE', on: false },
    { key: 'meetings', icon: 'video', name: 'MEETINGS', apps: 'Zoom · Google Meet · Teams', can: 'NOTES · FOLLOW-UPS', on: false },
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
  eyebrow: 'WHAT IT CAN DO',
  title: 'ONE ASK. EVERY TOOL IT TAKES.',
  body: 'Say what you need in a sentence. It moves between your apps until the job is done.',
  askLabel: 'YOU ASK',
  uses: 'USES',
  flows: [
    {
      tab: 'SCHEDULE',
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
      tab: 'INBOX',
      ask: 'Clear my inbox before 9.',
      steps: [
        { c: 'email', text: 'Sorts 42 new emails into what needs you' },
        { c: 'email', text: 'Drafts six replies in your voice' },
        { c: 'tasks', text: 'Turns three requests into to-dos' },
        { c: 'calendar', text: 'Blocks an hour to get them done' },
      ],
      result: 'INBOX CLEAR',
    },
    {
      tab: 'RESEARCH',
      ask: 'Brief me on our three biggest competitors.',
      steps: [
        { c: 'browser', text: 'Reads their pricing and launch pages' },
        { c: 'cloud', text: 'Pulls last quarter’s notes from Drive' },
        { c: 'docs', text: 'Writes a one-page brief' },
        { c: 'slack', text: 'Shares it in #strategy' },
      ],
      result: 'BRIEF SHARED',
    },
    {
      tab: 'FOLLOW-UP',
      ask: 'Follow up on this morning’s client call.',
      steps: [
        { c: 'meetings', text: 'Pulls the notes from the call' },
        { c: 'tasks', text: 'Creates the action items' },
        { c: 'email', text: 'Drafts the recap to the client' },
        { c: 'calendar', text: 'Books the next check-in' },
      ],
      result: 'RECAP READY',
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
  youSub: 'BRIEFS · DRAFTS · BOOKINGS',
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
  title: 'HAND OVER THE BUSYWORK.',
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
    'Request early access to Find Time — the productivity agent that works across your email, Slack, calendar and drive, and keeps your work inside them. Private beta.',
  optional: 'OPTIONAL',
  nameLabel: 'Your name',
  namePlaceholder: 'Ada Lovelace',
  reasonLabel: 'Why do you want to use Find Time?',
  reasonPlaceholder: 'Which tool would you connect first?',
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
  tagline: 'YOUR TOOLS · ONE AGENT · NOTHING LEAVES',
  links: [
    { label: 'PRIVACY', href: '/privacy' },
    { label: 'TERMS', href: '/terms' },
  ],
  copyright: '© 2026 FIND TIME',
} as const;
