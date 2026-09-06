import { normalizeEmail, validateEmail, type WaitlistResponse } from '@/signup/waitlist';
import { addToWaitlist } from '@/server/waitlist-store';

/**
 * POST /api/waitlist — email capture for the landing page.
 *
 * Runs server-side (expo-router API route, needs `web.output: "server"` — already
 * set). No auth, no CORS block (same-origin web form). Body cap + honeypot are the
 * only spam defences for now; rate-limiting and a confirmation email come with the
 * host/vendor decisions (plan §6, §10 Q1/Q8).
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

  if (typeof body.email !== 'string' || !validateEmail(body.email)) {
    return json({ ok: false, error: 'invalid_email' }, 400);
  }

  try {
    const status = addToWaitlist(
      normalizeEmail(body.email),
      typeof body.source === 'string' ? body.source.slice(0, 40) : undefined,
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
