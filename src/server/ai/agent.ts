import { STEP } from '../../lib/agent-tools.ts';
import type { ApiEvent } from '../../lib/api-types.ts';
import { FORM_TOOL, fromForm } from './form.ts';
import { type AgentItem, agentStep, type ToolDef } from './llm.ts';
import type { AgentProfile } from './preferences.ts';
import { checkChanges } from './tools/changes.ts';
import { findEvents, freeTime } from './tools/look.ts';
import { TOOL_ANSWER, TOOL_ASK, TOOL_CHANGES, TOOL_PROPOSE } from './tools/names.ts';
import { categoryOf, NOT_UNDERSTOOD, readFacets, type Understood, understand, type UnderstandContext } from './understand.ts';

/**
 * Plan with AI's reader and dispatcher. The model reads what the person typed
 * and chooses the workflow — look something up, answer, ask, place, find a
 * slot, change several things — calling tools in the order it needs. The
 * engine does every computation: free minutes, dates, slots, clashes,
 * whether an event may be changed. Every argument is checked in code; a bad
 * one goes back to the model as the tool's result, so it can fix it.
 *
 * Lookups (free_time, find_events) run here and feed back. The first action
 * ends the loop and becomes the same { name, args } the rules produce, so the
 * turn (turn.ts) runs the same handlers, and anything that changes the
 * calendar still comes back as something the person approves.
 *
 * Sent to OpenAI: the conversation's text, today's date, and what the lookups
 * return — times, and titles of what was made in Find Time. Never a Google
 * event's title (look.ts shownTitle). Charged to the user's credit (credits.ts).
 */

const MAX_STEPS = 4;

/** The phrasing the rules read — use_rules rewrites into it. */
const EXAMPLES = [
  '2h of deep work on Thursday',
  '2 hours of research tomorrow afternoon',
  '1 hour of deep work between 2 and 5 tomorrow',
  'an hour and a half of design next week after 2pm',
  'three review slots on Tuesday, 30 min each',
  'gym every morning next week for 45 min',
  'dentist Friday 9:30am for half an hour',
  'dinner at 19:00 on Saturday for 2h',
  'add task: write the quarterly report, 3h, due Friday',
  'add task: tax return, 3h, due 30 Oct, not before 20 Oct',
  'add task: prep for the investor call, 3h, due Oct 14',
  'habit: gym 3x a week, 1h, mornings',
  'add habit meditate every day for 15 min',
  'add habit read every day for 20 min, evenings',
  '30 min call with mom this weekend after 10am',
  'never book me before 10',
  'no meetings on Fridays',
  'keep Friday afternoons free',
  '15 minutes between meetings',
  "I'm off from the 17th to the 22nd",
  'Berlin trip from Oct 6 to Oct 8',
  'vacation in Lisbon next week',
  'cancel gym tomorrow',
  'clear everything on Friday',
  'make it 90 minutes',
  'not Tuesday',
  'later',
];

