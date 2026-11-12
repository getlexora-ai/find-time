import { IMPORTED_LOCKED_MESSAGE, canDelete, isImported, lockedFields } from '@/lib/synced-fields';
import { requireUserId, unauthorized } from '@/server/auth/user';
import { isConfigured } from '@/server/db';
import { deleteEvent, getEventMeta, updateEvent, type EventInput } from '@/server/events-repo';
import { deleteRemote, moveRemote } from '@/server/google/edit';
import { pushEvent, setCopyCalendar } from '@/server/google/push';

/*
 * Imported events are Google's. Sync overwrites their title, times and notes
 * and brings a deleted one back, so a local-only edit would silently revert;
 * those writes are refused with 409. The exception is an event Google lets you
 * edit here (synced-fields.ts googleEditable): its times and its existence are
 * changed in Google first (google/edit.ts), then locally, so sync agrees. The
 * calendar hides the controls too; this is for every other client.
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
    const meta = await getEventMeta(userId, id);
    if (!meta) return Response.json({ error: 'Not found.' }, { status: 404 });
    const locked = lockedFields(meta.origin, patch, meta.googleEditable);
    if (locked.length) {
      return Response.json({ error: IMPORTED_LOCKED_MESSAGE, locked }, { status: 409 });
    }
    if (isImported(meta.origin) && ('start' in patch || 'end' in patch)) {
      if (!patch.start || !patch.end) return Response.json({ error: 'Send both start and end.' }, { status: 400 });
      const remote = await moveRemote(userId, id, patch.start, patch.end);
      if (!remote.ok) return Response.json({ error: remote.error }, { status: remote.status });
    }
    // Which Google calendar this block is copied to: the old copy comes down
    // here, pushEvent below makes the new one.
    if ('copyTo' in patch) {
      if (patch.copyTo != null && typeof patch.copyTo !== 'string') {
        return Response.json({ error: 'copyTo is a calendar id or null.' }, { status: 400 });
      }
      const moved = await setCopyCalendar(userId, id, patch.copyTo ?? null);
      if (!moved.ok) return Response.json({ error: moved.error }, { status: moved.status });
    }
    const event = await updateEvent(userId, id, patch);
    if (!event) return Response.json({ error: 'Not found.' }, { status: 404 });
    const pushed = await pushEvent(userId, id); // no-op for Find Time only; never throws
    return Response.json({ event: { ...event, pushFailed: pushed ? undefined : true } });
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
    const meta = await getEventMeta(userId, id);
    if (!meta) return Response.json({ error: 'Not found.' }, { status: 404 });
    if (!canDelete(meta.origin, meta.googleEditable)) {
      return Response.json({ error: IMPORTED_LOCKED_MESSAGE }, { status: 409 });
    }
    if (isImported(meta.origin)) {
      const remote = await deleteRemote(userId, id);
      if (!remote.ok) return Response.json({ error: remote.error }, { status: remote.status });
    }
    const ok = await deleteEvent(userId, id);
    if (!ok) return Response.json({ error: 'Not found.' }, { status: 404 });
    await pushEvent(userId, id); // takes a pushed copy down; never throws
    return Response.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/events/[id]', err);
    return Response.json({ error: 'Failed to delete event.' }, { status: 500 });
  }
}
