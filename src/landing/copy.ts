/**
 * Every string on the landing page, so a copy change never has to touch layout.
 *
 * The page was first a verbatim port of design/from_user/landing.html (an AI day
 * planner). On 2026-09-11 it was repositioned for the personal-agent pivot — an
 * agent for email, calendar, tasks and accounts whose model never sees your
 * secrets. META / MARQUEE / HEADER / HERO / TELEMETRY / FOOTER and everything from
 * AGENT_LOG to ROADMAP are that copy (HANDOFF-landing.md §9). PLANNER, SCHEDULE*,
 * DEMO, PHONE, WIDGETS, MODAL and TOASTS are still the landing.html copy; they back
 * the mock components that are kept in the tree but no longer mounted.
 *
 * Claims are written to match the roadmap: what Phase 1 ships today is stated as
 * fact; the boundary and storage design are labelled as Phase 2 spec.
 */

import type { IconName } from '@/design/Icon';

export const META = {
  title: 'Find Time — the personal agent that never sees your secrets',
  description:
    'Find Time handles your email, calendar, tasks and accounts. Names, numbers and wallet addresses are swapped for placeholders before the model sees them, and nothing leaves without your approval. Private beta.',
} as const;

export const MARQUEE =
  'ANSWERS YOUR EMAIL // PLANS YOUR WEEK // PAYS THE INVOICE // CLEARS YOUR INBOX // BOOKS THE MEETING // NEVER SEES YOUR SECRETS //';

export const HEADER = {
  brand: 'FIND TIME',
  homeLabel: 'Find Time home',
  nav: [
    { label: 'WHAT IT DOES', anchor: 'capabilities' },
    { label: 'THE BOUNDARY', anchor: 'boundary' },
    { label: 'ROADMAP', anchor: 'roadmap' },
  ],
  cta: 'WAITLIST',
} as const;

export const HERO = {
  eyebrow: 'PERSONAL AGENT / WEB + APP / PRIVATE BY DESIGN',
  headlineTop: 'IT DOES THE WORK.',
  headlineAccent: 'IT NEVER SEES YOUR SECRETS.',
  body: 'Find Time answers your email, plans your week, chases your tasks and keeps your accounts in order. Your phone number, your wallet and your passwords stay on your side of a line the model never crosses.',
  primaryCta: 'JOIN THE WAITLIST',
  secondaryCta: 'SEE HOW IT’S BUILT',
  /** The three zeros the product is built around. */
  stats: [
    { value: '00', label: 'SECRETS SENT TO THE MODEL' },
    { value: '00', label: 'DOUBLE-BOOKINGS' },
    { value: '00', label: 'PAYMENTS WITHOUT YOU' },
  ],
} as const;

/** The `2xl`-only left aside. Ambient telemetry — no interaction. */
export const TELEMETRY = [
  'ACT.04',
  'HELD.01',
  'TOKENS.03',
  'VAULT.LOCKED',
  'MODEL.BLIND',
  'EGRESS.CLEAR',
  'CONFLICTS.00',
  'UTC.09:21',
  'STATUS.RUNNING',
] as const;

export type AgentLogRow = {
  time: string;
  kind: string;
  text: string;
  /** a placeholder shown in place of a real value, rendered lime */
  token?: string;
  /** the row that waits for the visitor's approval */
  held?: boolean;
};

/** The hero's example agent activity (components/AgentLog.tsx). Example data. */
export const AGENT_LOG = {
  label: 'Example agent activity log',
  title: 'AGENT LOG / THU 11 SEP',
  status: 'RUNNING',
  rows: [
    { time: '09:12', kind: 'EMAIL', text: 'Replied to Maya: Thursday works, and sent two free slots from your calendar' },
    { time: '09:14', kind: 'CALENDAR', text: 'Moved deep work to 14:00–16:00 to make room. 0 conflicts' },
    { time: '09:20', kind: 'ACCOUNTS', text: 'Pay invoice #2231 to Studio Nord, €480.00 from', token: '<IBAN_1>', held: true },
    { time: '09:21', kind: 'TASKS', text: 'Added “Renew passport” for Friday, before the post office closes' },
  ] as AgentLogRow[],
  done: 'DONE',
  held: 'HELD FOR YOU',
  paid: 'PAID',
  approve: 'APPROVE & PAY',
  review: 'REVIEW',
  reviewClose: 'HIDE',
  reviewBody:
    'Pays Studio Nord €480.00. Your IBAN is filled in by the vault after you approve. The model only ever saw <IBAN_1>.',
  footActions: '4 ACTIONS',
  footWaiting: (n: number) => `${n} WAITING ON YOU`,
  footSecrets: '0 SECRETS SENT TO MODEL',
} as const;

