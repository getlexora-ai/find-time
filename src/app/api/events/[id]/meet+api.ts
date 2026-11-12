import type { MeetResponse } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/user';
import { isConfigured } from '@/server/db';
import { createMeet } from '@/server/google/push';
import { enforceRateLimit } from '@/server/rate-limit';

/**
 * POST /api/events/:id/meet — attach a Google Meet link to one of your blocks.
 * The block's Google copy is made (write-back) and Google creates the Meet on
 * it; see google/push.ts createMeet. Your own blocks only, never Google's.
 */
export async function POST(request: Request, { id }: Record<string, string>): Promise<Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'meet', { kind: 'user', userId });
  if (limited) return limited;
  try {
    const out = await createMeet(userId, id);
    if (out.ok) return Response.json({ url: out.url } satisfies MeetResponse);
    return Response.json({ error: out.error, code: out.code } satisfies MeetResponse, { status: out.status });
  } catch (err) {
    console.error('POST /api/events/[id]/meet', err);
    return Response.json({ error: "Couldn't create a Meet link. Try again." } satisfies MeetResponse, { status: 500 });
  }
}
