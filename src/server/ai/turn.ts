import type { ChatMessage, ChatProposal, ChatResponse, ChatStreamEvent, TraceStep } from '@/lib/api-types';
import { STEP } from '@/lib/agent-tools';
import { listEvents } from '@/server/events-repo';
import { type ApiHabit, listHabits } from '@/server/habits-repo';
import { type ApiTask, listOpenTasks } from '@/server/tasks-repo';
import { DEFAULT_ZONE, wallClockNow } from '@/server/wall-clock';
import { blocksTime } from './find-time';
import { describeClaim } from './learn';
import type { AgentProfile } from './preferences';
import { appendMessage, createSession, listMessages, loadProfile, sessionExists, userTimeZone } from './repo';
import { doneLabel, iso, plural, runningLabel, type TurnCtx } from './tools/context';
import { toolFor } from './tools';
import { asString } from './tools/names';
import { rewriteForRules, weakRead } from './rewrite';
import { type Draft, NOT_UNDERSTOOD, understand } from './understand';

/**
 * One turn of Plan with AI, after the route has authenticated the user and
 * parsed the body (src/app/api/ai/chat+api.ts):
 *
 *   load the calendar, tasks and habits → understand.ts reads the sentence into
 *   one tool + arguments → that tool's handler (tools/index.ts) carries it out →
 *   the reply is stored with the draft the next turn continues from.
 *
 * The rules read first; only a sentence they can't read goes to the model,
 * which rewrites it for the rules to read again (rewrite.ts). What has been understood so far rides on each assistant
 * message as `parsed.draft`, so "make it 90 minutes" or the answer to its own
 * question continues the plan.
 */

const HORIZON_DAYS = 21;
export const MAX_TURNS = 16;

export type Emit = (e: ChatStreamEvent) => void;

/** Rules and learned habits, as counted on the "Applied your rules" step. */
function preferenceCard(profile: AgentProfile): { learned: string[]; rules: string[] } {
  const learned = profile.learned
    .filter((p) => p.userVerdict !== 'rejected' && (p.userVerdict === 'confirmed' || p.evidenceCount >= 3))
    .map((p) => describeClaim(p))
    .filter((t): t is string => Boolean(t))
    .slice(0, 10);
  const rules = profile.rules.map((r) => r.label).filter(Boolean).slice(0, 10);
  return { learned, rules };
}

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
  let events: Awaited<ReturnType<typeof listEvents>>;
  let openTasks: ApiTask[];
  let habits: ApiHabit[];
  begin(STEP.read);
  try {
    [profile, history, events, openTasks, habits] = await Promise.all([
      loadProfile(userId),
      listMessages(sessionId, MAX_TURNS),
      listEvents(userId, nowISO, horizonISO),
      // The backlog is optional context: a failure here must not cost the turn.
      listOpenTasks(userId).catch((err) => {
        console.error('ai/chat listOpenTasks', err);
        return [] as ApiTask[];
      }),
      listHabits(userId).catch((err) => {
        console.error('ai/chat listHabits', err);
        return [] as ApiHabit[];
      }),
    ]);
  } catch (err) {
    console.error('ai/chat load', err);
    return Response.json({ sessionId, error: 'Could not read your calendar.' }, { status: 500 });
  }

  // Only time the calendar itself calls busy is a conflict (see blocksTime).
  const busy = events.filter(blocksTime).map((e) => ({ start: e.start, end: e.end, title: e.title }));
  // Everything a person would see at a given time, busy or not: a time the
  // user names is checked against this. All-day markers and declined invites
  // aren't "something at 12:00".
  const shown = events.filter((e) => !e.allDay && e.rsvp !== 'declined').map((e) => ({ start: e.start, end: e.end, title: e.title }));

  step({
    tool: STEP.read,
    label: doneLabel(STEP.read, 'Read your calendar'),
    detail: `${plural(events.length, 'block')} · next ${HORIZON_DAYS} days · ${busy.length} fixed`,
    ms: Date.now() - t0,
  });
  const card = preferenceCard(profile);
  const ruleBits = [
    card.rules.length && plural(card.rules.length, 'rule'),
    card.learned.length && plural(card.learned.length, 'learned habit'),
  ].filter(Boolean);
  step({
    tool: STEP.rules,
    label: ruleBits.length ? doneLabel(STEP.rules, 'Applied your rules') : 'No rules yet',
    detail: ruleBits.length ? ruleBits.join(' · ') : 'tell me one any time',
  });

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
  let choice = understand(text, readCtx);
  // The rules couldn't read it, or read it badly (rewrite.ts weakRead): the model rewrites it into phrasing they do read, and
  // the rules decide again. A rewrite they still can't read changes nothing.
  let read = text;
  if (weakRead(choice)) {
    const rewritten = await rewriteForRules(text, nowISO);
    const again = rewritten ? understand(rewritten, readCtx) : null;
    if (rewritten && again && again.summary !== NOT_UNDERSTOOD) {
      choice = { ...again, summary: `${again.summary} · read by AI as "${rewritten}"` };
      read = rewritten;
    }
  }
  step({ tool: choice.name, label: `Chose: ${doneLabel(choice.name, choice.name).toLowerCase()}`, detail: choice.summary, ms: Date.now() - readT0 });

  const ctx: TurnCtx = { userId, sessionId, text: read, summary: choice.summary, now, nowISO, horizonISO, profile, events, busy, shown, openTasks, habits, begin, step };
  const handler = toolFor(choice.name);
  const result = handler ? await handler(choice.args, ctx) : {};
  if ('fail' in result) return Response.json({ sessionId, error: result.fail }, { status: 500 });

  const reply = result.reply ?? asString(choice.args.reply);
  const kind = result.kind ?? 'text';
  const extras: Partial<ChatMessage> = {};
  if (result.proposals) extras.proposals = result.proposals;
  if (result.question) extras.question = result.question;
  if (result.savedRule) extras.savedRule = result.savedRule;
  if (result.timeOff) extras.timeOff = result.timeOff;
  if (result.deleted) extras.deleted = result.deleted;
  extras.trace = trace;

  // Stored with the reply, never sent: what the next turn continues from.
  const draft: Draft | null = choice.draft && {
    ...choice.draft,
    placed: kind === 'plan',
    ...(result.pendingDeleteIds ? { deleteIds: result.pendingDeleteIds } : {}),
    ...(result.proposals?.length ? { lastStartISO: result.proposals[0].startISO } : {}),
    clashAsked: result.clashAsked ?? false,
  };

  const messageId = await appendMessage(sessionId, {
    role: 'assistant',
    content: reply,
    kind,
    parsed: { ...extras, ...(draft ? { draft } : {}) },
  });

  const message: ChatMessage = {
    id: messageId,
    role: 'assistant',
    text: reply,
    createdAt: iso(new Date()), // a real timestamp, like the stored history — not a calendar time
    ...extras,
  };
  return Response.json({ sessionId, message } satisfies ChatResponse);
}
