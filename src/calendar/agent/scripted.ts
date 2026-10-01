import type { AgentEvent, AgentRequest, DraftBlock, PendingChange } from '@/lib/agent-types';

import { allEvents, createEventAsync, deleteEvent } from '../cal-store';
import { addDays, iso, today, WD, wdIndex } from '../cal-date';

/**
 * DEV ONLY — `/preview` has no server or model, so the panel runs this scripted
 * turn instead: the same events, in the same order and rhythm, as the real agent
 * sends. It exists to judge the feel of the conversation, not its intelligence.
 */

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function type(emit: (e: AgentEvent) => void, text: string) {
  for (const word of text.split(/(?<= )/)) {
    emit({ type: 'text', delta: word });
    await wait(28);
  }
}

async function tool(emit: (e: AgentEvent) => void, id: string, label: string, detail: string, ms = 650) {
  emit({ type: 'tool', id, status: 'running', label });
  await wait(ms);
  emit({ type: 'tool', id, status: 'done', label, detail });
}

let pendingScript: PendingChange[] = [];
let asked = false;

const day = (n: number) => iso(addDays(today(), n));
const label = (d: string) => {
  const x = new Date(`${d}T00:00:00`);
  return `${WD[wdIndex(x)]} ${x.getDate()}`;
};

export async function scriptedTurn(body: Omit<AgentRequest, 'items' | 'timeZone'>, emit: (e: AgentEvent) => void) {
  await wait(300);

  // Approve / reject
  if (body.approvals && Object.keys(body.approvals).length && !body.message) {
    const ok = pendingScript.filter((c) => body.approvals![c.id]);
    for (const c of ok) {
      emit({ type: 'tool', id: c.id, status: 'running', label: 'Applying' });
      const ids: string[] = [];
      for (const b of c.blocks) {
        const ev = await createEventAsync({ date: b.date, start: b.start, end: b.end, title: b.title, cat: b.category, kind: b.kind });
        ids.push(String(ev.id));
      }
      await wait(250);
      emit({ type: 'applied', id: c.id, summary: c.summary.replace(/^Add/, 'Added'), eventIds: ids, undo: ids.map((id) => ({ op: 'delete' as const, id })) });
    }
    pendingScript = [];
    await type(emit, ok.length ? `Done — ${ok.length} block${ok.length === 1 ? ' is' : 's are'} on your calendar. I kept your mornings before 9 clear.` : 'No problem, nothing was added.');
    emit({ type: 'done', items: [] });
    return;
  }

  const text = (body.message ?? Object.values(body.answers ?? {})[0] ?? '').toLowerCase();

  if (!asked && /gym|run|workout/.test(text) && !/morning|evening|\d/.test(text)) {
    asked = true;
    await type(emit, 'Let me look at your week first. ');
    await tool(emit, 's1', `Checking ${label(day(0))} – ${label(day(6))}`, '24 events');
    await tool(emit, 's2', 'Searching for "gym"', '3 past sessions · usually 18:00');
    emit({
      type: 'question',
      question: {
        id: 'q1',
        question: 'You usually train at 18:00, but Wednesday evening is busy. Keep evenings and skip Wednesday, or switch to mornings this week? I’d keep evenings.',
        options: ['Evenings, skip Wednesday', 'Mornings this week', 'Ask me per day'],
      },
    });
    emit({ type: 'done', items: [] });
    return;
  }

  await type(emit, 'On it — checking your week and where the room is. ');
  await tool(emit, 's3', `Checking ${label(day(0))} – ${label(day(6))}`, '24 events');
  await tool(emit, 's4', 'Looking for 120 min free', '5 options', 800);
  await tool(emit, 's5', 'Looking for 45 min free after 17:00', '4 options', 600);

  const blocks: DraftBlock[] = [
    { title: 'Investor deck', date: day(1), start: '09:00', end: '11:00', kind: 'focus', category: 'deep' },
    { title: 'Investor deck', date: day(2), start: '09:30', end: '11:30', kind: 'focus', category: 'deep' },
    { title: 'Gym', date: day(1), start: '18:00', end: '18:45', kind: 'routine', category: 'admin' },
  ];
  const clashDay = allEvents().find((e) => e.date === day(2) && e.start < '11:30' && e.end > '09:30');
  pendingScript = blocks.map((b, i) => {
    const id = `c${i}`;
    emit({ type: 'tool', id: `d${i}`, status: 'running', label: `Drafting "${b.title}"` });
    return {
      id,
      action: 'add',
      summary: `Add "${b.title}" · ${label(b.date)} ${b.start}–${b.end}`,
      clash: i === 1 && clashDay ? `overlaps ${clashDay.title} (${clashDay.start}–${clashDay.end})` : undefined,
      blocks: [b],
    };
  });
  await wait(400);
  blocks.forEach((b, i) => emit({ type: 'tool', id: `d${i}`, status: 'done', label: `Drafting "${b.title}"`, detail: 'waiting for you' }));
  emit({ type: 'pending', changes: pendingScript });
  await type(
    emit,
    `Here's a plan: two 2-hour deck sessions on ${label(day(1))} and ${label(day(2))} mornings, when you're freshest, and the gym at 18:00 on ${label(day(1))}. They're drawn on your calendar as drafts — approve what you want to keep.`,
  );
  emit({ type: 'done', items: [] });
}

/** Undo in preview: delete the local blocks. */
export async function scriptedUndo(ids: string[]) {
  for (const id of ids) await deleteEvent(Number(id));
}
