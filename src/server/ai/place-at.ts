/**
 * "Gym today 6–8pm" — placing a block at the time the user said, instead of
 * handing it to the scorer. Before this, every request went through
 * propose_blocks, which picks its own slot, so a user who named a time got a
 * different one back: the agent "just proposed" rather than doing as asked.
 *
 * The model reads the times out of the sentence; everything after that is
 * here, and deterministic. Pure — no DB, no clock (callers pass nowISO), so
 * place-at.check.mjs runs it directly.
 *
 * Times are wall-clock with a `Z` suffix, like every other time in the app.
 */

export type Span = { startISO: string; endISO: string };
export type PlaceCheck = { ok: true; span: Span } | { ok: false; reason: string };

const MAX_BLOCK_MIN = 12 * 60;

/** "2026-10-01T18:00:00+02:00" → "2026-10-01T18:00:00.000Z": the clock the user said, offset dropped. */
function wallClock(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/.exec(raw.trim());
  if (!m) return null;
  const out = `${m[1]}T${m[2]}:${m[3]}:00.000Z`;
  return Number.isFinite(Date.parse(out)) ? out : null;
}

export function checkPlaceAt(startRaw: unknown, endRaw: unknown, nowISO: string, horizonISO: string): PlaceCheck {
  const startISO = wallClock(startRaw);
  const endISO = wallClock(endRaw);
  if (!startISO || !endISO) return { ok: false, reason: 'What time should it start and end?' };
  const [s, e] = [Date.parse(startISO), Date.parse(endISO)];
  if (e <= s) return { ok: false, reason: 'The end has to be after the start. What times did you mean?' };
  if ((e - s) / 60_000 > MAX_BLOCK_MIN) return { ok: false, reason: "That's over 12 hours. What times did you mean?" };
  if (s < Date.parse(nowISO)) return { ok: false, reason: "That time has already passed today. Did you mean another day?" };
  if (s > Date.parse(horizonISO)) return { ok: false, reason: "I can only plan three weeks ahead for now. Pick a closer day?" };
  return { ok: true, span: { startISO, endISO } };
}

/**
 * A bare "at 6" or "5:30" (hours 1–9) with no am/pm, 24h form or time-of-day
 * word is ambiguous. Enforced in code because models skip the prompt rule when
 * one reading "seems likely" — the same lesson as find-time-agent.
 * ponytail: hours 10–12 aren't treated as ambiguous (people rarely mean 22:00); widen if reports say so.
 */
const BARE_TIME = /(?:\bat\s+([1-9])(?::([0-5]\d))?|(?<![\d:.])([1-9]):([0-5]\d)|(?<![\d:.])([1-9])\s*(?:-|–|to)\s*([1-9]|1[0-2])\b)(?![\d:]|\s*(?:am|pm|a\.m|p\.m|h\b|uhr|hours?\b|hrs?\b|min))/i;
const CLEAR = /\d\s*(?:am|pm|a\.m|p\.m)\b|\b(morning|evening|afternoon|night|tonight|noon|midnight|after work|before work|lunch|breakfast|dinner)\b/i;

export type Ambiguous = { said: string; am: string; pm: string };

export function ambiguousTime(text: string): Ambiguous | null {
  if (CLEAR.test(text)) return null;
  const hit = BARE_TIME.exec(text);
  if (!hit) return null;
  const hour = Number(hit[1] ?? hit[3] ?? hit[5]);
  const minute = hit[2] ?? hit[4] ?? '00';
  const pad = (h: number) => String(h).padStart(2, '0');
  return { said: hit[0].trim(), am: `${pad(hour)}:${minute}`, pm: `${pad(hour + 12)}:${minute}` };
}

/** "…it overlaps Call with Alice (18:30–19:00)" for the card, so a clash shows even if the model is silent. */
export function clashNote(busy: { start: string; end: string; title: string }[], span: Span): string | null {
  const [s, e] = [Date.parse(span.startISO), Date.parse(span.endISO)];
  const hits = busy.filter((b) => Date.parse(b.start) < e && Date.parse(b.end) > s);
  if (!hits.length) return null;
  const hhmm = (iso: string) => iso.slice(11, 16);
  return `it's the time you asked for, but it overlaps ${hits.map((b) => `${b.title.slice(0, 40)} (${hhmm(b.start)}–${hhmm(b.end)})`).join(', ')}`;
}
