/**
 * Repeating events, one implementation for the calendar grid and the server.
 * A repeat is stored once: its first date plus an RRULE body. The grid asks
 * "does it fall on this day?"; the planner asks "which days in this window?";
 * Plan with AI builds rules from a model's form. All three answer here, so
 * what the AI proposes is what the grid draws.
 *
 * Supports what Find Time writes and what Google commonly sends:
 * FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY (weekly, plain days), COUNT, UNTIL.
 * Anything else is "not understood": callers fall back to the first date only —
 * never a wrong guess. Pure: dates are YYYY-MM-DD strings, no time zones, no imports.
 */

export const RULE_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const;
export type RuleDay = (typeof RULE_DAYS)[number];

export type Rule = {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  interval: number;
  /** weekly only; Monday = 0. Empty = the first date's weekday */
  byDay: number[];
  /** last day, inclusive (YYYY-MM-DD) */
  until: string | null;
  count: number | null;
};

const DAY_MS = 86_400_000;
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
const ymd = (t: number) => new Date(t).toISOString().slice(0, 10);
/** Monday = 0 … Sunday = 6 */
const monIdx = (t: number) => (new Date(t).getUTCDay() + 6) % 7;

/** The RRULE body → a Rule, or null for anything this module doesn't read. */
export function parseRule(raw: string | null | undefined): Rule | null {
  if (!raw) return null;
  const parts: Record<string, string> = {};
  for (const part of raw.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v) parts[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = parts.FREQ;
  if (freq !== 'DAILY' && freq !== 'WEEKLY' && freq !== 'MONTHLY') return null;
  const interval = Math.max(1, Number(parts.INTERVAL) || 1);
  let byDay: number[] = [];
  if (parts.BYDAY) {
    if (freq !== 'WEEKLY') return null;
    const codes = parts.BYDAY.split(',');
    // "1MO" (first Monday) and the like aren't read: refuse rather than misplace.
    if (codes.some((c) => !RULE_DAYS.includes(c as RuleDay))) return null;
    byDay = codes.map((c) => RULE_DAYS.indexOf(c as RuleDay));
  }
  let until: string | null = null;
  if (parts.UNTIL) {
    const u = parts.UNTIL.slice(0, 8);
    until = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    if (!Number.isFinite(ms(until))) return null;
  }
  const count = parts.COUNT ? Math.max(1, Number(parts.COUNT) || 1) : null;
  return { freq, interval, byDay, until, count };
}

/** A Rule → the RRULE body Find Time stores. */
export function formatRule(r: Rule): string {
  return [
    `FREQ=${r.freq}`,
    r.interval > 1 ? `INTERVAL=${r.interval}` : '',
    r.freq === 'WEEKLY' && r.byDay.length ? `BYDAY=${[...r.byDay].sort((a, b) => a - b).map((d) => RULE_DAYS[d]).join(',')}` : '',
    r.count ? `COUNT=${r.count}` : '',
    r.until ? `UNTIL=${r.until.replace(/-/g, '')}T235959` : '',
  ]
    .filter(Boolean)
    .join(';');
}

/** Does the pattern (ignoring COUNT and UNTIL) land on `day`? */
function hits(r: Rule, first: string, day: string): boolean {
  const a = ms(first);
  const t = ms(day);
  const days = Math.round((t - a) / DAY_MS);
  if (days < 0) return false;
  if (r.freq === 'DAILY') return days % r.interval === 0;
  if (r.freq === 'WEEKLY') {
    const by = r.byDay.length ? r.byDay : [monIdx(a)];
    const weeks = Math.round((t - monIdx(t) * DAY_MS - (a - monIdx(a) * DAY_MS)) / (7 * DAY_MS));
    return by.includes(monIdx(t)) && weeks % r.interval === 0;
  }
  const da = new Date(a);
  const dt = new Date(t);
  const months = (dt.getUTCFullYear() - da.getUTCFullYear()) * 12 + dt.getUTCMonth() - da.getUTCMonth();
  return dt.getUTCDate() === da.getUTCDate() && months % r.interval === 0;
}

/**
 * Does a repeat that starts on `first` fall on `day`? The first date always
 * counts (it's the event itself); an unreadable rule means the first date only.
 */
export function repeatsOn(first: string, rrule: string | null | undefined, day: string): boolean {
  if (day === first) return true;
  if (!rrule || day < first) return false;
  const r = parseRule(rrule);
  if (!r) return false;
  if (r.until && day > r.until) return false;
  if (!hits(r, first, day)) return false;
  if (!r.count) return true;
  // COUNT: the n-th occurrence only if fewer than COUNT came before it.
  let seen = 0;
  for (let t = ms(first); t <= ms(day); t += DAY_MS) {
    if (t === ms(first) || hits(r, first, ymd(t))) seen++;
    if (seen > r.count) return false;
  }
  return true;
}

/** Every date the repeat falls on, from `from` through `to` (inclusive), at most `limit`. */
export function datesBetween(first: string, rrule: string | null | undefined, from: string, to: string, limit = 400): string[] {
  const out: string[] = [];
  const start = Math.max(ms(first), ms(from));
  for (let t = start; t <= ms(to) && out.length < limit; t += DAY_MS) {
    if (repeatsOn(first, rrule, ymd(t))) out.push(ymd(t));
  }
  return out;
}

/** The first date on or after `from` that a pattern starting there would include ("from Wed, Mon–Thu" → Wed). */
export function firstOnOrAfter(from: string, r: Rule, horizonDays = 62): string | null {
  for (let t = ms(from), i = 0; i < horizonDays; t += DAY_MS, i++) {
    if (r.freq !== 'WEEKLY' || !r.byDay.length || r.byDay.includes(monIdx(t))) return ymd(t);
  }
  return null;
}

const SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const human = (day: string) => {
  const d = new Date(ms(day));
  return `${SHORT[monIdx(ms(day))]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const nth = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th'}`;

/** "Mon–Thu", "Mon, Wed, Fri", "weekdays", "every day" (Monday = 0). */
export function daysLabel(days: number[]): string {
  const order = [...new Set(days)].sort((a, b) => a - b);
  if (order.length === 7) return 'every day';
  if (order.join() === '0,1,2,3,4') return 'weekdays';
  const run = order.length >= 3 && order.every((d, i) => i === 0 || d === order[i - 1] + 1);
  return run ? `${SHORT[order[0]]}–${SHORT[order[order.length - 1]]}` : order.map((d) => SHORT[d]).join(', ');
}

/** "Mon–Thu · until Thu 29 Oct", "every 2 weeks on Mon", "monthly on the 5th · 6 times", "daily". */
export function describeRule(first: string, rrule: string): string {
  const r = parseRule(rrule);
  if (!r) return 'repeats';
  const every = (unit: string) => (r.interval > 1 ? `every ${r.interval} ${unit}s` : '');
  let what: string;
  if (r.freq === 'DAILY') what = every('day') || 'daily';
  else if (r.freq === 'MONTHLY') what = `${every('month') || 'monthly'} on the ${nth(new Date(ms(first)).getUTCDate())}`;
  else {
    const days = daysLabel(r.byDay.length ? r.byDay : [monIdx(ms(first))]);
    what = r.interval > 1 ? `${every('week')} on ${days}` : days;
  }
  const end = r.until ? `until ${human(r.until)}` : r.count ? `${r.count} times` : 'no end';
  return `${what} · ${end}`;
}