export const CAPABILITIES = {
  eyebrow: 'WHAT IT DOES',
  title: 'ONE AGENT FOR THE ADMIN OF BEING A PERSON.',
  body: 'Tell it what you need in a sentence. It works across your inbox, calendar, tasks and accounts, and checks with you before anything leaves your hands.',
  askLabel: 'CHECKS WITH YOU',
  items: [
    {
      icon: 'letter' as IconName,
      tag: 'INBOX',
      title: 'EMAIL',
      points: ['Sorts overnight mail into what needs you', 'Drafts replies in your voice', 'Follows up when nobody answers'],
      ask: 'Before sending to anyone new, or anything with an attachment.',
    },
    {
      icon: 'calendar-mark' as IconName,
      tag: 'CALENDAR',
      title: 'TIME',
      points: ['Finds slots that never double-book', 'Protects focus and recovery time', 'Agrees meeting times over email'],
      ask: 'Before moving anything someone else is invited to.',
    },
    {
      icon: 'lock' as IconName,
      tag: 'ACCOUNTS',
      title: 'MONEY & LOGINS',
      points: ['Pays bills you have approved before', 'Flags renewals and price rises', 'Cancels subscriptions you stopped using'],
      ask: 'Every payment, every time.',
    },
    {
      icon: 'check' as IconName,
      tag: 'TASKS',
      title: 'FOLLOW-THROUGH',
      points: ['Turns emails into to-dos with due dates', 'Schedules them where they fit', 'Reminds you at the right moment'],
      ask: 'Not needed. Nothing here leaves your account.',
    },
  ],
} as const;

/** Which value a boundary mark stands for — the same key links it across lanes. */
export type BoundaryKey = 'contact' | 'wallet' | 'phone';
/** A run of lane text: plain strings, or a tappable value. */
export type Seg = string | { k: BoundaryKey; v: string };
type Lane = {
  step: string;
  where: string;
  title: string;
  /** `real` values render as highlighted originals, `token` as lime placeholders */
  kind: 'real' | 'token';
  body: Seg[];
  code?: Seg[];
  chips: string[];
};

