/**
 * Landing strings — the one place to review and edit what the page says.
 *
 * LANDING is rendered by `dom/LandingPage.tsx`; the example week the hero and
 * the story draw lives in `dom/week-data.ts`. META is the `<Head>` on `/` and
 * the `+html.tsx` fallback; COOKIES is the notice mounted over the landing.
 *
 * Copy rules:
 * - Say plainly what the visitor is looking at; label every example as one.
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
    kicker: 'An AI planner for your calendar · Private beta',
    title: ['Plan the week', 'you meant to have.'],
    body:
      'Find Time reads your Google Calendar and puts your tasks, habits and focus time into the hours that are really free. Say what the week needs in one sentence. Nothing lands until you say yes.',
    cta: 'Join the private beta',
    secondary: 'See how it works',
    note: 'Works with Google Calendar',
    canvasLabel: 'Example · a week as it usually arrives',
    canvasAlt:
      'An example work week, Monday to Friday. Meetings are scattered across each day, leaving only short gaps. Labels point out 15- and 20-minute gaps between meetings that are too short to use, a run of back-to-back calls on Tuesday, and a ten-hour thesis draft with no time set aside for it.',
    notes: {
      crumbs: 'Gaps too short to use',
      b2b: 'Back to back until 19:00',
      homeless: 'Thesis draft, 10 h — no time for it yet',
    },
  },

  manifesto: {
    label: 'Why it exists',
    /** *starred* words settle in ink; the rest settle a step quieter */
    text:
      'Your calendar remembers everything you agreed to. It forgets everything you *meant to do.* Find Time gives those things *a time,* before the week fills up.',
  },

  story: {
    label: 'How it works',
    title: 'One sentence in. A planned week out.',
    canvasLabel: 'Example week',
    legend: [
      { kind: 'meet', label: 'Already on your calendar' },
      { kind: 'free', label: 'Free time it found' },
      { kind: 'proposal', label: 'Proposed, not yet booked' },
      { kind: 'placed', label: 'Accepted' },
    ],
    chapters: [
      {
        n: '01',
        title: 'You say what the week needs.',
        body: 'No forms and no dragging blocks around — just tell it, the way you would tell an assistant.',
        quote:
          '“Thesis draft by Thursday, about ten hours. Gym three times. I’m in Copenhagen from Thursday evening.”',
      },
      {
        n: '02',
        title: 'It reads the week you already have.',
        body: 'Meetings stay exactly where they are. It finds the stretches long enough for real work, and blocks out the trip before planning anything around it.',
      },
      {
        n: '03',
        title: 'It proposes, and tells you what didn’t fit.',
        body: 'Writing goes in the mornings and gym in the evenings — ten hours done before you leave. The third gym session doesn’t fit, because Tuesday’s calls run late, so it asks instead of squeezing it in.',
        ask: { q: 'Third gym session?', options: ['Tue 07:00', 'Skip this week'] },
      },
      {
        n: '04',
        title: 'You say yes. It’s on your calendar.',
        body: 'Accept the whole week or only part of it. One tap undoes it.',
      },
      {
        n: '05',
        title: 'When the week changes, it replans.',
        body: 'A 10:00 call lands on Wednesday’s writing session. Find Time offers Thursday 11:00 instead — still done before the flight.',
        ask: { q: 'Move the hour you lost?', options: ['Thu 11:00', 'Leave it'] },
      },
    ],
  },

  keeps: {
    label: 'What it keeps in mind',
    title: 'It plans the way you would, if you had the time.',
    rows: [
      {
        n: '01',
        name: 'Deadlines',
        body: 'Work lands before it’s due, not the night before.',
        spec: 'Thesis · 10 h · due Thu',
      },
      {
        n: '02',
        name: 'Habits',
        body: 'Three gym sessions a week stays three, even when Tuesday fills up.',
        spec: 'Gym · 3× a week · evenings',
      },
      {
        n: '03',
        name: 'Your energy',
        body: 'Hard work goes into your best hours, with a daily limit so no day is all deep work.',
        spec: 'Deep work · mornings · 4 h a day max',
      },
      {
        n: '04',
        name: 'Time away',
        body: 'Trips, holidays and travel time are blocked before anything is planned around them.',
        spec: 'Copenhagen · Thu 18:00 → Tue',
      },
      {
        n: '05',
        name: 'What you moved',
        body: 'Move a block yourself and it stays put the next time the week is replanned.',
        spec: 'Pinned · Wed 14:00',
      },
    ],
  },

  trust: {
    label: 'Your calendar stays yours',
    title: 'You stay in charge of every hour.',
    items: [
      {
        title: 'Nothing lands without a yes.',
        body: 'Every plan arrives as a proposal, drawn dashed. Accept all of it, some of it or none — and undo with one tap.',
        ui: 'proposal',
      },
      {
        title: 'It reads first. It writes only if you ask.',
        body: 'Find Time reads your Google Calendar. Writing back is a switch you turn on, and it adds only your focus blocks, as private busy events.',
        ui: 'toggle',
      },
      {
        title: 'Other people’s meetings never move.',
        body: 'It plans around the time other people booked with you. It never moves their meetings to make room.',
        ui: 'locked',
      },
    ],
    uiText: {
      proposalTitle: 'Thesis · Mon 07:30–10:00',
      accept: 'Accept',
      undo: 'Undo',
      toggle: 'Add focus blocks to Google Calendar',
      toggleState: 'Off',
      lockedTitle: 'Client call · Tue 11:00',
      lockedNote: 'Booked by someone else',
    },
  },

  insights: {
    label: 'Insights',
    title: 'See where the week actually went.',
    body: 'A plain read of your week, built from the same calendar it plans on: how much was meetings, how much real focus time you got, and how much free time was too short to use.',
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
        a: 'Google Calendar. Connect your account and Find Time reads the calendars you choose. Other calendar providers aren’t supported yet.',
      },
      {
        q: 'Will it move my meetings?',
        a: 'No. Meetings other people booked with you stay where they are. Find Time plans around them and only rearranges the blocks it proposed itself.',
      },
      {
        q: 'Does it write to my Google Calendar?',
        a: 'Only if you turn it on. When you do, it adds your focus blocks as private, busy events so colleagues see the time is taken. Nothing else is written.',
      },
      {
        q: 'Do I need to type out my schedule first?',
        a: 'No. It already sees your calendar. You tell it what the week needs — a deadline, a habit, a trip — in a sentence.',
      },
      {
        q: 'What if everything doesn’t fit?',
        a: 'It tells you what didn’t fit and why, and offers a choice — another time, a shorter session or skipping it — instead of squeezing it in.',
      },
      {
        q: 'Can I use it today?',
        a: 'Find Time is in private beta. Leave your email and we’ll write once, when a place opens.',
      },
    ],
  },

  final: {
    title: ['Give your week', 'a plan.'],
    body: 'Find Time is in private beta. Leave your email and we’ll write once, when there’s a place for you.',
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
