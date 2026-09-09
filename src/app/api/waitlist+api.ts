import { normalizeEmail, validateEmail, type WaitlistResponse } from '@/signup/waitlist';
import { enforceRateLimit, requestIpHash } from '@/server/rate-limit';
import { addToWaitlist } from '@/server/waitlist-store';

/**
 * POST /api/waitlist — email capture for the landing page.
 *
 * Runs server-side (expo-router API route, needs `web.output: "server"` — already
 * set). No auth, no CORS block (same-origin web form). Defences: 4 KB body cap,
 * honeypot field, and a per-IP fixed-window rate limit (src/server/rate-limit.ts).
 */
export async function POST(req: Request): Promise<Response> {
  let body: { email?: unknown; company?: unknown; source?: unknown };
  try {
    const text = await req.text();
    if (text.length > 4096) return json({ ok: false, error: 'server_error' }, 413);
    body = JSON.parse(text);
  } catch {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  // honeypot: a hidden field only a bot fills — answer 200 so it can't probe
  if (typeof body.company === 'string' && body.company.trim() !== '') {
    return json({ ok: true, status: 'added' }, 200);
  }

  const limited = await enforceRateLimit(req, 'waitlist', { kind: 'ip' });
  if (limited) return limited;

  if (typeof body.email !== 'string' || !validateEmail(body.email)) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  try {
    const status = await addToWaitlist(
      normalizeEmail(body.email),
      typeof body.source === 'string' ? body.source.slice(0, 40) : undefined,
      requestIpHash(req),
    );
    return json({ ok: true, status }, 201);
  } catch {
    return json({ ok: false, error: 'server_error' }, 500);
  }
}

function json(payload: WaitlistResponse, status: number): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
