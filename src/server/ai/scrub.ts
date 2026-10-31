/**
 * Google event titles are read live and never stored (db/023). The model may
 * read them to understand a request, so its reply can quote one; the person
 * sees that reply as written, and the saved copy (ai_messages) goes through
 * here first. Partial mentions count: "Dr Meyer checkup" can come back as
 * "Meyer". Words the person typed themselves are already in the conversation,
 * so they stay.
 *
 * Pure. scrub.check.mjs runs it directly.
 */

export const STORED_NAME = '[calendar event]';

/** The placeholder Google titles fall back to, and words that say nothing about the event. */
const SAYS_NOTHING = new Set(['busy', 'calendar', 'daily', 'event', 'events', 'lunch', 'meeting', 'meetings', 'monthly', 'planning', 'review', 'session', 'weekly']);
const MIN_WORD = 4;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordsOf = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
const bounded = (body: string) => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'giu');

function scrubber(titles: string[], typed: string): (s: string) => string {
  const said = new Set(wordsOf(typed));
  const real = [...new Set(titles.map((t) => t.trim()).filter((t) => t && t.toLowerCase() !== 'busy'))];
  const whole = real.filter((t) => !wordsOf(t).every((w) => said.has(w))).sort((a, b) => b.length - a.length);
  const words = [...new Set(real.flatMap(wordsOf))].filter((w) => w.length >= MIN_WORD && !said.has(w) && !SAYS_NOTHING.has(w));
  const patterns = [whole.map(escape).join('|'), words.map(escape).join('|')].filter(Boolean).map(bounded);
  const repeated = new RegExp(`${escape(STORED_NAME)}(?:\\s+${escape(STORED_NAME)})+`, 'g');
  return (s) => patterns.reduce((out, p) => out.replace(p, STORED_NAME), s).replace(repeated, STORED_NAME);
}

function deep(v: unknown, clean: (s: string) => string): unknown {
  if (typeof v === 'string') return clean(v);
  if (Array.isArray(v)) return v.map((x) => deep(x, clean));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x, clean)]));
  return v;
}

/** `value` with Google titles out of every string in it, whatever its shape. */
export function scrubTitles<T>(value: T, titles: string[], typed: string): T {
  return deep(value, scrubber(titles, typed)) as T;
}
