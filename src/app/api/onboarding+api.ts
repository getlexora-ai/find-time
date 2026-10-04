import {
  answersFromProfile,
  checkAnswers,
  checkGroups,
  energyCurveFor,
  type PreviewBlock,
  workHoursOf,
} from '@/auth/onboarding';
import { firstNameOf, markOnboarded, requireUserId, setFirstName, unauthorized } from '@/server/auth/user';
import { blocksTime } from '@/server/ai/find-time';
import { loadProfile, savePlanSettings } from '@/server/ai/repo';
import { getSettings, patchSettings } from '@/server/calendar/settings-repo';
import { isConfigured, query, queryOne } from '@/server/db';
import { listEvents } from '@/server/events-repo';
import { enforceRateLimit } from '@/server/rate-limit';
import { wallClockNow } from '@/server/wall-clock';

/**
 * GET  /api/onboarding — what `/welcome` opens on:
 *        { existing, answers, connected, meetings, weekOf }
 *      `existing` = this user already has planner settings; `answers` are
 *      those settings as onboarding answers (src/auth/onboarding.ts
 *      `answersFromProfile`), so a returning user edits theirs instead of
 *      overwriting them with defaults. `meetings` = this week's busy events
 *      from connected calendars, as preview blocks (Mon = 0), or null.
 *
 * POST /api/onboarding — `{ answers, changed }` writes only the groups in
 *      `changed` (omitted = all, for first-time users), then sets
 *      `auth_user.onboarded`. `{ skip: true }` only sets the flag.
 */

const DAY = 86_400_000;

export async function GET(request: Request): Promise<Response> {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'onboarding', { kind: 'user', userId });
  if (limited) return limited;

  let firstName = '';
  try {
    firstName = await firstNameOf(userId);
  } catch {
    // name is a nicety; the form still works without it
  }

  if (!isConfigured()) {
    return Response.json({ existing: false, answers: null, connected: false, meetings: null, weekOf: null });
  }

  try {
    const [row, settings, profile, accounts] = await Promise.all([
      queryOne<{ user_id: string }>('select user_id from scheduler_profiles where user_id = $1', [userId]),
      getSettings(userId),
      loadProfile(userId),
      query<{ n: number }>(`select count(*)::int as n from connected_accounts where user_id = $1`, [userId]),
    ]);

    const answers = answersFromProfile({
      firstName,
      timezone: settings.timezone,
      clock24: settings.clock24,
      weekStart: settings.weekStart,
      workHours: settings.workHours,
      energyCurve: profile.energyCurve,
      maxDailyFocusMin: profile.maxDailyFocusMin,
      hardWork: profile.hardWork,
    });

    const connected = (accounts[0]?.n ?? 0) > 0;
    let meetings: PreviewBlock[] | null = null;
    let weekOf: string | null = null;
    if (connected) {
      // This week on the user's wall clock (src/server/wall-clock.ts), Monday first.
      const now = wallClockNow(settings.timezone);
      const today = now - (now % DAY);
      const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
      weekOf = new Date(monday).toISOString().slice(0, 10);
      const events = await listEvents(userId, new Date(monday).toISOString(), new Date(monday + 7 * DAY).toISOString());
      meetings = [];
      // The same busy rule the planner uses: free, declined and all-day events don't block.
      for (const e of events.filter(blocksTime)) {
        if (e.allDay) continue;
        const s = Date.parse(e.start);
        const t = Date.parse(e.end);
        for (let d = 0; d < 7; d++) {
          const ds = monday + d * DAY;
          const from = Math.max(s, ds);
          const to = Math.min(t, ds + DAY);
          if (to <= from) continue;
          meetings.push({
            id: `${e.id}-${d}`,
            day: d,
            s: Math.round((from - ds) / 60_000),
            e: Math.round((to - ds) / 60_000),
            title: e.title || 'Busy',
            kind: 'meeting',
          });
        }
      }
    }

    return Response.json({ existing: Boolean(row), answers, connected, meetings, weekOf });
  } catch (err) {
    console.error('GET /api/onboarding', err);
    return Response.json({ error: 'Could not load your settings.' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const userId = await requireUserId(request);
  if (!userId) return unauthorized();
  const limited = await enforceRateLimit(request, 'onboarding', { kind: 'user', userId });
  if (limited) return limited;

  let body: { skip?: unknown; answers?: unknown; changed?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ error: 'Expected JSON.' }, { status: 400 });
  }

  let saved = false;
  if (!body?.skip) {
    const checked = checkAnswers(body.answers);
    if (!checked.ok) return Response.json({ error: checked.error }, { status: 400 });
    const a = checked.value;
    const changed = new Set(checkGroups(body.changed));

    try {
      if (isConfigured()) {
        const settings: Parameters<typeof patchSettings>[1] = {};
        if (changed.has('hours')) settings.workHours = workHoursOf(a);
        if (changed.has('prefs')) Object.assign(settings, { timezone: a.timezone, weekStart: a.weekStart, clock24: a.clock24 });
        // The weekly focus goal follows the daily budget and the working days.
        if (changed.has('focus') || changed.has('hours')) settings.focusGoalH = a.focusH * a.days.length;
        await patchSettings(userId, settings);

        if (changed.has('focus') || changed.has('hardWork')) {
          await savePlanSettings(userId, {
            hardWork: changed.has('hardWork') ? a.hardWork : undefined,
            dailyBudgetMin: changed.has('focus') ? Math.round(a.focusH * 60) : undefined,
          });
        }
        // Only when the user picked a peak: this replaces whatever curve was learned.
        if (changed.has('peak')) {
          await query(
            `insert into scheduler_profiles (user_id, energy_curve) values ($1, $2::jsonb)
             on conflict (user_id) do update set energy_curve = excluded.energy_curve`,
            [userId, JSON.stringify(energyCurveFor(a.peak))],
          );
        }
        saved = true;
      }
      if (changed.has('name') && a.firstName) await setFirstName(userId, a.firstName);
    } catch (err) {
      console.error('POST /api/onboarding', err);
      return Response.json({ error: 'Could not save your answers. Try again.' }, { status: 500 });
    }
  }

  try {
    await markOnboarded(userId);
  } catch (err) {
    console.error('POST /api/onboarding (metadata)', err);
    return Response.json({ error: 'Saved, but could not finish setup. Try again.' }, { status: 500 });
  }
  return Response.json({ ok: true, saved });
}
