/**
 * Shared waitlist contract — imported by the RN form *and* `src/app/api/waitlist+api.ts`.
 * Pure TypeScript, zero React Native / Node imports, so both sides can use it.
 *
 * landing.html has no waitlist at all; this is new. Copy lives in `src/landing/copy.ts`
 * (`WAITLIST`) and is placeholder pending the user's call (plan §10 Q2).
 */

export type WaitlistRequest = {
  email: string;
  /** honeypot — must be empty; a real user never fills a hidden field */
  company?: string;
  /** where on the page the submit came from, for later segmentation */
  source?: string;
};

export type WaitlistResponse =
  | { ok: true; status: 'added' | 'already' }
  | { ok: false; error: 'invalid_email' | 'rate_limited' | 'server_error' };

/**
 * Deliberately permissive: one `@`, a non-empty local part, a dot in the domain,
 * no whitespace, length-capped. Stricter regexes reject valid addresses; the real
 * check is a confirmation email (plan §6.6, not built — needs an email vendor, §10 Q8).
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEmail(raw: string): boolean {
  const email = raw.trim();
  return email.length >= 6 && email.length <= 254 && EMAIL_RE.test(email);
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * POST the waitlist form. Web hits the relative `/api/waitlist` (same origin);
 * native would need `EXPO_PUBLIC_API_BASE_URL`, but the landing page is web-only
 * so the base is empty. Network/parse failures collapse to `server_error` so the
 * form always has something to show.
 */
export async function joinWaitlist(body: WaitlistRequest): Promise<WaitlistResponse> {
  try {
    const res = await fetch('/api/waitlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as WaitlistResponse;
    return data;
  } catch {
    return { ok: false, error: 'server_error' };
  }
}
