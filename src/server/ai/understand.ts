/**
 * Plan with AI, read by rules instead of a model.
 *
 * The panel and the route did not change shape: a turn still ends in one of
 * the same tools — propose_blocks, place_at, ask_clarification, record_rule,
 * block_time_off, answer — carrying the same arguments the model used to
 * supply. This module produces them from the sentence with plain pattern
 * matching, so the same words always give the same plan, nothing leaves the
 * server, and every miss is a test case in understand.check.mjs rather than a
 * prompt tweak.
 *
 * What it reads (English): days ("today", "Friday", "next Tuesday", "the
 * 17th", "Oct 17"), ranges ("this week", "before Friday", "the 17th to the
 * 22nd"), parts of the day, clock times ("18:00", "6-8pm", "at 9:30am"),
 * bounds ("after 3pm"), lengths ("2h", "90 min", "an hour and a half"), counts
 * ("three sessions", "every day"), and follow-ups to its own previous turn —
 * "make it 90 minutes", "not Tuesday", "later", or the answer to a question it
 * asked — carried between turns as a `Draft`.
 *
 * It never guesses a day, a length or am/pm: a missing one becomes a question
 * (the route asks for propose_blocks via clarify.ts; this module asks for the
 * rest).
 *
 * Pure: no DB, no clock (callers pass nowISO). Times are UTC wall-clock, like
 * the rest of the app (find-time.ts).
 */

import {
  TOOL_ADD_TASK,
  TOOL_ANSWER,
  TOOL_ASK,
  TOOL_DELETE,
  TOOL_LIST_TASKS,
  TOOL_PLACE_AT,
  TOOL_PLAN_WEEK,
  TOOL_PROPOSE,
  TOOL_RULE,
  TOOL_TASK_DONE,
  TOOL_TASK_UPDATE,
  TOOL_TIME_OFF,
  TOOL_ADD_HABIT,
  TOOL_HABIT_UPDATE,
  TOOL_POSTPONE,
  TOOL_TRAVEL,
  TOOL_PLAN_SETTINGS,
} from './tools/names.ts';
import { durationOptions } from './clarify.ts';
import { datesBetween, describeRule, firstOnOrAfter, formatRule, parseRule, type Rule } from '../../lib/repeats.ts';
import { ambiguousTime } from './place-at.ts';

/** Stamped on every logged turn in place of the old prompt version. Bump on any behaviour change. */
export const PARSER_VERSION = 'r4';
/** What `ai_turns.model_id` records for a turn read by this module. */
export const PARSER_ID = 'rules';

const DAY = 86_400_000;
const MIN = 60_000;

/** What the planner has understood so far in a conversation. Stored on the assistant message. */
/** A task being added, held while its length is asked for. */
export type TaskDraft = {
  title: string;
  category: string;
  /** exclusive: midnight after the due day */
  dueByISO?: string;
  priority: 'low' | 'medium' | 'high';
  splittable?: boolean;
  preferredWindow?: 'morning' | 'afternoon' | 'evening';
  /** inclusive: no session before this instant */
  notBeforeISO?: string;
  effort?: 'light' | 'hard';
};

export type Draft = {
  tool:
    | typeof TOOL_PROPOSE
    | typeof TOOL_PLACE_AT
    | typeof TOOL_TIME_OFF
    | typeof TOOL_DELETE
    | typeof TOOL_ADD_TASK
    | typeof TOOL_ADD_HABIT
    | typeof TOOL_POSTPONE
    | typeof TOOL_TRAVEL;
  /** add_task: the task so far */
  task?: TaskDraft;
  /** add_habit: the habit so far */
  habit?: HabitDraft;
  /** delete: the title words to match ('' = every block in the range); postpone: the task's title */
  match?: string;
  /** delete: the exact blocks listed in the question, set by the route; a yes deletes these and only these */
  deleteIds?: string[];
  title?: string;
  category?: string;
  durationMin?: number;
  count?: number;
  everyDay?: boolean;
  /** day range, YYYY-MM-DD, `to` exclusive */
  from?: string;
  to?: string;
  /** the range is one named day */
  single?: boolean;
  dayStartHour?: number;
  dayEndHour?: number;
  /** several blocks may share a day ("three review slots on Tuesday") */
  sameDay?: boolean;
  /** the user put the weekend in play */
  weekends?: boolean;
  excludeDates?: string[];
  /** place_at: minutes after midnight */
  atMin?: number;
  /** place_at: the time was a bare "at 6" and still needs am/pm */
  atUnsure?: boolean;
  /** place_at: repeats weekly on these weekdays (0 = Sunday) inside from–to */
  days?: number[];
  /** place_at with days: no end date wanted ("every Monday", "every week") */
  repeatOpen?: boolean;
  /** place_at: a repeat the form read that weekdays alone can't say ("every other Friday", "monthly", "6 times"); its end is `to` */
  rule?: string;
  /** place_at, set by the route: the time overlaps something and the user was asked whether to go ahead */
  clashAsked?: boolean;
  /** set by the route: the last turn put blocks on the card */
  placed?: boolean;
  lastStartISO?: string;
};

export type Understood = {
  name: string;
  args: Record<string, unknown>;
  /** state for the next turn; null starts the next message fresh */
  draft: Draft | null;
  /** one line for the trace: what was read */
  summary: string;
};

export type UnderstandContext = {
  nowISO: string;
  previous: Draft | null;
  /** the blocks the last plan proposed, for "why?" */
  lastProposals: { startISO: string; reason?: string }[];
  /** titles of the user's open tasks, so "report due Monday" is read as a task change */
  taskTitles?: string[];
  /** titles of the user's habits, so "gym 2x a week" changes the one they have */
  habitTitles?: string[];
};

/* ───────────────────────── vocabulary ───────────────────────── */

const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WD_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const WDN = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tues|tue|wed|thurs|thur|thu|fri|sat|sun';
const MON =
  'january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec';

/** One named day. Every group inside is non-capturing so callers can wrap it. */
const DATE =
  `(?:day after tomorrow|today|tonight|tomorrow|tmrw|(?:(?:this|next|coming)\\s+)?(?:${WDN})` +
  `|(?:the\\s+)?\\d{1,2}(?:st|nd|rd|th)(?:\\s+(?:of\\s+)?(?:${MON}))?` +
  `|(?:${MON})\\.?\\s+\\d{1,2}(?:st|nd|rd|th)?|\\d{1,2}\\s+(?:${MON})|\\d{4}-\\d{2}-\\d{2}` +
  // German day.month.year: "5.10.2026", "29.10.26"
  `|\\d{1,2}\\.\\d{1,2}\\.\\d{2}(?:\\d{2})?)`;

/** A set of weekdays: "Monday through Thursday", "Mon–Thu", "Mondays and Wednesdays", "every Tuesday". */
const WD_ONE = `(?:${WDN})s?`;
const WD_RANGE = `\\b(?:every\\s+|each\\s+|on\\s+|from\\s+)?(${WD_ONE})\\s*(?:through|thru|to|till|until|-|–)\\s*(${WD_ONE})\\b`;
const WD_LIST = `\\b(?:every\\s+|each\\s+|on\\s+)?${WD_ONE}(?:\\s*(?:,|and|&|\\+)\\s*${WD_ONE})+\\b`;
const WD_EVERY = `\\b(?:every|each)\\s+(${WDN})\\b|\\b(?:mon|tues|wednes|thurs|fri|satur|sun)days\\b`;
/** "every"/"each" or a plural day name: the days repeat with no end needed. */
const REPEATS = /\b(?:every|each)\b|\b(?:mon|tues|wednes|thurs|fri|satur|sun)days\b/i;

const PART =
  '(?:after lunch|before lunch|lunch(?:time)?|mornings?|afternoons?|evenings?|nights?|tonight|end of (?:the )?day|after work|before work)';

type Part = { from: number; to: number; at: number };
const PARTS: Record<string, Part> = {
  morning: { from: 8, to: 12, at: 9 },
  afternoon: { from: 12, to: 17, at: 13 },
  evening: { from: 17, to: 21, at: 18 },
  night: { from: 18, to: 22, at: 18 },
  tonight: { from: 17, to: 22, at: 18 },
  lunch: { from: 12, to: 14, at: 12 },
  'after lunch': { from: 13, to: 17, at: 13 },
  'before lunch': { from: 8, to: 12, at: 9 },
  'end of day': { from: 15, to: 18, at: 18 },
  'after work': { from: 17, to: 21, at: 18 },
  'before work': { from: 7, to: 9, at: 7 },
};

function partKey(raw: string): string {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').replace('end of the day', 'end of day').replace('lunchtime', 'lunch');
  return PARTS[s] ? s : s.replace(/s$/, '');
}

const HM = '(\\d{1,2})(?:[:.](\\d{2}))?';
/** am/pm, as one optional group so `${MER}?` keeps a single capture */
const MER = '(?:(am|pm|a\\.m\\.?|p\\.m\\.?)(?![a-z]))';
/** a number that is a length or a count, not a clock */
const NOT_CLOCK = '(?!\\s*(?:h\\b|hrs?\\b|hours?\\b|m\\b|mins?\\b|minutes?\\b|days?\\b|weeks?\\b|blocks?\\b|sessions?\\b|slots?\\b|times\\b|x\\b|st\\b|nd\\b|rd\\b|th\\b|%))';

const NUM: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };
const num = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUM[s.toLowerCase()] ?? NaN);

const CATEGORY_WORDS: [string, RegExp][] = [
  ['personal', /\b(gym|work ?out|run|running|jog|yoga|pilates|swim|swimming|climb|climbing|bouldering|tennis|football|soccer|padel|walk|hike|bike|cycling|lunch|dinner|breakfast|coffee with|doctor|dentist|physio|therapy|haircut|barber|groceries|shopping|errands?|laundry|cleaning|cook|cooking|family|kids|school run|pick ?up|date night|friends|party|birthday|hobby|guitar|piano|meditat\w*|nap|personal|movie)\b/],
  ['meeting', /\b(meeting|meet|call|sync|1:1|1-1|one on one|standup|stand-up|interview|catch[- ]?up|check[- ]?in|demo|chat with|talk to|talk with)\b/],
  ['admin', /\b(e-?mails?|inbox|admin|expenses|invoices?|paperwork|taxes|bills|bookkeeping|accounting|slack)\b/],
  ['design', /\b(design|figma|mockups?|wireframes?|prototype|ui|ux|sketch)\b/],
  ['research', /\b(research|read|reading|study|studying|learn|learning|course|paper|investigate|explore|analysis|analy[sz]e)\b/],
];

const DEFAULT_TITLE: Record<string, string> = {
  'deep-work': 'Focus block',
  design: 'Design',
  research: 'Research',
  meeting: 'Meeting',
  admin: 'Admin',
  personal: 'Personal time',
};

export function categoryOf(low: string): string {
  for (const [cat, re] of CATEGORY_WORDS) if (re.test(low)) return cat;
  return 'deep-work';
}

/* ───────────────────────── dates ───────────────────────── */

const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const fromYmd = (s: string) => Date.parse(`${s}T00:00:00.000Z`);
const iso = (ms: number) => new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const pad = (n: number) => String(n).padStart(2, '0');
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

/** Monday of the week after `today`'s week. */
function nextMonday(today: number): number {
  const monBased = (new Date(today).getUTCDay() + 6) % 7;
  return today + (7 - monBased) * DAY;
}

function validDay(y: number, mo: number, d: number): number | null {
  const ms = Date.UTC(y, mo, d);
  return new Date(ms).getUTCDate() === d ? ms : null;
}