export const BOUNDARY: {
  eyebrow: string;
  title: string;
  body: string;
  hint: string;
  lanes: Lane[];
  vaultTitle: string;
  vaultBody: string;
} = {
  eyebrow: 'THE BOUNDARY',
  title: 'THE MODEL GETS PLACEHOLDERS. YOU KEEP THE REAL THING.',
  body: 'Before your request reaches the model, names, phone numbers, wallet addresses and account numbers are swapped for tokens. The model plans with the tokens. Only after you approve are the real values put back, straight into the message that leaves.',
  hint: 'TAP A VALUE TO FOLLOW IT ACROSS THE BOUNDARY',
  lanes: [
    {
      step: '01 · YOU ASK',
      where: 'ON YOUR DEVICE',
      title: 'YOUR REQUEST',
      kind: 'real',
      body: [
        'Email ',
        { k: 'contact', v: 'Maya Kranz' },
        ' that the deposit goes to ',
        { k: 'wallet', v: '0x71C7…9A3f' },
        ', and to call me on ',
        { k: 'phone', v: '+49 151 2345 6789' },
        ' if it bounces.',
      ],
      chips: ['3 VALUES DETECTED'],
    },
    {
      step: '02 · IT THINKS',
      where: 'WHAT THE MODEL SEES',
      title: 'TOKENS ONLY',
      kind: 'token',
      body: [
        'Email ',
        { k: 'contact', v: '<CONTACT_1>' },
        ' that the deposit goes to ',
        { k: 'wallet', v: '<WALLET_1>' },
        ', and to call me on ',
        { k: 'phone', v: '<PHONE_1>' },
        ' if it bounces.',
      ],
      code: [
        'send_email(\n  to:   ',
        { k: 'contact', v: '<CONTACT_1>' },
        ',\n  body: "…goes to ',
        { k: 'wallet', v: '<WALLET_1>' },
        '…\n         call me on ',
        { k: 'phone', v: '<PHONE_1>' },
        '"\n)',
      ],
      chips: ['0 REAL VALUES IN PROMPT'],
    },
    {
      step: '03 · YOU APPROVE',
      where: 'WHAT LEAVES',
      title: 'THE REAL EMAIL',
      kind: 'real',
      body: [
        'To: ',
        { k: 'contact', v: 'maya@studionord.de' },
        '\nHi Maya, the deposit goes to ',
        { k: 'wallet', v: '0x71C7…9A3f' },
        '. If anything bounces, call me on ',
        { k: 'phone', v: '+49 151 2345 6789' },
        '.',
      ],
      chips: ['APPROVED BY YOU', 'OUTGOING SCAN CLEAR'],
    },
  ],
  vaultTitle: 'THE VAULT SITS OUTSIDE THE MODEL’S REACH.',
  vaultBody:
    'Plain code, not the model, looks up the real value and writes it into the outgoing message after the model has finished. There is nothing sensitive in the prompt to leak, to log, or to be tricked into repeating.',
};

export const STORAGE: {
  eyebrow: string;
  title: string;
  body: string;
  tableLeft: string;
  tableRight: string;
  rows: { field: string; value: string; note: string; empty?: boolean }[];
  principles: { title: string; body: string }[];
  roadmapNote: string;
} = {
  eyebrow: 'WHAT WE KEEP',
  title: 'ALMOST NOTHING, AND NOTHING WE CAN READ.',
  body: 'An agent can’t leak what it never stored. This is your whole account, as it will sit in our database.',
  tableLeft: 'TABLE users · 1 ROW',
  tableRight: 'DESIGN SPEC · PHASE 2',
  rows: [
    { field: 'user_id', value: 'u_7f3a91c2', note: 'Random. Means nothing outside our system.' },
    { field: 'identity', value: 'google:sub 10984…5527', note: 'An opaque sign-in ID. No name column, no email column.' },
    {
      field: 'google_token',
      value: '▓▓▓▓▓▓▓▓▓▓ 412 bytes',
      note: 'Encrypted. The key lives in a separate key service and unlocks it only for the seconds a task runs.',
    },
    {
      field: 'calendar · inbox · contacts',
      value: '— not stored',
      empty: true,
      note: 'Fetched live from Google when a task needs them, then discarded.',
    },
    {
      field: 'phone · wallet · passwords',
      value: '— never on our servers',
      empty: true,
      note: 'Kept on your device, encrypted with a key only you hold.',
    },
  ],
  principles: [
    {
      title: 'LIVE, NOT CACHED',
      body: 'Your calendar and inbox stay with Google. We read them when a task needs them and keep no copy.',
    },
    {
      title: 'UNLOCKED FOR SECONDS',
      body: 'Background jobs decrypt your access token in memory, do one job, wipe it and exit. Between jobs, a database dump is only ciphertext.',
    },
    {
      title: 'SCRUBBED BEFORE LOGGING',
      body: 'Error reports pass through the same redaction as the model, so a crash report can’t carry your number.',
    },
  ],
  roadmapNote: 'SEE THE ROADMAP FOR WHAT’S LIVE TODAY',
};

