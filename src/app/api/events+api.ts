import { isConfigured } from '@/server/db';
import { createEvent, listEvents, type EventInput } from '@/server/events-repo';

// TODO(auth): replace with the real session user once auth lands.
const USER_ID = 'u1';

function guard(): Response | null {
  if (!isConfigured()) {
    return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const url = new URL(request.url);
    const from = url.searchParams.get('from') ?? undefined;
    const to = url.searchParams.get('to') ?? undefined;
    const events = await listEvents(USER_ID, from, to);
    return Response.json({ events });
  } catch (err) {
    console.error('GET /api/events', err);
    return Response.json({ error: 'Failed to list events.' }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const blocked = guard();
  if (blocked) return blocked;
  try {
    const body = (await request.json()) as Partial<EventInput>;
    if (!body.title || !body.start || !body.end) {
      return Response.json({ error: 'title, start and end are required.' }, { status: 400 });
    }
    const event = await createEvent(USER_ID, body as EventInput);
    return Response.json({ event }, { status: 201 });
  } catch (err) {
    console.error('POST /api/events', err);
    return Response.json({ error: 'Failed to create event.' }, { status: 500 });
  }
}