/** One matched DATE phrase → the UTC midnight it names. */
function dayOf(raw: string, today: number): number | null {
  const s = raw.toLowerCase().replace(/\s+/g, ' ').trim();
  if (s === 'today' || s === 'tonight') return today;
  if (s === 'tomorrow' || s === 'tmrw') return today + DAY;
  if (s === 'day after tomorrow') return today + 2 * DAY;

  let m = /^(?:(this|next|coming) )?([a-z]+)$/.exec(s);
  if (m) {
    const idx = WD.indexOf(m[2].slice(0, 3) as (typeof WD)[number]);
    if (idx < 0) return null;
    // "next Friday" is Friday of next week; a bare or "this" weekday is the
    // coming one, today included.
    if (m[1] === 'next') return nextMonday(today) + ((idx + 6) % 7) * DAY;
    return today + ((idx - new Date(today).getUTCDay() + 7) % 7) * DAY;
  }
  const now = new Date(today);
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return validDay(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // "29.19.2026" is a typo, not July 2027: Date.UTC would roll month 19 over.
  m = /^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mo = Number(m[2]) - 1;
    return mo >= 0 && mo <= 11 ? validDay(Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]), mo, Number(m[1])) : null;
  }

  m = /^(?:the )?(\d{1,2})(?:st|nd|rd|th)(?: (?:of )?([a-z]+))?$/.exec(s);
  if (m && !m[2]) {
    // "the 17th": this month if it hasn't passed, otherwise next month.
    const d = Number(m[1]);
    const mo = now.getUTCMonth() + (d < now.getUTCDate() ? 1 : 0);
    return validDay(now.getUTCFullYear(), mo, d);
  }
  let day: number | null = null;
  let month = -1;
  if (m) [day, month] = [Number(m[1]), MONTHS.indexOf(m[2].slice(0, 3))];
  else if ((m = /^([a-z]+)\.? (\d{1,2})(?:st|nd|rd|th)?$/.exec(s))) [day, month] = [Number(m[2]), MONTHS.indexOf(m[1].slice(0, 3))];
  else if ((m = /^(\d{1,2}) ([a-z]+)$/.exec(s))) [day, month] = [Number(m[1]), MONTHS.indexOf(m[2].slice(0, 3))];
  if (day === null || month < 0) return null;
  const thisYear = validDay(now.getUTCFullYear(), month, day);
  if (thisYear !== null && thisYear >= today) return thisYear;
  return validDay(now.getUTCFullYear() + 1, month, day);
}

/* ───────────────────────── clock ───────────────────────── */

/**
 * A clock time in minutes after midnight. With no am/pm, 13–23 and zero-padded
 * hours are 24h; a bare 1–7 reads as afternoon under 'pm' (callers ask when it
 * matters) and under 'early' only 1–4 do, so "never before 7" stays 07:00.
 */
function clockMin(h: string, m: string | undefined, mer: string | undefined, prefer: 'pm' | 'early'): number | null {
  let hour = Number(h);
  const minute = m ? Number(m) : 0;
  if (!Number.isFinite(hour) || hour > 24 || minute > 59) return null;
  const mr = mer?.toLowerCase().replace(/\./g, '');
  if (mr === 'pm') {
    if (hour > 12) return null;
    if (hour < 12) hour += 12;
  } else if (mr === 'am') {
    if (hour > 12) return null;
    if (hour === 12) hour = 0;
  } else if (!h.startsWith('0') && hour >= 1) {
    if (prefer === 'pm' && hour <= 7) hour += 12;
    if (prefer === 'early' && hour <= 4) hour += 12;
  }
  return hour * 60 + minute;
}

/* ───────────────────────── reading a sentence ───────────────────────── */

type Shift = 'later' | 'earlier' | 'shorter' | 'longer';

type Facets = {
  when?: { from: number; to: number; single: boolean; weekend: boolean };
  part?: Part;
  partWord?: string;
  startHour?: number;
  endHour?: number;
  durationMin?: number;
  count?: number;
  everyDay?: boolean;
  weekendOk?: boolean;
  at?: { startMin: number; endMin?: number; hasMer: boolean };
  /** weekdays a fixed-time block repeats on, 0 = Sunday ("Monday through Thursday 11–14:45") */
  days?: number[];
  /** "every"/plural days: repeats with no end needed */
  repeat?: boolean;
  exclude: string[];
  shift?: Shift;
  /** the sentence with everything recognised blanked out — what is left is the title */
  rest: string;
};

/** Consumes what it matches, so the leftovers are the title. */
class Scan {
  s: string;
  constructor(s: string) {
    this.s = s;
  }
  take(re: RegExp): RegExpExecArray | null {
    const m = re.exec(this.s);
    if (m) this.s = this.s.slice(0, m.index) + ' '.repeat(m[0].length) + this.s.slice(m.index + m[0].length);
    return m;
  }
}

const rx = (src: string) => new RegExp(src, 'i');

/** "mon" | "Tuesdays" → 0–6 (Sunday 0). */
const wdIndex = (w: string) => WD.indexOf(w.toLowerCase().slice(0, 3) as (typeof WD)[number]);

/**
 * Weekday sets mean a repeat only next to a clock time ("German class Mon–Thu
 * 11:00–14:45"); without one, "Monday to Thursday" stays a window to search
 * ("2h of deep work Monday to Thursday"), so the sentence is read again without them.
 */
export function readFacets(text: string, nowMs: number, withDays = true): Facets {
  const f = readFacetsOnce(text, nowMs, withDays);
  return f.days && !f.at ? readFacetsOnce(text, nowMs, false) : f;
}

function readFacetsOnce(text: string, nowMs: number, withDays: boolean): Facets {
  const today = dayStart(nowMs);
  const sc = new Scan(text);
  const f: Facets = { exclude: [], rest: '' };
  const isWeekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay());
  const setWhen = (from: number, to: number, single = false) => {
    if (f.when) return;
    if (to <= from) to = from + DAY;
    let weekend = false;
    for (let d = from; d < to; d += DAY) if (isWeekend(d)) weekend = single || weekend;
    f.when = { from, to, single, weekend };
  };

  // "not Tuesday" — before any date is read, so Tuesday is not taken as the day.
  for (let m; (m = sc.take(rx(`\\bnot\\s+(?:on\\s+)?(${DATE})\\b`))); ) {
    const d = dayOf(m[1], today);
    if (d !== null) f.exclude.push(ymd(d));
  }

  // Weekday sets, before date ranges read "Monday through Thursday" as one span.
  if (withDays) {
    let w: RegExpExecArray | null;
    if ((w = sc.take(rx(WD_RANGE)))) {
      const [a, b] = [wdIndex(w[1]), wdIndex(w[2])];
      if (a >= 0 && b >= 0) {
        f.days = [];
        for (let i = a; ; i = (i + 1) % 7) {
          f.days.push(i);
          if (i === b) break;
        }
      }
    } else if ((w = sc.take(rx(WD_LIST))) || (w = sc.take(rx(WD_EVERY)))) {
      const names = w[0].match(new RegExp(WDN, 'gi')) ?? [];
      f.days = [...new Set(names.map(wdIndex).filter((i) => i >= 0))];
    }
    if (f.days) {
      f.days.sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7)); // Monday first
      f.repeat = REPEATS.test(w![0]);
      // "for 4 days (a week)" only restates the days.
      sc.take(/\bfor\s+(?:\d|one|two|three|four|five|six|seven)\s+days(?:\s+(?:a|per|each)\s+week)?\b/i);
    }
  }

  if (sc.take(/\b(?:including|incl\.?|and|or|plus)\s+(?:the\s+)?weekends?\b/i)) f.weekendOk = true;

  // Ranges first, then deadlines, then day-to-day spans, then a single day.
  const nm = nextMonday(today);
  let m: RegExpExecArray | null;
  if (sc.take(/\blater this week\b/i)) setWhen(today + 2 * DAY < nm ? today + 2 * DAY : today, nm);
  else if (sc.take(/\b(?:this|the rest of the)\s+week\b/i)) setWhen(today, nm);
  else if (sc.take(/\bnext week\b/i)) setWhen(nm, nm + 7 * DAY);
  else if ((m = sc.take(/\b(next\s+)?(?:this\s+|the\s+|over\s+the\s+|on\s+the\s+)?weekend\b/i))) {
    const sat = Math.max(today, nm - 2 * DAY) + (m[1] ? 7 * DAY : 0);
    setWhen(sat, nm + (m[1] ? 7 * DAY : 0));
    f.when!.weekend = true;
  } else if (
    (m = sc.take(/\b(?:(?:with)?in\s+|over\s+)?(?:the\s+)?next\s+(\d+|two|three|four|five|six|seven|a|one|few)\s+(days?|weeks?)\b/i))
  ) {
    const n = m[1].toLowerCase() === 'few' ? 3 : num(m[1]);
    setWhen(today, today + (n * (m[2].startsWith('w') ? 7 : 1) + 1) * DAY);
  } else if (sc.take(/\bthis month\b/i)) {
    const d = new Date(today);
    setWhen(today, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  } else if ((m = sc.take(/\bin\s+(\d+|two|three|four|five|a|one)\s+days?\b/i))) {
    const d = today + num(m[1]) * DAY;
    setWhen(d, d + DAY, true);
  }

  // A span before a deadline: in "from 5.10.2026 till 29.10.2026" the "till" belongs to the span.
  if (!f.when && (m = sc.take(rx(`\\b(?:from\\s+)?(${DATE})\\s*(?:to|till|until|through|thru|-|–)\\s*(${DATE})\\b`)))) {
    const [a, b] = [dayOf(m[1], today), dayOf(m[2], today)];
    if (a !== null && b !== null) setWhen(a, b + DAY, a === b);
  }
  if (!f.when && (m = sc.take(rx(`\\b(before|by|until|till|no later than)\\s+(${DATE})\\b`)))) {
    const d = dayOf(m[2], today);
    if (d !== null) setWhen(today, m[1].toLowerCase() === 'before' ? d : d + DAY);
  }
  if (!f.when && (m = sc.take(rx(`\\bbetween\\s+(${DATE})\\s+and\\s+(${DATE})\\b`)))) {
    const [a, b] = [dayOf(m[1], today), dayOf(m[2], today)];
    if (a !== null && b !== null) setWhen(a, b + DAY);
  }
  if (!f.when && (m = sc.take(rx(`\\b(?:on\\s+|for\\s+)?(${DATE})\\b`)))) {
    const d = dayOf(m[1], today);
    if (d !== null) {
      setWhen(d, d + DAY, true);
      if (/tonight/i.test(m[1])) f.part = PARTS.tonight;
    }
  }

  // Lengths before clocks: "1h30" is not a time of day.
  const DUR: [RegExp, (m: RegExpExecArray) => number][] = [
    [/\b(?:an?|one)\s+hour\s+and\s+a\s+half\b|\b(?:1|one)\s+and\s+a\s+half\s+hours?\b/i, () => 90],
    [/\bhalf\s+(?:an\s+)?hour\b/i, () => 30],
    [/\b(?:a\s+)?quarter\s+(?:of\s+an\s+)?hour\b/i, () => 15],
    [/\b(\d+)h(\d{2})\b/i, (x) => Number(x[1]) * 60 + Number(x[2])],
    [
      /\b(\d+(?:[.,]\d+)?)\s*(?:h|hrs?|hours?)\b(?:\s*(?:and\s*)?(\d{1,2})\s*(?:m|mins?|minutes?)\b)?/i,
      (x) => Math.round(Number(x[1].replace(',', '.')) * 60) + Number(x[2] ?? 0),
    ],
    [/\b(an|one|two|three|four|five|six|seven|eight)\s+hours?\b/i, (x) => num(x[1]) * 60],
    [/\b(\d+)\s*(?:m|mins?|minutes?)\b/i, (x) => Number(x[1])],
  ];
  for (const [re, val] of DUR) {
    const d = sc.take(re);
    if (d) {
      const v = val(d);
      if (Number.isFinite(v) && v > 0) f.durationMin = Math.min(480, Math.max(15, v));
      break;
    }
  }

  // Clock range: "6-8pm", "from 9:30 to 11", "18:00–19:30".
  m = sc.take(rx(`\\b(?:from\\s+)?${HM}\\s*${MER}?\\s*(?:-|–|to|till|until)\\s*${HM}\\s*${MER}?${NOT_CLOCK}`));
  if (m) {
    const endMin = clockMin(m[4], m[5], m[6], 'pm');
    let startMin = clockMin(m[1], m[2], m[3] ?? (m[6] && /p/i.test(m[6]) ? undefined : m[6]), 'pm');
    if (startMin !== null && endMin !== null) {
      // "6-8pm": the start borrows pm when that keeps it before the end; "11-1pm" stays 11:00.
      if (!m[3] && m[6] && /p/i.test(m[6])) {
        const h = Number(m[1]);
        startMin = (h < 12 && (h + 12) * 60 < endMin ? h + 12 : h) * 60 + Number(m[2] ?? 0);
      }
      let end = endMin;
      if (end <= startMin && end + 720 <= 1440) end += 720;
      if (end > startMin) {
        if (f.durationMin && end - startMin > f.durationMin) {
          // A window wider than the block is a bound, not a placement.
          f.startHour = Math.floor(startMin / 60);
          f.endHour = Math.ceil(end / 60);
        } else {
          f.at = { startMin, endMin: end, hasMer: Boolean(m[3] || m[6]) };
        }
      }
    }
  }

  // Bounds: "after 3pm", "before 11", "between 2 and 5".
  if ((m = sc.take(rx(`\\bbetween\\s+${HM}\\s*${MER}?\\s+and\\s+${HM}\\s*${MER}?${NOT_CLOCK}`)))) {
    const a = clockMin(m[1], m[2], m[3], 'pm');
    const b = clockMin(m[4], m[5], m[6], 'pm');
    if (a !== null && b !== null && b > a) [f.startHour, f.endHour] = [Math.floor(a / 60), Math.ceil(b / 60)];
  }
  if ((m = sc.take(rx(`\\b(?:after|from|not before|no earlier than)\\s+${HM}\\s*${MER}?${NOT_CLOCK}`)))) {
    const a = clockMin(m[1], m[2], m[3], 'pm');
    if (a !== null) f.startHour = Math.ceil(a / 60);
  }
  if ((m = sc.take(rx(`\\b(?:before|by|until|till|no later than)\\s+${HM}\\s*${MER}?${NOT_CLOCK}`)))) {
    const b = clockMin(m[1], m[2], m[3], 'pm');
    if (b !== null) f.endHour = Math.floor(b / 60) || 24;
  }

  // A single clock time — needs am/pm, a colon, "at", or a word like noon.
  if (!f.at) {
    if ((m = sc.take(/\b(?:at\s+)?(noon|midday|midnight)\b/i))) {
      f.at = { startMin: /night/i.test(m[1]) ? 0 : 720, hasMer: true };
    } else if ((m = sc.take(rx(`\\b(?:at\\s+)?${HM}\\s*${MER}`)))) {
      const a = clockMin(m[1], m[2], m[3], 'pm');
      if (a !== null) f.at = { startMin: a, hasMer: true };
    } else if ((m = sc.take(rx(`\\b(?:at\\s+)?(\\d{1,2})[:.](\\d{2})\\b${NOT_CLOCK}`)))) {
      const a = clockMin(m[1], m[2], undefined, 'pm');
      if (a !== null) f.at = { startMin: a, hasMer: false };
    } else if ((m = sc.take(rx(`\\bat\\s+(\\d{1,2})\\b${NOT_CLOCK}(?![:.]\\d)`)))) {
      const a = clockMin(m[1], undefined, undefined, 'pm');
      if (a !== null) f.at = { startMin: a, hasMer: false };
    } else if ((m = sc.take(/\b(\d{1,2})\s*uhr\b/i))) {
      const a = clockMin(m[1].padStart(2, '0'), undefined, undefined, 'pm');
      if (a !== null) f.at = { startMin: a, hasMer: true };
    }
  }

  // "every morning" is both a count and a part of the day.
  if ((m = sc.take(/\b(?:every|each)\s+(?:single\s+)?(day|weekday|morning|afternoon|evening)\b|\bdaily\b/i))) {
    f.everyDay = true;
    if (m[1] && PARTS[m[1].toLowerCase()]) [f.part, f.partWord] = [PARTS[m[1].toLowerCase()], m[1].toLowerCase()];
  }
  if ((m = sc.take(rx(`\\b(?:(this|in the|every|each)\\s+)?(${PART})\\b`)))) {
    const key = partKey(m[2]);
    if (!f.part && PARTS[key]) [f.part, f.partWord] = [PARTS[key], key];
    if ((m[1]?.toLowerCase() === 'this' || key === 'tonight') && !f.when) setWhen(today, today + DAY, true);
  }
  // A bare hour with a part of the day: "at 6 in the evening", "9 in the morning".
  if (f.at && !f.at.hasMer && f.partWord) {
    const evening = f.part!.from >= 12;
    if (evening && f.at.startMin < 720) f.at.startMin += 720;
    if (!evening && f.at.startMin >= 780) f.at.startMin -= 720;
    f.at.hasMer = true;
  }

  if ((m = sc.take(/\b(\d|one|two|three|four|five)\s*(?:x\b|×)/i))) f.count = num(m[1]);
  else if ((m = sc.take(/\btwice\b/i))) f.count = 2;
  else {
    const c = /\b(\d|one|two|three|four|five)\s+((?:[a-z-]+\s+){0,3}?)(blocks?|sessions?|slots?|times|meetings|calls|workouts|runs|reviews|chunks)\b/i.exec(sc.s);
    if (c) {
      f.count = num(c[1]);
      sc.s = sc.s.slice(0, c.index) + ' '.repeat(c[1].length) + sc.s.slice(c.index + c[1].length);
    }
  }

  if (sc.take(/\b(?:later|too early|push (?:it |them )?back)\b/i)) f.shift = 'later';
  else if (sc.take(/\b(?:earlier|too late|sooner)\b/i)) f.shift = 'earlier';
  else if (sc.take(/\b(?:shorter|too long)\b/i)) f.shift = 'shorter';
  else if (sc.take(/\b(?:longer|too short)\b/i)) f.shift = 'longer';

  f.rest = sc.s;
  return f;
}

