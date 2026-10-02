import { checkAnswers, energyCurveFor, workHoursOf } from '@/auth/onboarding';
import { clerkClient, requireUserId, unauthorized } from '@/server/auth/clerk';
import { savePlanSettings } from '@/server/ai/repo';
import { patchSettings } from '@/server/calendar/settings-repo';
import { isConfigured, query } from '@/server/db';

/**
 * POST /api/onboarding — the `/welcome` answers, written where the planner
 * already reads them (src/auth/onboarding.ts maps each one), then the Clerk
 * user is marked `publicMetadata.onboarded` so `/app` stops sending them back.
 *
 * Body: `OnboardingAnswers`, or `{ skip: true }` to mark done without saving
 * anything (the app's defaults stay in force; everything is editable later).
 *
 * Without a database the answers can't be kept, but the user still gets into
 * the app: the flag is set and the response says `saved: false`.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  let saved = false;
  if (!(body as { skip?: unknown })?.skip) {
    const checked = checkAnswers(body);
    if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
    const a = checked.value;

    try {
      if (isConfigured()) {
        await patchSettings(userId, {
          timezone: a.timezone,
          workHours: workHoursOf(a),
          weekStart: a.weekStart,
          clock24: a.clock24,
          focusGoalH: a.focusH * a.days.length,
        });
        await savePlanSettings(userId, { hardWork: a.hardWork, dailyBudgetMin: Math.round(a.focusH * 60) });
        await query(`update scheduler_profiles set energy_curve = $2::jsonb where user_id = $1`, [
          userId,
          JSON.stringify(energyCurveFor(a.peak)),
        ]);
        saved = true;
      }
      if (a.firstName) await clerkClient.users.updateUser(userId, { firstName: a.firstName });
    } catch (err) {
      console.error('POST /api/onboarding', err);
      return Response.json({ error: 'Could not save your answers. Try again.' }, { status: 500 });
    }
  }

  try {
    await clerkClient.users.updateUserMetadata(userId, { publicMetadata: { onboarded: true } });
  } catch (err) {
    console.error('POST /api/onboarding (metadata)', err);
    return Response.json({ error: 'Saved, but could not finish setup. Try again.' }, { status: 500 });
  }
  return Response.json({ ok: true, saved });
}
