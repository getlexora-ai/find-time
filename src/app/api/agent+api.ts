import type { AgentEvent, AgentRequest } from '@/lib/agent-types';
import { agentConfigured, runTurn } from '@/server/agent/loop';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/agent — one turn of Plan with AI v2 (src/server/agent/loop.ts).
 *
 * The reply is a stream of NDJSON lines (src/lib/agent-types.ts AgentEvent):
 * text as it is written, each tool as it runs, then a question or the changes
 * waiting for Approve, and finally `done` with the transcript to send back.
 */

const isZone = (tz: unknown) => {
  try {
    return typeof tz === 'string' && Boolean(new Intl.DateTimeFormat('en', { timeZone: tz }));
  } catch {
    return false;
  }
};
const isStringMap = (o: unknown) =>
  o === undefined || (typeof o === 'object' && o !== null && Object.values(o).every((v) => typeof v === 'string'));
const isBoolMap = (o: unknown) =>
  o === undefined || (typeof o === 'object' && o !== null && Object.values(o).every((v) => typeof v === 'boolean'));

export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  if (!agentConfigured()) return Response.json({ error: 'Plan with AI is not set up (OPENAI_API_KEY missing).' }, { status: 503 });
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'ai-chat', { kind: 'user', userId });
  if (limited) return limited;

  let body: AgentRequest;
  try {
    body = (await request.json()) as AgentRequest;
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }
  if (
    !Array.isArray(body.items) ||
    !isZone(body.timeZone) ||
    (body.message !== undefined && typeof body.message !== 'string') ||
    !isBoolMap(body.approvals) ||
    !isStringMap(body.answers)
  ) {
    return Response.json({ error: 'Need items[], a valid timeZone, and a message, approvals or answers.' }, { status: 400 });
  }

  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        await runTurn(userId, body, emit);
      } catch (err) {
        console.error('POST /api/agent', err);
        emit({ type: 'error', message: err instanceof Error ? err.message : 'Something went wrong.' });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store', 'x-accel-buffering': 'no' },
  });
}
