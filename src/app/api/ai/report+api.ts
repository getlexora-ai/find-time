import type { ReportResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { parseReport, recordCorrection, reportExists, turnForMessage } from '@/server/ai/capture';
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
 * A report changes nothing about the agent on its own. It lands in
 * `ai_corrections` as `source = 'report'`, unreviewed, pointing at the model
 * turn that produced the reply — and a human decides whether it was the
 * agent's fault before it feeds anything (docs/training-capture.md §5). The
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

  // A second tap is not a second data point.
  if (await reportExists(userId, message.id)) {
    return Response.json({ ok: true } satisfies ReportResponse);
  }

  const saved = await recordCorrection({
    userId,
    turnId: await turnForMessage(message.id),
    source: 'report',
    kind: report.reason,
    reasonCode: report.reason,
    reasonNote: report.note,
    before: { sessionId: message.sessionId, messageId: message.id, messageKind: message.kind },
  });

  // Capture writers swallow their errors, which is right for telemetry but not
  // for something the user explicitly sent: never say "reported" when it wasn't.
  if (!saved) {
    return Response.json({ error: "Couldn't send that report. Try again in a moment." }, { status: 503 });
  }
  return Response.json({ ok: true } satisfies ReportResponse);
}
