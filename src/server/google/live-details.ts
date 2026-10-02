import { query } from '../db';
import { collectEvents } from './calendar';
import { detailsOf, type EventDetails } from './map';
import { getValidAccessToken } from './oauth';

/**
 * Imported Google events are stored without content (map.ts). This reads the
 * title, notes, location and video link back from Google for the rows being
 * served, keeps them in memory for this request only, and never writes them.
 *
 * One events.list per calendar over the rows' own time span. A calendar Google
 * can't answer for (revoked, offline) leaves its rows titled 'Busy', so the
 * week still renders and the planner still sees the time as taken.
 */

const DAY_MS = 86_400_000;

type Wanted = { calendarId: string; providerEventId: string; start: Date; end: Date };

export async function liveDetails(
  userId: string,
  wanted: Wanted[],
): Promise<Map<string, EventDetails>> {
  const out = new Map<string, EventDetails>();
  if (wanted.length === 0) return out;

  const byCal = new Map<string, Wanted[]>();
  for (const w of wanted) byCal.set(w.calendarId, [...(byCal.get(w.calendarId) ?? []), w]);

  const cals = await query<{ id: string; connected_account_id: string; provider_calendar_id: string }>(
    `select id, connected_account_id, provider_calendar_id from calendars
      where user_id = $1 and id = any($2)`,
    [userId, [...byCal.keys()]],
  );

  await Promise.all(
    cals.map(async (c) => {
      const rows = byCal.get(c.id)!;
      // Stored times are wall-clock stamped as Z (map.ts), up to ±14 h off the
      // real instant, so pad the window by a day each side.
      const from = Math.min(...rows.map((r) => r.start.getTime())) - DAY_MS;
      const to = Math.max(...rows.map((r) => r.end.getTime())) + DAY_MS;
      try {
        const token = await getValidAccessToken(c.connected_account_id);
        const { events } = await collectEvents(token, c.provider_calendar_id, {
          timeMin: new Date(from).toISOString(),
          timeMax: new Date(to).toISOString(),
          singleEvents: true,
          showDeleted: false,
        });
        for (const g of events) out.set(`${c.id}:${g.id}`, detailsOf(g));
      } catch (err) {
        console.warn(`[live-details] calendar ${c.id}:`, err instanceof Error ? err.message : err);
      }
    }),
  );
  return out;
}

export const BUSY: EventDetails = { title: 'Busy', description: null, location: null, conference_url: null };