export const RULES = {
  eyebrow: 'RULES IT CAN’T BREAK',
  title: 'THE MODEL DECIDES. CODE DOES.',
  body: 'Find Time’s planner already works this way: the model reads your request, and a plain slot-finder places every block. That’s why it can’t double-book you. The agent keeps the same rule for everything else.',
  videoCaption: 'LIVE IN BETA · THE SLOT-FINDER, NOT THE MODEL, PLACES EVERY BLOCK',
  items: [
    {
      code: 'PROPOSE → CHECK → ACT',
      title: 'THE MODEL CAN ONLY ASK',
      body: 'It picks an action and fills in the blanks. Tested code checks the request and carries it out, or refuses.',
    },
    {
      code: 'HOLD → APPROVE',
      title: 'NOTHING LEAVES WITHOUT YOU',
      body: 'Every email to someone new, every payment and every shared file is shown to you in its final form first.',
    },
    {
      code: 'KNOWN CONTACTS ONLY',
      title: 'IT WRITES TO PEOPLE YOU KNOW',
      body: 'Sends are limited to your contacts. An unfamiliar address, even one it read in an email, needs you to add it.',
    },
    {
      code: 'AUDIT LOG',
      title: 'EVERYTHING IS ON THE RECORD',
      body: 'Every action, with what it saw and why it acted. Read it, export it, undo from it.',
    },
  ],
} as const;

export const LIMITS = {
  eyebrow: 'WHAT WE WON’T PROMISE',
  title: 'NO AGENT IS PERFECTLY SAFE. HERE’S WHERE OURS ISN’T.',
  items: [
    {
      title: 'Prompt injection is managed, not solved.',
      body: 'An email can hide instructions aimed at the agent. It treats everything it reads as information, never as orders, and holds outbound actions for you. Nobody in the industry can promise zero.',
    },
    {
      title: 'Detection misses things.',
      body: 'Phone numbers, IBANs and wallet addresses are caught reliably. Unusual formats can slip through, so every outgoing message gets a second scan before it leaves.',
    },
    {
      title: 'Some data has to be used.',
      body: 'If you ask it to text your landlord, the number has to reach the text. It travels as a token and is filled in only for that one message, but it does leave.',
    },
  ],
} as const;

export type PhaseState = 'live' | 'next' | 'planned';

export const ROADMAP: {
  eyebrow: string;
  title: string;
  body: string;
  stateLabel: Record<PhaseState, string>;
  phases: { n: string; state: PhaseState; title: string; points: string[] }[];
} = {
  eyebrow: 'ROADMAP',
  title: 'PRIVACY FIRST, THEN POWER.',
  body: 'The boundary ships before the agent gets anything that can send, pay or share. Money comes last because it carries the most risk.',
  stateLabel: { live: 'LIVE IN BETA', next: 'NEXT', planned: 'PLANNED' },
  phases: [
    {
      n: 'PHASE 1',
      state: 'live',
      title: 'FIND TIME',
      points: [
        'Connect Google Calendar',
        'Describe what you need; it places blocks around your real events',
        'Structurally unable to double-book',
      ],
    },
    {
      n: 'PHASE 2',
      state: 'next',
      title: 'THE BOUNDARY',
      points: [
        'Personal data swapped for tokens before it reaches the model',
        'On-device vault for numbers, wallets and passwords',
        'Calendar data fetched live instead of cached',
        'Sign-in by opaque ID; keys held in a separate key service',
      ],
    },
    {
      n: 'PHASE 3',
      state: 'planned',
      title: 'EMAIL & TASKS',
      points: [
        'Sort, draft and send, behind your approval',
        'Outgoing scan and a full audit log',
        'Sends limited to your known contacts',
      ],
    },
    {
      n: 'PHASE 4',
      state: 'planned',
      title: 'ACCOUNTS',
      points: ['Bills, renewals and subscriptions', 'Every payment approved by you, every time'],
    },
  ],
};

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
  title: 'HAND OVER THE ADMIN. KEEP THE SECRETS.',
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
    'Request early access to Find Time — the personal agent that does the work and never sees your secrets. Private beta.',
  optional: 'OPTIONAL',
  nameLabel: 'Your name',
  namePlaceholder: 'Ada Lovelace',
  reasonLabel: 'Why do you want to use Find Time?',
  reasonPlaceholder: 'What would you hand over to an agent first?',
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
  tagline: 'REDACTED BEFORE REASONING · APPROVED BEFORE SENDING',
  links: [
    { label: 'PRIVACY', href: '/privacy' },
    { label: 'TERMS', href: '/terms' },
  ],
  copyright: '© 2026 FIND TIME',
} as const;
