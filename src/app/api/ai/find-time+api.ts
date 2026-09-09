import type { FindTimeProposal, FindTimeResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { aiConfigured, extractWithTool } from '@/server/ai/anthropic';
import { findFreeSlots } from '@/server/ai/find-time';
import { isConfigured } from '@/server/db';
import { listEvents } from '@/server/events-repo';

/**
 * POST /api/ai/find-time — { prompt: string }.
 *
 * Claude parses the sentence into bounds + preferences (never specific slots);
 * `findFreeSlots` does the placement against the user's real calendar, so the
 * model cannot propose a double-book. Returns `FindTimeResponse`; the client
 * (AiPanel) shows the proposals and creates them via POST /api/events on Apply.
 */

const HORIZON_DAYS = 21;
const CATS = ['deep-work', 'design', 'research', 'meeting', 'admin'] as const;

const INTENT_TOOL = {
  name: 'find_time_intent',
  description:
    "Structured form of the user's scheduling request, for a deterministic scheduler. " +
    'Give bounds and preferences only — never invent specific dates/times for the blocks.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: {
        type: 'string',
        description: 'Short calendar title for the block(s), e.g. "Deep work — onboarding spec". No quotes.',
      },
      category: { type: 'string', enum: [...CATS] },
      durationMin: { type: 'integer', minimum: 15, maximum: 480, description: 'Length of each block in minutes.' },
      count: { type: 'integer', minimum: 1, maximum: 5, description: 'How many separate blocks to place.' },
      earliestISO: {
        type: 'string',
        description: 'Earliest UTC datetime a block may start, ISO 8601. Use "now" if the user gave no lower bound.',
      },
      latestISO: {
        type: 'string',
        description: 'Latest UTC datetime a block may end, ISO 8601. Default: 14 days after "now". Never beyond 21 days.',
      },
      dayStartHour: {
        type: 'integer',
        minimum: 0,
        maximum: 23,
        description: 'Earliest hour of day for a block (24h UTC). Default 9. "mornings" → 8, "afternoon" → 12, "evening" → 17.',
      },
      dayEndHour: {
        type: 'integer',
        minimum: 1,
        maximum: 24,
        description: 'Latest hour of day a block may end (24h UTC). Default 18. "mornings" → 12, "evening" → 21.',
      },
      rationale: {
        type: 'string',
        description: 'One sentence, first person ("I placed…"), explaining the choice for the user.',
      },
    },
    required: [
      'title',
      'category',
      'durationMin',
      'count',
      'earliestISO',
      'latestISO',
      'dayStartHour',
      'dayEndHour',
      'rationale',
    ],
  },
} as const;

const clamp = (n: unknown, lo: number, hi: number, dflt: number) => {
  const x = typeof n === 'number' && Number.isFinite(n) ? n : dflt;
  return Math.min(hi, Math.max(lo, Math.round(x)));
};
const laterOf = (a: string, b: string) => (Date.parse(a) > Date.parse(b) ? a : b);

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  if (!aiConfigured()) {
    return Response.json({ error: 'AI is not configured (ANTHROPIC_API_KEY missing).' }, { status: 503 });
  }

  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  let prompt = '';
  try {
    prompt = String(((await request.json()) as { prompt?: unknown }).prompt ?? '').trim();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  if (prompt.length < 3) {
    return Response.json({ error: 'Tell Find time what to make room for.' }, { status: 400 });
  }
  prompt = prompt.slice(0, 500);

  const now = new Date();
  const nowISO = now.toISOString().replace(/\.\d{3}Z$/, '.000Z');
  const horizonISO = new Date(now.getTime() + HORIZON_DAYS * 86_400_000)
    .toISOString()
    .replace(/\.\d{3}Z$/, '.000Z');

  let events;
  try {
    events = await listEvents(userId, nowISO, horizonISO);
  } catch (err) {
    console.error('find-time listEvents', err);
    return Response.json({ error: 'Could not read your calendar.' }, { status: 500 });
  }
  // Flexible blocks may be scheduled over; everything else is a hard conflict.
  const busy = events
    .filter((e) => e.flexibility !== 'flexible')
    .map((e) => ({ start: e.start, end: e.end, title: e.title }));

  let raw: Record<string, unknown>;
  try {
    raw = await extractWithTool({
      system:
        'You turn a scheduling request into structured intent for a deterministic placer. ' +
        `"now" is ${nowISO} (UTC — treat every time as UTC wall-clock). ` +
        'Only produce bounds and preferences; the placer picks the actual slots. Keep the title concise.',
      user:
        `Request: ${prompt}\n\n` +
        `Busy blocks in the next ${HORIZON_DAYS} days (do not schedule over these):\n` +
        (busy.length
          ? busy.map((b) => `- ${b.start} → ${b.end}  ${b.title}`).join('\n')
          : '(nothing scheduled)'),
      tool: INTENT_TOOL as unknown as {
        name: string;
        description: string;
        input_schema: Record<string, unknown>;
      },
    });
  } catch (err) {
    console.error('find-time extract', err);
    return Response.json(
      { error: 'Find time could not read that request. Try rephrasing.' },
      { status: 502 },
    );
  }

  const durationMin = clamp(raw.durationMin, 15, 480, 60);
  const count = clamp(raw.count, 1, 5, 1);
  const category = CATS.includes(raw.category as (typeof CATS)[number])
    ? (raw.category as string)
    : 'deep-work';
  const title = (typeof raw.title === 'string' && raw.title.trim()) || 'Focus block';
  const earliestISO = laterOf(
    typeof raw.earliestISO === 'string' && Number.isFinite(Date.parse(raw.earliestISO))
      ? raw.earliestISO
      : nowISO,
    nowISO,
  );
  // Model's latest, but never past our 21-day horizon and always after earliest.
  const modelLatest =
    typeof raw.latestISO === 'string' && Number.isFinite(Date.parse(raw.latestISO))
      ? raw.latestISO
      : horizonISO;
  let latestISO = Date.parse(modelLatest) > Date.parse(horizonISO) ? horizonISO : modelLatest;
  if (Date.parse(latestISO) <= Date.parse(earliestISO)) latestISO = horizonISO;

  const slots = findFreeSlots(busy, {
    durationMin,
    count,
    earliestISO,
    latestISO,
    dayStartHour: clamp(raw.dayStartHour, 0, 23, 9),
    dayEndHour: clamp(raw.dayEndHour, 1, 24, 18),
    bufferMin: 10,
  });

  const proposals: FindTimeProposal[] = slots.map((s) => ({
    title,
    startISO: s.startISO,
    endISO: s.endISO,
    category,
  }));

  const rationale =
    proposals.length > 0
      ? (typeof raw.rationale === 'string' && raw.rationale) || `Placed ${proposals.length} block${proposals.length > 1 ? 's' : ''} around your existing events.`
      : `No free ${durationMin}-minute slot before ${latestISO.slice(0, 10)}. Try a shorter block or a wider window.`;

  const payload: FindTimeResponse = { proposals, rationale, requested: count };
  return Response.json(payload);
}
