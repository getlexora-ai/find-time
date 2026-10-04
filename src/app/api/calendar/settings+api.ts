import type { CalendarSettings } from '@/lib/api-types';
import { requireUserId, unauthorized } from '@/server/auth/user';
import { checkPatch, getSettings, patchSettings } from '@/server/calendar/settings-repo';
import { isConfigured } from '@/server/db';

/**
 * GET   /api/calendar/settings — your hours, working hours, zone, week start,
 *                                clock, targets, write-back.
 * PATCH /api/calendar/settings — any subset of the same; validated.
 */
export async function GET(request: Request): Promise<Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  try {
    return Response.json({ settings: await getSettings(userId) });
  } catch (err) {
    console.error('GET /api/calendar/settings', err);
    return Response.json({ error: 'Failed to load settings.' }, { status: 500 });
  }
}

export async function PATCH(request: Request): Promise<Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured.' }, { status: 503 });
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  try {
    const patch = (await request.json()) as Partial<CalendarSettings>;
    const bad = checkPatch(patch);
    if (bad) return Response.json({ error: bad }, { status: 400 });
    if (patch.pushFocus) {
      const cur = await getSettings(userId);
      if (!cur.canWriteGoogle) {
        return Response.json(
          { error: 'Reconnect Google Calendar to let Find Time add your focus blocks.' },
          { status: 409 },
        );
      }
    }
    await patchSettings(userId, patch);
    return Response.json({ settings: await getSettings(userId) });
  } catch (err) {
    console.error('PATCH /api/calendar/settings', err);
    return Response.json({ error: 'Failed to save settings.' }, { status: 500 });
  }
}
