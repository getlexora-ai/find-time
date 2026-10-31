import { randomUUID } from 'node:crypto';

import { STEP } from '@/lib/agent-tools';
import type { ApiEvent, ChangeItem } from '@/lib/api-types';
import { dayWindowFor } from '../clarify';
import { checkPlaceAt, freeNear, overlapList, overlapping, type Span } from '../place-at';
import { categoryOf } from '../understand';
import { categoryOr, doneLabel, type ToolHandler } from './context';
import { lockReason, shownTitle } from './look';

/**
 * "Move my gym to 6pm and put German where it was": several linked changes,
 * checked together against the calendar *as it would be after them* — the
 * slot the gym leaves is free for German. The model names the changes; the
 * engine checks every time (not past, inside the planning window, under 12 h),
 * whether each event may be moved or deleted, and what each new time overlaps.
 * A time the user named is kept: a clash is asked about with the nearest free
 * times, never silently moved. Nothing applies until the user taps Apply.
 */

export type RawChange = {
  op?: unknown;
  event_id?: unknown;
  title?: unknown;
  date?: unknown;
  start?: unknown;
  end?: unknown;
  duration_min?: unknown;
};

type Checked = { ok: true; items: ChangeItem[] } | { ok: false; error: string };

const HM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isoAt = (date: string, hm: string) => `${date}T${hm}:00.000Z`;
const addMin = (iso: string, min: number) => new Date(Date.parse(iso) + min * 60_000).toISOString().replace(/\.\d{3}Z$/, '.000Z');
const minutes = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

/** The model's changes → checked items, or the first problem in words the model can fix. */
export function checkChanges(raw: unknown, events: ApiEvent[], nowISO: string, horizonISO: string): Checked {
  if (!Array.isArray(raw) || !raw.length) return { ok: false, error: 'changes is empty' };
  if (raw.length > 6) return { ok: false, error: 'at most 6 changes at once' };
  const byId = new Map(events.map((e) => [e.id, e]));
  const items: ChangeItem[] = [];
  for (const [i, c] of (raw as RawChange[]).entries()) {
    const n = `change ${i + 1}`;
    const op = c.op;
    if (op !== 'move' && op !== 'add' && op !== 'delete') return { ok: false, error: `${n}: op must be move, add or delete` };

    if (op === 'delete' || op === 'move') {
      const ev = typeof c.event_id === 'string' ? byId.get(c.event_id) : undefined;
      if (!ev) return { ok: false, error: `${n}: unknown event_id — call find_events first and use an id it returned` };
      const lock = lockReason(ev);
      if (lock) return { ok: false, error: `${n}: that event can't be changed here: ${lock}. Tell the user.` };
      if (op === 'delete') {
        items.push({ op, eventId: ev.id, title: shownTitle(ev), fromStartISO: ev.start, fromEndISO: ev.end });
        continue;
      }
      const date = typeof c.date === 'string' && DATE.test(c.date) ? c.date : ev.start.slice(0, 10);
      if (typeof c.start !== 'string' || !HM.test(c.start)) return { ok: false, error: `${n}: start must be HH:MM (24-hour)` };
      const startISO = isoAt(date, c.start);
      const len = typeof c.end === 'string' && HM.test(c.end) ? minutes(startISO, isoAt(date, c.end)) : typeof c.duration_min === 'number' ? c.duration_min : minutes(ev.start, ev.end);
      const checked = checkPlaceAt(startISO, addMin(startISO, len), nowISO, horizonISO);
      if (!checked.ok) return { ok: false, error: `${n}: ${checked.reason}` };
      items.push({ op, eventId: ev.id, title: shownTitle(ev), fromStartISO: ev.start, fromEndISO: ev.end, ...checked.span });
      continue;
    }

    // add
    const title = typeof c.title === 'string' ? c.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 60) : '';
    if (!title) return { ok: false, error: `${n}: add needs a title` };
    if (typeof c.date !== 'string' || !DATE.test(c.date)) return { ok: false, error: `${n}: add needs date YYYY-MM-DD — ask the user if they did not say` };
    if (typeof c.start !== 'string' || !HM.test(c.start)) return { ok: false, error: `${n}: add needs start HH:MM` };
    const startISO = isoAt(c.date, c.start);
    const endISO =
      typeof c.end === 'string' && HM.test(c.end) ? isoAt(c.date, c.end) : typeof c.duration_min === 'number' ? addMin(startISO, c.duration_min) : null;
    if (!endISO) return { ok: false, error: `${n}: add needs an end or a length — ask the user if they did not say` };
    const checked = checkPlaceAt(startISO, endISO, nowISO, horizonISO);
    if (!checked.ok) return { ok: false, error: `${n}: ${checked.reason}` };
    items.push({ op, title: title.charAt(0).toUpperCase() + title.slice(1), category: categoryOf(title.toLowerCase()), ...checked.span });
  }
  return { ok: true, items };
}

