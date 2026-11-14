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
 *   opt-in write-back of your Find Time blocks, proposals you accept, undo).
 * - No customers, metrics or quotes we don't have.
 * - `*starred*` words in a title are set in italic; `|` before a word starts a new line (wide screens).
 */

/** The deployed origin, for canonical and absolute OG URLs. Set EXPO_PUBLIC_SITE_URL on Railway. */
export const SITE = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');

export const META = {
  title: 'Find Time — work and life, in one plan',
  description:
    'Find Time plans a busy week the way you would: meetings, deadlines, the gym and the school run, each in the hours that are really free. Works with your work and personal Google calendars; nothing lands until you say yes. Private beta.',
} as const;

export const LANDING = {
  brand: 'Find Time',
  nav: [
    { label: 'How it plans', section: 'human' },
    { label: 'Work and life', section: 'both' },
    { label: 'Questions', section: 'faq' },
  ],
  signIn: 'Sign in',
  headerCta: 'Join the beta',

  hero: {
    kicker: 'For busy people · Private beta',
    title: 'Work and life, |*in one plan.*',
    body: 'Find Time plans your week the way you would. Meetings, deadlines, the gym and the school run, each in the hours that are really free.',
    cta: 'Join the private beta',
    secondary: 'See how it plans',
    notes: ['Works with Google Calendar', 'Work and personal, together', 'Nothing lands without your yes'],
    boardLabel: 'Example week · Sep 14 – 18',
    legend: [
      { key: 'meet', label: 'Work' },
      { key: 'life', label: 'Personal' },
      { key: 'focus', label: 'Focus time' },
      { key: 'proposal', label: 'Proposed' },
      { key: 'away', label: 'Away' },
    ],
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
    /** *starred* words settle in colour */
    text: 'You already know how to plan a good week. *You just never have the time.*',
  },

  /** how a person plans, and how Find Time does the same */
  human: {
    title: 'Planned the way *a person would.*',
    body: 'A calendar shows you the week. An auto-scheduler fills every gap in it. Find Time plans like someone who knows you.',
    rows: [
      { n: '01', name: 'Hard things first', body: 'Deep work goes in the hours you do it best.', spec: 'Launch brief · mornings' },
      { n: '02', name: 'Room to breathe', body: 'Ask for a gap between calls and it keeps one.', spec: '15 min between calls' },
      { n: '03', name: 'Evenings stay yours', body: 'Work is planned inside your working hours.', spec: 'Work · 09:00 – 18:00' },
      { n: '04', name: 'It asks, it never guesses', body: 'No day or length? You get a question, with options.', spec: 'Third gym session? · Skip it' },
      { n: '05', name: 'Promises are kept', body: 'Meetings other people booked never move.', spec: 'Client call · stays' },
      { n: '06', name: 'Tell it once', body: 'Say how you like to work and it remembers.', spec: 'No deep work on Monday mornings' },
    ],
  },

  /** work + personal in one week: a planned Wednesday, filterable */
  both: {
    title: 'One week. *Both halves* of it.',
    body: 'Connect your work and personal Google calendars, add the tasks and habits that live in your head, and plan them together. A deadline never lands on the dentist.',
    sourcesLabel: 'What goes into the plan',
    sources: [
      { key: 'meet', label: 'Work calendar' },
      { key: 'life', label: 'Personal calendar' },
      { key: 'focus', label: 'Tasks with a deadline' },
      { key: 'habit', label: 'Habits you want to keep' },
      { key: 'away', label: 'Trips and days off' },
    ],
    dayLabel: 'Example day · Wednesday, planned',
    filterLabel: 'Show',
    filters: [
      { key: 'both', label: 'Both' },
      { key: 'work', label: 'Work' },
      { key: 'life', label: 'Life' },
    ],
    day: [
      { time: '07:30 – 10:00', title: 'Launch brief', side: 'work', kind: 'focus', note: 'Your best hours, kept for the hard thing.' },
      { time: '10:00 – 10:30', title: 'Standup', side: 'work', kind: 'meet' },
      { time: '12:30 – 13:30', title: 'Lunch with Sam', side: 'life', kind: 'life', note: 'Personal plans count as real plans.' },
      { time: '15:00 – 16:00', title: 'Roadmap review', side: 'work', kind: 'meet' },
      { time: '16:30 – 17:30', title: 'Dentist', side: 'life', kind: 'life' },
      { time: '18:00 – 19:00', title: 'Gym', side: 'life', kind: 'habit', note: 'The gym gets a slot, not a wish.' },
    ],
    count: (work: number, life: number) => `${work} for work · ${life} for you`,
  },

  story: {
    label: 'How it works',
    title: 'Say it like you would *to a person.*',
    step: (n: number, of: number) => `Step ${n} of ${of}`,
    chapters: [
      {
        n: '01',
        title: 'You say it.',
        quote: '“Launch brief by Thursday, about ten hours. Gym three times.”',
      },
      {
        n: '02',
        title: 'It reads your week.',
        body: 'Work calls, the dentist, the trip. All of it stays put. It finds the real gaps.',
      },
      {
        n: '03',
        title: 'It proposes.',
        body: 'Mornings for the brief, evenings for the gym.',
        ask: { q: 'Third gym session?', options: ['Tue 07:00', 'Skip it'] },
      },
      {
        n: '04',
        title: 'You say yes.',
        body: 'Proposals drop into place. One tap undoes it.',
      },
      {
        n: '05',
        title: 'Life happens. It replans.',
        body: 'A call lands on Wednesday. The lost hour moves to Thursday.',
      },
    ],
  },

  trust: {
    label: 'Your calendar stays yours',
    title: 'You stay *in charge.*',
    hint: 'Try it',
    items: [
      { title: 'Nothing lands without a yes.', body: 'Every plan is a proposal first.', ui: 'proposal' },
      { title: 'Reads first. Writes only if you ask.', body: 'Your Find Time blocks, and the events you move yourself.', ui: 'toggle' },
      { title: 'Other people’s meetings never move.', body: 'It plans around them.', ui: 'locked' },
      { title: 'Your event details stay in Google.', body: 'Find Time keeps the times it plans around, not what your events say.', ui: 'private' },
    ],
    uiText: {
      proposalTitle: 'Launch brief',
      proposalTime: 'Mon 07:30–10:00',
      accept: 'Accept',
      undo: 'Undo',
      toggle: 'Show Find Time blocks in Google Calendar',
      on: 'On',
      off: 'Off',
      lockedTitle: 'Client call',
      lockedTime: 'Tue 11:00',
      lockedNote: 'Booked by someone else — it stays',
      privateGoogle: 'In Google',
      privateOurs: 'What Find Time keeps',
      privateTitle: 'Dentist',
      privateTime: 'Wed 16:30–17:30',
      privateBusy: 'Busy',
    },
  },

  insights: {
    label: 'Insights',
    title: 'See where *the week went.*',
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
    title: 'Questions, *answered plainly.*',
    items: [
      {
        q: 'Is it for work or for my personal life?',
        a: 'Both, in one week. Connect a work and a personal Google account and Find Time plans around everything on them, so work never lands on a personal plan and the other way round.',
      },
      {
        q: 'Which calendars does it work with?',
        a: 'Google Calendar, with more than one account if you have them. Other calendar providers aren’t supported yet.',
      },
      {
        q: 'Will it move my meetings?',
        a: 'No. Meetings other people booked with you stay where they are. Find Time only rearranges blocks it proposed itself.',
      },
      {
        q: 'Can it find a time with other people?',
        a: 'Not yet. It plans your own time around the meetings you already have; it doesn’t send booking links or look at anyone else’s calendar.',
      },
      {
        q: 'Does it write to my Google Calendar?',
        a: 'Only when you ask. Turn on Google Calendar sync and your Find Time blocks appear as private events. Move or delete one of your own events in Find Time and Google updates too — for one-off events without guests. It never edits meetings with other people.',
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
    title: 'Give the whole week *a plan.*',
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
 * Cookie banner + settings dialog (src/consent/ConsentManager.web.tsx). The
 * banner is a notice while only necessary items are declared in
 * src/consent/registry.ts, and becomes an Accept / Reject choice by itself once
 * an optional category is declared there.
 */
export const COOKIES = {
  title: 'Cookies',
  notice:
    'Find Time only stores what it needs to sign you in, keep the site secure and remember your settings. No analytics, advertising or tracking.',
  consent: (optional: string) =>
    `We use necessary cookies to run the site. With your OK we’d also use ${optional} cookies. You can change this any time under “Cookie settings” at the bottom of every page.`,
  gotIt: 'Got it',
  acceptAll: 'Accept all',
  rejectAll: 'Reject all',
  customize: 'Customize',
  settings: 'Cookie settings',
  save: 'Save choices',
  close: 'Close',
  privacyLink: 'Privacy policy',
  dialogIntro:
    'Choose what Find Time may store on your device. Necessary items can’t be turned off; everything else stays off until you turn it on, and you can change your mind here at any time.',
  notUsed: 'Not used',
  alwaysOn: 'Always on',
  items: (n: number) => (n === 1 ? '1 item' : `${n} items`),
  noItems: 'Nothing in this category is stored on this site.',
  tabs: { consent: 'Consent', details: 'Details', about: 'About' },
  about: [
    'Cookies and similar storage (local and session storage) are small pieces of data a website keeps on your device. Some are needed for the site to work; others are optional.',
    'The law lets us store what is strictly necessary without asking. For anything else we need your permission, and you can change or withdraw it here at any time.',
    'Find Time sets its own items only. No third party stores anything through this site.',
  ],
  recordTitle: 'Your consent record',
  withdraw: 'To change your choice, open “Cookie settings” at the bottom of any page.',
  gpc: 'Your browser sends a Global Privacy Control signal, so optional cookies stay off unless you turn them on here.',
  yourChoice: (date: string, id: string) => `Your choice from ${date}. Consent ID: ${id}`,
  noChoice: 'You haven’t made a choice yet.',
  cols: { name: 'Name', provider: 'Provider', purpose: 'Purpose', expiry: 'Expiry', type: 'Type' },
} as const;
