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
  sessionExists,
  addRule,
} from '@/server/ai/repo';
import { isConfigured } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';
import { checkTimeOff, splitByDay } from '@/server/ai/time-off';
import { createEvent, deleteEvent, listEvents } from '@/server/events-repo';
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
  begin(STEP.read);
  try {
    [profile, history, events] = await Promise.all([
      loadProfile(userId),
      listMessages(sessionId, MAX_TURNS),
      listEvents(userId, nowISO, horizonISO),
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
            itemType: 'event',
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