const nul = (type: string, description: string) => ({ type: [type, 'null'], description });
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const formProps = (FORM_TOOL.input_schema as { properties: Record<string, unknown> }).properties;
const { kind: _kind, ...placeProps } = formProps;

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: 'free_time',
    description: 'How much free time the user has: free minutes and the free gaps per day, counted by the engine. Use for any question about free or busy time.',
    strict: true,
    input_schema: obj({ date: { type: 'string', description: 'YYYY-MM-DD, the first day' }, days: nul('integer', '1-7 days from date; null = 1') }),
  },
  {
    name: 'find_events',
    description: "Look up events by words in their title (code matches; Google events come back as 'a calendar event'). Returns ids, times and whether each may be moved or deleted.",
    strict: true,
    input_schema: obj({
      match: { type: 'string', description: "words from the title, e.g. 'gym'; '' = everything" },
      from: nul('string', 'YYYY-MM-DD; null = today'),
      days: nul('integer', '1-21; null = 7'),
    }),
  },
  {
    name: 'place_at',
    description:
      'Put one thing at the time the user named, once or repeating. Fill only what they said; leave the rest null and the app asks (which day, how long, am/pm, until when). The engine checks the time and offers nearby free times if it clashes.',
    strict: true,
    input_schema: obj(placeProps),
  },
  {
    name: 'find_slot',
    description: 'The engine finds the best free time for something, when the user did NOT name a time ("find 2h for the report this week").',
    strict: true,
    input_schema: obj({
      title: { type: 'string' },
      duration_min: nul('integer', 'only if said'),
      from: nul('string', 'YYYY-MM-DD, earliest day, only if said'),
      to: nul('string', 'YYYY-MM-DD, last day (inclusive), only if said'),
      count: nul('integer', 'how many blocks, only if said'),
      earliest_hour: nul('integer', '0-23, only if said ("after 2pm" → 14)'),
      latest_hour: nul('integer', '1-24, only if said'),
    }),
  },
  {
    name: 'change_plan',
    description:
      'Several linked changes in one card the user approves: move events (ids from find_events), add new ones, delete some. Checked together, so a slot freed by a move counts as free. Keep times the user named.',
    strict: true,
    input_schema: obj({
      changes: {
        type: 'array',
        items: obj({
          op: { type: 'string', enum: ['move', 'add', 'delete'] },
          event_id: nul('string', 'move/delete: an id from find_events'),
          title: nul('string', 'add: what it is'),
          date: nul('string', 'YYYY-MM-DD; move: null keeps its day'),
          start: nul('string', 'HH:MM 24-hour'),
          end: nul('string', 'HH:MM 24-hour'),
          duration_min: nul('integer', 'when no end; move: null keeps its length'),
        }),
      },
      overlap_ok: { type: 'boolean', description: 'true only after the user said to go ahead despite an overlap' },
      reply: { type: 'string', description: 'one short sentence for the card' },
    }),
  },
  {
    name: 'ask',
    description: 'Ask one short question when the request can be read two ways or something the engine needs is missing. 2-4 short options the user can tap.',
    strict: true,
    input_schema: obj({ question: { type: 'string' }, options: { type: 'array', items: { type: 'string' } } }),
  },
  {
    name: 'answer',
    description: 'Reply in words: answer a question with the numbers a lookup returned, or explain. Short. Never invent numbers.',
    strict: true,
    input_schema: obj({ text: { type: 'string' } }),
  },
  {
    name: 'use_rules',
    description: `For tasks, habits, standing rules, time off, clearing a day and "plan my week": rewrite the request as one sentence in this phrasing and the app's rules carry it out. Examples:\n${EXAMPLES.map((e) => `- ${e}`).join('\n')}`,
    strict: true,
    input_schema: obj({ sentence: { type: 'string' } }),
  },
];

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function agentSystem(nowISO: string, profile: AgentProfile): string {
  const d = new Date(nowISO);
  const hours = Object.entries(profile.workHours)
    .map(([k, v]) => `${k} ${v ? `${v.start}-${v.end}` : 'off'}`)
    .join(', ');
  return [
    'You are Plan with AI inside a calendar app. You choose which tools to call and in what order; the engine does every calculation.',
    `Now: ${WD[d.getUTCDay()]} ${nowISO.slice(0, 10)} ${nowISO.slice(11, 16)} (the user's own clock). Working hours: ${hours}.`,
    '- A question ("how much free time today?", "am I busy Friday?") is answered: look it up (free_time / find_events), then answer with those numbers. Never plan when asked a question. Never count minutes yourself.',
    '- If the user named a time, keep it: place_at, or change_plan for moves. find_slot only when they did not name a time.',
    '- Changing existing events ("move my gym", "replace X with Y", "cancel lunch"): find_events first, then change_plan with the ids it returned. If several events match and the user did not say which, ask.',
    '- If a request can be read two ways, ask one question with tappable options instead of picking.',
    '- Never fill a day, time or length the user did not say. place_at asks for missing ones itself; for change_plan, ask first.',
    '- Dates are YYYY-MM-DD, times HH:MM 24-hour. 5.10.2026 is 5 October. A bare "at 6" stays 06:00; the app asks am or pm.',
    '- Google events show as "a calendar event"; refer to them by time.',
    '- Do one action per message (place_at, find_slot, change_plan or use_rules), after any lookups. Keep replies short and plain.',
  ].join('\n');
}

