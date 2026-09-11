/**
 * Site-wide strings that live outside the landing page itself.
 *
 * The landing page (`dom/LandingPage.tsx`) is a port of the approved artifact and
 * keeps its own copy inline, next to the markup the 3D engine hooks into. What's
 * left here is shared: META (the `<Head>` on `/` and the `+html.tsx` fallback)
 * and COOKIES (the notice mounted over the landing).
 */

export const META = {
  title: 'Find Time — the AI calendar planner that plans and schedules your week',
  description:
    'Tell Find Time what your week needs. It books the meetings, protects your focus time and fits in the goals that keep slipping — around your real calendar, with context from your email, Slack and tasks. Nothing leaves your own tools. Private beta.',
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
