import type { ChatMessage, ChatProposal, ChatResponse, ChatStreamEvent, TraceStep } from '@/lib/api-types';
import { STEP } from '@/lib/agent-tools';
import { listEvents, listOwnRepeats } from '@/server/events-repo';
import { type ApiHabit, listHabits } from '@/server/habits-repo';
import { type ApiTask, listOpenTasks } from '@/server/tasks-repo';
import { DEFAULT_ZONE, wallClockNow } from '@/server/wall-clock';
import { isImported } from '@/lib/synced-fields';
import { blocksTime } from './find-time';
import { type CalendarInfo, type CalEvent, holidaysIn, onCalendars } from './holidays';
import { expandRepeat } from './place-at';
import { preferenceCard } from './learn';
import type { AgentProfile } from './preferences';
import { addFact, appendMessage, createSession, deleteFact, listCalendars, listMessages, loadMemory, loadProfile, type Memory, sessionExists, updateFact, userTimeZone } from './repo';
import { doneLabel, iso, plural, runningLabel, type TurnCtx } from './tools/context';
import { toolFor } from './tools';
import { asString, TOOL_ANSWER } from './tools/names';
import { askAboutFacts, runAgent } from './agent';
import { chargeTokens, hasCredit } from './credits';
import { aiConfigured } from './llm';
import { scrubTitles } from './scrub';
import { type Draft, guardTitle, type Understood, understand } from './understand';

/**
 * One turn of Plan with AI, after the route has authenticated the user and
 * parsed the body (src/app/api/ai/chat+api.ts):
 *
 *   load the calendar, tasks and habits → the model decides whether this is a
 *   question, a request or a reply, and reads it (agent.ts) → that tool's handler
 *   (tools/index.ts) carries it out → if the planner found something it can't
 *   decide alone, the model asks → the reply is stored.
 *
 * The rules (understand.ts) read a message only when there is no model to read
 * it: no key, or no credit left. A model that fails says so, and nothing changes:
 * a broken reading passed off as an answer is worse than asking again. What has
 * been understood so far rides on each assistant message as `parsed.draft`, so
 * "make it 90 minutes" continues the plan.
 */

const HORIZON_DAYS = 21;

/**
 * The window's events with Find Time's own repeats expanded to every day they
 * fall on, each with its calendar's name and public holidays marked (holidays.ts).
 */
async function calendarFor(userId: string, fromISO: string, toISO: string, calendars: Promise<CalendarInfo[]>): Promise<CalEvent[]> {
  const [events, repeats, cals] = await Promise.all([listEvents(userId, fromISO, toISO), listOwnRepeats(userId, toISO), calendars]);
  const series = new Set(repeats.map((r) => r.id));
  const all = [...events.filter((e) => !series.has(e.id)), ...repeats.flatMap((r) => expandRepeat(r, fromISO, toISO))].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  return onCalendars(all, cals);
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The coming week in a few words, from the busy blocks: "6 fixed blocks this
 * week · freest Sat · busiest Tue". The seven days start tomorrow — late in the
 * evening, today would always look "freest". Times are naive wall-clock ISO, so
 * the date is the first ten characters and the weekday comes from UTC fields.
 */
export function weekShape(busy: { start: string; end: string }[], nowISO: string): string {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.parse(`${nowISO.slice(0, 10)}T00:00:00Z`) + (i + 1) * 86_400_000);
    return { key: d.toISOString().slice(0, 10), name: i === 0 ? 'tomorrow' : WEEKDAY[d.getUTCDay()], min: 0 };
  });
  let fixed = 0;
  for (const b of busy) {
    const day = days.find((d) => d.key === b.start.slice(0, 10));
    if (!day) continue;
    fixed++;
    day.min += Math.max(0, (Date.parse(b.end) - Date.parse(b.start)) / 60_000);
  }
  if (!fixed) return 'nothing fixed this week · wide open';
  const sorted = [...days].sort((a, b) => a.min - b.min);
  const freest = sorted[0];
  const busiest = sorted[sorted.length - 1];
  return `${plural(fixed, 'fixed block')} this week · freest ${freest.name} · busiest ${busiest.name}`;
}
export const MAX_TURNS = 16;

export type Emit = (e: ChatStreamEvent) => void;

