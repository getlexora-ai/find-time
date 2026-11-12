import { requireUserId, unauthorized } from '@/server/auth/user';
import { addFact, deleteFact, loadMemory, MAX_FACTS, MAX_INSTRUCTIONS, saveInstructions, updateFact } from '@/server/ai/repo';
import { isConfigured } from '@/server/db';

/**
 * The "About you" page (src/calendar/components/AboutYou.tsx): what Plan with AI
 * reads on every message, besides rules and settings (db/029).
 *
 * GET    /api/ai/memory              — { instructions, facts }
 * PUT    /api/ai/memory              — { instructions }: replace them ('' clears)
 * POST   /api/ai/memory              — { text }: add a fact yourself
 * PATCH  /api/ai/memory              — { id, text }: change a fact
 * DELETE /api/ai/memory?id=…         — forget a fact
 */

async function guard(request: Request): Promise<string | Response> {
  if (!isConfigured()) return Response.json({ error: 'Database not configured (DATABASE_URL missing).' }, { status: 503 });
  return (await requireUserId(request)) ?? unauthorized();
}

async function bodyOf(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const b = (await request.json()) as unknown;
    return b && typeof b === 'object' ? (b as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const userId = await guard(request);
  if (typeof userId !== 'string') return userId;
  return Response.json(await loadMemory(userId));
}

export async function PUT(request: Request): Promise<Response> {
  const userId = await guard(request);
  if (typeof userId !== 'string') return userId;
  const body = await bodyOf(request);
  if (!body || typeof body.instructions !== 'string') return Response.json({ error: 'instructions is required.' }, { status: 400 });
  if (body.instructions.length > MAX_INSTRUCTIONS) {
    return Response.json({ error: `Keep instructions under ${MAX_INSTRUCTIONS} characters.` }, { status: 400 });
  }
  await saveInstructions(userId, body.instructions);
  return Response.json({ ok: true });
}

export async function POST(request: Request): Promise<Response> {
  const userId = await guard(request);
  if (typeof userId !== 'string') return userId;
  const body = await bodyOf(request);
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text) return Response.json({ error: 'text is required.' }, { status: 400 });
  const fact = await addFact(userId, text, 'user');
  if (!fact) return Response.json({ error: `Memory is full (${MAX_FACTS} facts). Remove one first.` }, { status: 409 });
  return Response.json({ fact });
}

export async function PATCH(request: Request): Promise<Response> {
  const userId = await guard(request);
  if (typeof userId !== 'string') return userId;
  const body = await bodyOf(request);
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id || typeof body?.text !== 'string') return Response.json({ error: 'id and text are required.' }, { status: 400 });
  const ok = await updateFact(userId, id, body.text);
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found.' }, { status: 404 });
}

export async function DELETE(request: Request): Promise<Response> {
  const userId = await guard(request);
  if (typeof userId !== 'string') return userId;
  const id = new URL(request.url).searchParams.get('id') ?? '';
  if (!id) return Response.json({ error: 'id is required.' }, { status: 400 });
  const ok = await deleteFact(userId, id);
  return ok ? Response.json({ ok: true }) : Response.json({ error: 'Not found.' }, { status: 404 });
}
