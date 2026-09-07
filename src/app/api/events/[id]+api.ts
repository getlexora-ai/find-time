import { isConfigured } from '@/server/db';
import { currentUserId } from '@/server/auth/session';
import { deleteEvent, updateEvent, type EventInput } from '@/server/events-repo';

function guard(): Response | null {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  return null;
}

export async function PATCH(request: Request, { id }: Record<string, string>): Promise<Response> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const patch = (await request.json()) as Partial<EventInput>;
    const event = await updateEvent(currentUserId(request), id, patch);
    if (!event) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json({ event });
  } catch (err) {
    console.error('PATCH /api/events/[id]', err);
    return Response.json({ error: 'Failed to update event.' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { id }: Record<string, string>): Promise<Response> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const ok = await deleteEvent(currentUserId(request), id);
    if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/events/[id]', err);
    return Response.json({ error: 'Failed to delete event.' }, { status: 500 });
  }
}
