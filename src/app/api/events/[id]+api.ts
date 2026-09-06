import { isConfigured } from '@/server/db';
import { deleteEvent, updateEvent, type EventInput } from '@/server/events-repo';

// TODO(auth): replace with the real session user once auth lands.
const USER_ID = 'u1';

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
    const event = await updateEvent(USER_ID, id, patch);
    if (!event) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json({ event });
  } catch (err) {
    console.error('PATCH /api/events/[id]', err);
    return Response.json({ error: 'Failed to update event.' }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { id }: Record<string, string>): Promise<Response> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const ok = await deleteEvent(USER_ID, id);
    if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/events/[id]', err);
    return Response.json({ error: 'Failed to delete event.' }, { status: 500 });
  }
}
