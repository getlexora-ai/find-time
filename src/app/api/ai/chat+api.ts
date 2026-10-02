import type {
  ChatHistoryResponse,
  ChatMessage,
  ChatProposal,
  ChatResponse,
  ChatStreamEvent,
  TraceStep,
} from '@/lib/api-types';
import { agentTool, STEP } from '@/lib/agent-tools';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import {
  TOOL_ANSWER,
  TOOL_ASK,
  TOOL_PLACE_AT,
  TOOL_PROPOSE,
  TOOL_RULE,
  TOOL_DELETE,
  TOOL_TIME_OFF,
  TOOL_ADD_TASK,
  TOOL_LIST_TASKS,
  TOOL_PLAN_WEEK,
  TOOL_TASK_DONE,
  TOOL_TASK_UPDATE,
  TOOL_POSTPONE,
  TOOL_ADD_HABIT,
  TOOL_HABIT_UPDATE,
  TOOL_TRAVEL,
  TOOL_PLAN_SETTINGS,
  asString,
  clampInt,
} from '@/server/ai/chat';
import { type Draft, PARSER_ID, PARSER_VERSION, understand } from '@/server/ai/understand';
import {
  candidatesFrom,
  captureProfile,
  latestOccasionInSession,
  linkTurnMessage,
  recordCorrection,
  recordOccasion,
  recordTurn,
  reportedMessageIds,
  shouldExplore,
} from '@/server/ai/capture';
import { blocksTime, buildScoreContext, rankFreeSlots, selectSlots, type RankedSlot } from '@/server/ai/find-time';
import { SCORER_VERSION, slotNotes, ZERO_FEATURES } from '@/server/ai/scoring';
import { ambiguousTime, checkPlaceAt, clashNote } from '@/server/ai/place-at';
import { describeClaim } from '@/server/ai/learn';
import { adjustDuration, CATEGORIES, effectiveBuffer, type AgentProfile } from '@/server/ai/preferences';
import { dayWindowFor, durationOptions, missingInfo, questionFor, whenOptions } from '@/server/ai/clarify';
import {
  appendMessage,
  createSession,
  listMessages,
  loadProfile,
  saveProposals,
  savePlanSettings,
  saveTravelMin,
  sessionExists,
  addRule,
} from '@/server/ai/repo';
import { isConfigured } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';
import { checkTimeOff, splitByDay } from '@/server/ai/time-off';
import { createEvent, deleteEvent, listEvents } from '@/server/events-repo';
import {
  MAX_HORIZON_DAYS,
  type PlanInput,
  type PlanTask,
  dueLabel,
  habitWeeks,
  planWeek,
  startLabel,
  travelPadding,
  verifyPlan,
} from '@/server/ai/plan-week';
import { type ApiHabit, createHabit, findHabits, listHabits, updateHabit } from '@/server/habits-repo';
import { finishTask, postponeTask, stopHabit } from '@/server/task-actions';
import { type ApiTask, createTask, findOpenTasks, listOpenTasks, updateTask } from '@/server/tasks-repo';
import { IMPORTED_ORIGIN } from '@/lib/synced-fields';

/**
 * POST /api/ai/chat — one turn of a conversation with the scheduling agent.
 * GET  /api/ai/chat?sessionId=… — rehydrate an open conversation.
 *
 * This replaces the single-shot `/api/ai/find-time` flow. The difference that
 * matters is not the UI: it is that the agent now has a thread to be corrected
 * in. "Make it 90 minutes", "not Tuesday", "why that slot?" are all ordinary
 * turns here, and each correction is recorded against the proposal it corrects
 * (src/server/ai/repo.ts), which is what gives the learner something to learn
 * from.
 *
 * No model runs here. `understand` (src/server/ai/understand.ts) reads the
 * sentence with rules and returns the same tool call the model used to make;
 * `rankFreeSlots` picks the actual times against the real calendar. What it
 * has understood so far rides on each assistant message as `parsed.draft`, so
 * "make it 90 minutes" or the answer to its own question continues the plan.
 * The model path (src/server/ai/gemini.ts, chat.ts tool definitions) is left
 * in place, unused, for when it comes back.
 */

const HORIZON_DAYS = 21;
const MAX_TURNS = 16;

/** Must stay a subset of the `constraints_kind_ck` CHECK in db/001_core.sql. */
const RULE_KINDS = new Set(['work-hours', 'protected', 'no-meetings', 'leave-by', 'buffer']);
const WEEKDAY_CODES = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const iso = (d: Date) => d.toISOString().replace(/\.\d{3}Z$/, '.000Z');
const laterOf = (a: string, b: string) => (Date.parse(a) > Date.parse(b) ? a : b);

const hoursText = (min: number) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `${h}h${String(min % 60).padStart(2, '0')}` : `${h}h`;
};

/** A stored task, as the planner sees it. */
function toPlanTask(t: ApiTask): PlanTask {
  return {
    id: t.id,
    title: t.title,
    category: (CATEGORIES as readonly string[]).includes(t.category) ? t.category : 'deep-work',
    durationMin: t.durationMin,
    dueByISO: t.dueBy,
    preferByISO: t.preferBy,
    notBeforeISO: t.notBefore,
    priority: t.priority,
    effort: t.effort,
    preferredWindow: t.preferredWindow,
    splittable: t.splittable,
    minChunkMin: t.minChunkMin,
  };
}

/** "2–3x a week, 1h, mornings" */
function habitText(h: ApiHabit): string {
  const often = h.minPerWeek && h.minPerWeek < h.perWeek ? `${h.minPerWeek}–${h.perWeek}x a week` : `${h.perWeek}x a week`;
  return [often, hoursText(h.durationMin), h.preferredWindow ? `${h.preferredWindow}s` : ''].filter(Boolean).join(', ');
}

/** The structured preference card shown to the model — never any event text. */
function preferenceCard(profile: AgentProfile): { learned: string[]; rules: string[] } {
  const learned = profile.learned
    .filter((p) => p.userVerdict !== 'rejected' && (p.userVerdict === 'confirmed' || p.evidenceCount >= 3))
    .map((p) => describeClaim(p))
    .filter((t): t is string => Boolean(t))
    .slice(0, 10);
  const rules = profile.rules.map((r) => r.label).filter(Boolean).slice(0, 10);
  return { learned, rules };
}

