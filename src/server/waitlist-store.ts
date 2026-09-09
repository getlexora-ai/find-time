/**
 * Waitlist persistence.
 *
 * Neon-backed when DATABASE_URL is set (the running config everywhere else), with
 * the original in-memory Map kept as the no-database fallback (plan §6.5). Branch
 * on env — don't delete either path.
 *
 * Table: `db/001_waitlist.sql` (also folded into `db/schema.sql`). `+api.ts` only
 * touches the three functions here; they're async now.
 */

import { isConfigured, query } from '@/server/db';

export type WaitlistEntry = {
  email: string;
  source?: string;
  createdAt: string;
};

const memory = new Map<string, WaitlistEntry>();

/** Returns 'added' for a new email, 'already' if it was seen before. */
export async function addToWaitlist(
  email: string,
  source?: string,
  ipHash?: string,
): Promise<'added' | 'already'> {
  if (isConfigured()) {
    // `email` is citext unique — the conflict target is the column itself.
    const rows = await query(
      `insert into waitlist (email, source, ip_hash) values ($1, $2, $3)
       on conflict (email) do nothing
       returning email`,
      [email, source ?? null, ipHash ?? null],
    );
    return rows.length > 0 ? 'added' : 'already';
  }

  if (memory.has(email)) return 'already';
  memory.set(email, { email, source, createdAt: new Date().toISOString() });
  return 'added';
}

export async function waitlistCount(): Promise<number> {
  if (isConfigured()) {
    const rows = await query<{ n: string }>('select count(*)::text as n from waitlist');
    return Number(rows[0]?.n ?? 0);
  }
  return memory.size;
}

/** Test/debug only — clears the in-memory driver. */
export function _resetWaitlist(): void {
  memory.clear();
}
