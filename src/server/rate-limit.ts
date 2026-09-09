import { createHash } from 'node:crypto';

import { isConfigured, query } from '@/server/db';
import { decide, windowStart, type Pair, type Window } from '@/server/rate-limit-core';

/**
 * Fixed-window rate limiting for the public API routes, backed by the
 * `rate_limits` table (`db/013_rate_limits.sql`). Server-only.
 *
 * Call at the top of a route handler:
 *
 *   const limited = await enforceRateLimit(request, 'waitlist', { kind: 'ip' });
 *   if (limited) return limited;
 *
 * Returns a 429 `Response` when over the limit, or `null` to proceed. Fails open:
 * a limiter/DB outage (or DATABASE_URL unset) must never take a route down.
 */

export type RateRoute = 'waitlist' | 'ai-find-time' | 'google-connect';

const LIMITS: Record<RateRoute, Pair> = {
  // unauthenticated — spammable to junk; keep tight
  waitlist: { hour: 5, day: 20 },
  // authed, burns Anthropic tokens per hit
  'ai-find-time': { hour: 15, day: 40 },
  // authed, kicks off a Google OAuth round trip
  'google-connect': { hour: 10, day: 30 },
};

type Key = { kind: 'ip' } | { kind: 'user'; userId: string };

/** First hop of x-forwarded-for (client IP behind Railway's edge), salted-hashed. */
function ipHashOf(req: Request): string {
  const xff = req.headers.get('x-forwarded-for') ?? '';
  const ip = xff.split(',')[0]!.trim() || 'unknown';
  const salt = process.env.SESSION_SECRET ?? '';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

/** Same value the limiter keys IP buckets on — reused as `waitlist.ip_hash`. */
export function requestIpHash(req: Request): string {
  return ipHashOf(req);
}

/** Atomic upsert-increment; returns the new count for this key + window. */
async function bump(baseKey: string, win: Window, now: Date): Promise<number> {
  const rows = await query<{ count: number }>(
    `insert into rate_limits (bucket_key, window_start, count)
     values ($1, $2, 1)
     on conflict (bucket_key, window_start)
     do update set count = rate_limits.count + 1
     returning count`,
    [`${baseKey}:${win[0]}`, windowStart(win, now)],
  );
  return rows[0]?.count ?? 1;
}

export async function enforceRateLimit(
  req: Request,
  route: RateRoute,
  key: Key,
): Promise<Response | null> {
  if (!isConfigured()) return null; // no DB → nothing to count against

  const idPart = key.kind === 'user' ? `u:${key.userId}` : `ip:${ipHashOf(req)}`;
  const bucket = `${route}:${idPart}`;
  const now = new Date();

  try {
    const [h, d] = await Promise.all([bump(bucket, 'hour', now), bump(bucket, 'day', now)]);
    const verdict = decide({ hour: h, day: d }, LIMITS[route], now);

    if (Math.random() < 0.01) {
      query(`delete from rate_limits where window_start < now() - interval '2 days'`).catch(() => {});
    }

    if (verdict.ok) return null;

    query(`insert into rate_limit_blocks (route, bucket_key) values ($1, $2)`, [route, bucket]).catch(
      () => {},
    );
    return Response.json(
      { error: 'rate_limited', retry_after: verdict.retryAfter },
      { status: 429, headers: { 'Retry-After': String(verdict.retryAfter) } },
    );
  } catch (err) {
    console.error('[rate-limit] check failed, allowing request:', err);
    return null;
  }
}