export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId || !(await sessionExists(userId, sessionId))) {
    return Response.json({ sessionId: null, messages: [] } satisfies ChatHistoryResponse);
  }

  const [stored, reported] = await Promise.all([
    listMessages(sessionId, MAX_TURNS * 2),
    reportedMessageIds(userId, sessionId),
  ]);
  const messages: ChatMessage[] = stored.map((m) => {
    // The draft is the planner's working state, not part of the reply.
    const { draft: _draft, ...parsed } = (m.parsed ?? {}) as Partial<ChatMessage> & { draft?: unknown };
    return {
      id: m.id,
      role: m.role,
      text: m.content,
      createdAt: m.createdAt,
      ...parsed,
      ...(reported.has(m.id) ? { reported: true } : {}),
    };
  });
  return Response.json({ sessionId, messages } satisfies ChatHistoryResponse);
}

type Emit = (e: ChatStreamEvent) => void;

/** The step's own words from the registry, so a renamed tool renames everywhere. */
const doneLabel = (key: string, fallback: string) => agentTool(key)?.label ?? fallback;
const runningLabel = (key: string) => agentTool(key)?.running ?? 'Working';

/**
 * POST /api/ai/chat. With `Accept: application/x-ndjson` the turn streams:
 * a `start` as each step begins, a `step` with its numbers as it ends, then
 * the reply (ChatStreamEvent). Without it, one JSON body as before — the
 * steps still ride on the reply as `trace`.
 */
export async function POST(request: Request): Promise<Response> {
  if (!(request.headers.get('accept') ?? '').includes('application/x-ndjson')) {
    return handle(request, () => {});
  }
  const enc = new TextEncoder();
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const emit: Emit = (e) => void writer.write(enc.encode(`${JSON.stringify(e)}\n`)).catch(() => {});
  void (async () => {
    try {
      // Every exit of the handler is a Response; its body becomes the last line.
      const res = await handle(request, emit);
      const body = (await res.json().catch(() => ({}))) as Partial<ChatResponse> & { error?: string };
      if (res.ok && body.message && body.sessionId) emit({ type: 'message', sessionId: body.sessionId, message: body.message });
      else emit({ type: 'error', sessionId: body.sessionId, error: body.error ?? 'Find time hit a snag. Try again.' });
    } catch (err) {
      console.error('ai/chat stream', err);
      emit({ type: 'error', error: 'Find time hit a snag. Try again.' });
    } finally {
      await writer.close().catch(() => {});
    }
  })();
  return new Response(stream.readable, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' },
  });
}