/* ───────────────────────── title ───────────────────────── */

const LEAD =
  /^(?:(?:can|could|would|will)\s+you\s+|please\s+|i\s+(?:need|want|have|would\s+like)\s+(?:to\s+)?|i'd\s+like\s+(?:to\s+)?|let'?s\s+|help\s+me\s+|remind\s+me\s+to\s+|make\s+(?:some\s+)?(?:room|time|space)\s+(?:for|to)\s+|make\s+it\s+|find\s+(?:me\s+)?(?:some\s+)?(?:time|room|a\s+slot|slots?|a\s+time)\s*(?:for|to)?\s*|find\s+|fit\s+(?:in\s+)?|squeeze\s+(?:in\s+)?|schedule\s+|book\s+(?:in\s+)?|block\s+(?:out\s+|off\s+)?|put\s+(?:in\s+)?|plan\s+(?:in\s+)?|add\s+|set\s+up\s+|create\s+|move\s+(?:it|this|that|them)?\s*|what\s+about\s+|how\s+about\s+|try\s+|when\s+can\s+i\s+(?:do\s+|fit\s+(?:in\s+)?|have\s+)?|where\s+can\s+i\s+fit\s+(?:in\s+)?|go\s+to\s+|do\s+)+/i;

const EDGE = new Set(
  (
    'a an the of for on at in to from by this next and or with me my some it them that time slot slots block blocks ' +
    'session sessions instead please actually no not ok okay yes sure also then around about every each day days ' +
    'between until till before after x times shorter longer earlier later again more less too early late long short ' +
    'just maybe up out be i im is am are can you could should would will want need any week'
  ).split(' '),
);

