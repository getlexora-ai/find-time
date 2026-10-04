import type { ReportReason, ReportResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/user';
import { getOwnedMessage } from '@/server/ai/repo';
import { isConfigured } from '@/server/db';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/ai/report — the user flags an agent reply as wrong.
 *
 * Proposal cards already report their own outcome (/api/ai/feedback). This is
 * for everything else a turn can get wrong: misreading the request, ignoring a
 * rule the user stated, asserting something false about their calendar, or
 * just not helping.
 *
 * A report changes nothing about the agent on its own. It goes to the server
 * log (Railway), not a database table. The
 * immediate way to correct the agent is still to tell it in the thread.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  const limited = await enforceRateLimit(request, 'ai-report', { kind: 'user', userId });
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const report = parseReport(body);
  if (!report) {
    return Response.json({ error: 'messageId and a valid reason are required.' }, { status: 400 });
  }

  // Ownership, not just existence: a message id from someone else's thread is
  // indistinguishable from a made-up one.
  const message = await getOwnedMessage(userId, report.messageId);
  if (!message || message.role !== 'assistant') {
    return Response.json({ error: 'Unknown message.' }, { status: 404 });
  }

  console.warn(
    '[ai-report]',
    JSON.stringify({ messageId: message.id, kind: message.kind, reason: report.reason, note: report.note }),
  );
  return Response.json({ ok: true } satisfies ReportResponse);
}

const REASONS: readonly ReportReason[] = ['misunderstood', 'ignored-rule', 'wrong-info', 'unhelpful', 'inappropriate', 'other'];

/** A message id plus a known reason, or null (→ 400). The note is collapsed and capped. */
function parseReport(body: unknown): { messageId: string; reason: ReportReason; note: string | null } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const messageId = typeof b.messageId === 'string' ? b.messageId.trim() : '';
  if (!messageId.startsWith('msg_') || messageId.length > 80) return null;
  const reason = REASONS.find((r) => r === b.reason);
  if (!reason) return null;
  const note = typeof b.note === 'string' ? b.note.replace(/\s+/g, ' ').trim() : '';
  return { messageId, reason, note: note ? note.slice(0, 120) : null };
}
