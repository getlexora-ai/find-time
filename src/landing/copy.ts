/**
 * Landing strings — the one place to review and edit what the page says.
 *
 * LANDING is rendered by `dom/LandingPage.tsx`; the example week the board
 * draws lives in `dom/week-data.ts`, and the hero demo runs the product's own
 * parser and slot ranking in `dom/demo.ts`. META is the `<Head>` on `/` and the
 * `+html.tsx` fallback; COOKIES is the notice mounted over the landing.
 *
 * Copy rules:
 * - Short. A headline and at most one line under it; let the board show it.
 * - Label every example as one.
 * - Only claim what the product does today (Google Calendar, read first,
 *   opt-in write-back of focus blocks, proposals you accept, undo).
 * - No customers, metrics or quotes we don't have.
 */

export const META = {
  title: 'Find Time — plan the week you meant to have',
  description:
    'Find Time reads your Google Calendar and places your tasks, habits and focus time in the hours that are really free. Say what the week needs in one sentence; nothing lands until you say yes. Private beta.',
} as const;

export const LANDING = {
  brand: 'Find Time',
  nav: [
    { label: 'How it works', section: 'story' },
    { label: 'Your calendar', section: 'trust' },
    { label: 'Questions', section: 'faq' },
  ],
  signIn: 'Sign in',
  headerCta: 'Join the beta',

  hero: {
    kicker: 'AI week planner · Private beta',
    title: ['Plan the week', 'you meant to have.'],
    body: 'Say what your week needs. It finds the time.',
    cta: 'Join the private beta',
    note: 'Works with Google Calendar',
    boardLabel: 'Example week · Sep 14 – 18',
    boardAlt:
      'A 3D example work week, Monday to Friday, with meetings set into the board. Proposed blocks float above it until accepted, then drop into place.',
  },

  /** the hero's "type your week" box — runs the real parser on the example week */
  demo: {
    label: 'Try it on the example week',
    placeholder: 'Gym 3 times, 1 hour, evenings',
    inputLabel: 'What does your week need?',
    submit: 'Plan it',
    examples: [
      'Gym 3 times, 1 hour, evenings',
      'Launch brief by Friday, 6 hours',
      'Spanish 3x a week, 45 min',
      'Write the report',
    ],
    accept: 'Accept',
    clear: 'Clear',
    undo: 'Undo',
    placed: (n: number, title: string) => `${n} × ${title}, proposed`,
    partial: (n: number, of: number) => `${n} of ${of} fit around this week`,
    none: 'Nothing fits around this week — try a shorter length.',
    accepted: 'On the calendar.',
    other: 'Try a task or a habit — like the examples.',
    why: 'Why there:',
    privacy: 'Runs in your browser. Nothing you type is sent anywhere.',
  },

  manifesto: {
    label: 'Why it exists',
    /** *starred* words settle in ink; the rest settle a step quieter */
    text: 'Your calendar remembers what you agreed to. Find Time remembers *what you meant to do.*',
  },

  story: {
    label: 'How it works',
    title: 'One sentence in. A planned week out.',
    chapters: [
      {
        n: '01',
        title: 'You say it.',
        quote: '“Thesis by Thursday, about ten hours. Gym three times.”',
      },
      {
        n: '02',
        title: 'It reads your week.',
        body: 'Meetings and trips stay put. It finds the real gaps.',
      },
      {
        n: '03',
        title: 'It proposes.',
        body: 'Mornings for writing, evenings for gym.',
        ask: { q: 'Third gym session?', options: ['Tue 07:00', 'Skip it'] },
      },
      {
        n: '04',
        title: 'You say yes.',
        body: 'Proposals drop into place. One tap undoes it.',
      },
      {
        n: '05',
        title: 'It replans.',
        body: 'A call lands on Wednesday. The lost hour moves to Thursday.',
      },
    ],
  },

  keeps: {
    label: 'What it keeps in mind',
    title: 'It plans the way you would.',
    rows: [
      { n: '01', name: 'Deadlines', spec: 'Thesis · 10 h · due Thu' },
      { n: '02', name: 'Habits', spec: 'Gym · 3× a week · evenings' },
      { n: '03', name: 'Your energy', spec: 'Deep work · mornings · 4 h a day max' },
      { n: '04', name: 'Time away', spec: 'Copenhagen · Thu 18:00 → Tue' },
      { n: '05', name: 'What you moved', spec: 'Pinned · Wed 14:00' },
    ],
  },

  trust: {
    label: 'Your calendar stays yours',
    title: 'You stay in charge.',
    hint: 'Try them',
    items: [
      { title: 'Nothing lands without a yes.', body: 'Every plan is a proposal first.', ui: 'proposal' },
      { title: 'Reads first. Writes only if you ask.', body: 'Your focus blocks, and the events you move yourself.', ui: 'toggle' },
      { title: 'Other people’s meetings never move.', body: 'It plans around them.', ui: 'locked' },
    ],
    uiText: {
      proposalTitle: 'Thesis',
      proposalTime: 'Mon 07:30–10:00',
      accept: 'Accept',
      undo: 'Undo',
      toggle: 'Add focus blocks to Google Calendar',
      on: 'On',
      off: 'Off',
      lockedTitle: 'Client call',
      lockedTime: 'Tue 11:00',
      lockedNote: 'Booked by someone else — it stays',
    },
  },

  insights: {
    label: 'Insights',
    title: 'See where the week went.',
    sample: 'Sample week',
    /** values are read from the example week (dom/week-data.ts readWeek) */
    kpis: [
      { key: 'focus', unit: 'h', label: 'Focus time' },
      { key: 'meet', unit: 'h', label: 'Meetings' },
      { key: 'ready', unit: 'h', label: 'Focus-ready time left' },
      { key: 'b2b', unit: '', label: 'Back-to-back runs' },
    ],
    chartLabel: 'Hours per day',
    chartAlt:
      'Bar chart of the sample week: hours of focus time, meetings and free time for each weekday. Tuesday is almost all meetings; Friday is away.',
    series: [
      { key: 'focus', label: 'Focus' },
      { key: 'meet', label: 'Meetings' },
      { key: 'free', label: 'Free' },
    ],
  },

  faq: {
    label: 'Questions',
    title: 'Questions, answered plainly.',
    items: [
      {
        q: 'Which calendars does it work with?',
        a: 'Google Calendar. Other calendar providers aren’t supported yet.',
      },
      {
        q: 'Will it move my meetings?',
        a: 'No. Meetings other people booked with you stay where they are. Find Time only rearranges blocks it proposed itself.',
      },
      {
        q: 'Does it write to my Google Calendar?',
        a: 'Only when you ask. Turn on focus-block sync and your focus blocks appear as private busy events. Move or delete one of your own events in Find Time and Google updates too — for one-off events without guests. It never edits meetings with other people.',
      },
      {
        q: 'What if everything doesn’t fit?',
        a: 'It tells you what didn’t fit and offers a choice, instead of squeezing it in.',
      },
      {
        q: 'Can I use it today?',
        a: 'It’s in private beta. Leave your email and we’ll write once, when a place opens.',
      },
    ],
  },

  final: {
    title: ['Give your week', 'a plan.'],
    body: 'Private beta. One email when there’s a place for you.',
    placeholder: 'you@work.com',
    emailLabel: 'Email address',
    button: 'Join the beta',
    sending: 'Joining…',
    done: 'You’re on the list. We’ll write when a place opens.',
    invalid: 'That email doesn’t look right — check it and try again.',
    failed: 'Something went wrong on our side. Please try again.',
  },

  footer: {
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Sign in', href: '/login' },
    ],
    copyright: '© 2026 Find Time',
  },
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