function titleFrom(rest: string): string {
  let s = rest.replace(/[,.!?;()"“”]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(LEAD, '').trim();
  const words = s.split(' ').filter(Boolean);
  const edge = (w: string) => EDGE.has(w.toLowerCase().replace(/['’]/g, ''));
  while (words.length && edge(words[0])) words.shift();
  while (words.length && edge(words[words.length - 1])) words.pop();
  const t = words.join(' ').replace(/^[-–—:]+|[-–—:]+$/g, '').trim().slice(0, 60);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/* ───────────────────────── rules ───────────────────────── */

const RULE_HELP =
  'I couldn\'t turn that into a rule. Rules I can keep: "never book me before 10", "no meetings on Fridays", ' +
  '"leave by 17:00", "work hours 9 to 5", "15 minutes between meetings", "keep Friday afternoons free".';

const STANDING =
  /\b((?:leave|finish|stop)\s+(?:work\s+)?by|never|always|no\s+(?:meetings|calls)|(?:meeting|call)[- ]free|(?:don'?t|do\s+not)\s+(?:ever\s+)?(?:book|schedule|put|plan)|work(?:ing)?\s+hours|office\s+hours|i\s+(?:work|start\s+work|finish\s+work|stop\s+work)|my\s+(?:work\s*)?day\s+(?:starts|ends|is)|buffer|breathing\s+room|between\s+(?:meetings|calls|blocks|events)|nothing\s+(?:before|after)|(?:keep|protect)\s+(?:my\s+)?(?:\w+\s+)?(?:(?:mon|tues|wednes|thurs|fri|satur|sun)days|mornings|afternoons|evenings))\b/i;

const ONE_OFF = /\b(today|tonight|tomorrow|this\s+\w+|next\s+\w+|\d{1,2}(?:st|nd|rd|th))\b/i;

function weekdayCode(low: string): string | undefined {
  const m = new RegExp(`\\b(${WDN})s?\\b`, 'i').exec(low);
  return m ? WD[WD.indexOf(m[1].slice(0, 3).toLowerCase() as (typeof WD)[number])] : undefined;
}

function readRule(raw: string): Record<string, unknown> | 'unclear' | null {
  const low = raw.toLowerCase();
  if (!STANDING.test(low)) return null;
  // "don't book anything tomorrow afternoon" is about one day, not a standing rule.
  if (ONE_OFF.test(low) && !/\b(never|always)\b/.test(low)) return null;

  const label = raw.replace(/[.!\s]+$/, '').slice(0, 80);
  const out = (kind: string, extra: Record<string, unknown>) => {
    const day = weekdayCode(low);
    const nice = label.charAt(0).toUpperCase() + label.slice(1);
    return { kind, ...(day ? { day } : {}), ...extra, label: nice, reply: `Saved — ${nice}. I'll keep to it from now on.` };
  };
  const hour = (m: RegExpExecArray, i: number, prefer: 'pm' | 'early') => {
    const v = clockMin(m[i], m[i + 1], m[i + 2], prefer);
    return v === null ? null : v / 60;
  };
  let m: RegExpExecArray | null;

  const mins = /(\d+)\s*(?:m|mins?|minutes?)\b/.exec(low);
  if (/\b(buffer|breathing room|gap|between (?:meetings|calls|blocks|events)|after (?:every|each)|before and after)\b/.test(low)) {
    return out('buffer', { minutes: Math.min(120, Math.max(0, mins ? Number(mins[1]) : 15)) });
  }
  if (/\b(work(?:ing)? hours|office hours|i work|my (?:work ?)?day is)\b/.test(low)) {
    m = rx(`${HM}\\s*${MER}?\\s*(?:-|–|to|till|until)\\s*${HM}\\s*${MER}?`).exec(low);
    if (m) {
      const a = hour(m, 1, 'early');
      let b = hour(m, 4, 'pm');
      if (a !== null && b !== null) {
        if (b <= a && b + 12 <= 24) b += 12;
        if (b > a) return out('work-hours', { startHour: a, endHour: b });
      }
    }
    return 'unclear';
  }
  if ((m = rx(`\\b(?:i start(?: work)?|my (?:work ?)?day starts)\\s+(?:at\\s+)?${HM}\\s*${MER}?`).exec(low))) {
    const a = hour(m, 1, 'early');
    if (a !== null) return out('protected', { startHour: 0, endHour: a });
  }
  if ((m = rx(`\\b(?:leave|finish|done|stop|wrap up|out|off|my (?:work ?)?day ends)\\b[^.]*?\\b(?:by|at)\\s+${HM}\\s*${MER}?`).exec(low))) {
    const b = hour(m, 1, 'pm');
    if (b !== null) return out('leave-by', { endHour: b });
  }
  const window = (): Record<string, unknown> | null => {
    let w: RegExpExecArray | null;
    if ((w = rx(`\\bbefore\\s+${HM}\\s*${MER}?`).exec(low))) {
      const a = hour(w, 1, 'early');
      return a === null ? null : { startHour: 0, endHour: a };
    }
    if ((w = rx(`\\bafter\\s+${HM}\\s*${MER}?`).exec(low))) {
      const a = hour(w, 1, 'pm');
      return a === null ? null : { startHour: a, endHour: 24 };
    }
    if ((w = rx(`\\b(${PART})\\b`).exec(low))) {
      const p = PARTS[partKey(w[1])];
      if (p) return { startHour: p.from, endHour: p.to };
    }
    return null;
  };
  if (/\bno\s+(?:meetings|calls)\b|\b(?:meeting|call)[- ]free\b|\b(?:don'?t|do not|never)\s+(?:book|schedule|put)\s+(?:any\s+)?(?:meetings|calls)\b/.test(low)) {
    return out('no-meetings', window() ?? {});
  }
  const w = window();
  if (w && /\b(never|nothing|don'?t|do not|keep|protect|block)\b/.test(low)) return out('protected', w);
  if (/\b(keep|protect|block)\b/.test(low) && weekdayCode(low)) return out('protected', { startHour: 0, endHour: 24 });
  return 'unclear';
}

/* ───────────────────────── time off ───────────────────────── */

const AWAY =
  /\b(vacation|holidays?|time off|days? off|off work|out of (?:the )?office|ooo|away|sick|(?:parental|maternity|paternity|annual|sick|on) leave|trip|travell?ing|wedding|conference|offsite|off-site|unavailable|not available|abroad)\b/i;
const OFF = /\b(?:i'?m|i am|i'?ll be|i will be|we'?re|taking|take|be)\b[^.]*\boff\b|\b(?:i'?m|i am|i'?ll be|i will be|we'?re)\s+out\b/i;
/** Case-sensitive on purpose: the capital is how a place name is told from "in the morning". */
const BE_IN = /\b(?:[Ii]'?m|[Ii] am|[Ii]'?ll be|[Ii] will be|[Ww]e'?re|[Ww]e will be)\s+(?:in|at|visiting)\s+[A-Z]/;
const KEEP_FREE = /\b(?:keep|leave)\b.*\b(?:free|clear)\b|\b(?:don'?t|do not)\s+(?:book|schedule|put|plan)\b/i;

function looksAway(raw: string): boolean {
  if (/\bkick[- ]?off\b/i.test(raw)) return false;
  return AWAY.test(raw) || OFF.test(raw) || BE_IN.test(raw) || KEEP_FREE.test(raw);
}

function awayTitle(raw: string): string {
  const low = raw.toLowerCase();
  const kind = /\b(vacation|holidays?)\b/.test(low)
    ? 'Vacation'
    : /\bsick\b/.test(low)
      ? 'Sick'
      : /\b(parental|maternity|paternity) leave\b/.test(low)
        ? 'Parental leave'
        : /\bconference\b/.test(low)
          ? 'Conference'
          : /\bwedding\b/.test(low)
            ? 'Wedding'
            : /\b(trip|travell?ing)\b/.test(low)
              ? 'Trip'
              : /\b(day off|days off|time off|off)\b/.test(low)
                ? 'Time off'
                : KEEP_FREE.test(raw)
                  ? 'Kept free'
                  : 'Away';
  const place = /\b(?:in|to|at|visiting)\s+([A-Z][\p{L}'’-]+(?:\s+[A-Z][\p{L}'’-]+)?)/u.exec(raw);
  const named = place && !new RegExp(`^(?:${WDN}|${MON}|I)\\b`, 'i').test(place[1]) ? place[1] : '';
  return named ? `${kind} — ${named}` : kind;
}

/** The span someone is away, as checkTimeOff reads it: a bare date is a whole day, end inclusive. */
function readTimeOff(raw: string, nowMs: number): { startISO: string; endISO: string } | null {
  const today = dayStart(nowMs);
  const low = raw.toLowerCase();
  const nm = nextMonday(today);
  const at = (day: number, part?: string) => (part ? `${ymd(day)}T${pad(PARTS[partKey(part)]?.at ?? 0)}:00` : ymd(day));

  let m: RegExpExecArray | null;
  if ((m = /\b(next\s+)?(?:this\s+|the\s+|all\s+|over\s+the\s+)?weekend\b/.exec(low))) {
    const sat = Math.max(today, nm - 2 * DAY) + (m[1] ? 7 * DAY : 0);
    return { startISO: ymd(sat), endISO: ymd(nm - DAY + (m[1] ? 7 * DAY : 0)) };
  }
  if (/\bnext week\b/.test(low)) return { startISO: ymd(nm), endISO: ymd(nm + 6 * DAY) };
  if (/\b(?:this|the rest of the)\s+week\b/.test(low)) return { startISO: ymd(today), endISO: ymd(nm - DAY) };

  const hits: { day: number; part?: string; index: number; end: number }[] = [];
  const re = new RegExp(`\\b(${DATE})(?:\\s+(?:in\\s+the\\s+)?(${PART}))?\\b`, 'gi');
  while ((m = re.exec(low))) {
    const d = dayOf(m[1], today);
    if (d !== null) hits.push({ day: d, part: m[2] ?? (/tonight/.test(m[1]) ? 'tonight' : undefined), index: m.index, end: m.index + m[0].length });
  }
  if (!hits.length) {
    m = rx(`\\bthis\\s+(${PART})\\b`).exec(low);
    if (m) return { startISO: at(today, m[1]), endISO: ymd(today) };
    return null;
  }
  const first = hits[0];
  const second = hits[1];
  if (second && /^\s*(?:to|till|until|through|thru|-|–|and)\s*(?:the\s+)?$/.test(low.slice(first.end, second.index))) {
    // "Tuesday to Thursday" on a Thursday: the end weekday is the one after the start, not today.
    const end = second.day < first.day ? second.day + 7 * DAY * Math.ceil((first.day - second.day) / (7 * DAY)) : second.day;
    return { startISO: at(first.day, first.part), endISO: at(end, second.part) };
  }
  if (/\b(?:until|till|through|thru)\s*$/.test(low.slice(0, first.index))) {
    return { startISO: ymd(today), endISO: at(first.day, first.part) };
  }
  if ((m = /\bfor\s+(\d+|a|one|two|three|four|five|six|seven|ten)\s+(days?|weeks?)\b/.exec(low))) {
    const n = num(m[1]) * (m[2].startsWith('w') ? 7 : 1);
    return { startISO: at(first.day, first.part), endISO: ymd(first.day + (n - 1) * DAY) };
  }
  return { startISO: at(first.day, first.part), endISO: ymd(first.day) };
}

/* ───────────────────────── deleting ───────────────────────── */

const DELETE = /^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:delete|remove|cancel|clear|drop|scrap|get\s+rid\s+of)\b\s*(.*)$/i;
const CONFIRM_YES = /^\s*(?:delete(?:\s+(?:them|it|all|both))?|yes|yep|yeah|confirm|do\s+it|go\s+ahead|sure)\b[\s.!]*$/i;
const CONFIRM_NO = /^\s*(?:keep(?:\s+(?:them|it))?|no|nope|don'?t|cancel|stop|never\s*mind)\b/i;
const ALL_WORDS = new Set(['all', 'everything', 'events', 'event', 'anything', 'whole', 'entire', 'schedule', 'calendar']);

/**
 * "Delete work", "cancel gym tomorrow", "clear everything on Friday". This only
 * says what to look for; the route finds the blocks, lists them, and deletes
 * nothing until the user says yes to that exact list.
 */
function readDelete(target: string, prev: Draft | null, nowMs: number, today: number): Understood {
  const f = readFacets(target, nowMs);
  const words = titleFrom(f.rest)
    .toLowerCase()
    .split(' ')
    .filter((w) => w && !ALL_WORDS.has(w) && !EDGE.has(w));
  const match = prev ? prev.match ?? '' : words.join(' ');
  const from = f.when ? f.when.from : prev?.from ? fromYmd(prev.from) : NaN;
  const to = f.when ? f.when.to : prev?.to ? fromYmd(prev.to) : NaN;
  const draft: Draft = {
    tool: TOOL_DELETE,
    match,
    ...(Number.isFinite(from) ? { from: ymd(from), to: ymd(to) } : {}),
  };
  // "Clear everything" with no day would be the whole calendar: ask which day.
  if (!match && !Number.isFinite(from)) {
    return ask('Which day should I clear?', ['Today', 'Tomorrow'], draft, 'delete · day missing');
  }
  const when = Number.isFinite(from)
    ? to - from === DAY
      ? dayLabel(from, today)
      : `${dayLabel(from, today)} – ${dayLabel(to - DAY, today)}`
    : 'next 3 weeks';
  return {
    name: TOOL_DELETE,
    args: {
      confirm: false,
      match,
      ...(Number.isFinite(from) ? { earliestISO: iso(from), latestISO: iso(to) } : {}),
    },
    draft,
    summary: `delete · ${match ? `"${match}"` : 'everything'} · ${when}`,
  };
}

/* ───────────────────────── tasks ───────────────────────── */

const ADD_TASK =
  /^\s*(?:please\s+)?(?:(?:add|new|create|save)\s+(?:a\s+|the\s+)?(?:task|to-?do)\b|(?:task|to-?do)\s*:)\s*[:\-–]?\s*(.*)$/i;
const PLAN_WEEK =
  /^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:(?:plan|schedule|organi[sz]e|sort\s+out)\s+(?:(?:my|the|all\s+(?:of\s+)?my|all\s+the)\s+)?(?:week|tasks|backlog|to-?dos|to-?do\s+list)(?:\s+(?:for\s+)?(?:this|next)\s+week)?|re-?plan(?:\s+(?:my|the)\s+(?:week|tasks))?)\s*[.!?]*$/i;
const LIST_TASKS =
  /^\s*(?:(?:show|list|what\s+are|what's\s+on|whats\s+on)\s+)?(?:me\s+)?(?:my\s+|the\s+)?(?:open\s+)?(?:tasks|to-?dos|backlog|to-?do\s+list)\s*[?.!]*$/i;
/** "finished the report", "mark the report as done" — `mark` alone is not done ("mark Friday as focus time"). */
const TASK_DONE =
  /^\s*(?:i(?:'ve|\s+have)?\s+)?(?:(?:finished|completed|done\s+with)\s+(?:the\s+|my\s+)?(.+?)(?:\s+(?:as\s+)?(?:done|complete|completed|finished))?|mark(?:ed)?\s+(?:the\s+|my\s+)?(.+?)\s+(?:as\s+)?(?:done|complete|completed|finished))\s*[.!]*$/i;
const TASK_SPLIT = /^\s*(?:you\s+can\s+|it's\s+ok\s+to\s+|ok\s+to\s+)?split\s+(?:up\s+)?(?:the\s+|my\s+)?(.+?)\s*[.!]*$/i;
const TASK_DUE = /^\s*(?:move\s+|make\s+)?(?:the\s+|my\s+)?(.+?)\s+(?:is\s+)?(?:now\s+)?due\s+(.+?)\s*[.!]*$/i;
const TASK_TAKES = /^\s*(?:the\s+|my\s+)?(.+?)\s+(?:takes|will\s+take|needs)\s+(.+?)\s*[.!]*$/i;
/** How draining a task is. Only unmistakable phrasings: "hard drive backup" stays a title. */
const IT_IS = "(?:(?:it'?s|it\\s+is|this\\s+is|that'?s)\\s+)?(?:(?:a|an|really|quite|pretty|very|super)\\s+)*";
const HARD_WORDS = new RegExp(`\\b${IT_IS}(?:difficult|demanding|draining|intense|tough\\s+one|hard\\s+(?:one|task)|heavy\\s+lifting|needs?\\s+(?:deep|full)\\s+focus)\\b`, 'i');
const LIGHT_WORDS = new RegExp(`\\b${IT_IS}(?:easy\\s+(?:one|task)|easy|light\\s+(?:one|task|work)|low[- ]effort|no[- ]brainer|mindless)\\b`, 'i');
/** "the report is hard", "tax forms are easy" — about a task they have. */
const TASK_EFFORT =
  /^\s*(?:the\s+|my\s+)?(.+?)\s+(?:is|are|will\s+be|is\s+going\s+to\s+be)\s+(?:a\s+|an\s+|really\s+|quite\s+|pretty\s+|very\s+|super\s+)*(hard|difficult|demanding|draining|intense|tough|heavy|easy|light|simple|quick|mindless)(?:\s+(?:one|task|work))?\s*[.!]*$/i;
const TASK_CANCEL = /^\s*(?:no|nope|cancel|never\s*mind|forget\s+it|stop)\b[\s.!]*$/i;

/** Words that point at a task without naming one: never a match. */
const NOT_A_NAME = /^(?:it|this|that|them|these|those|everything|all|as|one|the\s+one|this\s+one|that\s+one)$/;

/** Whether `hay` contains `needle` as whole words ("report" in "write the report", not "it" in "write"). */
function hasWords(hay: string, needle: string): boolean {
  return new RegExp(`(?:^|\\W)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\W|$)`).test(hay);
}

/** The open task a phrase names: exact title first, then one containing the other as whole words. */
function matchTask(phrase: string, titles: string[]): string | null {
  const p = phrase.toLowerCase().replace(/^(?:the|my)\s+/, '').replace(/[.!?]+$/, '').trim();
  if (p.length < 3 || NOT_A_NAME.test(p)) return null;
  return (
    titles.find((t) => t.toLowerCase() === p) ??
    titles.find((t) => hasWords(t.toLowerCase(), p) || hasWords(p, t.toLowerCase())) ??
    null
  );
}

const hoursLabel = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${h}h`;
};

/** "by Friday" → midnight after Friday: the whole due day counts, on the user's calendar. */
function dueFrom(phrase: string, nowMs: number): number | null {
  const f = readFacets(`by ${phrase.replace(/^\s*(?:on|by)\s+/i, '')}`, nowMs);
  return f.when ? f.when.to : null;
}

function addTask(t: TaskDraft, durationMin: number, today: number): Understood {
  const splittable = t.splittable ?? durationMin > 120;
  const due = t.dueByISO ? `due ${dayLabel(Date.parse(t.dueByISO) - DAY, today)}` : 'no due date';
  const from = t.notBeforeISO ? `not before ${dayLabel(dayStart(Date.parse(t.notBeforeISO)), today)}` : '';
  return {
    name: TOOL_ADD_TASK,
    args: { ...t, durationMin, splittable, reply: '' },
    draft: null,
    summary: [t.title, hoursLabel(durationMin), due, from, t.effort ?? '', t.priority !== 'medium' ? `${t.priority} priority` : '', splittable ? 'can split' : '']
      .filter(Boolean)
      .join(' · '),
  };
}

function readAddTask(body: string, nowMs: number, today: number): Understood {
  // "not before the 20th" first, so its date is not read as the due date.
  const nb = takeNotBefore(body, nowMs);
  let s = nb.body;
  const take = (re: RegExp) => {
    const hit = re.test(s);
    if (hit) s = s.replace(re, ' ');
    return hit;
  };
  let priority: TaskDraft['priority'] = 'medium';
  if (take(/\b(?:urgent(?:ly)?|asap|important|high[- ]priority|top[- ]priority)\b/i)) priority = 'high';
  else if (take(/\b(?:low[- ]priority|whenever|someday|no\s+rush)\b/i)) priority = 'low';
  else take(/\b(?:medium|normal)[- ]priority\b/i);

  let effort: TaskDraft['effort'];
  if (take(HARD_WORDS)) effort = 'hard';
  else if (take(LIGHT_WORDS)) effort = 'light';

  let splittable: boolean | undefined;
  if (take(/\b(?:in\s+one\s+(?:go|sitting|block)|(?:don't|do\s+not)\s+split(?:\s+it)?|no\s+splitting|all\s+at\s+once)\b/i)) splittable = false;
  else if (take(/\b(?:(?:can\s+be\s+)?split(?:\s+(?:it|up))?|in\s+(?:chunks|pieces|sessions)|across\s+(?:a\s+few\s+|several\s+)?days)\b/i)) splittable = true;

  // "due Friday" reads like "by Friday": the end of that day.
  s = s.replace(/\bdue\s+(?:on\s+|by\s+)?/i, 'by ');
  const f = readFacets(s, nowMs);
  const title = titleFrom(f.rest);
  if (!title) {
    return answer('What\'s the task? For example: "Add task: write the report, 3h, due Friday".', null);
  }
  const category = categoryOf(title.toLowerCase());
  const t: TaskDraft = { title, category, priority };
  if (f.when) t.dueByISO = iso(f.when.to);
  if (nb.at !== null) t.notBeforeISO = iso(nb.at);
  if (effort) t.effort = effort;
  if (splittable !== undefined) t.splittable = splittable;
  if (f.part) t.preferredWindow = f.part.from < 12 ? 'morning' : f.part.from < 17 ? 'afternoon' : 'evening';

  if (!f.durationMin) {
    return ask(`How long will ${title} take?`, durationOptions(category), { tool: TOOL_ADD_TASK, task: t }, `task · ${title} · length missing`);
  }
  return addTask(t, f.durationMin, today);
}

/** A turn about the task backlog, or null when the sentence is about something else. */
function readTaskTurn(raw: string, ctx: UnderstandContext, nowMs: number, today: number): Understood | null {
  const prev = ctx.previous;
  const titles = ctx.taskTitles ?? [];

  // Answering "how long will X take?"
  if (prev?.tool === TOOL_ADD_TASK && prev.task) {
    if (TASK_CANCEL.test(raw)) return answer('Okay — no task added.', null);
    const f = readFacets(raw, nowMs);
    if (f.durationMin && !titleFrom(f.rest)) return addTask(prev.task, f.durationMin, today);
  }

  const add = ADD_TASK.exec(raw);
  if (add) return readAddTask(add[1], nowMs, today);

  if (PLAN_WEEK.test(raw)) return { name: TOOL_PLAN_WEEK, args: { reply: '' }, draft: null, summary: 'plan every open task' };
  if (LIST_TASKS.test(raw)) return { name: TOOL_LIST_TASKS, args: { reply: '' }, draft: null, summary: 'list open tasks' };

  const done = TASK_DONE.exec(raw);
  // Finishing a task clears its sessions, so it only happens for a task the
  // sentence actually names — never on a guess from "mark it done".
  const doneTitle = done && matchTask(done[1] ?? done[2], titles);
  if (doneTitle) {
    return { name: TOOL_TASK_DONE, args: { match: doneTitle, reply: '' }, draft: null, summary: `done · "${doneTitle}"` };
  }
  if (done && titles.length) {
    const question = 'Which task did you finish?';
    return { name: TOOL_ASK, args: { question, options: titles.slice(0, 4).map((t) => `Done with ${t}`) }, draft: null, summary: 'done · which task?' };
  }

  // Changes to a task only count when they name one the user actually has.
  const split = TASK_SPLIT.exec(raw);
  const splitTitle = split && matchTask(split[1], titles);
  if (splitTitle) {
    return { name: TOOL_TASK_UPDATE, args: { match: splitTitle, splittable: true, reply: '' }, draft: null, summary: `${splitTitle} · can split` };
  }
  const dueM = TASK_DUE.exec(raw);
  const dueTitle = dueM && matchTask(dueM[1], titles);
  if (dueM && dueTitle) {
    const to = dueFrom(dueM[2], nowMs);
    if (to !== null) {
      return {
        name: TOOL_TASK_UPDATE,
        args: { match: dueTitle, dueByISO: iso(to), reply: '' },
        draft: null,
        summary: `${dueTitle} · due ${dayLabel(to - DAY, today)}`,
      };
    }
  }
  const eff = TASK_EFFORT.exec(raw);
  const effTitle = eff && matchTask(eff[1], titles);
  if (eff && effTitle) {
    const effort = /^(?:easy|light|simple|quick|mindless)$/i.test(eff[2]) ? 'light' : 'hard';
    return { name: TOOL_TASK_UPDATE, args: { match: effTitle, effort, reply: '' }, draft: null, summary: `${effTitle} · ${effort}` };
  }
  const takes = TASK_TAKES.exec(raw);
  const takesTitle = takes && matchTask(takes[1], titles);
  if (takes && takesTitle) {
    const f = readFacets(takes[2], nowMs);
    if (f.durationMin) {
      return {
        name: TOOL_TASK_UPDATE,
        args: { match: takesTitle, durationMin: f.durationMin, reply: '' },
        draft: null,
        summary: `${takesTitle} · ${hoursLabel(f.durationMin)}`,
      };
    }
  }
  return null;
}

/* ─────────────────── habits, postpone, travel ─────────────────── */

const TIMES: Record<string, number> = { once: 1, one: 1, twice: 2, two: 2, thrice: 3, three: 3, four: 4, five: 5, six: 6, seven: 7 };
/** "3x a week", "three times per week", "twice a week" — and, after "habit:", "every day" / "every weekday". */
const PER_WEEK =
  /\b(?:(once|twice|thrice)|([1-7]|one|two|three|four|five|six|seven)\s*(?:x|×|times?))\s*(?:a|per|each|every|in\s+a)\s+week\b/i;
const EVERY_DAY = /\b(?:every\s*day|daily|each\s+day)\b/i;
const EVERY_WEEKDAY = /\b(?:every\s+(?:week|work)\s*day|each\s+(?:week|work)\s*day|on\s+weekdays|weekdays)\b/i;

const N = '[1-7]|one|two|three|four|five|six|seven|once|twice|thrice';
const TIMES_WORD = '(?:\\s*(?:x|×|times?))?';
const A_WEEK = '\\s*(?:a|per|each|every|in\\s+a)\\s+week\\b';
/** "2-3x a week", "2 to 3 times a week", "2 or 3 times a week" */
const RANGE = new RegExp(`\\b(${N})\\s*(?:-|–|to|or)\\s*(${N})${TIMES_WORD}${A_WEEK}`, 'i');
/** "at least 2" / "ideally 3" (with or without "times a week") */
const AT_LEAST = new RegExp(`\\b(?:at\\s+least|minimum(?:\\s+of)?|no\\s+fewer\\s+than)\\s+(${N})${TIMES_WORD}(?:${A_WEEK})?`, 'i');
const IDEALLY = new RegExp(`\\b(?:ideally|preferably|up\\s+to|at\\s+most|aiming\\s+for|hopefully)\\s+(${N})${TIMES_WORD}(?:${A_WEEK})?`, 'i');
const timesNum = (w: string) => TIMES[w.toLowerCase()] ?? Number(w);

/**
 * How often, as an ideal and the fewest that still count — the benchmark's
 * min/opt repetition counts. `strip` blanks what was read, so the rest is the title.
 */
type PerWeek = { n: number; min?: number; strip: (s: string) => string };
function perWeekOf(s: string, prefixed: boolean): PerWeek | null {
  const blank = (...res: RegExp[]) => (x: string) => res.reduce((acc, re) => acc.replace(re, ' '), x);
  const range = RANGE.exec(s);
  if (range) {
    const [a, b] = [timesNum(range[1]), timesNum(range[2])];
    return { n: Math.max(a, b), min: Math.min(a, b), strip: blank(RANGE) };
  }
  const least = AT_LEAST.exec(s);
  const ideal = IDEALLY.exec(s);
  const m = PER_WEEK.exec(s);
  const base = m ? timesNum(m[1] ?? m[2]) : undefined;
  if (least || ideal) {
    const min = least ? timesNum(least[1]) : undefined;
    const n = ideal ? timesNum(ideal[1]) : base ?? min!;
    return { n: Math.max(n, min ?? 1), min: min !== undefined && min < n ? min : undefined, strip: blank(AT_LEAST, IDEALLY, PER_WEEK) };
  }
  if (m) return { n: base!, strip: blank(PER_WEEK) };
  // Only a "habit:" line reads "every day" as a target; elsewhere it is a routine.
  if (prefixed && EVERY_WEEKDAY.test(s)) return { n: 5, strip: blank(EVERY_WEEKDAY) };
  if (prefixed && EVERY_DAY.test(s)) return { n: 7, strip: blank(EVERY_DAY) };
  return null;
}
const perText = (n: number, min?: number) => (min ? `${min}–${n}x a week` : `${n}x a week`);

const ADD_HABIT = /^\s*(?:please\s+)?(?:(?:add|new|create|start|set\s+up)\s+(?:a\s+)?habit\b|habit\s*:)\s*[:\-–]?\s*(.*)$/i;
/** "I want to go to the gym 3 times a week" — the lead-in is not part of the title. */
const HABIT_LEAD =
  /^\s*(?:i\s+(?:want|would\s+like|'d\s+like|need|have|plan|try|aim|like)\s+to\s+|i\s+(?:should|must)\s+|let\s+me\s+|help\s+me\s+|(?:find|make|block)\s+(?:time|room)\s+(?:for|to)\s+|(?:put|plan|schedule|book)\s+(?:in\s+)?)?(?:go\s+(?:to\s+(?:the\s+)?)?|do\s+(?:some\s+)?|get\s+(?:in\s+)?(?:a\s+|some\s+)?|hit\s+the\s+)?/i;
/** "stop the gym habit", "drop gym", "no more running". Delete/remove/cancel only with the word habit — "delete gym tomorrow" is about blocks. */
const HABIT_STOP =
  /^\s*(?:please\s+)?(?:(?:stop|drop|quit|pause|end|no\s+more)\s+(?:the\s+|my\s+)?(?:habit\s*:?\s*)?(.+?)(?:\s+habit)?|(?:delete|remove|cancel)\s+(?:the\s+|my\s+)?(?:habit\s*:?\s*(.+?)|(.+?)\s+habit))\s*[.!]*$/i;
const HABITS_LIST = /^\s*(?:(?:show|list|what\s+are)\s+)?(?:me\s+)?(?:my\s+|the\s+)?habits\s*[?.!]*$/i;

export type HabitDraft = {
  title: string;
  category: string;
  perWeek?: number;
  /** the fewest that still count, when it differs from perWeek */
  minPerWeek?: number;
  durationMin?: number;
  preferredWindow?: 'morning' | 'afternoon' | 'evening';
};

const WINDOW_OF = (from: number) => (from < 12 ? 'morning' : from < 17 ? 'afternoon' : 'evening') as HabitDraft['preferredWindow'];

function habitTurn(h: HabitDraft): Understood {
  if (!h.perWeek) {
    return ask(`How many times a week for ${h.title}?`, ['2x a week', '3x a week', '4x a week', 'Every weekday'], { tool: TOOL_ADD_HABIT, habit: h }, `habit · ${h.title} · how often missing`);
  }
  if (!h.durationMin) {
    return ask(`How long is each ${h.title} session?`, durationOptions(h.category), { tool: TOOL_ADD_HABIT, habit: h }, `habit · ${h.title} · length missing`);
  }
  return {
    name: TOOL_ADD_HABIT,
    args: { ...h, reply: '' },
    draft: null,
    summary: [h.title, perText(h.perWeek, h.minPerWeek), hoursLabel(h.durationMin), h.preferredWindow ?? ''].filter(Boolean).join(' · '),
  };
}

/** "gym 3x a week, 1h, mornings" → a habit, asking for whatever is missing. */
function readHabit(body: string, nowMs: number, prefixed: boolean): Understood {
  const per = perWeekOf(body, prefixed);
  const s = per ? per.strip(body) : body;
  const f = readFacets(s.replace(HABIT_LEAD, ''), nowMs);
  const title = titleFrom(f.rest);
  if (!title) return answer('What\'s the habit? For example: "Habit: gym 3x a week, 1h, mornings".', null);
  const h: HabitDraft = { title, category: categoryOf(title.toLowerCase()) };
  if (per) h.perWeek = per.n;
  if (per?.min) h.minPerWeek = per.min;
  if (f.durationMin) h.durationMin = f.durationMin;
  if (f.part) h.preferredWindow = WINDOW_OF(f.part.from);
  return habitTurn(h);
}

/** The habit a phrase names, like matchTask. */
const matchHabit = matchTask;

/** "until Monday", "a week", "3 hours", "next week" → the instant work may resume. Null when unreadable. */
function notBeforeFrom(phrase: string, nowMs: number): number | null {
  const p = phrase.trim().toLowerCase().replace(/[.!?]+$/, '');
  if (!p) return null;
  const n = (w: string) => (/^an?$|^one$/.test(w) ? 1 : TIMES[w] ?? Number(w));
  const rel = /^(?:by\s+|for\s+|another\s+)?(an?|one|two|three|four|five|six|seven|\d+)\s*(h|hrs?|hours?|d|days?|w|wks?|weeks?)$/.exec(p);
  if (rel) {
    const k = n(rel[1]);
    if (!Number.isFinite(k) || k <= 0) return null;
    if (rel[2].startsWith('h')) return Math.ceil((nowMs + k * 60 * MIN) / (15 * MIN)) * 15 * MIN;
    const days = rel[2].startsWith('w') ? 7 * k : k;
    return dayStart(nowMs) + days * DAY;
  }
  const after = /^after\s+/.test(p);
  const day = p.replace(/^(?:until|till|'?til|to|for|on|from|after|starting|start)\s+/, '');
  // "until October": a month on its own starts on its first day ("after October": the first of the next).
  const month = new RegExp(`^(?:the\\s+)?(?:start\\s+of\\s+|beginning\\s+of\\s+)?(${MON})\\w*$`, 'i').exec(day);
  if (month) {
    const mo = MONTHS.indexOf(month[1].toLowerCase().slice(0, 3));
    const y = new Date(nowMs).getUTCFullYear();
    // A month already over means next year's.
    const year = Date.UTC(y, mo + 1, 1) <= nowMs ? y + 1 : y;
    return after ? Date.UTC(year, mo + 1, 1) : Math.max(Date.UTC(year, mo, 1), dayStart(nowMs));
  }
  const f = readFacets(`on ${day}`, nowMs);
  if (!f.when || f.rest.replace(/\bon\b/, '').trim()) return null;
  return after ? f.when.to : f.when.from;
}

/** Split "the report a week" into the task it names and what follows. */
function splitOnTitle(rest: string, titles: string[]): { title: string; tail: string } | null {
  const low = rest.toLowerCase().replace(/^(?:the|my)\s+/, '');
  const byLength = [...titles].sort((a, b) => b.length - a.length);
  for (const t of byLength) {
    if (low.startsWith(t.toLowerCase())) return { title: t, tail: low.slice(t.length).trim() };
  }
  // "quarterly report a week" for "Write the quarterly report": the longest prefix that names a task.
  const words = low.split(/\s+/);
  for (let i = words.length; i >= 1; i--) {
    const hit = matchTask(words.slice(0, i).join(' '), titles);
    if (hit) return { title: hit, tail: words.slice(i).join(' ') };
  }
  return null;
}

const POSTPONE = /^\s*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:postpone|push\s+back|push|snooze|defer|delay|put\s+off|bump)\s+(.+?)\s*[.!?]*$/i;
const NOT_BEFORE =
  /^\s*(?:the\s+|my\s+)?(.+?)\s+(?:can(?:'t|not)\s+start|shouldn't\s+start|(?:is\s+)?not|no\s+earlier)\s+(?:before|until|than)\s+(.+?)\s*[.!]*$/i;
const DONT_START = /^\s*(?:don't|do\s+not)\s+start\s+(?:on\s+)?(?:the\s+|my\s+)?(.+?)\s+(?:until|before)\s+(.+?)\s*[.!]*$/i;
const START_ON = /^\s*start\s+(?:on\s+)?(?:the\s+|my\s+)?(.+?)\s+((?:on|from|after)\s+.+?)\s*[.!]*$/i;
const POSTPONE_OPTIONS = ['1 hour', '3 hours', 'Tomorrow', 'Next week'];

function postponeTo(title: string, at: number, today: number): Understood {
  const label = at % DAY === 0 ? dayLabel(at, today) : `${dayLabel(dayStart(at), today)} ${hhmm((at % DAY) / MIN)}`;
  return {
    name: TOOL_POSTPONE,
    args: { match: title, notBeforeISO: iso(at), label, reply: '' },
    draft: null,
    summary: `${title} · not before ${label}`,
  };
}

/** "Not before Monday" inside an add-task line, taken out so the date is not read as the due date. */
const NB_PHRASE =
  /\b(not\s+before|no\s+earlier\s+than|not\s+until|starting(?:\s+on|\s+from)?|start(?:ing)?\s+(?:on|from|after)|after)\s+([^,;]+?)(?=\s*(?:[,;]|$|\bdue\b|\bby\b))/i;

function takeNotBefore(body: string, nowMs: number): { body: string; at: number | null } {
  const m = NB_PHRASE.exec(body);
  if (!m) return { body, at: null };
  const at = notBeforeFrom(`${/^after/i.test(m[1]) ? 'after ' : ''}${m[2]}`, nowMs);
  if (at === null || at <= nowMs) return { body, at: null };
  return { body: body.slice(0, m.index) + ' ' + body.slice(m.index + m[0].length), at };
}

// The whole sentence: "remove travel to work tomorrow" is deleting a block, not this setting.
const TRAVEL_OFF =
  /^\s*(?:please\s+)?(?:(?:no|turn\s+off|stop|remove|drop|disable)\s+(?:the\s+|my\s+|adding\s+)?travel(?:\s+time)?(?:\s+please)?|(?:my\s+)?travel(?:\s+time)?\s+(?:off|none|0))[\s.!]*$/i;
const TRAVEL_SET =
  /^\s*(?:please\s+)?(?:(?:my\s+)?travel(?:\s+time)?\s*(?:takes|is|:|=|of|usually\s+takes)|(?:add|keep|leave|allow|plan|block|give\s+me|i\s+need)\s+(?:.+?\s+)?(?:for\s+)?travel(?:\s+time)?\b|(?:add|turn\s+on)\s+travel(?:\s+time)?)/i;
const TRAVEL_OPTIONS = ['15 min', '30 min', '45 min', 'No travel time'];

function travelTurn(minutes: number): Understood {
  return {
    name: TOOL_TRAVEL,
    args: { minutes, reply: '' },
    draft: null,
    summary: minutes ? `travel · ${hoursLabel(minutes)} each way` : 'travel · off',
  };
}

const HARD_THINGS = '(?:hard|difficult|demanding|deep|heavy|focus(?:ed)?|intense)\\s+(?:work|tasks|stuff|things|blocks)';
const SPREAD = new RegExp(`\\b(?:spread|space|split)\\s+(?:out\\s+)?(?:my\\s+|the\\s+)?${HARD_THINGS}(?:\\s+out)?(?:\\s+(?:across|over)\\s+the\\s+week)?\\b|\\bone\\s+${HARD_THINGS.replace('tasks', 'task')}\\s+a\\s+day\\b`, 'i');
const CLUSTER = new RegExp(`\\b(?:batch|cluster|group|bundle|stack|keep|put)\\s+(?:all\\s+)?(?:my\\s+|the\\s+)?${HARD_THINGS}\\s*(?:together|on\\s+the\\s+same\\s+days?|in\\s+one\\s+go)?\\b`, 'i');
/** "no more than 4 hours of deep work a day" */
const BUDGET = /\b(?:no\s+more\s+than|not\s+more\s+than|max(?:imum)?(?:\s+of)?|at\s+most|up\s+to|cap\s+(?:it\s+|me\s+)?at|limit\s+(?:it\s+|me\s+)?to)\s+(.+?)\s+of\s+(?:hard|deep|focus(?:ed)?|demanding|heavy|intense)\s+(?:work\s+|time\s+)?(?:a|per|each)\s+day\b/i;

function planSettingTurn(raw: string, nowMs: number): Understood | null {
  const budget = BUDGET.exec(raw);
  const minutes = budget ? readFacets(budget[1], nowMs).durationMin : undefined;
  const hardWork = CLUSTER.test(raw) ? 'cluster' : SPREAD.test(raw) ? 'spread' : undefined;
  if (!hardWork && !(minutes && minutes >= 60 && minutes <= 12 * 60)) return null;
  const args: Record<string, unknown> = { reply: '' };
  if (hardWork) args.hardWork = hardWork;
  if (minutes && minutes >= 60 && minutes <= 12 * 60) args.dailyBudgetMin = minutes;
  return {
    name: TOOL_PLAN_SETTINGS,
    args,
    draft: null,
    summary: [hardWork ? `hard work · ${hardWork}` : '', args.dailyBudgetMin ? `budget · ${hoursLabel(minutes!)} a day` : ''].filter(Boolean).join(' · '),
  };
}

/** Habits, postponing, travel time — or null when the sentence is about something else. */
function readPlanTurn(raw: string, ctx: UnderstandContext, nowMs: number, today: number): Understood | null {
  const prev = ctx.previous;
  const titles = ctx.taskTitles ?? [];
  const habitTitles = ctx.habitTitles ?? [];

  // Answers to this module's own questions.
  if (prev?.tool === TOOL_ADD_HABIT && prev.habit) {
    if (/^\s*(?:no|nope|cancel|never\s*mind|forget\s+it|stop)\b[\s.!]*$/i.test(raw)) return answer('Okay — no habit added.', null);
    const per = perWeekOf(raw, true);
    const f = readFacets(per ? per.strip(raw) : raw, nowMs);
    if ((per || f.durationMin) && !titleFrom(f.rest).replace(/^(?:A|Week|Times?)$/i, '')) {
      return habitTurn({
        ...prev.habit,
        ...(per ? { perWeek: per.n, ...(per.min ? { minPerWeek: per.min } : {}) } : {}),
        ...(f.durationMin ? { durationMin: f.durationMin } : {}),
      });
    }
  }
  if (prev?.tool === TOOL_POSTPONE && prev.match) {
    const at = notBeforeFrom(raw, nowMs);
    if (at !== null && at > nowMs) return postponeTo(prev.match, at, today);
  }
  if (prev?.tool === TOOL_TRAVEL) {
    if (/^\s*(?:no(?:\s+travel(?:\s+time)?)?|none|off|0)\s*[.!]*$/i.test(raw)) return travelTurn(0);
    const f = readFacets(raw, nowMs);
    if (f.durationMin && f.durationMin <= 180) return travelTurn(f.durationMin);
  }

  const setting = planSettingTurn(raw, nowMs);
  if (setting) return setting;

  // ── travel ──
  if (TRAVEL_OFF.test(raw)) return travelTurn(0);
  if (TRAVEL_SET.test(raw)) {
    const f = readFacets(raw, nowMs);
    if (f.durationMin && f.durationMin <= 180) return travelTurn(f.durationMin);
    return ask('How long should I keep free before and after an in-person meeting?', TRAVEL_OPTIONS, { tool: TOOL_TRAVEL }, 'travel · minutes missing');
  }

  // ── habits ──
  const addHabit = ADD_HABIT.exec(raw);
  if (addHabit) return readHabit(addHabit[1], nowMs, true);
  if (HABITS_LIST.test(raw)) return { name: TOOL_LIST_TASKS, args: { reply: '' }, draft: null, summary: 'list tasks and habits' };

  const stop = HABIT_STOP.exec(raw);
  const stopPhrase = stop ? (stop[1] ?? stop[2] ?? stop[3]).toLowerCase().trim() : '';
  // Exactly the habit's name: "stop gym" yes, "stop gym on Friday" is something else.
  const stopTitle = stop && habitTitles.find((t) => t.toLowerCase() === stopPhrase);
  if (stopTitle) {
    return { name: TOOL_HABIT_UPDATE, args: { match: stopTitle, stop: true, reply: '' }, draft: null, summary: `${stopTitle} · stop` };
  }
  const per = perWeekOf(raw, false);
  if (per) {
    // "gym 2x a week" about a habit they already have is a change, not a new one.
    const f = readFacets(per.strip(raw).replace(HABIT_LEAD, ''), nowMs);
    const named = matchHabit(titleFrom(f.rest), habitTitles);
    if (named) {
      return {
        name: TOOL_HABIT_UPDATE,
        // A plain "2x a week" sets both: the old minimum would otherwise outlive the new target.
        args: { match: named, perWeek: per.n, minPerWeek: per.min ?? null, ...(f.durationMin ? { durationMin: f.durationMin } : {}), reply: '' },
        draft: null,
        summary: `${named} · ${perText(per.n, per.min)}`,
      };
    }
    return readHabit(raw, nowMs, false);
  }
  const takes = TASK_TAKES.exec(raw);
  const takesHabit = takes && !matchTask(takes[1], titles) && matchHabit(takes[1], habitTitles);
  if (takes && takesHabit) {
    const f = readFacets(takes[2], nowMs);
    if (f.durationMin) {
      return {
        name: TOOL_HABIT_UPDATE,
        args: { match: takesHabit, durationMin: f.durationMin, reply: '' },
        draft: null,
        summary: `${takesHabit} · ${hoursLabel(f.durationMin)}`,
      };
    }
  }

  // ── postpone / not before ──
  const pp = POSTPONE.exec(raw);
  if (pp) {
    const split = splitOnTitle(pp[1], titles);
    if (split) {
      if (!split.tail) {
        return ask(`Until when should I hold off on ${split.title}?`, POSTPONE_OPTIONS, { tool: TOOL_POSTPONE, match: split.title }, `postpone · ${split.title} · until when missing`);
      }
      const at = notBeforeFrom(split.tail, nowMs);
      if (at !== null && at > nowMs) return postponeTo(split.title, at, today);
      return ask(`Until when should I hold off on ${split.title}?`, POSTPONE_OPTIONS, { tool: TOOL_POSTPONE, match: split.title }, `postpone · ${split.title} · "${split.tail}" unclear`);
    }
    if (/^\s*(?:please\s+)?postpone\b/i.test(raw)) {
      return answer(`I can't find an open task in "${pp[1]}". Say "my tasks" to see them.`, null);
    }
  }
  for (const re of [NOT_BEFORE, DONT_START, START_ON]) {
    const m = re.exec(raw);
    const title = m && matchTask(m[1], titles);
    if (m && title) {
      const at = notBeforeFrom(m[2], nowMs);
      if (at !== null && at > nowMs) return postponeTo(title, at, today);
    }
  }
  return null;
}

/* ───────────────────────── the turn ───────────────────────── */

const HELP =
  'Tell me what to make room for and I\'ll find the time. Try "2h of deep work on Thursday", ' +
  '"gym Friday 18:00 for an hour", "never book me before 10" or "I\'m off from the 17th to the 22nd".';
const GREETING = /^\s*(hi|hello|hey|yo|hallo|good (?:morning|afternoon|evening)|help|what can you do\??|how does this work\??)[\s.!?]*$/i;
const THANKS = /^\s*(thanks|thank you|ty|cheers|great|perfect|cool|nice|ok(?:ay)?|got it|awesome|👍)[\s.!]*$/i;
/**
 * A question about the calendar rather than a request. "Do taxes" is a request;
 * "do I have time?" is not. A what/where/show question stays a question even
 * when it names a day ("what's on tomorrow?").
 */
const isQuestion = (raw: string, namesDay: boolean) =>
  /^\s*(what|what's|whats|who|where|show|list)\b(?!\s+about)/i.test(raw) ||
  (!namesDay && /\?\s*$/.test(raw) && /^\s*(how|is|are|am|do|does|did)\b(?!\s+about)/i.test(raw));
const REVISION_CUE =
  /^\s*(?:no\b|nope|actually|instead|make\s+(?:it|them)|can\s+you\s+make|could\s+you\s+make|move\s+(?:it|them)|not\b|what\s+about|how\s+about|try\b|shorter|longer|earlier|later\b|sooner|too\s+(?:early|late|long|short))/i;

/** Summary of a turn the rules could not read at all: turn.ts may hand it to the model (rewrite.ts). */
export const NOT_UNDERSTOOD = 'not understood';
const giveUp = (reply: string, keep: Draft | null): Understood => ({ ...answer(reply, keep), summary: NOT_UNDERSTOOD });

const answer = (reply: string, keep: Draft | null): Understood => ({
  name: TOOL_ANSWER,
  args: { reply },
  draft: keep,
  summary: 'a question, not a plan',
});

const ask = (question: string, options: string[], draft: Draft, summary: string): Understood => ({
  name: TOOL_ASK,
  args: { question, options },
  draft,
  summary,
});

function dayLabel(ms: number, today: number): string {
  if (ms === today) return 'today';
  if (ms === today + DAY) return 'tomorrow';
  const d = new Date(ms);
  return `${WD_LONG[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].replace(/^./, (c) => c.toUpperCase())}`;
}

function why(last: UnderstandContext['lastProposals'], today: number): string {
  if (!last.length) return "I haven't placed anything in this conversation yet.";
  return last
    .map((p) => {
      const ms = Date.parse(p.startISO);
      return `${dayLabel(dayStart(ms), today)} at ${p.startISO.slice(11, 16)}: ${p.reason ?? "it's the time you asked for"}.`;
    })
    .join(' ')
    .replace(/^./, (c) => c.toUpperCase());
}

export function understand(text: string, ctx: UnderstandContext): Understood {
  // Phone keyboards type curly apostrophes; every pattern here expects straight ones.
  const raw = text.trim().replace(/[’‘]/g, "'");
  const low = raw.toLowerCase();
  const nowMs = Date.parse(ctx.nowISO);
  const today = dayStart(nowMs);
  const prev = ctx.previous;

  if (GREETING.test(raw)) return answer(HELP, prev);
  if (THANKS.test(raw)) return answer('Glad that works. Tap Add on anything you want to keep.', prev);
  // The backlog before anything else: "add task: work out why…" is not a "why?".
  const taskTurn = readTaskTurn(raw, ctx, nowMs, today) ?? readPlanTurn(raw, ctx, nowMs, today);
  if (taskTurn) return taskTurn;
  if (/\bwhy\b/.test(low)) return answer(why(ctx.lastProposals, today), prev);

  // Deleting: a yes or no to the list it just showed, or a new "delete …".
  if (prev?.tool === TOOL_DELETE && prev.deleteIds?.length) {
    if (CONFIRM_YES.test(raw)) {
      const n = prev.deleteIds.length;
      return { name: TOOL_DELETE, args: { confirm: true, ids: prev.deleteIds }, draft: null, summary: `delete ${n} block${n === 1 ? '' : 's'}` };
    }
    if (CONFIRM_NO.test(raw)) return answer('Okay — nothing deleted.', null);
  }
  const del = DELETE.exec(raw);
  if (del) {
    const target = readFacets(del[1], nowMs);
    // "Cancel that" right after a plan: the blocks were only proposed, never saved.
    if (prev?.placed && !target.when && !titleFrom(target.rest)) {
      return answer("Okay — I won't add it. Nothing was saved; the blocks were only proposed.", null);
    }
    return readDelete(del[1], null, nowMs, today);
  }
  // "12:00 overlaps Lunch — put Gym there anyway?" A yes places it as asked;
  // a no drops it; a different time ("13:00") falls through and is re-checked.
  if (prev?.tool === TOOL_PLACE_AT && prev.clashAsked) {
    if (CONFIRM_YES.test(raw) || /^\s*(?:yes,?\s+)?(?:put|place|book)\s+it\s+there\b|\banyway\b/i.test(raw)) {
      const placed = placeAtFrom({ ...prev, clashAsked: false }, today);
      if (placed) return { ...placed, args: { ...placed.args, overlapOk: true }, summary: `${placed.summary} · overlap ok` };
    }
    if (CONFIRM_NO.test(raw)) return answer(`Okay — I haven't added ${prev.title ?? 'it'}.`, null);
  }

  // Answering "which day should I clear?" — but a new request starts fresh.
  if (prev?.tool === TOOL_DELETE && !prev.deleteIds?.length && !titleFrom(readFacets(raw, nowMs).rest)) {
    return readDelete(raw, prev, nowMs, today);
  }

  // Answering "which dates are you away?"
  if (prev?.tool === TOOL_TIME_OFF) {
    const span = readTimeOff(raw, nowMs);
    if (span) return timeOff(span, prev.title ?? 'Away');
  }

  const rule = readRule(raw);
  if (rule === 'unclear') return giveUp(RULE_HELP, prev);
  if (rule) return { name: TOOL_RULE, args: rule, draft: null, summary: `rule · ${String(rule.kind)}` };

  if (looksAway(raw)) {
    const title = awayTitle(raw);
    const span = readTimeOff(raw, nowMs);
    if (span) return timeOff(span, title);
    return ask('Which dates should I block?', [], { tool: TOOL_TIME_OFF, title }, `${title} · dates missing`);
  }

  const f = readFacets(raw, nowMs);
  const title = titleFrom(f.rest);
  const followUp = !!prev && prev.tool !== TOOL_TIME_OFF && (REVISION_CUE.test(raw) || !title);

  if (!followUp && isQuestion(raw, Boolean(f.when)) && !f.durationMin && !f.at) {
    return answer(`I can't answer questions about your calendar yet — I can place time on it. ${HELP}`, prev);
  }
  if (!followUp && !title && !f.when && !f.durationMin && !f.at && !f.part) return giveUp(HELP, prev);

  const d: Draft = followUp ? { ...prev!, placed: false } : { tool: TOOL_PROPOSE };
  const changed: string[] = [];
  if (!followUp) {
    d.category = categoryOf(low);
    d.title = title || DEFAULT_TITLE[d.category];
  }

  if (f.when) {
    [d.from, d.to, d.single] = [ymd(f.when.from), ymd(f.when.to), f.when.single];
    if (f.when.weekend) d.weekends = true;
    changed.push('changed_day');
  }
  if (f.weekendOk) d.weekends = true;
  if (f.exclude.length) {
    d.excludeDates = [...new Set([...(d.excludeDates ?? []), ...f.exclude])];
    changed.push('changed_day');
  }
  if (f.part) {
    [d.dayStartHour, d.dayEndHour] = [f.part.from, f.part.to];
    changed.push('changed_time_of_day');
  }
  if (f.startHour !== undefined) d.dayStartHour = f.startHour;
  if (f.endHour !== undefined) d.dayEndHour = f.endHour;
  if (f.startHour !== undefined || f.endHour !== undefined) changed.push('changed_time_of_day');
  if (f.durationMin) {
    d.durationMin = f.durationMin;
    changed.push('changed_duration');
  }
  if (f.count) {
    d.count = Math.min(5, Math.max(1, f.count));
    d.everyDay = false;
    changed.push('changed_count');
  }
  if (f.everyDay) d.everyDay = true;
  if (f.at) {
    d.tool = TOOL_PLACE_AT;
    d.atMin = f.at.startMin;
    d.atUnsure = !f.at.hasMer && ambiguousTime(raw) !== null;
    if (f.at.endMin !== undefined) d.durationMin = f.at.endMin - f.at.startMin;
    changed.push('changed_time_of_day');
  }
  if (f.days) {
    d.days = f.days;
    if (f.repeat) d.repeatOpen = true;
    changed.push('changed_day');
  }
  // Answering "Until when?": an open-ended weekly repeat.
  if (followUp && (d.days?.length || d.rule) && /\b(?:every week|weekly|no end|ongoing|keep (?:it )?going|forever)\b/i.test(raw)) {
    d.repeatOpen = true;
  }

  if (followUp && f.shift) {
    const last = prev!.lastStartISO ? Date.parse(prev!.lastStartISO) : NaN;
    const lastHour = Number.isFinite(last) ? Math.floor((last - dayStart(last)) / 3_600_000) : null;
    if (f.shift === 'shorter' || f.shift === 'longer') {
      const cur = d.durationMin ?? 60;
      const step = cur >= 120 ? 60 : 30;
      d.durationMin = Math.min(480, Math.max(15, cur + (f.shift === 'longer' ? step : -step)));
      changed.push('changed_duration');
    } else if (d.tool === TOOL_PLACE_AT && d.atMin !== undefined) {
      d.atMin = Math.min(23 * 60, Math.max(0, d.atMin + (f.shift === 'later' ? 60 : -60)));
      changed.push('changed_time_of_day');
    } else if (lastHour !== null) {
      if (f.shift === 'later') d.dayStartHour = Math.min(23, lastHour + 1);
      else d.dayEndHour = Math.max(1, lastHour);
      changed.push('changed_time_of_day');
    }
  }

  const revises = followUp && prev!.placed === true;
  const correctionKind = changed[0] ?? 'other';
  const category = d.category ?? 'deep-work';
  const name = d.title ?? DEFAULT_TITLE[category];

  if (d.tool === TOOL_PLACE_AT) return placeAtDraft(d, nowMs);

  const from = d.from ? fromYmd(d.from) : NaN;
  const to = d.to ? fromYmd(d.to) : NaN;
  let count = d.count ?? 1;
  if (d.everyDay) {
    count = 0;
    const lo = Number.isFinite(from) ? Math.max(from, today) : today;
    const hi = Number.isFinite(to) ? to : nextMonday(today);
    const personal = category === 'personal';
    for (let x = lo; x < hi; x += DAY) {
      const wd = new Date(x).getUTCDay();
      if (d.weekends || personal || (wd !== 0 && wd !== 6)) count++;
    }
    count = Math.min(5, Math.max(1, count));
  }
  const whenFrom = f.when ? 'user' : Number.isFinite(from) ? 'conversation' : 'guessed';
  const durationFrom = f.durationMin || (followUp && f.shift && /shorter|longer/.test(f.shift)) ? 'user' : d.durationMin ? 'conversation' : 'guessed';

  const args: Record<string, unknown> = {
    title: name,
    category,
    count,
    ...(d.durationMin ? { durationMin: d.durationMin } : {}),
    ...(Number.isFinite(from) ? { earliestISO: iso(from), latestISO: iso(to) } : {}),
    ...(d.dayStartHour !== undefined ? { dayStartHour: d.dayStartHour } : {}),
    ...(d.dayEndHour !== undefined ? { dayEndHour: d.dayEndHour } : {}),
    oneBlockPerDay: !(d.sameDay || (count > 1 && d.single)),
    ...(d.weekends ? { weekdaysOnly: false } : {}),
    excludeDates: d.excludeDates ?? [],
    whenFrom,
    durationFrom,
    revisesPrevious: revises,
    ...(revises ? { correctionKind } : {}),
    reply: '',
  };
  const bits = [
    name,
    d.durationMin ? `${d.durationMin} min` : 'length?',
    count > 1 ? `×${count}` : '',
    Number.isFinite(from) ? (d.single ? dayLabel(from, today) : `${dayLabel(from, today)} – ${dayLabel(to - DAY, today)}`) : 'day?',
    d.dayStartHour !== undefined || d.dayEndHour !== undefined ? `${d.dayStartHour ?? '…'}–${d.dayEndHour ?? '…'}h` : '',
  ].filter(Boolean);
  return { name: TOOL_PROPOSE, args, draft: d, summary: bits.join(' · ') };
}

/**
 * A place_at draft — read by the rules here, or filled by the model's form
 * (form.ts) — to the call to make, or to the one question still open: am or
 * pm, which day, how long, until when. Both readers end here, so both ask the
 * same questions and never guess.
 */
export function placeAtDraft(d: Draft, nowMs: number): Understood {
  const today = dayStart(nowMs);
  const category = d.category ?? 'deep-work';
  const name = d.title ?? DEFAULT_TITLE[category];
  if (d.atUnsure && d.atMin !== undefined) {
    const pm = d.atMin >= 720 ? d.atMin : d.atMin + 720;
    const am = pm - 720;
    return ask(`Did you mean ${hhmm(pm)} or ${hhmm(am)}?`, [hhmm(pm), hhmm(am)], { ...d, atMin: pm }, `${name} · am or pm?`);
  }
  if (d.days?.length || d.rule) return repeatAt(d, name, nowMs, today);
  const from = d.from ? fromYmd(d.from) : NaN;
  if (!d.single || !Number.isFinite(from)) {
    const opts: string[] = [];
    if ((d.atMin ?? 0) * MIN > nowMs - today) opts.push('Today');
    opts.push('Tomorrow', WD_LONG[new Date(today + 2 * DAY).getUTCDay()], WD_LONG[new Date(today + 3 * DAY).getUTCDay()]);
    return ask(`Which day should ${name} go on?`, opts, d, `${name} · ${hhmm(d.atMin ?? 0)} · day missing`);
  }
  if (!d.durationMin || d.durationMin <= 0) {
    return ask(`How long do you need for ${name}?`, durationOptions(category), d, `${name} · ${hhmm(d.atMin ?? 0)} · length missing`);
  }
  return placeAtFrom({ ...d, clashAsked: false }, today)!;
}

/** A complete place_at draft (one day, a time, a length) as the call to make; null if anything is missing. */
function placeAtFrom(d: Draft, today: number): Understood | null {
  const from = d.from ? fromYmd(d.from) : NaN;
  if (!d.single || !Number.isFinite(from) || d.atMin === undefined || !d.durationMin || d.durationMin <= 0) return null;
  const category = d.category ?? 'deep-work';
  const name = d.title ?? DEFAULT_TITLE[category];
  const start = from + d.atMin * MIN;
  return {
    name: TOOL_PLACE_AT,
    args: { title: name, category, startISO: iso(start), endISO: iso(start + d.durationMin * MIN), reply: '' },
    draft: d,
    summary: `${name} · ${dayLabel(from, today)} ${hhmm(d.atMin)} · ${d.durationMin} min`,
  };
}

/**
 * A fixed time on a set of weekdays: one repeating block, not N single ones.
 * The dates are computed here, never by a model. Needs a length, and an end
 * unless the person said "every"/"Mondays" — "Mon–Thu 11:00" alone could mean
 * this week or every week, so that is asked.
 */
/** This reader counts Sunday as 0 (Date.getUTCDay); the shared engine counts Monday as 0. */
const monDays = (days: number[]) => days.map((x) => (x + 6) % 7);

function repeatAt(d: Draft, name: string, nowMs: number, today: number): Understood {
  const at = d.atMin ?? 0;
  // The pattern without its end: weekdays read by the rules, or any rule the form filled.
  const base: Rule | null = d.rule ? parseRule(d.rule) : { freq: 'WEEKLY', interval: 1, byDay: monDays(d.days ?? []), until: null, count: null };
  if (!base) return answer('How often should it repeat?', d);
  const pattern = formatRule({ ...base, until: null, count: null });
  const what = describeRule(d.from ?? ymd(today), pattern).split(' · ')[0];
  if (!d.durationMin || d.durationMin <= 0) {
    return ask(`How long is each ${name}?`, durationOptions(d.category ?? 'deep-work'), d, `${name} · ${what} ${hhmm(at)} · length missing`);
  }
  const lo = d.from ? Math.max(fromYmd(d.from), today) : today;
  const hiEx = d.to ? fromYmd(d.to) : NaN;
  if (!Number.isFinite(hiEx) && !base.count && !d.repeatOpen) {
    const later = new Date(today + 27 * DAY);
    const month = MONTHS[later.getUTCMonth()].replace(/^./, (c) => c.toUpperCase());
    const weekly = base.freq === 'WEEKLY' && base.interval === 1;
    return ask(
      `Until when should ${name} repeat?`,
      [weekly ? 'Every week' : 'No end date', ...(weekly ? ['Just this week'] : []), `Until ${month} ${later.getUTCDate()}`],
      d,
      `${name} · ${what} ${hhmm(at)} · end missing`,
    );
  }
  // Today counts only if the time hasn't passed yet.
  const startDay = lo === today && at * MIN <= nowMs - today ? today + DAY : lo;
  const until = Number.isFinite(hiEx) ? ymd(hiEx - DAY) : null;
  const rule: Rule = { ...base, until };
  const firstDay = firstOnOrAfter(ymd(startDay), rule);
  if (!firstDay || (until && firstDay > until)) return answer(`There's no ${what} left in that range. Which dates did you mean?`, d);
  const rrule = formatRule(rule);
  const bounded = until ?? (rule.count ? '9999-12-31' : null);
  const dates = bounded ? datesBetween(firstDay, rrule, firstDay, bounded) : [firstDay];
  const first = fromYmd(firstDay);
  const start = first + at * MIN;
  const span = bounded
    ? `${dayLabel(first, today)} – ${dayLabel(fromYmd(dates[dates.length - 1]), today)} · ${dates.length} times`
    : `from ${dayLabel(first, today)} · no end`;
  return {
    name: TOOL_PLACE_AT,
    args: {
      title: name,
      category: d.category ?? 'deep-work',
      startISO: iso(start),
      endISO: iso(start + d.durationMin * MIN),
      rrule,
      reply: '',
    },
    draft: d,
    summary: `${name} · ${what} ${hhmm(at)} · ${d.durationMin} min · ${span}`,
  };
}

function timeOff(span: { startISO: string; endISO: string }, title: string): Understood {
  const human = (s: string) => {
    const ms = fromYmd(s.slice(0, 10));
    const d = new Date(ms);
    const day = `${WD_LONG[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].replace(/^./, (c) => c.toUpperCase())}`;
    return s.length > 10 ? `${day} ${s.slice(11, 16)}` : day;
  };
  const range = span.startISO === span.endISO ? human(span.startISO) : `${human(span.startISO)} to ${human(span.endISO)}`;
  return {
    name: TOOL_TIME_OFF,
    args: { ...span, title, reply: `Blocked ${title}: ${range}.` },
    draft: null,
    summary: `${title} · ${range}`,
  };
}