export type AgentCtx = {
  text: string;
  /** the conversation so far, oldest first, the current message last */
  history: { role: 'user' | 'assistant'; content: string }[];
  nowISO: string;
  horizonISO: string;
  profile: AgentProfile;
  events: ApiEvent[];
  readCtx: UnderstandContext;
  step: (s: { tool: string; label: string; detail?: string; ms?: number }) => void;
  /** count one model call against the user's credit */
  charge: (promptTokens: number, outputTokens: number) => Promise<void>;
  /** the model call; replaceable in tests */
  call?: typeof agentStep;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const intOr = (v: unknown, lo: number, hi: number) => (typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const nextDay = (s: string) => new Date(Date.parse(`${s}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

type Outcome = { kind: 'done'; choice: Understood } | { kind: 'feedback'; output: unknown };

/** One tool call → either the turn's action, or a result to show the model. */
export function dispatch(name: string, args: Record<string, unknown>, c: AgentCtx): Outcome {
  const today = c.nowISO.slice(0, 10);
  switch (name) {
    case 'free_time': {
      const date = typeof args.date === 'string' && DATE.test(args.date) ? args.date : today;
      const days = freeTime(c.events, c.profile, c.nowISO, date, intOr(args.days, 1, 7) ?? 1);
      const total = days.reduce((n, d) => n + d.free_min, 0);
      c.step({ tool: STEP.freeTime, label: 'Counted your free time', detail: `${Math.floor(total / 60)}h ${total % 60}m free · ${days.length} day${days.length === 1 ? '' : 's'}` });
      return { kind: 'feedback', output: { days } };
    }
    case 'find_events': {
      const from = typeof args.from === 'string' && DATE.test(args.from) ? args.from : today;
      const found = findEvents(c.events, String(args.match ?? ''), from, intOr(args.days, 1, 21) ?? 7);
      c.step({ tool: STEP.findEvents, label: 'Looked up your events', detail: `${found.length} match${found.length === 1 ? '' : 'es'}` });
      return { kind: 'feedback', output: { events: found } };
    }
    case 'answer':
      return { kind: 'done', choice: { name: TOOL_ANSWER, args: { reply: String(args.text ?? '').slice(0, 800) }, draft: null, summary: 'answered' } };
    case 'ask': {
      const options = Array.isArray(args.options) ? args.options.filter((o): o is string => typeof o === 'string').slice(0, 4) : [];
      return { kind: 'done', choice: { name: TOOL_ASK, args: { question: String(args.question ?? '').slice(0, 300), options }, draft: null, summary: 'asked first' } };
    }
    case 'place_at': {
      const u = fromForm({ kind: 'event', ...(args as object) } as Parameters<typeof fromForm>[0], c.text, c.nowISO);
      if (!u) return { kind: 'feedback', output: { error: 'place_at needs start as HH:MM (24-hour) and a repeat the app supports. If the user named no time, use find_slot.' } };
      return { kind: 'done', choice: u };
    }
    case 'find_slot': {
      // The person's own time is kept: a sentence with a clock time is not the scorer's to re-pick.
      if (readFacets(c.text, Date.parse(c.nowISO)).at) {
        return { kind: 'feedback', output: { error: 'The user named a time. Keep it: use place_at (or change_plan) with that time.' } };
      }
      const from = typeof args.from === 'string' && DATE.test(args.from) ? args.from : null;
      const to = typeof args.to === 'string' && DATE.test(args.to) ? args.to : null;
      const duration = intOr(args.duration_min, 5, 480);
      const title = String(args.title ?? '').trim().slice(0, 60) || 'Focus time';
      const count = intOr(args.count, 1, 5) ?? 1;
      const lo = intOr(args.earliest_hour, 0, 23);
      const hi = intOr(args.latest_hour, 1, 24);
      return {
        kind: 'done',
        choice: {
          name: TOOL_PROPOSE,
          args: {
            title,
            category: categoryOf(`${title} ${c.text}`.toLowerCase()),
            count,
            ...(duration ? { durationMin: duration } : {}),
            ...(from ? { earliestISO: `${from}T00:00:00.000Z`, latestISO: `${nextDay(to ?? from)}T00:00:00.000Z` } : {}),
            ...(lo !== undefined ? { dayStartHour: lo } : {}),
            ...(hi !== undefined ? { dayEndHour: hi } : {}),
            oneBlockPerDay: true,
            excludeDates: [],
            whenFrom: from ? 'user' : 'guessed',
            durationFrom: duration ? 'user' : 'guessed',
            revisesPrevious: false,
            reply: '',
          },
          draft: null,
          summary: `${title} · ${duration ? `${duration} min` : 'length?'}${count > 1 ? ` ×${count}` : ''} · ${from ? (to && to !== from ? `${from} – ${to}` : from) : 'day?'}`,
        },
      };
    }
    case 'change_plan': {
      const checked = checkChanges(args.changes, c.events, c.nowISO, c.horizonISO);
      if (!checked.ok) return { kind: 'feedback', output: { error: checked.error } };
      const n = checked.items.length;
      return { kind: 'done', choice: { name: TOOL_CHANGES, args, draft: null, summary: `${n} change${n === 1 ? '' : 's'}: ${checked.items.map((i) => i.op).join(', ')}` } };
    }
    case 'use_rules': {
      const sentence = String(args.sentence ?? '').trim().slice(0, 300);
      const u = sentence ? understand(sentence, c.readCtx) : null;
      if (!u || u.summary === NOT_UNDERSTOOD) return { kind: 'feedback', output: { error: 'The rules could not read that sentence. Use another tool, or ask the user.' } };
      return { kind: 'done', choice: { ...u, summary: `${u.summary} · via rules: "${sentence}"` } };
    }
    default:
      return { kind: 'feedback', output: { error: `unknown tool ${name}` } };
  }
}

/** The model's choice for this message, or null (no answer in MAX_STEPS steps, or the model failed): the rules read it. */
export async function runAgent(c: AgentCtx): Promise<Understood | null> {
  const call = c.call ?? agentStep;
  const input: AgentItem[] = c.history.slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }));
  const last = input[input.length - 1];
  if (!last || last.role !== 'user' || last.content !== c.text.slice(0, 1000)) input.push({ role: 'user', content: c.text.slice(0, 1000) });
  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const s = await call({ system: agentSystem(c.nowISO, c.profile), input, tools: AGENT_TOOLS, signal: AbortSignal.timeout(15_000) });
      await c.charge(s.promptTokens, s.outputTokens);
      input.push(...s.output);
      const out = s.args ? dispatch(s.name, s.args, c) : { kind: 'feedback' as const, output: { error: 'arguments were not valid JSON' } };
      if (out.kind === 'done') return out.choice;
      input.push({ type: 'function_call_output', call_id: s.callId, output: JSON.stringify(out.output) });
    }
    console.warn('[ai] agent: no action in', MAX_STEPS, 'steps');
    return null;
  } catch (err) {
    console.warn('[ai] agent failed:', err instanceof Error ? err.message.slice(0, 160) : err);
    return null;
  }
}
