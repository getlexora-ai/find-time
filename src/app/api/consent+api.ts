import { isConfigured, query } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/consent — logs a cookie choice as proof of consent (GDPR Art. 7(1)).
 *
 * Called fire-and-forget by src/consent/store.ts. Stores only what the banner
 * produced: a random browser-side consent id, the consent version, how it was
 * given and the per-category choices. No IP, user id or user agent. Rows older
 * than 3 years are dropped here, so the table never needs a cron.
 * Table: db/026_consent_log.sql.
 */
const METHODS = ['notice', 'accept-all', 'reject-all', 'custom', 'gpc'] as const;
const CATS = ['preferences', 'statistics', 'marketing'] as const;

export async function POST(req: Request): Promise<Response> {
  let body: { id?: unknown; v?: unknown; method?: unknown; choices?: unknown };
  try {
    const text = await req.text();
    if (text.length > 1024) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }

  const { id, v, method, choices } = body;
  const ok =
    typeof id === 'string' &&
    /^[A-Za-z0-9-]{8,64}$/.test(id) &&
    typeof v === 'string' &&
    v.length <= 64 &&
    METHODS.includes(method as (typeof METHODS)[number]) &&
    !!choices &&
    typeof choices === 'object' &&
    CATS.every((c) => typeof (choices as Record<string, unknown>)[c] === 'boolean');
  if (!ok) return new Response(null, { status: 400 });

  const limited = await enforceRateLimit(req, 'consent', { kind: 'ip' });
  if (limited) return limited;

  if (!isConfigured()) return new Response(null, { status: 204 });
  const clean = Object.fromEntries(CATS.map((c) => [c, (choices as Record<string, boolean>)[c]]));
  try {
    await query(
      `insert into consent_log (consent_id, version, method, choices) values ($1, $2, $3, $4::jsonb)`,
      [id, v, method, JSON.stringify(clean)],
    );
    await query(`delete from consent_log where created_at < now() - interval '3 years'`);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 500 });
  }
}