export async function runTurn(
  userId: string,
  body: { sessionId?: unknown; message?: unknown },
  emit: Emit,
): Promise<Response> {
  /** What this turn actually did, step by step — kept on the reply and streamed as it happens. */
  const trace: TraceStep[] = [];
  const begin = (key: string) => emit({ type: 'start', tool: key, label: runningLabel(key) });
  const step = (st: TraceStep) => {
    trace.push(st);
    emit({ type: 'step', step: st });
  };

  const text = String(body.message ?? '').trim().slice(0, 500);
  if (text.length < 2) {
    return Response.json({ error: 'Tell Find time what you need.' }, { status: 400 });
  }

  // An unknown or someone else's sessionId silently starts a new thread rather
  // than erroring — the id is client-held state and may simply be stale.
  let sessionId = typeof body.sessionId === 'string' ? body.sessionId : '';
  if (!sessionId || !(await sessionExists(userId, sessionId))) {
    sessionId = await createSession(userId, text);
  }

  await appendMessage(sessionId, { role: 'user', content: text });

  // Now on the user's clock: every calendar time is wall-clock, so a real-UTC
  // "now" is hours off — it offered 09:00 at 09:30 in Berlin (wall-clock.ts).
  const zone = await userTimeZone(userId).catch(() => DEFAULT_ZONE);
  const now = new Date(wallClockNow(zone));
  const t0 = Date.now();
  const nowISO = iso(now);
  const horizonISO = iso(new Date(now.getTime() + HORIZON_DAYS * 86_400_000));

  let profile: AgentProfile;
  let history: Awaited<ReturnType<typeof listMessages>>;
  let events: CalEvent[];
  let openTasks: ApiTask[];
  let habits: ApiHabit[];
  let memory: Memory;
  begin(STEP.read);
  // Which calendar each event is on, and which are public holidays. Optional:
  // without it the turn plans as before, holidays unmarked.
  const calendarsP = listCalendars(userId).catch((err) => {
    console.error('ai/chat listCalendars', err);
    return [] as CalendarInfo[];
  });
  let calendars: CalendarInfo[];
  try {
    [profile, history, events, openTasks, habits, memory, calendars] = await Promise.all([
      loadProfile(userId),
      listMessages(sessionId, MAX_TURNS),
      calendarFor(userId, nowISO, horizonISO, calendarsP),
      // The backlog is optional context: a failure here must not cost the turn.
      listOpenTasks(userId).catch((err) => {
        console.error('ai/chat listOpenTasks', err);
        return [] as ApiTask[];
      }),
      listHabits(userId).catch((err) => {
        console.error('ai/chat listHabits', err);
        return [] as ApiHabit[];
      }),
      // Also optional: before db/029 is applied, or if it fails, the turn runs without memory.
      loadMemory(userId).catch((err) => {
        console.error('ai/chat loadMemory', err);
        return { instructions: '', facts: [] } as Memory;
      }),
      calendarsP,
    ]);
  } catch (err) {
    console.error('ai/chat load', err);
    return Response.json({ sessionId, error: 'Could not read your calendar.' }, { status: 500 });
  }

  // Imported titles are live from Google and never stored; these lists feed
  // clash text that is saved (ai_messages, ai_suggestions.reason), so they
  // carry a generic name for imported events.
  const named = (e: (typeof events)[number]) => ({ start: e.start, end: e.end, title: e.origin === 'imported' ? 'a calendar event' : e.title });
  // Only time the calendar itself calls busy is a conflict (see blocksTime).
  const busy = events.filter(blocksTime).map(named);
  // Everything a person would see at a given time, busy or not: a time the
  // user names is checked against this. All-day markers and declined invites
  // aren't "something at 12:00".
  const shown = events.filter((e) => !e.allDay && e.rsvp !== 'declined').map(named);

  step({
    tool: STEP.read,
    label: `Checked your next ${Math.round(HORIZON_DAYS / 7)} weeks`,
    detail: weekShape(busy, nowISO),
    ms: Date.now() - t0,
  });
  // A rules step only when there are rules: "No rules yet" on every turn was filler.
  const card = preferenceCard(profile);
  const ruleBits = [
    card.rules.length && plural(card.rules.length, 'rule'),
    card.learned.length && plural(card.learned.length, 'learned habit'),
  ].filter(Boolean);
  if (ruleBits.length) {
    step({ tool: STEP.rules, label: doneLabel(STEP.rules, 'Applied your rules'), detail: ruleBits.join(' · ') });
  }

  // The previous assistant turn carries what was understood so far, and the
  // blocks it proposed (for "why that slot?").
  const lastReply = [...history].reverse().find((m) => m.role === 'assistant');
  const lastParsed = (lastReply?.parsed ?? {}) as { draft?: Draft; proposals?: ChatProposal[] };

  begin(STEP.model);
  const readT0 = Date.now();
  const readCtx = {
    nowISO,
    previous: lastParsed.draft ?? null,
    lastProposals: (lastParsed.proposals ?? []).map((p) => ({ startISO: p.startISO, reason: p.reason })),
    taskTitles: openTasks.map((t) => t.title),
    habitTitles: habits.map((h) => h.title),
  };
  // The model reads every typed message and chooses the workflow (agent.ts);
  // the engine computes. Two exceptions go to the rules: a tap on one of the
  // options the rules themselves offered (they hold the draft it answers, and
  // the meaning is already known), and no model — no key, no credit left, or
  // it failed. Rules are the backup, not the reader.
  const lastOptions = ((lastReply?.parsed as { question?: { options?: string[] } } | null)?.question?.options ?? []) as string[];
  const tapped = Boolean(lastParsed.draft) && lastOptions.includes(text);
  // What the app just asked, if that was its last word: this message may be the answer.
  const lastQuestion = lastReply?.kind === 'question' ? lastReply.content : ((lastReply?.parsed as { question?: { text?: string } } | null)?.question?.text ?? null);
  let choice: Understood | null = null;
  const seen: typeof events = [];
  const modelReads = !tapped && aiConfigured() && (await hasCredit(userId));
  const charge = (p: number, o: number) => chargeTokens(userId, p, o);
  if (modelReads) {
    choice = await runAgent({
      text,
      pendingQuestion: lastQuestion,
      history: history.map((m) => ({ role: m.role, content: m.content })),
      nowISO,
      horizonISO,
      profile,
      events,
      tasks: openTasks,
      habits,
      memory,
      // A fact is the person's words about themselves: a Google title it picked up is scrubbed first.
      saveFact: async ({ action, text: fact, factId }) => {
        if (action === 'forget') return factId && (await deleteFact(userId, factId)) ? { id: factId } : null;
        const googleTitles = [...events, ...seen].filter((e) => isImported(e.origin)).map((e) => e.title);
        const typed = [...history.filter((m) => m.role === 'user').map((m) => m.content), text].join(' ');
        const clean = scrubTitles(fact, googleTitles, typed);
        if (factId) return (await updateFact(userId, factId, clean)) ? { id: factId } : null;
        return addFact(userId, clean, 'ai');
      },
      eventsIn: (fromISO, toISO) => calendarFor(userId, fromISO, toISO, calendarsP),
      seen,
      readCtx,
      step,
      charge,
    });
    choice = choice
      ? { ...choice, summary: `${choice.summary} · AI` }
      : { name: TOOL_ANSWER, args: { reply: "I couldn't read that just now, so nothing has changed. Please send it again." }, draft: null, summary: 'the model failed · nothing changed' };
  }
  choice ??= tapped ? understand(text, readCtx) : guardTitle(understand(text, readCtx));
  const read = text;
  // Echo the person's own words: the step is about this sentence, not a tool.
  const quoted = text.length > 42 ? `${text.slice(0, 40).trimEnd()}…` : text;
  step({ tool: choice.name, label: `Read “${quoted}”`, detail: choice.summary, ms: Date.now() - readT0 });

  const ctx: TurnCtx = {
    userId,
    sessionId,
    text: read,
    summary: choice.summary,
    now,
    nowISO,
    horizonISO,
    profile,
    events,
    busy,
    shown,
    holidays: holidaysIn(events),
    calendars,
    openTasks,
    habits,
    begin,
    step,
  };
  const handler = toolFor(choice.name);
  const result = handler ? await handler(choice.args, ctx) : {};
  if ('fail' in result) return Response.json({ sessionId, error: result.fail }, { status: 500 });

  // The planner's facts become a question the person can answer, in the model's words.
  const asked = modelReads && !choice.draft && result.facts?.length ? await askAboutFacts({ text, nowISO, charge }, result.facts) : null;
  if (asked) step({ tool: STEP.ask, label: doneLabel(STEP.ask, 'Ask you'), detail: 'the planner needs a decision' });

  const reply = asked?.text ?? result.reply ?? asString(choice.args.reply);
  const kind = result.kind ?? (asked ? 'question' : 'text');
  const extras: Partial<ChatMessage> = {};
  if (result.proposals) extras.proposals = result.proposals;
  if (result.question) extras.question = result.question;
  if (asked) extras.question = asked;
  if (result.savedRule) extras.savedRule = result.savedRule;
  if (result.timeOff) extras.timeOff = result.timeOff;
  if (result.deleted) extras.deleted = result.deleted;
  if (result.changes) extras.changes = result.changes;
  extras.trace = trace;

  // Stored with the reply, never sent: what the next turn continues from.
  const draft: Draft | null = choice.draft && {
    ...choice.draft,
    placed: kind === 'plan',
    ...(result.pendingDeleteIds ? { deleteIds: result.pendingDeleteIds } : {}),
    ...(result.proposals?.length ? { lastStartISO: result.proposals[0].startISO } : {}),
    clashAsked: result.clashAsked ?? false,
  };

  // The model reads Google titles and may quote them; the person sees the reply, the database doesn't.
  const googleTitles = [...events, ...seen].filter((e) => isImported(e.origin)).map((e) => e.title).concat(result.titlesRead ?? []);
  const typed = [...history.filter((m) => m.role === 'user').map((m) => m.content), text].join(' ');
  const stored = scrubTitles({ content: reply, parsed: { ...extras, ...(draft ? { draft } : {}) } }, googleTitles, typed);
  const messageId = await appendMessage(sessionId, { role: 'assistant', content: stored.content, kind, parsed: stored.parsed });

  const message: ChatMessage = {
    id: messageId,
    role: 'assistant',
    text: reply,
    createdAt: iso(new Date()), // a real timestamp, like the stored history — not a calendar time
    ...extras,
  };
  return Response.json({ sessionId, message } satisfies ChatResponse);
}
