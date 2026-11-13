import type { SessionsResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/user';
import { deleteSession, listSessions, renameSession } from '@/server/ai/repo';
import { isConfigured } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * Plan with AI chat history.
 *   GET    /api/ai/sessions             — your chats, newest first
 *   PATCH  /api/ai/sessions {id, title} — rename one
 *   DELETE /api/ai/sessions?id=…        — delete one and its messages
 *
 * Every query is scoped to the signed-in user; someone else's id is a 404,
 * never a 403, so ids can't be probed.
 */

const noDb = () => Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
const notFound = () => Response.json({ error: 'Chat not found.' }, { status: 404 });

export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) return noDb();
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  try {
    const sessions = await listSessions(userId);
    return Response.json({ sessions } satisfies SessionsResponse, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    console.error('ai/sessions list', err);
    return Response.json({ error: 'Could not load your chats.' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isConfigured()) return noDb();
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'ai-sessions', { kind: 'user', userId });
  if (limited) return limited;

  let body: { id?: unknown; title?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const id = typeof body.id === 'string' ? body.id : '';
  const title = typeof body.title === 'string' ? body.title.replace(/\s+/g, ' ').trim() : '';
  if (!id || !title || title.length > 120) {
    return Response.json({ error: 'A chat id and a title of 1–120 characters are required.' }, { status: 400 });
  }
  try {
    return (await renameSession(userId, id, title)) ? Response.json({ ok: true }) : notFound();
  } catch (err) {
    console.error('ai/sessions rename', err);
    return Response.json({ error: 'Could not rename that chat.' }, { status: 500 });
  }
}

export async function DELETE(request: Request): Promise<Response> {
  if (!isConfigured()) return noDb();
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'ai-sessions', { kind: 'user', userId });
  if (limited) return limited;

  const id = new URL(request.url).searchParams.get('id');
  if (!id) return Response.json({ error: 'A chat id is required.' }, { status: 400 });
  try {
    return (await deleteSession(userId, id)) ? Response.json({ ok: true }) : notFound();
  } catch (err) {
    console.error('ai/sessions delete', err);
    return Response.json({ error: 'Could not delete that chat.' }, { status: 500 });
  }
}