/** The calendar as it would be after the changes, as overlap candidates (generic names for Google events). */
function after(events: ApiEvent[], items: ChangeItem[]): { id?: string; start: string; end: string; title: string }[] {
  const gone = new Set(items.filter((i) => i.op !== 'add').map((i) => i.eventId));
  const kept = events
    .filter((e) => !e.allDay && e.rsvp !== 'declined' && !gone.has(e.id))
    .map((e) => ({ id: e.id, start: e.start, end: e.end, title: shownTitle(e) }));
  const placed = items.filter((i) => i.op !== 'delete').map((i) => ({ start: i.startISO!, end: i.endISO!, title: i.title ?? 'a block' }));
  return [...kept, ...placed];
}

export const changePlan: ToolHandler = async (args, ctx) => {
  const checked = checkChanges(args.changes, ctx.events, ctx.nowISO, ctx.horizonISO);
  if (!checked.ok) return { reply: `I couldn't line those changes up: ${checked.error.replace(/ — .*$/, '')}.` };
  const items = checked.items;
  const cal = after(ctx.events, items);

  // Each new time against everything else as it would be — not against itself.
  const clashes: { item: ChangeItem; hits: { start: string; end: string; title: string }[] }[] = [];
  for (const it of items) {
    if (it.op === 'delete') continue;
    const span: Span = { startISO: it.startISO!, endISO: it.endISO! };
    const others = cal.filter((b) => !(b.start === span.startISO && b.end === span.endISO && b.title === (it.title ?? 'a block')));
    const hits = overlapping(others, span);
    if (hits.length) clashes.push({ item: it, hits });
  }

  if (clashes.length && args.overlap_ok !== true) {
    const c = clashes[0];
    const win = dayWindowFor(ctx.profile, categoryOr(String(c.item.category ?? 'personal'), 'personal'));
    const near = freeNear(cal, { startISO: c.item.startISO!, endISO: c.item.endISO! }, ctx.nowISO, win.start, win.end);
    const at = c.item.startISO!.slice(11, 16);
    const text = `${c.item.title} at ${at} overlaps ${overlapList(c.hits)}.${near.length ? ` ${near.join(' and ')} ${near.length === 1 ? 'is' : 'are'} free nearby.` : ''} Apply as asked, or move it?`;
    ctx.step({ tool: STEP.check, label: doneLabel(STEP.check, 'Checked that time'), detail: `${clashes.length} overlap${clashes.length === 1 ? '' : 's'} · asked first` });
    return { kind: 'question', question: { text, options: ['Yes, apply as asked', ...near.map((t) => `Use ${t} instead`)] }, reply: text };
  }

  ctx.step({
    tool: STEP.check,
    label: doneLabel(STEP.check, 'Checked that time'),
    detail: clashes.length ? `${clashes.length} overlap${clashes.length === 1 ? '' : 's'} · you said go ahead` : `${items.length} change${items.length === 1 ? '' : 's'} · all free`,
  });
  return {
    kind: 'plan',
    changes: { id: `chg_${randomUUID()}`, items },
    reply: typeof args.reply === 'string' && args.reply.trim() ? args.reply.trim().slice(0, 300) : 'Here are the changes. Nothing moves until you apply them.',
  };
};