async function handle(request: Request, emit: Emit): Promise<Response> {
  /** What this turn actually did, step by step — kept on the reply and streamed as it happens. */
  const trace: TraceStep[] = [];
  const begin = (key: string) => emit({ type: 'start', tool: key, label: runningLabel(key) });
  const step = (st: TraceStep) => {
    trace.push(st);
    emit({ type: 'step', step: st });
  };

  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const limited = await enforceRateLimit(request, 'ai-chat', { kind: 'user', userId });
  if (limited) return limited;

  let body: { sessionId?: unknown; message?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

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

  const now = new Date();
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

  const loadMs = Date.now() - t0;

  // Only time the calendar itself calls busy is a conflict (see blocksTime).
  const busy = events
    .filter(blocksTime)
    .map((e) => ({ start: e.start, end: e.end, title: e.title }));

  const card = preferenceCard(profile);

  step({
    tool: STEP.read,
    label: doneLabel(STEP.read, 'Read your calendar'),
    detail: `${events.length} block${events.length === 1 ? '' : 's'} · next ${HORIZON_DAYS} days · ${busy.length} fixed`,
    ms: loadMs,
  });
  const ruleBits = [
    card.rules.length && `${card.rules.length} rule${card.rules.length === 1 ? '' : 's'}`,
    card.learned.length && `${card.learned.length} learned habit${card.learned.length === 1 ? '' : 's'}`,
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

  /**
   * What the reader was given, replayable later. Busy blocks are BOUNDS ONLY —
   * event titles are other people's text and never enter the log at any
   * capture profile (docs/ai-learning.md §8). The user's own message rides
   * along at 'full' and is dropped at 'anon' with the rest of track B.
   */
  const modelInput: Record<string, unknown> = {
    nowISO,
    horizonISO,
    horizonDays: HORIZON_DAYS,
    learned: card.learned,
    rules: card.rules,
    busy: busy.map((b) => ({ start: b.start, end: b.end })),
    turns: history.length,
    draft: lastParsed.draft ?? null,
    ...(captureProfile() === 'full' ? { userText: text } : {}),
  };

  begin(STEP.model);
  const readT0 = Date.now();
  const choice = understand(text, {
    nowISO,
    previous: lastParsed.draft ?? null,
    lastProposals: (lastParsed.proposals ?? []).map((p) => ({ startISO: p.startISO, reason: p.reason })),
    taskTitles: openTasks.map((t) => t.title),
    habitTitles: habits.map((h) => h.title),
  });
  const readMs = Date.now() - readT0;

  const args = choice.args;
  // The row for the reading step names the tool it chose, and what it read.
  step({ tool: choice.name, label: `Chose: ${doneLabel(choice.name, choice.name).toLowerCase()}`, detail: choice.summary, ms: readMs });

  /**
   * The clarification policy. A proposal whose day or length the model had to
   * guess is not placed — it becomes a question (src/server/ai/clarify.ts).
   * Decided here, before the turn is logged, so the log records what the user
   * actually saw rather than what the model first reached for.
   */
  const missing = choice.name === TOOL_PROPOSE ? missingInfo(args) : null;
  // "gym at 6" — never placed on a guess between 06:00 and 18:00.
  const ampm = choice.name === TOOL_PLACE_AT ? ambiguousTime(text) : null;

  const ACTION_BY_TOOL: Record<string, 'propose' | 'ask' | 'record_rule' | 'time_off' | 'answer'> = {
    [TOOL_PROPOSE]: 'propose',
    [TOOL_PLACE_AT]: 'propose',
    [TOOL_ASK]: 'ask',
    [TOOL_RULE]: 'record_rule',
    [TOOL_TIME_OFF]: 'time_off',
    [TOOL_ANSWER]: 'answer',
    // The backlog tools reuse the logged actions ai_turns already allows (db/018).
    [TOOL_PLAN_WEEK]: 'propose',
    [TOOL_ADD_TASK]: 'answer',
    [TOOL_LIST_TASKS]: 'answer',
    [TOOL_TASK_DONE]: 'answer',
    [TOOL_TASK_UPDATE]: 'answer',
    [TOOL_POSTPONE]: 'answer',
    [TOOL_ADD_HABIT]: 'answer',
    [TOOL_HABIT_UPDATE]: 'answer',
    [TOOL_TRAVEL]: 'record_rule',
    [TOOL_PLAN_SETTINGS]: 'record_rule',
  };
  // Logged before the action is carried out, so a turn that fails downstream
  // still leaves a record of what the model decided to do.
  const turnId = await recordTurn({
    userId,
    sessionId,
    // Deleting has no action of its own in ai_turns' CHECK: the list is a question, the yes an answer.
    action:
      missing || ampm
        ? 'ask'
        : choice.name === TOOL_DELETE
          ? args.confirm === true ? 'answer' : 'ask'
          : ACTION_BY_TOOL[choice.name] ?? 'answer',
    modelId: PARSER_ID,
    promptVersion: PARSER_VERSION,
    scorerVersion: SCORER_VERSION,
    input: modelInput,
    toolArgs: args,
    latencyMs: readMs,
  });
  let reply = asString(args.reply);
  let proposals: ChatProposal[] | undefined;
  let question: ChatMessage['question'];
  let savedRule: ChatMessage['savedRule'];
  let timeOff: ChatMessage['timeOff'];
  let deleted: ChatMessage['deleted'];
  /** the blocks a delete question listed — kept server-side, deleted only on a yes */
  let pendingDeleteIds: string[] | undefined;
  let kind = 'text';

  if (choice.name === TOOL_PROPOSE && missing) {
    kind = 'question';
    const category = asString(args.category, 'deep-work');
    const title = asString(args.title, '');
    const options =
      missing === 'duration'
        ? durationOptions(category)
        : whenOptions({
            busy,
            profile,
            category,
            durationMin: clampInt(args.durationMin, 15, 480, 60),
            nowMs: now.getTime(),
            horizonMs: Date.parse(horizonISO),
          });
    question = { text: questionFor(missing, title, options.length > 0), options };
    reply = question.text;
    step({ tool: STEP.ask, label: missing === 'duration' ? 'Needs a length first' : 'Needs a day first', detail: 'I never guess a time' });
  } else if (choice.name === TOOL_PROPOSE) {
    kind = 'plan';
    const category = asString(args.category, 'deep-work');
    const title = asString(args.title, 'Focus block');
    const count = clampInt(args.count, 1, 5, 1);

    // The user's own estimate, corrected by how long this category actually
    // takes them (learned from past resizes).
    const askedMin = clampInt(args.durationMin, 15, 480, 60);
    const durationMin = adjustDuration(profile, category, askedMin);

    const win = dayWindowFor(profile, category);
    // Personal time lives in evenings and weekends; work stays on weekdays
    // unless the user invited the weekend.
    const skipWeekends = category === 'personal' ? args.weekdaysOnly === true : args.weekdaysOnly !== false;
    const earliestISO = laterOf(
      typeof args.earliestISO === 'string' && Number.isFinite(Date.parse(args.earliestISO))
        ? args.earliestISO
        : nowISO,
      nowISO,
    );
    const modelLatest =
      typeof args.latestISO === 'string' && Number.isFinite(Date.parse(args.latestISO))
        ? args.latestISO
        : horizonISO;
    let latestISO = Date.parse(modelLatest) > Date.parse(horizonISO) ? horizonISO : modelLatest;
    if (Date.parse(latestISO) <= Date.parse(earliestISO)) latestISO = horizonISO;

    begin(STEP.rank);
    const rankT0 = Date.now();
    // "Not Friday": days the user ruled out for this request only.
    const excluded = new Set(
      Array.isArray(args.excludeDates) ? args.excludeDates.filter((d): d is string => typeof d === 'string') : [],
    );
    const ranked = rankFreeSlots(busy, {
      durationMin,
      count,
      earliestISO,
      latestISO,
      dayStartHour: clampInt(args.dayStartHour, 0, 23, win.start),
      dayEndHour: clampInt(args.dayEndHour, 1, 24, win.end),
      bufferMin: effectiveBuffer(profile),
      skipWeekends,
      category,
    }, profile).filter((r) => !excluded.has(r.startISO.slice(0, 10)));

    /**
     * A slice of occasions offers a wider band of runners-up instead of the
     * top tier. Without it every observation is a choice among slots this
     * scorer already liked, so its own bias is baked into the evidence and
     * "afternoons don't work" cannot be told apart from "we never offered an
     * afternoon". The flip is recorded on the occasion so analysis can lean on
     * exactly these rows; it cannot be added to history afterwards, which is
     * why it ships with the capture rather than after it.
     */
    const explore = shouldExplore();
    const { chosen, alternatives } = selectSlots(ranked, {
      count,
      maxPerDay: args.oneBlockPerDay !== false ? 1 : undefined,
      bufferMin: effectiveBuffer(profile),
      alternatives: explore ? 4 : 2,
      strategy: explore ? 'spread' : 'top',
    });

    step({
      tool: STEP.rank,
      label: doneLabel(STEP.rank, 'Scored free slots'),
      detail: `${ranked.length} candidate${ranked.length === 1 ? '' : 's'} · ${durationMin} min · picked ${chosen.length}`,
      ms: Date.now() - rankT0,
    });

    if (chosen.length === 0) {
      kind = 'text';
      reply =
        reply ||
        `I couldn't find a free ${durationMin}-minute slot that fits before ${latestISO.slice(0, 10)}. Want me to try a shorter block or a wider window?`;
    } else {
      // Persist before replying: a proposal the client can't report an outcome
      // against is a proposal we can never learn from.
      let stored;
      try {
        stored = await saveProposals(
          userId,
          sessionId,
          { startISO: earliestISO, endISO: latestISO },
          chosen.map((c) => ({
            title,
            category,
            startISO: c.startISO,
            endISO: c.endISO,
            score: c.score,
            features: c.features,
            reason: c.reason,
            alternatives: alternatives.map((a) => ({
              startISO: a.startISO,
              endISO: a.endISO,
              score: a.score,
              features: a.features,
            })),
          })),
        );
      } catch (err) {
        console.error('ai/chat saveProposals', err);
        return Response.json({ sessionId, error: 'Could not save that plan. Try again.' }, { status: 500 });
      }

      /**
       * One occasion per block placed, each carrying the whole ranked field it
       * was chosen from. The slots that lost are the point: a correction on
       * its own cannot say whether `fragmentation` mattered once `hourFit` is
       * controlled for, because it never sees what was passed over.
       *
       * `offered` marks what the user could actually act on — this block plus
       * the runners-up shown beside it. Under 'spread' a low-ranked slot can
       * be offered, and those are the rows worth the most.
       */
      const ctx = buildScoreContext(busy, {
        durationMin,
        count,
        earliestISO,
        latestISO,
        dayStartHour: clampInt(args.dayStartHour, 0, 23, win.start),
        dayEndHour: clampInt(args.dayEndHour, 1, 24, win.end),
        bufferMin: effectiveBuffer(profile),
        skipWeekends,
        category,
      });
      const notesFor = (r: RankedSlot) =>
        slotNotes(profile, ctx, Date.parse(r.startISO), Date.parse(r.endISO));
      const busyMinutes = ctx.busy.reduce((n, b) => n + (b.e - b.s) / 60_000, 0);

      // Resolved BEFORE the new occasions are written: this lookup takes the
      // most recent occasion in the session, and a moment from now that will
      // be one of the rows about to be inserted.
      const previousOccasion =
        args.revisesPrevious === true ? await latestOccasionInSession(userId, sessionId) : null;

      const occasionIds: string[] = [];
      for (let i = 0; i < stored.length; i++) {
        const occId = await recordOccasion({
          userId,
          turnId,
          suggestionId: stored[i].id,
          category,
          requestedMinutes: durationMin,
          randomised: explore,
          strategy: explore ? 'spread' : 'top',
          modelId: PARSER_ID,
          promptVersion: PARSER_VERSION,
          scorerVersion: SCORER_VERSION,
          weekBusyMinutes: Math.round(busyMinutes),
          contextNote: `${ranked.length}cand·${count}blk${explore ? '·expl' : ''}`,
          candidates: candidatesFrom(ranked, [chosen[i], ...alternatives], notesFor),
        });
        if (occId) occasionIds.push(occId);
      }

      /**
       * A correction made in words, labelled by the model that just read both
       * turns. `revisesPrevious` is the model's own claim and lands unreviewed
       * like everything else — it is a suggestion for the review queue, never
       * a verdict.
       */
      if (previousOccasion) {
        await recordCorrection({
          userId,
          occasionId: previousOccasion,
          turnId,
          source: 'chat',
          kind: asString(args.correctionKind, 'other'),
          before: { occasionId: previousOccasion },
          after: { occasionIds, durationMin, count, category, earliestISO, latestISO },
          reasonNote: text,
        });
      }

      proposals = stored.map((p) => ({
        id: p.id,
        title: p.title,
        startISO: p.startISO,
        endISO: p.endISO,
        category: p.category,
        reason: p.reason,
        alternatives: p.alternatives.map((a) => ({ startISO: a.startISO, endISO: a.endISO })),
      }));

      if (!reply) {
        reply =
          durationMin !== askedMin
            ? `I've found room — I stretched these to ${durationMin} minutes because ${category.replace('-', ' ')} usually runs over for you.`
            : `Here's what I found.`;
      }
    }
  } else if (choice.name === TOOL_PLACE_AT) {
    const title = asString(args.title, 'Block').slice(0, 120);
    const categoryArg = asString(args.category, 'personal');
    const category = (CATEGORIES as readonly string[]).includes(categoryArg) ? categoryArg : 'personal';
    const checked = checkPlaceAt(args.startISO, args.endISO, nowISO, horizonISO);
    if (ampm) {
      kind = 'question';
      question = { text: `Did you mean ${ampm.pm} or ${ampm.am}?`, options: [ampm.pm, ampm.am] };
      reply = question.text;
    } else if (!checked.ok) {
      reply = checked.reason;
    } else {
      // The user's own time, not a scorer pick: no features, no runners-up, no
      // occasion. The card and the feedback path are the same as any proposal.
      const clash = clashNote(busy, checked.span);
      const reason = clash ?? "it's the time you asked for";
      step({ tool: STEP.check, label: doneLabel(STEP.check, 'Checked that time'), detail: clash ? 'it overlaps something' : 'it is free' });
      try {
        const stored = await saveProposals(userId, sessionId, checked.span, [
          { title, category, ...checked.span, score: 0, features: ZERO_FEATURES, reason, alternatives: [] },
        ]);
        kind = 'plan';
        proposals = stored.map((p) => ({
          id: p.id,
          title: p.title,
          startISO: p.startISO,
          endISO: p.endISO,
          category: p.category,
          reason: p.reason,
          alternatives: [],
        }));
        reply = reply || 'Here it is.';
      } catch (err) {
        console.error('ai/chat placeAt', err);
        return Response.json({ sessionId, error: 'Could not save that plan. Try again.' }, { status: 500 });
      }
    }
  } else if (choice.name === TOOL_ASK) {
    kind = 'question';
    step({ tool: STEP.ask, label: doneLabel(STEP.ask, 'Needs one detail'), detail: 'asked rather than guessed' });
    const opts = Array.isArray(args.options)
      ? args.options.filter((o): o is string => typeof o === 'string').slice(0, 4)
      : [];
    question = { text: asString(args.question, 'Could you say a bit more?'), options: opts };
    reply = question.text;
  } else if (choice.name === TOOL_RULE) {
    const label = asString(args.label, 'New scheduling rule');
    // `constraints.kind` carries a CHECK constraint; an off-enum value from the
    // model would fail the insert, so it is validated here rather than trusted.
    const kindArg = asString(args.kind, 'work-hours');
    const ruleKind = RULE_KINDS.has(kindArg) ? kindArg : 'work-hours';

    const rule: Record<string, unknown> = {};
    if (typeof args.day === 'string' && WEEKDAY_CODES.has(args.day)) rule.day = args.day;
    if (typeof args.startHour === 'number') rule.start = clampInt(args.startHour, 0, 24, 9);
    if (typeof args.endHour === 'number') rule.end = clampInt(args.endHour, 0, 24, 18);
    if (typeof args.minutes === 'number') rule.minutes = clampInt(args.minutes, 0, 120, 10);

    try {
      // A rule the user stated in words is hard: they said it, so the scheduler
      // obeys it rather than trading it off against a score. Only *inferred*
      // preferences stay soft.
      const saved = await addRule(userId, { kind: ruleKind, rule, hard: true, label });
      savedRule = { id: saved.id, label: saved.label };
      step({ tool: STEP.saveRule, label: doneLabel(STEP.saveRule, 'Saved a rule'), detail: saved.label });
      reply = reply || `Saved — ${label}`;
    } catch (err) {
      // Never claim to have saved a rule that did not save; the user would go on
      // believing the agent is bound by it.
      console.error('ai/chat addRule', err);
      reply = "I couldn't save that rule just now — try telling me again in a moment.";
    }
  } else if (choice.name === TOOL_TIME_OFF) {
    const title = asString(args.title, 'Away').slice(0, 120) || 'Away';
    const checked = checkTimeOff(args.startISO, args.endISO, nowISO);
    if (!checked.ok) {
      // Asked back rather than guessed around: a wrong stretch blocked quietly
      // is worse than one more question.
      reply = checked.reason;
    } else {
      // Fixed and manual: the user said it, so the scheduler treats it as busy
      // (it is not `flexible`) and it renders as an ordinary block they can
      // delete, not as an AI proposal.
      const created: string[] = [];
      try {
        for (const day of splitByDay(checked.span)) {
          const ev = await createEvent(userId, {
            title,
            start: day.startISO,
            end: day.endISO,
            category: 'other',
            // Its own kind (db/020), so planning can say "you're away" rather
            // than "something is booked".
            itemType: 'away',
            flexibility: 'fixed',
            origin: 'manual',
          });
          created.push(ev.id);
        }
        timeOff = { title, startISO: checked.span.startISO, endISO: checked.span.endISO, days: created.length };
        step({ tool: STEP.block, label: doneLabel(STEP.block, 'Blocked the time'), detail: `${created.length} day${created.length === 1 ? '' : 's'}` });
        reply = reply || `Blocked — ${title}.`;
      } catch (err) {
        console.error('ai/chat timeOff', err);
        // All or nothing: half a vacation on the calendar would read as the
        // whole one having been saved.
        await Promise.all(created.map((id) => deleteEvent(userId, id).catch(() => false)));
        reply = "I couldn't block that time just now, so nothing was added. Try telling me again in a moment.";
      }
    }
  } else if (choice.name === TOOL_DELETE && args.confirm === true) {
    // The ids come from this conversation's own stored draft, never from the
    // client, and deleteEvent is scoped to the user.
    const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : [];
    let n = 0;
    for (const id of ids) if (await deleteEvent(userId, id).catch(() => false)) n++;
    deleted = { count: n };
    step({ tool: TOOL_DELETE, label: 'Deleted blocks', detail: `${n} of ${ids.length}` });
    const s = n === 1 ? '' : 's';
    reply =
      n === ids.length
        ? `Deleted ${n} block${s}.`
        : n > 0
          ? `Deleted ${n} of ${ids.length} — the rest were already gone.`
          : 'Those blocks were already gone, so nothing was deleted.';
  } else if (choice.name === TOOL_DELETE) {
    const lo = typeof args.earliestISO === 'string' ? Date.parse(args.earliestISO) : now.getTime();
    const hi = typeof args.latestISO === 'string' ? Date.parse(args.latestISO) : Date.parse(horizonISO);
    const match = asString(args.match).toLowerCase();
    const hits = events.filter(
      (e) =>
        Date.parse(e.start) < hi &&
        Date.parse(e.end) > Math.max(lo, now.getTime()) &&
        (!match || e.title.toLowerCase().includes(match)),
    );
    // Google's events come back on the next sync, so only Find Time's own blocks are offered.
    const own = hits.filter((e) => e.origin !== IMPORTED_ORIGIN);
    const fromGoogle = hits.length - own.length;
    const what = match ? `"${match}"` : 'blocks';
    const googleNote = fromGoogle
      ? ` ${fromGoogle} more ${fromGoogle === 1 ? 'is' : 'are'} from Google Calendar — delete ${fromGoogle === 1 ? 'it' : 'them'} there, or the next sync brings ${fromGoogle === 1 ? 'it' : 'them'} back.`
      : '';
    step({ tool: TOOL_DELETE, label: 'Found matching blocks', detail: `${own.length} yours · ${fromGoogle} from Google` });
    if (own.length === 0) {
      reply = fromGoogle ? `Nothing of Find Time's to delete for ${what}.${googleNote}` : `I couldn't find any ${what} to delete in that time.`;
    } else {
      const when = (iso: string) => {
        const d = new Date(iso);
        return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${iso.slice(11, 16)}`;
      };
      const list = own
        .slice(0, 6)
        .map((e) => `${e.title} (${when(e.start)}${e.rrule ? ', repeating' : ''})`)
        .join(', ');
      const more = own.length > 6 ? ` and ${own.length - 6} more` : '';
      kind = 'question';
      question = {
        text: `Delete ${own.length} block${own.length === 1 ? '' : 's'}: ${list}${more}?${googleNote}`,
        options: ['Delete them', 'Keep them'],
      };
      reply = question.text;
      pendingDeleteIds = own.map((e) => e.id);
    }
  } else if (choice.name === TOOL_ADD_TASK) {
    const title = asString(args.title, '').slice(0, 120);
    const durationMin = clampInt(args.durationMin, 15, 40 * 60, 60);
    const dueByISO = typeof args.dueByISO === 'string' && Number.isFinite(Date.parse(args.dueByISO)) ? args.dueByISO : null;
    const notBefore = typeof args.notBeforeISO === 'string' && Number.isFinite(Date.parse(args.notBeforeISO)) ? args.notBeforeISO : null;
    const priority = (['low', 'medium', 'high'] as const).find((p) => p === args.priority) ?? 'medium';
    const preferredWindow = (['morning', 'afternoon', 'evening'] as const).find((w) => w === args.preferredWindow) ?? null;
    const categoryArg = asString(args.category, 'deep-work');
    try {
      const t = await createTask(userId, {
        title,
        durationMin,
        dueBy: dueByISO,
        notBefore,
        priority,
        effort: args.effort === 'hard' || args.effort === 'light' ? args.effort : 'normal',
        preferredWindow,
        splittable: args.splittable === true,
        category: (CATEGORIES as readonly string[]).includes(categoryArg) ? categoryArg : 'deep-work',
      });
      step({ tool: TOOL_ADD_TASK, label: doneLabel(TOOL_ADD_TASK, 'Added a task'), detail: choice.summary });
      const due = t.dueBy ? `, due ${dueLabel(t.dueBy)}` : '';
      const from = t.notBefore ? `, not before ${startLabel(Date.parse(t.notBefore))}` : '';
      reply = `Added "${t.title}" — ${hoursText(t.durationMin)}${due}${from}. Say "plan my week" when you want it on the calendar.`;
    } catch (err) {
      console.error('ai/chat addTask', err);
      reply = "I couldn't save that task just now, so nothing was added. Try again in a moment.";
    }
  } else if (choice.name === TOOL_LIST_TASKS) {
    step({ tool: TOOL_LIST_TASKS, label: doneLabel(TOOL_LIST_TASKS, 'Your tasks'), detail: `${openTasks.length} open · ${habits.length} habit${habits.length === 1 ? '' : 's'}` });
    const habitLines = habits.length
      ? `\n\nHabits:\n${habits.map((h) => `• ${h.title} — ${habitText(h)}`).join('\n')}`
      : '';
    if (!openTasks.length) {
      reply = `No open tasks. Add one with "Add task: write the report, 3h, due Friday".${habitLines}`;
    } else {
      const lines = openTasks.slice(0, 10).map((t) => {
        const bits = [
          hoursText(t.durationMin),
          t.dueBy ? `due ${dueLabel(t.dueBy)}` : '',
          t.notBefore && Date.parse(t.notBefore) > now.getTime() ? `not before ${startLabel(Date.parse(t.notBefore))}` : '',
          t.priority !== 'medium' ? `${t.priority} priority` : '',
          t.effort !== 'normal' ? t.effort : '',
        ]
          .filter(Boolean)
          .join(', ');
        return `• ${t.title} — ${bits}`;
      });
      const more = openTasks.length > 10 ? `\n…and ${openTasks.length - 10} more.` : '';
      reply = `${openTasks.length} open task${openTasks.length === 1 ? '' : 's'}:\n${lines.join('\n')}${more}${habitLines}`;
    }
  } else if (choice.name === TOOL_TASK_DONE || choice.name === TOOL_TASK_UPDATE) {
    const match = asString(args.match, '');
    const found = match ? await findOpenTasks(userId, match).catch(() => []) : [];
    const t = found[0];
    if (!t) {
      reply = `I can't find an open task called "${match}". Say "my tasks" to see them.`;
    } else if (choice.name === TOOL_TASK_DONE) {
      try {
        // Its future sessions are Find Time's own blocks: cleared, so finished work stops holding time.
        const { cleared: n } = await finishTask(userId, t, nowISO);
        if (n) deleted = { count: n };
        step({ tool: TOOL_TASK_DONE, label: doneLabel(TOOL_TASK_DONE, 'Finished a task'), detail: `${t.title} · ${n} future block${n === 1 ? '' : 's'} cleared` });
        reply = `Done — "${t.title}".${n ? ` Cleared ${n} upcoming session${n === 1 ? '' : 's'} from your calendar.` : ''}`;
      } catch (err) {
        console.error('ai/chat taskDone', err);
        reply = "I couldn't mark that done just now. Try again in a moment.";
      }
    } else {
      const patch: Parameters<typeof updateTask>[2] = {};
      if (typeof args.dueByISO === 'string' && Number.isFinite(Date.parse(args.dueByISO))) patch.dueBy = args.dueByISO;
      if (typeof args.durationMin === 'number') patch.durationMin = clampInt(args.durationMin, 15, 40 * 60, t.durationMin);
      if (args.splittable === true) patch.splittable = true;
      if (args.effort === 'hard' || args.effort === 'light') patch.effort = args.effort;
      try {
        const u = await updateTask(userId, t.id, patch);
        if (!u) throw new Error('no change');
        const what = [
          patch.dueBy ? `due ${dueLabel(patch.dueBy)}` : '',
          patch.durationMin ? hoursText(patch.durationMin) : '',
          patch.splittable ? 'can be split across days' : '',
          patch.effort ? `${patch.effort} — it counts ${patch.effort === 'hard' ? 'more' : 'less'} toward a full day` : '',
        ].filter(Boolean);
        step({ tool: TOOL_TASK_UPDATE, label: doneLabel(TOOL_TASK_UPDATE, 'Changed a task'), detail: `${u.title} · ${what.join(', ')}` });
        reply = `Updated "${u.title}": ${what.join(', ')}. Say "replan" to fit it in again.`;
      } catch (err) {
        console.error('ai/chat updateTask', err);
        reply = "I couldn't change that task just now. Try again in a moment.";
      }
    }
  } else if (choice.name === TOOL_POSTPONE) {
    const match = asString(args.match, '');
    const at = typeof args.notBeforeISO === 'string' && Number.isFinite(Date.parse(args.notBeforeISO)) ? args.notBeforeISO : null;
    const found = match ? await findOpenTasks(userId, match).catch(() => []) : [];
    const t = found[0];
    if (!t || !at) {
      reply = `I can't find an open task called "${match}". Say "my tasks" to see them.`;
    } else {
      try {
        // Its sessions before the new start come off now, like "done with", so
        // the calendar stops promising them.
        const { cleared: n } = await postponeTask(userId, t, at, nowISO);
        if (n) deleted = { count: n };
        const label = asString(args.label, startLabel(Date.parse(at)));
        step({ tool: TOOL_POSTPONE, label: doneLabel(TOOL_POSTPONE, 'Postponed a task'), detail: `${t.title} · not before ${label}${n ? ` · ${n} cleared` : ''}` });
        const late = t.dueBy && Date.parse(at) >= Date.parse(t.dueBy) ? ` That's after it's due (${dueLabel(t.dueBy)}) — move the due date too?` : '';
        reply = `Okay — "${t.title}" won't start before ${label}.${n ? ` Took ${n} earlier session${n === 1 ? '' : 's'} off your calendar.` : ''}${late} Say "replan" to fit it in again.`;
      } catch (err) {
        console.error('ai/chat postpone', err);
        reply = "I couldn't postpone that just now. Try again in a moment.";
      }
    }
  } else if (choice.name === TOOL_ADD_HABIT) {
    const title = asString(args.title, '').slice(0, 120);
    const perWeek = clampInt(args.perWeek, 1, 7, 3);
    const minPerWeek = typeof args.minPerWeek === 'number' ? clampInt(args.minPerWeek, 1, perWeek, perWeek) : null;
    const durationMin = clampInt(args.durationMin, 5, 480, 60);
    const preferredWindow = (['morning', 'afternoon', 'evening'] as const).find((w) => w === args.preferredWindow) ?? null;
    const categoryArg = asString(args.category, 'personal');
    try {
      const h = await createHabit(userId, {
        title,
        perWeek,
        minPerWeek: minPerWeek && minPerWeek < perWeek ? minPerWeek : null,
        durationMin,
        preferredWindow,
        category: (CATEGORIES as readonly string[]).includes(categoryArg) ? categoryArg : 'personal',
      });
      step({ tool: TOOL_ADD_HABIT, label: doneLabel(TOOL_ADD_HABIT, 'Added a habit'), detail: choice.summary });
      reply = `Added "${h.title}" — ${habitText(h)}. Say "plan my week" to put this week's sessions on the calendar.`;
    } catch (err) {
      console.error('ai/chat addHabit', err);
      reply = "I couldn't save that habit just now, so nothing was added. Try again in a moment.";
    }
  } else if (choice.name === TOOL_HABIT_UPDATE) {
    const match = asString(args.match, '');
    const h = match ? (await findHabits(userId, match).catch(() => []))[0] : undefined;
    if (!h) {
      reply = `I can't find a habit called "${match}". Say "my habits" to see them.`;
    } else if (args.stop === true) {
      try {
        const { cleared: n } = await stopHabit(userId, h, nowISO);
        if (n) deleted = { count: n };
        step({ tool: TOOL_HABIT_UPDATE, label: 'Stopped a habit', detail: `${h.title} · ${n} upcoming cleared` });
        reply = `Stopped "${h.title}".${n ? ` Cleared ${n} upcoming session${n === 1 ? '' : 's'}.` : ''}`;
      } catch (err) {
        console.error('ai/chat stopHabit', err);
        reply = "I couldn't stop that habit just now. Try again in a moment.";
      }
    } else {
      const patch: Parameters<typeof updateHabit>[2] = {};
      if (typeof args.perWeek === 'number') {
        patch.perWeek = clampInt(args.perWeek, 1, 7, h.perWeek);
        const min = typeof args.minPerWeek === 'number' ? clampInt(args.minPerWeek, 1, patch.perWeek, patch.perWeek) : null;
        patch.minPerWeek = min && min < patch.perWeek ? min : null;
      }
      if (typeof args.durationMin === 'number') patch.durationMin = clampInt(args.durationMin, 5, 480, h.durationMin);
      try {
        const u = await updateHabit(userId, h.id, patch);
        if (!u) throw new Error('no change');
        step({ tool: TOOL_HABIT_UPDATE, label: doneLabel(TOOL_HABIT_UPDATE, 'Changed a habit'), detail: `${u.title} · ${habitText(u)}` });
        reply = `Updated "${u.title}": ${habitText(u)}. Say "replan" to fit it in again.`;
      } catch (err) {
        console.error('ai/chat updateHabit', err);
        reply = "I couldn't change that habit just now. Try again in a moment.";
      }
    }
  } else if (choice.name === TOOL_PLAN_SETTINGS) {
    const hardWork = args.hardWork === 'cluster' || args.hardWork === 'spread' ? args.hardWork : undefined;
    const dailyBudgetMin = typeof args.dailyBudgetMin === 'number' ? clampInt(args.dailyBudgetMin, 60, 12 * 60, 240) : undefined;
    try {
      await savePlanSettings(userId, { hardWork, dailyBudgetMin });
      step({ tool: TOOL_PLAN_SETTINGS, label: doneLabel(TOOL_PLAN_SETTINGS, 'Planning settings'), detail: choice.summary });
      const bits = [
        hardWork === 'cluster' ? "I'll keep hard tasks together on the same days" : '',
        hardWork === 'spread' ? "I'll spread hard tasks across the week" : '',
        dailyBudgetMin ? `I'll keep demanding work under ${hoursText(dailyBudgetMin)} a day where the deadlines allow` : '',
      ].filter(Boolean);
      reply = `Got it — ${bits.join(', and ')}. Say "replan" to apply it.`;
    } catch (err) {
      console.error('ai/chat planSettings', err);
      reply = "I couldn't save that just now. Try again in a moment.";
    }
  } else if (choice.name === TOOL_TRAVEL) {
    const minutes = clampInt(args.minutes, 0, 180, 0);
    try {
      await saveTravelMin(userId, minutes);
      step({ tool: TOOL_TRAVEL, label: doneLabel(TOOL_TRAVEL, 'Travel time'), detail: minutes ? `${hoursText(minutes)} each way` : 'off' });
      reply = minutes
        ? `Got it — I'll keep ${hoursText(minutes)} free before and after anything with an address when I plan your week. Video calls don't count.`
        : "Okay — no travel time. In-person meetings get no extra room when I plan.";
    } catch (err) {
      console.error('ai/chat travel', err);
      reply = "I couldn't save that just now. Try again in a moment.";
    }
  } else if (choice.name === TOOL_PLAN_WEEK) {
    if (!openTasks.length && !habits.length) {
      reply = 'There are no open tasks or habits to plan. Add one with "Add task: write the report, 3h, due Friday" or "Habit: gym 3x a week, 1h".';
    } else {
      begin(STEP.rank);
      const planT0 = Date.now();
      let planEvents: Awaited<ReturnType<typeof listEvents>>;
      try {
        // A deadline can sit further out than the chat's usual horizon; a
        // habit's week can have started before today.
        const weekStart = iso(new Date(Math.min(...habitWeeks(now.getTime()), now.getTime())));
        planEvents = await listEvents(userId, weekStart, iso(new Date(now.getTime() + MAX_HORIZON_DAYS * 86_400_000)));
      } catch (err) {
        console.error('ai/chat planWeek events', err);
        return Response.json({ sessionId, error: 'Could not read your calendar.' }, { status: 500 });
      }
      const taskIds = new Set(openTasks.map((t) => t.id));
      const habitIds = new Set(habits.map((h) => h.id));
      const ownBlock = (e: (typeof planEvents)[number]) =>
        Boolean((e.taskId && taskIds.has(e.taskId)) || (e.habitId && habitIds.has(e.habitId)));
      const isAway = (e: (typeof planEvents)[number]) => e.itemType === 'away' || (e.allDay === true && blocksTime(e));
      // The plan doesn't move other blocks, so flexible ones count as busy here;
      // free, declined and all-day ones still don't (blocksTime).
      const others = planEvents.filter((e) => !ownBlock(e) && !isAway(e) && blocksTime({ ...e, flexibility: undefined }));
      const input: PlanInput = {
        nowISO,
        profile,
        tasks: openTasks.map(toPlanTask),
        habits: habits.map((h) => ({
          ...h,
          minPerWeek: h.minPerWeek,
          category: (CATEGORIES as readonly string[]).includes(h.category) ? h.category : 'personal',
        })),
        busy: [
          ...others.map((e) => ({ start: e.start, end: e.end })),
          // Travel either side of in-person events (off unless the user set it).
          ...travelPadding(others, profile.travelMin),
        ],
        away: planEvents.filter((e) => !ownBlock(e) && isAway(e)).map((e) => ({ start: e.start, end: e.end })),
        existing: planEvents.filter(ownBlock).map((e) => ({
          eventId: e.id,
          ...(e.taskId && taskIds.has(e.taskId) ? { taskId: e.taskId } : { habitId: e.habitId! }),
          startISO: e.start,
          endISO: e.end,
          // Fixed by the user, or moved there by hand (events-repo pins on move).
          pinned: e.flexibility !== 'flexible',
        })),
      };
      const plan = planWeek(input);
      const problems = verifyPlan(input, plan);
      const added = plan.blocks.filter((b) => b.status === 'new');
      const kept = plan.blocks.length - added.length;
      const what = [
        openTasks.length && `${openTasks.length} task${openTasks.length === 1 ? '' : 's'}`,
        habits.length && `${habits.length} habit${habits.length === 1 ? '' : 's'}`,
      ].filter(Boolean).join(' · ');
      step({
        tool: STEP.rank,
        label: doneLabel(TOOL_PLAN_WEEK, 'Planned your week'),
        detail: `${what} · ${added.length} new · ${kept} kept · ${plan.unplaced.length} don't fit`,
        ms: Date.now() - planT0,
      });

      if (problems.length) {
        // Never show a plan that fails its own check: a double-book or a missed
        // deadline offered with confidence is worse than no plan.
        console.error('ai/chat planWeek verify', problems);
        reply = "I couldn't build a plan that passes my own checks, so I haven't proposed anything. Try again, or tell me which task matters most.";
      } else {
        if (added.length) {
          try {
            const stored = await saveProposals(
              userId,
              sessionId,
              { startISO: nowISO, endISO: added[added.length - 1].endISO },
              added.map((b) => ({
                title: b.title,
                category: b.category,
                startISO: b.startISO,
                endISO: b.endISO,
                score: b.score,
                features: b.features ?? ZERO_FEATURES,
                reason: b.reason,
                alternatives: [],
                ...(b.taskId ? { taskId: b.taskId } : {}),
                ...(b.habitId ? { habitId: b.habitId } : {}),
                ...(b.replacesEventId ? { replacesEventId: b.replacesEventId } : {}),
              })),
            );
            kind = 'plan';
            proposals = stored.map((p) => ({
              id: p.id,
              title: p.title,
              startISO: p.startISO,
              endISO: p.endISO,
              category: p.category,
              reason: p.reason,
              alternatives: [],
              ...(p.taskId ? { taskId: p.taskId } : {}),
              ...(p.habitId ? { habitId: p.habitId } : {}),
            }));
          } catch (err) {
            console.error('ai/chat planWeek save', err);
            return Response.json({ sessionId, error: 'Could not save that plan. Try again.' }, { status: 500 });
          }
        }
        const taskSessions = added.filter((b) => b.taskId);
        const habitSessions = added.filter((b) => b.habitId);
        const placedTasks = new Set(taskSessions.map((b) => b.taskId)).size;
        const lines: string[] = [];
        if (added.length) {
          const parts = [
            taskSessions.length && `${taskSessions.length} session${taskSessions.length === 1 ? '' : 's'} for ${placedTasks} task${placedTasks === 1 ? '' : 's'}, most urgent first`,
            habitSessions.length && `${habitSessions.length} habit session${habitSessions.length === 1 ? '' : 's'}`,
          ].filter(Boolean);
          lines.push(`Here's the plan: ${parts.join(', and ')}.`);
        } else if (!plan.unplaced.length) {
          lines.push('Everything already has its time — nothing needs to change.');
        }
        if (kept && added.length) lines.push(`${kept} session${kept === 1 ? '' : 's'} already on your calendar stay where ${kept === 1 ? 'it is' : 'they are'}.`);
        if (plan.moved.length) {
          lines.push(
            `${plan.moved.length} existing session${plan.moved.length === 1 ? ' has' : 's have'} to move (${plan.moved[0].why}) — adding the new time replaces the old one.`,
          );
        }
        if (profile.travelMin > 0 && input.busy.length > others.length) {
          lines.push(`I kept ${hoursText(profile.travelMin)} free either side of in-person meetings for travel.`);
        }
        const needed = plan.unplaced.filter((u) => !u.optional);
        const leftOut = plan.unplaced.filter((u) => u.optional);
        for (const u of needed.slice(0, 4)) {
          const tip = u.options[0] ? ` Try "${u.options[0]}".` : '';
          lines.push(`Couldn't fit ${u.title}: ${u.reason}.${tip}`);
        }
        if (needed.length > 4) lines.push(`…and ${needed.length - 4} more that don't fit.`);
        // Low priority, no deadline: said once, as a group — not as failures.
        if (leftOut.length) {
          lines.push(`Left out for now (low priority, no deadline): ${leftOut.map((u) => u.title).join(', ')}.`);
        }
        for (const n of plan.notes.slice(0, 3)) lines.push(n);
        reply = lines.join('\n');
      }
    }
  } else if (choice.name === TOOL_ANSWER) {
    reply = reply || "I'm not sure how to help with that one.";
  }

  const extras: Partial<ChatMessage> = {};
  if (proposals) extras.proposals = proposals;
  if (question) extras.question = question;
  if (savedRule) extras.savedRule = savedRule;
  if (timeOff) extras.timeOff = timeOff;
  if (deleted) extras.deleted = deleted;
  extras.trace = trace;

  // Stored with the reply, never sent: what the next turn continues from.
  const draft: Draft | null = choice.draft && {
    ...choice.draft,
    placed: kind === 'plan',
    ...(pendingDeleteIds ? { deleteIds: pendingDeleteIds } : {}),
    ...(proposals?.length ? { lastStartISO: proposals[0].startISO } : {}),
  };

  const messageId = await appendMessage(sessionId, {
    role: 'assistant',
    content: reply,
    kind,
    parsed: { ...extras, ...(draft ? { draft } : {}) },
  });
  // So a reported reply leads back to the turn behind it.
  await linkTurnMessage(turnId, messageId);

  const message: ChatMessage = {
    id: messageId,
    role: 'assistant',
    text: reply,
    createdAt: nowISO,
    ...extras,
  };

  return Response.json({ sessionId, message } satisfies ChatResponse);
}
