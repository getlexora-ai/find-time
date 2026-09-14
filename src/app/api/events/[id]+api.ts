import { IMPORTED_LOCKED_MESSAGE, isImported, lockedFields } from '@/lib/synced-fields';
import { requireUserId, unauthorized } from '@/server/auth/clerk';
import { isConfigured } from '@/server/db';
import { deleteEvent, getEventOrigin, updateEvent, type EventInput } from '@/server/events-repo';

/*
 * Imported events are pull-only (src/server/google/sync.ts). Google owns their
 * title, times, notes and existence: nothing is pushed to Google, and whenever
 * Google sends an event again — it changed there, or a full re-sync ran — sync
 * overwrites local changes to those fields and brings a deleted event back. Both handlers
 * refuse such writes with 409 rather than accept an edit that goes nowhere and
 * later reverts. The calendar hides these controls too; this is for every other
 * client, and for the calendar when it is wrong.
 */

function guard(): Response | null {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  return null;
}

export async function PATCH(request: Request, { id }: Record<string, string>): Promise<Response> {
  const blocked = guard();
  if (blocked) return blocked;
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  try {
    const patch = (await request.json()) as Partial<EventInput>;
    const origin = await getEventOrigin(userId, id);
    if (!origin) return Response.json({ error: 'Not found.' }, { status: 404 });
    const locked = lockedFields(origin, patch);
    if (locked.length) {
      return Response.json({ error: IMPORTED_LOCKED_MESSAGE, locked }, { status: 409 });
    }
    const event = await updateEvent(userId, id, patch);
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
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  try {
    const origin = await getEventOrigin(userId, id);
    if (!origin) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (isImported(origin)) {
      return Response.json({ error: IMPORTED_LOCKED_MESSAGE }, { status: 409 });
    }
    const ok = await deleteEvent(userId, id);
    if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/events/[id]', err);
    return Response.json({ error: 'Failed to delete event.' }, { status: 500 });
  }
}
