import { formatRule, RULE_DAYS, type Rule } from '../../lib/repeats.ts';
import type { ToolDef } from './llm.ts';
import { ambiguousTime } from './place-at.ts';
import { TOOL_PLACE_AT } from './tools/names.ts';
import { categoryOf, type Draft, placeAtDraft, type Understood } from './understand.ts';

/**
 * The model reads, code decides. For a request at a fixed time — one-off or
 * repeating, in any phrasing or language — the model fills one strict form
 * (OpenAI structured output: these fields and nothing else). Code then checks
 * every field and hands the draft to the same placeAtDraft the rules use, so
 * the same questions get asked (am or pm, which day, how long, until when) and
 * nothing is placed on a guess. Repeats are RRULE patterns, so "every other
 * Friday" or "monthly on the 5th, 6 times" need no new code: the shared
 * engine (src/lib/repeats.ts) reads them, and the grid draws them.
 *
 * The agent (agent.ts) offers this form as its place_at tool and calls
 * fromForm on what the model fills.
 */

export type Form = {
  kind: 'event' | 'other';
  title: string;
  date: string | null;
  start: string | null;
  end: string | null;
  duration_min: number | null;
  repeat: {
    freq: 'DAILY' | 'WEEKLY' | 'MONTHLY';
    interval: number;
    days: string[];
    until: string | null;
    count: number | null;
    no_end: boolean;
  } | null;
};

const nullable = (type: string, description: string) => ({ type: [type, 'null'], description });

export const FORM_TOOL: ToolDef = {
  name: 'fill_request',
  description: 'The request as a form. Fill only what the user said; null for anything they did not say.',
  strict: true,
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'title', 'date', 'start', 'end', 'duration_min', 'repeat'],
    properties: {
      kind: {
        type: 'string',
        enum: ['event', 'other'],
        description: 'event: something at a time the user named (once or repeating). other: anything else.',
      },
      title: { type: 'string', description: "What it is, in the user's own words, 1-4 words, no dates or times." },
      date: nullable('string', 'YYYY-MM-DD: the day, or the first day of a repeat. Only if the user said a day or date.'),
      start: nullable('string', 'HH:MM, 24-hour. Only if the user said a time.'),
      end: nullable('string', 'HH:MM, 24-hour. Only if the user said an end time.'),
      duration_min: nullable('integer', 'Minutes, only if the user said how long and gave no end time.'),
      repeat: {
        anyOf: [
          { type: 'null' },
          {
            type: 'object',
            additionalProperties: false,
            required: ['freq', 'interval', 'days', 'until', 'count', 'no_end'],
            properties: {
              freq: { type: 'string', enum: ['DAILY', 'WEEKLY', 'MONTHLY'] },
              interval: { type: 'integer', description: '1 = every, 2 = every other, …' },
              days: { type: 'array', items: { type: 'string', enum: [...RULE_DAYS] }, description: 'WEEKLY: the weekdays. Empty otherwise.' },
              until: nullable('string', 'YYYY-MM-DD, the last day, only if the user said when it ends.'),
              count: nullable(
                'integer',
                'How many times in all, only if the user said a number of times ("6 times", "for 10 sessions"). "4 days" next to weekdays describes the days, not a count. Null when there is an until.',
              ),
              no_end: { type: 'boolean', description: 'true only if the user said it goes on with no end ("every Monday", "weekly", "always").' },
            },
          },
        ],
      },
    },
  },
};

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function formSystem(nowISO: string): string {
  const d = new Date(nowISO);
  return [
    'You fill a form from one calendar request. Code checks the form and asks the user about anything missing, so never fill a field the user did not say.',
    `Today is ${WD[d.getUTCDay()]} ${nowISO.slice(0, 10)}. Turn named days into dates on or after today.`,
    '- kind "event" when the user names a time of day for something (once, or repeating). Asking to find time, tasks, habits, rules, time off, deleting, or questions are kind "other".',
    '- Dates like 5.10.2026 or 5/10 are day.month (European). "till", "until", "bis", "through" give the last day.',
    '- "Monday till Thursday", "Mon–Thu", "weekdays", "every Tuesday", "Mondays" are a WEEKLY repeat on those days. "every other" is interval 2. "monthly" or "every month" is MONTHLY on the date\'s day.',
    '- Times are 24-hour. "11am to 2:45pm" is start 11:00, end 14:45. A bare "at 6" stays 06:00 — code asks am or pm.',
    '- Any language in, English title out. Fix typos.',
  ].join('\n');
}

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const hm = (s: unknown) => (typeof s === 'string' && HM.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5)) : null);
const day = (s: unknown) =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ? s : null;
const nextDay = (s: string) => new Date(Date.parse(`${s}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
const intIn = (n: unknown, lo: number, hi: number) => (typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi ? n : null);

/**
 * The form → what to do, or null when it isn't a fixed-time request (or
 * makes no sense): the caller keeps the rules' reading. Every field is checked
 * here; a field that fails is treated as not said, which means a question.
 */
export function fromForm(form: Form, text: string, nowISO: string): Understood | null {
  if (!form || form.kind !== 'event') return null;
  const atMin = hm(form.start);
  if (atMin === null) return null;
  const date = day(form.date);
  const endMin = hm(form.end);
  const durationMin = endMin !== null && endMin > atMin ? endMin - atMin : intIn(form.duration_min, 5, 720);
  const title = String(form.title ?? '')
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 60);

  const d: Draft = {
    tool: TOOL_PLACE_AT,
    category: categoryOf(text.toLowerCase()),
    atMin,
    // A bare "at 6" is asked about, whatever the model wrote (ambiguousTime reads the user's text, not the form).
    atUnsure: ambiguousTime(text) !== null,
    ...(title ? { title: title.charAt(0).toUpperCase() + title.slice(1) } : {}),
    ...(durationMin ? { durationMin } : {}),
  };

  const r = form.repeat;
  if (r) {
    const freq = r.freq === 'DAILY' || r.freq === 'WEEKLY' || r.freq === 'MONTHLY' ? r.freq : null;
    if (!freq) return null;
    const byDay = freq === 'WEEKLY' ? [...new Set((r.days ?? []).map((c) => RULE_DAYS.indexOf(c as (typeof RULE_DAYS)[number])).filter((i) => i >= 0))] : [];
    const until = day(r.until);
    // RFC 5545 forbids COUNT with UNTIL; a said end date wins. (Live: "for 4 days" next to
    // Mon–Thu came back as count 4 *and* until 29 Oct — four classes instead of sixteen.)
    const count = until ? null : intIn(r.count, 1, 366);
    const rule: Rule = { freq, interval: intIn(r.interval, 1, 12) ?? 1, byDay, until: null, count };
    d.rule = formatRule(rule);
    if (date) d.from = date;
    if (until && (!date || until >= date)) d.to = nextDay(until);
    if (r.no_end || count) d.repeatOpen = true;
  } else if (date) {
    [d.from, d.to, d.single] = [date, nextDay(date), true];
  }
  return placeAtDraft(d, Date.parse(nowISO));
}
