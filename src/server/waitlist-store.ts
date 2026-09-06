/**
 * Waitlist persistence.
 *
 * ponytail: in-memory Map, process-lifetime only. Entries are lost on restart and
 * not shared across server instances. This is enough to exercise the whole
 * flow (form → validate → honeypot → store → success/error UI) with no database,
 * exactly as plan §6.5 describes ("leave DATABASE_URL unset → in-memory driver").
 *
 * Swap for real persistence when the host + DB are chosen (plan §10 Q1): replace
 * the three functions below with queries against `db/001_waitlist.sql`. Signatures
 * stay the same, so `+api.ts` doesn't change.
 */

export type WaitlistEntry = {
  email: string;
  source?: string;
  createdAt: string;
};

const store = new Map<string, WaitlistEntry>();

/** Returns 'added' for a new email, 'already' if it was seen before. */
export function addToWaitlist(email: string, source?: string): 'added' | 'already' {
  if (store.has(email)) return 'already';
  store.set(email, { email, source, createdAt: new Date().toISOString() });
  return 'added';
}

export function waitlistCount(): number {
  return store.size;
}

/** Test/debug only. */
export function _resetWaitlist(): void {
  store.clear();
}
