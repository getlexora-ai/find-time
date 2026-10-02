import type { ChatHistoryResponse, ChatMessage, ChatResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { listMessages, sessionExists } from '@/server/ai/repo';
import { MAX_TURNS, runTurn, type Emit } from '@/server/ai/turn';
import { isConfigured } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/ai/chat — one turn of a conversation with the scheduling agent.
 * GET  /api/ai/chat?sessionId=… — rehydrate an open conversation.
 *
 * Auth, rate limit and body parsing live here; the turn itself is
 * src/server/ai/turn.ts.
 */

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

  const stored = await listMessages(sessionId, MAX_TURNS * 2);
  const messages: ChatMessage[] = stored.map((m) => {
    // The draft is the planner's working state, not part of the reply.
    const { draft: _draft, ...parsed } = (m.parsed ?? {}) as Partial<ChatMessage> & { draft?: unknown };
    return {
      id: m.id,
      role: m.role,
      text: m.content,
      createdAt: m.createdAt,
      ...parsed,
    };
  });
  return Response.json({ sessionId, messages } satisfies ChatHistoryResponse);
}

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

  return runTurn(userId, body, emit);
}
