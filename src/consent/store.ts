import {
  CONSENT_MAX_AGE_DAYS,
  consentVersion,
  DECLARATION,
  matches,
  optionalInUse,
  type OptionalCategory,
} from './registry';

/**
 * The visitor's cookie choice, plus the gate every non-essential script goes
 * through. Web only (there are no cookies on native).
 *
 *   hasConsent('statistics')         → boolean, false until the visitor says yes
 *   loadScript('statistics', src)    → injects a script only after consent
 *   onConsentChange(fn)              → re-run when the choice changes
 *   openCookieSettings()             → opens the settings dialog (footer link)
 *
 * The record lives in localStorage (`ft-consent`, a necessary item). It holds a
 * random id, the version and time of the choice, and nothing about the person.
 * A copy goes to /api/consent as proof of consent (GDPR Art. 7(1)). It expires
 * after CONSENT_MAX_AGE_DAYS, and it lapses when the version changes, so the
 * banner shows again.
 */

const KEY = 'ft-consent';
const LEGACY_KEY = 'find-time-cookie-consent';

export type Choices = Record<OptionalCategory, boolean>;
export type Method = 'notice' | 'accept-all' | 'reject-all' | 'custom' | 'gpc';
export type ConsentRecord = { id: string; v: string; ts: string; choices: Choices; method: Method };

export const NONE: Choices = { preferences: false, statistics: false, marketing: false };

const hasWindow = () => typeof window !== 'undefined';

/** Global Privacy Control — a browser-level "don't track me". Honoured as a refusal. */
export function gpcSignal(): boolean {
  return hasWindow() && (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
}

let cache: ConsentRecord | null | undefined;

export function readConsent(): ConsentRecord | null {
  if (cache !== undefined) return cache;
  cache = null;
  try {
    const raw = hasWindow() ? localStorage.getItem(KEY) : null;
    const r = raw ? (JSON.parse(raw) as ConsentRecord) : null;
    const age = r ? Date.now() - Date.parse(r.ts) : Infinity;
    if (r && r.v === consentVersion() && age >= 0 && age < CONSENT_MAX_AGE_DAYS * 864e5) cache = r;
  } catch {
    /* blocked or corrupt: treat as no choice yet */
  }
  return cache;
}

export function hasConsent(category: OptionalCategory | 'necessary'): boolean {
  if (category === 'necessary') return true;
  return readConsent()?.choices[category] === true;
}

/** Should the first-visit banner show? */
export function needsChoice(): boolean {
  return readConsent() === null;
}

const listeners = new Set<() => void>();

export function onConsentChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function saveConsent(choices: Choices, method: Method): void {
  const before = readConsent()?.choices ?? NONE;
  // Only categories that exist can be granted; the rest stay false.
  const inUse = optionalInUse();
  const clean = { ...NONE };
  for (const c of inUse) clean[c] = choices[c] === true;

  const record: ConsentRecord = {
    id: readConsent()?.id ?? newId(),
    v: consentVersion(),
    ts: new Date().toISOString(),
    choices: clean,
    method,
  };
  cache = record;
  try {
    localStorage.setItem(KEY, JSON.stringify(record));
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode: the choice holds for this page view only */
  }

  const withdrawn = (Object.keys(before) as OptionalCategory[]).filter((c) => before[c] && !clean[c]);
  if (withdrawn.length) clearCategories(withdrawn);

  log(record);
  for (const fn of listeners) fn();

  // A script that already ran can't be unloaded; a reload is the only clean stop.
  if (withdrawn.some((c) => loaded.has(c))) window.location.reload();
}

/** Consent proof. Fire-and-forget: a failed log never blocks the visitor. */
function log(r: ConsentRecord) {
  try {
    void fetch('/api/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: r.id, v: r.v, choices: r.choices, method: r.method }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* no fetch */
  }
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

/** Delete what a withdrawn category left behind (readable cookies + storage). */
function clearCategories(categories: OptionalCategory[]) {
  const items = DECLARATION.filter((i) => (categories as string[]).includes(i.category));
  if (!items.length) return;
  const host = window.location.hostname;
  const domains = ['', host, `.${host}`, `.${host.split('.').slice(-2).join('.')}`];
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (!name || !items.some((i) => i.type === 'Cookie' && matches(i, name))) continue;
    for (const d of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ''}`;
    }
  }
  for (const store of [localStorage, sessionStorage]) {
    const type = store === localStorage ? 'Local storage' : 'Session storage';
    for (const k of Object.keys(store)) {
      if (items.some((i) => i.type === type && matches(i, k))) store.removeItem(k);
    }
  }
}

const loaded = new Set<OptionalCategory>();
const pending: { category: OptionalCategory; src: string; attrs?: Record<string, string> }[] = [];

/**
 * The only way a non-essential script may load. Nothing is injected until the
 * visitor has said yes to `category`; it then loads once, also if they say yes
 * later in the visit.
 */
export function loadScript(category: OptionalCategory, src: string, attrs?: Record<string, string>) {
  if (!hasWindow()) return;
  pending.push({ category, src, attrs });
  flush();
}

function flush() {
  for (let i = pending.length - 1; i >= 0; i--) {
    const p = pending[i];
    if (!hasConsent(p.category)) continue;
    pending.splice(i, 1);
    const s = document.createElement('script');
    s.src = p.src;
    s.async = true;
    for (const [k, v] of Object.entries(p.attrs ?? {})) s.setAttribute(k, v);
    document.head.appendChild(s);
    loaded.add(p.category);
  }
}
listeners.add(flush);

// ── settings dialog open/close, so any link can reopen it ───────────────
const openers = new Set<() => void>();

export function onOpenSettings(fn: () => void): () => void {
  openers.add(fn);
  return () => {
    openers.delete(fn);
  };
}

export function openCookieSettings(): void {
  for (const fn of openers) fn();
}
