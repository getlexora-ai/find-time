/**
 * Landing strings — the one place to review and edit what the page says.
 *
 * LANDING is rendered by `dom/LandingPage.tsx`. The four worked examples on the
 * animated week board (prompt, steps, result) live next to their animation data
 * in `dom/engine/weekBoard.js`. META is the `<Head>` on `/` and the `+html.tsx`
 * fallback; COOKIES is the notice mounted over the landing.
 *
 * Copy rules (from user feedback, 2026-09-11): say plainly what the visitor is
 * looking at; one sentence per point; no internals, no roadmap.
 */

export const META = {
  title: 'Find Time — the AI calendar planner that plans and schedules your week',
  description:
    'Tell Find Time what your week needs. It books the meetings, protects your focus time and fits in the goals that keep slipping — around your real calendar, with context from your email, Slack and tasks. Nothing leaves your own tools. Private beta.',
} as const;

export const LANDING = {
  nav: [
    { label: 'HOW IT WORKS', section: 'how' },
    { label: 'CONNECTORS', section: 'connectors' },
    { label: 'PRIVACY', section: 'privacy' },
  ],
  headerCta: 'JOIN WAITLIST ↗',

  hero: {
    eyebrow: 'AI CALENDAR PLANNER · PRIVATE BETA',
    title: 'Your week, planned on your real calendar.',
    body:
      'Tell Find Time what your week needs in one sentence. It reads your calendar, finds the time that’s really free, and books focus blocks, meetings and goals around what’s already there.',
    cta: 'JOIN THE WAITLIST',
    note: 'PRIVATE BETA · ONE EMAIL WHEN A SPOT OPENS',
  },

  /** The animated week board — the page's only animation. */
  demo: {
    label: 'EXAMPLE',
    hint: 'Pick a request and watch Find Time plan it on a sample week.',
    week: 'SAMPLE WEEK · SEP 14–18',
    askLabel: 'YOU ASK',
    resultLabel: 'RESULT',
    replay: '↻ REPLAY',
    legend: [
      { kind: 'meet', label: 'Already on your calendar' },
      { kind: 'added', label: 'Added by Find Time' },
      { kind: 'goal', label: 'Goal session' },
      { kind: 'clash', label: 'Clash to fix' },
    ],
  },

  how: {
    eyebrow: 'HOW IT WORKS',
    title: 'Three steps. No dragging blocks around.',
    steps: [
      {
        title: 'Connect your calendar',
        body:
          'It’s the only thing Find Time needs. Email, Slack and your task list are optional — each stays off until you switch it on.',
      },
      {
        title: 'Say what your week needs',
        body:
          'One sentence, the way you’d brief an assistant: “Three German sessions, and time to finish the launch brief.” No typing out your schedule first.',
      },
      {
        title: 'It lands on your calendar',
        body:
          'Focus time, goals and meetings go into time that’s actually free — never on top of an existing event. When something moves, ask again and it replans.',
      },
    ],
  },

  connectors: {
    eyebrow: 'CONNECTORS',
    title: 'What it connects to, and what it does with each.',
    body:
      'Your calendar is required. Everything else is optional and off until you switch it on — Find Time can’t reach a tool you leave off.',
    required: 'REQUIRED',
    optional: 'OPTIONAL',
    items: [
      {
        name: 'CALENDAR',
        apps: 'Google · Outlook',
        does: 'Reads your events and free time. Writes the blocks and meetings it plans.',
        required: true,
      },
      {
        name: 'EMAIL',
        apps: 'Gmail · Outlook',
        does: 'Spots emails that ask for a meeting. Sends the invite or confirmation from your address.',
        required: false,
      },
      {
        name: 'SLACK',
        apps: 'Channels · DMs · threads',
        does: 'Spots requests for your time. Tells people when a meeting moves.',
        required: false,
      },
      {
        name: 'TASKS',
        apps: 'Linear · Asana · Todoist',
        does: 'Reads your deadlines, so focus time lands before things are due.',
        required: false,
      },
      {
        name: 'MEETINGS',
        apps: 'Zoom · Google Meet · Teams',
        does: 'Adds the call link and books the follow-ups a meeting needs.',
        required: false,
      },
      {
        name: 'DOCS',
        apps: 'Notion · Google Docs',
        does: 'Attaches the agenda and prep notes to the event.',
        required: false,
      },
      {
        name: 'CLOUD',
        apps: 'Google Drive · Dropbox · OneDrive',
        does: 'Attaches the right file to the invite.',
        required: false,
      },
      {
        name: 'BROWSER',
        apps: 'Any site you point it at',
        does: 'Checks venues and travel times for plans outside the office.',
        required: false,
      },
    ],
  },

  privacy: {
    eyebrow: 'PRIVATE BY DESIGN',
    title: 'Your data never leaves your ecosystem. Not even to us.',
    body:
      'Find Time works inside the tools you already use. Your events, emails and messages stay where they are — they are never copied out, not even to Find Time.',
    diagramLabel:
      'Diagram: inside your ecosystem, Find Time reads your tools in place, writes plans back to your calendar and shows the plan to you. Find Time’s own servers sit outside the boundary and receive none of your data.',
    inside: 'YOUR ECOSYSTEM',
    wall: 'NOTHING LEAVES',
    tools: { name: 'YOUR TOOLS', sub: 'Calendar, email, Slack, tasks' },
    core: { name: 'FIND TIME', sub: 'Works inside your tools' },
    you: { name: 'YOU', sub: 'Ask in one sentence' },
    toCore: 'Read in place',
    toTools: 'Plans and bookings',
    toYou: 'Your plan',
    fromYou: 'Your request',
    outside: {
      tag: 'OUTSIDE YOUR ECOSYSTEM',
      name: 'FIND TIME’S SERVERS',
      sub: 'Receive none of your data. No copy of your calendar, emails or messages.',
    },
    pledges: [
      {
        icon: 'line',
        title: 'STAYS IN YOUR TOOLS',
        body: 'Your events, emails and messages stay where they already are. Find Time reads them in place.',
      },
      {
        icon: 'cross',
        title: 'NEVER SENT TO US',
        body: 'Find Time’s servers never receive your data, so there is no copy of it on our side.',
      },
      {
        icon: 'line',
        title: 'PLANS GO BACK TO YOU',
        body: 'What Find Time plans is written to your own calendar and shown to you. Nowhere else.',
      },
    ],
  },

  waitlist: {
    eyebrow: 'EARLY ACCESS',
    title: 'Get your week back.',
    body: 'Find Time is in private beta. Leave your email and we’ll tell you when a spot opens — one message, no spam.',
  },

  footer: { tagline: 'YOUR WEEK · PLANNED · NOTHING LEAVES' },
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
