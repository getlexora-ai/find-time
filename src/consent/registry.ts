/**
 * Cookie + storage declaration — the single source of truth for consent.
 *
 * Everything that stores something on a visitor's device (cookies, localStorage,
 * sessionStorage) is listed here. Three things read it:
 *   - the banner / settings dialog (src/consent/ConsentManager.web.tsx),
 *   - the declaration table on /privacy#cookies,
 *   - `cd e2e && npm run cookies:check` (e2e/cookie-scan.mjs), which loads the real
 *     site and fails on anything undeclared, the way Cookiebot's scanner does.
 *
 * Rule (GDPR Art. 6/7, ePrivacy Art. 5(3), §25 TDDDG): only `necessary` items may
 * be set without a choice. Anything else goes in another category, and its
 * script must be loaded through `loadScript()` / gated with `hasConsent()` in
 * ./store.ts so nothing runs before the visitor says yes.
 *
 * The banner switches itself from a notice to a real Accept / Reject choice the
 * moment any optional category has an entry here, and everyone who saw the
 * notice is asked again (the consent version includes the optional categories
 * in use). Plain, erasable TypeScript only: the scanner imports this file with
 * Node's type stripping.
 */

export type Category = 'necessary' | 'preferences' | 'statistics' | 'marketing';
export type OptionalCategory = Exclude<Category, 'necessary'>;

export const CATEGORIES: { id: Category; label: string; description: string }[] = [
  {
    id: 'necessary',
    label: 'Necessary',
    description:
      'Needed for the site to work: signing in, keeping your session secure, and remembering this choice. They can’t be switched off.',
  },
  {
    id: 'preferences',
    label: 'Preferences',
    description: 'Remember optional settings across visits beyond what you set yourself.',
  },
  {
    id: 'statistics',
    label: 'Statistics',
    description: 'Help us understand how the site is used, through anonymous measurement.',
  },
  {
    id: 'marketing',
    label: 'Marketing',
    description: 'Used to show or measure advertising.',
  },
];

export type StorageType = 'Cookie' | 'Local storage' | 'Session storage';

export type DeclaredItem = {
  /** exact name, or a prefix ending in `*` (e.g. `__client_uat*`) */
  name: string;
  provider: string;
  purpose: string;
  expiry: string;
  type: StorageType;
  category: Category;
};

export const DECLARATION: DeclaredItem[] = [
  // ── Sign-in (Better Auth, served by Find Time itself) ─────────────
  // Names are `ft.` + Better Auth's cookie; on https they gain `__Secure-`.
  {
    name: 'ft.*',
    provider: 'Find Time (sign-in)',
    purpose: 'Keeps you signed in: the session token, and short-lived sign-in state while you log in with Google.',
    expiry: '7 days, renewed while you use it',
    type: 'Cookie',
    category: 'necessary',
  },
  {
    name: '__Secure-ft.*',
    provider: 'Find Time (sign-in)',
    purpose: 'The same sign-in cookies, on the secure (https) site.',
    expiry: '7 days, renewed while you use it',
    type: 'Cookie',
    category: 'necessary',
  },
  // ── Find Time ──────────────────────────────────────────────────────
  {
    name: 'ft-consent',
    provider: 'Find Time',
    purpose: 'Remembers your cookie choice so we don’t ask on every page.',
    expiry: '12 months',
    type: 'Local storage',
    category: 'necessary',
  },
  {
    name: 'ft_oauth_state',
    provider: 'Find Time',
    purpose: 'Security check while you connect a Google Calendar.',
    expiry: '10 minutes',
    type: 'Cookie',
    category: 'necessary',
  },
  {
    name: 'ft_oauth_return',
    provider: 'Find Time',
    purpose: 'Where to send you back after connecting a Google Calendar.',
    expiry: '10 minutes',
    type: 'Cookie',
    category: 'necessary',
  },
  {
    name: 'ft-theme',
    provider: 'Find Time',
    purpose: 'The calendar background you picked. Saved only when you change it.',
    expiry: 'Persistent',
    type: 'Local storage',
    category: 'preferences',
  },
  {
    name: 'ft-hours',
    provider: 'Find Time',
    purpose: 'The hours your calendar shows. Saved only when you change it.',
    expiry: 'Persistent',
    type: 'Local storage',
    category: 'preferences',
  },
  {
    name: 'ft-cal-events-v2:*',
    provider: 'Find Time',
    purpose: 'Your event times (no Google titles or notes), so the calendar opens instantly.',
    expiry: 'Until sign-out',
    type: 'Local storage',
    category: 'necessary',
  },
  {
    name: 'ft.agent.session:*',
    provider: 'Find Time',
    purpose: 'Keeps your current Plan with AI conversation.',
    expiry: 'Until sign-out',
    type: 'Local storage',
    category: 'necessary',
  },
  {
    name: 'better-auth.message',
    provider: 'Find Time',
    purpose: 'Tells your other open tabs that you signed in or out.',
    expiry: 'Persistent',
    type: 'Local storage',
    category: 'necessary',
  },
  {
    name: 'ft-onboarding:*',
    provider: 'Find Time',
    purpose: 'Your answers during setup, so a reload doesn’t lose them.',
    expiry: 'Session',
    type: 'Session storage',
    category: 'necessary',
  },
  {
    name: 'ft-redo',
    provider: 'Find Time',
    purpose: 'Marks that you reopened setup from settings.',
    expiry: 'Session',
    type: 'Session storage',
    category: 'necessary',
  },
];

/**
 * Other servers a visitor's browser talks to. Each one sees the visitor's IP, so
 * each must be necessary (or consent-gated) and named in the privacy policy.
 * The scanner fails on any host not listed here.
 */
export const THIRD_PARTY_HOSTS: { host: string; provider: string; purpose: string }[] = [
];

export function knownHost(host: string): boolean {
  return THIRD_PARTY_HOSTS.some((h) =>
    h.host.startsWith('*.') ? host.endsWith(h.host.slice(1)) : host === h.host,
  );
}

/** Re-ask everyone this many days after their choice (CNIL / EDPB guidance: 6–13 months). */
export const CONSENT_MAX_AGE_DAYS = 365;

/**
 * Bump to ask everyone again (e.g. a purpose changed). Adding a new optional
 * category re-asks on its own — see `consentVersion()`.
 */
export const POLICY_VERSION = 1;

export function matches(item: DeclaredItem, name: string): boolean {
  return item.name.endsWith('*') ? name.startsWith(item.name.slice(0, -1)) : name === item.name;
}

export function declared(name: string, type: StorageType): DeclaredItem | undefined {
  return DECLARATION.find((i) => i.type === type && matches(i, name));
}

/** Optional categories that actually have something declared. */
export function optionalInUse(): OptionalCategory[] {
  return CATEGORIES.map((c) => c.id).filter(
    (id): id is OptionalCategory => id !== 'necessary' && DECLARATION.some((i) => i.category === id),
  );
}

export function consentVersion(): string {
  return [POLICY_VERSION, ...optionalInUse()].join(':');
}
