import type { ApiEvent, CalendarSettings, EventInput } from '@/lib/api-types';
import type { DraftBlock, PendingChange, UndoOp } from '@/lib/agent-types';
import { repeatsOn } from '@/lib/repeats';
import { IMPORTED_LOCKED_MESSAGE, lockedFields } from '@/lib/synced-fields';

import { toCalEvent, toEventInput, toEventPatch } from '../../calendar/api-adapter';
import type { CalEvent } from '../../calendar/types';
import { checkTimeOff, splitByDay } from '../ai/time-off';
import { createEvent, deleteEvent, listEvents, updateEvent } from '../events-repo';
import { findSlots, freeFromBusy, type Span } from './slots';
import { addDays, nowMinutesIn, span, todayIn, toHHMM, toMin, when } from './time';

/**
 * The agent's tools (ported from find-time-agent's agent.ts, onto the app's own
 * events instead of Google's API). Every input is untrusted model output and is
 * validated here. Changes never run on their own: each has an `approve` step
 * that describes it — in words and as ghost blocks for the grid — and the loop
 * pauses until the person clicks Approve.
 */

export type Ctx = {
  userId: string;
  timeZone: string;
  settings: CalendarSettings;
  /** every event the user has, refreshed after each write */
  events: ApiEvent[];
};

export type Tool = {
  description: string;
  parameters: Record<string, unknown>;
  /** shown as the tool line in the chat, from the validated input */
  label: (input: any) => string;
  run: (input: any, ctx: Ctx) => Promise<{ output: unknown; detail?: string; applied?: Applied }>;
  /** present on changes: describe it for the Approve card; throw = invalid, goes back to the model */
  approve?: (input: any, ctx: Ctx, callId: string) => Promise<PendingChange>;
};

export type Applied = { summary: string; eventIds: string[]; undo: UndoOp[] };

/* ───────────────────────── handles ───────────────────────── */

// The model sees "e-4k2p9q" instead of "evt_7c1d…" (a 40-character id it would
// copy wrong). Stable: the same event gets the same handle on every turn.
export function handleOf(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `e-${(h >>> 0).toString(36).padStart(6, '0').slice(-6)}`;
}

function eventByHandle(ctx: Ctx, handle: unknown): ApiEvent {
  const ev = typeof handle === 'string' ? ctx.events.find((e) => handleOf(e.id) === handle) : undefined;
  if (!ev) throw new Error(`unknown event id ${String(handle)}; find it again with find_events`);
  return ev;
}

/* ───────────────────────── validation ───────────────────────── */

const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isLocal = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s);
const isHHMM = (s: unknown): s is string => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const KINDS = ['event', 'focus', 'task', 'routine', 'break'] as const;
const CATS = ['deep', 'design', 'research', 'sync', 'admin'] as const;
const REPEATS: Record<string, string> = {
  daily: 'FREQ=DAILY',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
};

function checkSpan(start: unknown, end: unknown): { start: string; end: string } {
  if (!isLocal(start) || !isLocal(end)) throw new Error('start and end are both needed, as YYYY-MM-DDTHH:MM');
  if (end <= start) throw new Error('end must be after start');
  if (end.slice(0, 10) !== start.slice(0, 10)) throw new Error('start and end must be on the same day; split longer stretches');
  return { start, end };
}

/* ───────────────────────── reading the calendar ───────────────────────── */

const local = (iso: string) => iso.slice(0, 16);

/** One occurrence of an event in a date range, in wall-clock. */
type Occ = { ev: ApiEvent; cal: CalEvent; start: string; end: string };

/** Every occurrence between two dates (inclusive), repeats expanded, all-day excluded. */
function occurrences(ctx: Ctx, from: string, to: string, opts: { includeDrafts?: boolean } = {}): Occ[] {
  const out: Occ[] = [];
  for (const ev of ctx.events) {
    if (ev.allDay) continue;
    const cal = toCalEvent(ev);
    if (cal.kind === 'ai' && !opts.includeDrafts) continue;
    const s = local(ev.start);
    const e = local(ev.end);
    if (ev.rrule) {
      for (let d = from; d <= to; d = addDays(d, 1)) {
        if (repeatsOn({ date: s.slice(0, 10), rrule: ev.rrule, exdates: ev.exdates }, d)) {
          out.push({ ev, cal, start: `${d}T${s.slice(11)}`, end: `${d}T${e.slice(11)}` });
        }
      }
    } else if (s.slice(0, 10) <= to && e.slice(0, 10) >= from) {
      out.push({ ev, cal, start: s, end: e });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}

/** Does this occurrence take time? Declined, "free" and done tasks don't. */
const blocks = (o: Occ) => !o.ev.free && o.ev.rsvp !== 'declined' && !o.ev.done;

const REPEAT_WORDS: [RegExp, string][] = [
  [/FREQ=DAILY/, 'daily'],
  [/BYDAY=MO,TU,WE,TH,FR/, 'every weekday'],
  [/FREQ=WEEKLY/, 'weekly'],
  [/FREQ=MONTHLY/, 'monthly'],
];

function compact(o: Occ) {
  return {
    id: handleOf(o.ev.id),
    title: o.ev.title,
    when: span(o.start, o.end),
    start: o.start,
    end: o.end,
    minutes: toMin(o.end.slice(11)) - toMin(o.start.slice(11)),
    kind: o.cal.kind === 'ai' ? 'proposal' : o.cal.kind,
    category: o.cal.cat,
    ...(o.ev.origin === 'imported' && { from_google: true }),
    ...(o.ev.rrule && { repeats: REPEAT_WORDS.find(([re]) => re.test(o.ev.rrule!))?.[1] ?? 'repeats' }),
    ...(o.ev.rsvp === 'declined' && { declined: true }),
    ...(o.ev.free && { shows_as_free: true }),
    ...(o.ev.done && { done: true }),
  };
}

/** " ⚠ overlaps Board prep (10:30–11:30)" for the Approve card — computed, never the model's word. */
function clashNote(ctx: Ctx, start: string, end: string, ignoreId?: string): string | undefined {
  const hits = occurrences(ctx, start.slice(0, 10), start.slice(0, 10)).filter(
    (o) => o.ev.id !== ignoreId && blocks(o) && o.start < end && o.end > start,
  );
  return hits.length
    ? `overlaps ${hits.map((o) => `${o.ev.title} (${o.start.slice(11)}–${o.end.slice(11)})`).join(', ')}`
    : undefined;
}

const WEEKDAY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const workOn = (ctx: Ctx, date: string) => ctx.settings.workHours[WEEKDAY[new Date(`${date}T12:00:00Z`).getUTCDay()]] ?? null;

function draft(input: { title: string; start: string; end: string; kind?: string; category?: string }, extra: Partial<DraftBlock> = {}): DraftBlock {
  const kind = (KINDS as readonly string[]).includes(input.kind ?? '') ? (input.kind as DraftBlock['kind']) : 'event';
  const category = (CATS as readonly string[]).includes(input.category ?? '')
    ? (input.category as DraftBlock['category'])
    : kind === 'focus'
      ? 'deep'
      : kind === 'event'
        ? 'sync'
        : 'admin';
  return { title: input.title, date: input.start.slice(0, 10), start: input.start.slice(11), end: input.end.slice(11), kind, category, ...extra };
}

async function refresh(ctx: Ctx) {
  ctx.events = await listEvents(ctx.userId);
}

/* ───────────────────────── the tools ───────────────────────── */

const LOCAL_TIME = {
  type: 'string',
  description: 'Local wall-clock time YYYY-MM-DDTHH:MM in the user\'s zone, no offset',
};
const DATE = { type: 'string', description: 'YYYY-MM-DD' };
const EVENT = { type: 'string', description: 'Event id like "e-4k2p9q" from find_events' };

export const TOOLS: Record<string, Tool> = {
  ask_user: {
    description:
      'Ask the user ONE short question when the answer changes what you would do and you cannot look it up. ' +
      'Give 2-4 short suggested answers (real times from find_free_slots, real event names); the user can tap one or type anything. ' +
      'Call it alone, with no other tools in the same step.',
    parameters: {
      type: 'object',
      properties: {
        question: { type: 'string' },
        options: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 4 },
      },
      required: ['question', 'options'],
      additionalProperties: false,
    },
    label: () => 'Asking you',
    run: async () => {
      throw new Error('ask_user is handled by the loop');
    },
  },

  find_events: {
    description:
      'Find events. With `query`: events whose title matches, 6 months back to 6 months ahead unless dates are given. ' +
      'Without `query`: every event between start_date and end_date. Repeats are expanded. Use a query whenever the user names an event ("my gym", "the dentist").',
    parameters: {
      type: 'object',
      properties: {
        query: { type: ['string', 'null'], description: 'One word or a short phrase, e.g. gym' },
        start_date: { ...DATE, type: ['string', 'null'] },
        end_date: { ...DATE, type: ['string', 'null'] },
      },
      required: ['query', 'start_date', 'end_date'],
      additionalProperties: false,
    },
    label: (i) =>
      i.query ? `Searching for "${i.query}"` : `Checking ${i.start_date === i.end_date ? when(i.start_date) : `${when(i.start_date)} – ${when(i.end_date)}`}`.replace(/ \(all day\)/g, ''),
    run: async (i, ctx) => {
      const today = todayIn(ctx.timeZone);
      const query = typeof i.query === 'string' && i.query.trim() ? i.query.trim().toLowerCase() : null;
      if ((i.start_date && !isDate(i.start_date)) || (i.end_date && !isDate(i.end_date))) throw new Error('dates must be YYYY-MM-DD');
      if (!query && (!i.start_date || !i.end_date)) throw new Error('give a query, or both start_date and end_date');
      const from = i.start_date ?? addDays(today, -183);
      const to = i.end_date ?? addDays(today, 183);
      let list = occurrences(ctx, from, to, { includeDrafts: true });
      if (query) {
        const seen = new Set<string>();
        list = list.filter((o) => o.ev.title.toLowerCase().includes(query));
        // A weekly gym is one thing to talk about, not 26 rows.
        list = list.filter((o) => (o.ev.rrule ? !seen.has(o.ev.id) && seen.add(o.ev.id) : true));
      }
      const allDay = ctx.events
        .filter((e) => e.allDay && local(e.start).slice(0, 10) <= to && local(e.end).slice(0, 10) > from)
        .filter((e) => !query || e.title.toLowerCase().includes(query))
        .map((e) => ({ id: handleOf(e.id), title: e.title, all_day: true, from: e.start.slice(0, 10), until: e.end.slice(0, 10) }));
      const events = list.map(compact);
      return {
        output: {
          events: events.slice(0, 60),
          ...(allDay.length && { all_day: allDay }),
          ...(events.length > 60 && { note: `${events.length - 60} more not shown; narrow the dates or query` }),
        },
        detail: `${events.length + allDay.length} event${events.length + allDay.length === 1 ? '' : 's'}`,
      };
    },
  },

  find_free_slots: {
    description:
      "Find free time. Returns up to 8 slots, earliest first, never in the past. By default each day's search is the user's working hours " +
      '(days off are skipped); pass earliest/latest to search outside them, e.g. evenings for personal things. ' +
      'Use this before proposing or booking any time; never work out free time yourself.',
    parameters: {
      type: 'object',
      properties: {
        start_date: DATE,
        end_date: DATE,
        duration_minutes: { type: 'integer', minimum: 5, maximum: 720 },
        earliest: { type: ['string', 'null'], description: 'HH:MM; null = start of working hours' },
        latest: { type: ['string', 'null'], description: 'HH:MM the slot must end by; null = end of working hours' },
        buffer_minutes: { type: ['integer', 'null'], description: 'Free time also needed before and after' },
        include_days_off: { type: ['boolean', 'null'], description: 'Also search weekends and other days off' },
      },
      required: ['start_date', 'end_date', 'duration_minutes', 'earliest', 'latest', 'buffer_minutes', 'include_days_off'],
      additionalProperties: false,
    },
    label: (i) => `Looking for ${i.duration_minutes} min free`,
    run: async (i, ctx) => {
      const { start_date: from, end_date: to, duration_minutes: duration } = i;
      if (!isDate(from) || !isDate(to) || to < from) throw new Error('need start_date <= end_date as YYYY-MM-DD');
      if (to > addDays(from, 31)) throw new Error('search at most 31 days at a time');
      if (!Number.isInteger(duration) || duration < 5) throw new Error('duration_minutes must be a whole number >= 5');
      if ((i.earliest != null && !isHHMM(i.earliest)) || (i.latest != null && !isHHMM(i.latest))) throw new Error('earliest/latest must be HH:MM');
      const today = todayIn(ctx.timeZone);
      const win = ctx.settings.window;
      const slots: { start: string; end: string; when: string }[] = [];
      for (let d = from < today ? today : from; d <= to && slots.length < 8; d = addDays(d, 1)) {
        const work = workOn(ctx, d);
        if (!work && !i.include_days_off && i.earliest == null) continue;
        let earliest = i.earliest != null ? toMin(i.earliest) : (work?.start ?? win.start) * 60;
        const latest = i.latest != null ? toMin(i.latest) : (work?.end ?? win.end) * 60;
        if (d === today) earliest = Math.max(earliest, nowMinutesIn(ctx.timeZone));
        const busy: Span[] = occurrences(ctx, d, d)
          .filter(blocks)
          .map((o) => [toMin(o.start.slice(11)), o.end.slice(0, 10) > d ? 1440 : toMin(o.end.slice(11))]);
        for (const [s, e] of findSlots({ free: freeFromBusy(busy), duration, buffer: i.buffer_minutes ?? 0, earliest, latest })) {
          const start = `${d}T${toHHMM(s)}`;
          const end = `${d}T${toHHMM(e)}`;
          slots.push({ start, end, when: span(start, end) });
          if (slots.length >= 8) break;
        }
      }
      return slots.length
        ? { output: { slots }, detail: `${slots.length} option${slots.length === 1 ? '' : 's'}` }
        : { output: { slots: [], note: 'Nothing free there. Offer a wider window or another day.' }, detail: 'nothing free' };
    },
  },

  create_event: {
    description:
      'Add a block to the calendar. kind: event (with people), focus (protected deep work), task, routine (repeats), break. ' +
      'category: deep, design, research, sync (meetings), admin. repeat: null, daily, weekdays or weekly.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        start: LOCAL_TIME,
        end: LOCAL_TIME,
        kind: { type: 'string', enum: [...KINDS] },
        category: { type: 'string', enum: [...CATS] },
        repeat: { type: ['string', 'null'], enum: ['daily', 'weekdays', 'weekly', null] },
      },
      required: ['title', 'start', 'end', 'kind', 'category', 'repeat'],
      additionalProperties: false,
    },
    label: (i) => `Drafting "${i.title}"`,
    approve: async (i, ctx, callId) => {
      if (typeof i.title !== 'string' || !i.title.trim()) throw new Error('title is required');
      const t = checkSpan(i.start, i.end);
      const rep = i.repeat ? ` · repeats ${i.repeat}` : '';
      return {
        id: callId,
        action: 'add',
        summary: `Add "${i.title.trim()}" · ${span(t.start, t.end)}${rep}`,
        clash: clashNote(ctx, t.start, t.end),
        blocks: [draft({ ...i, ...t })],
      };
    },
    run: async (i, ctx) => {
      const t = checkSpan(i.start, i.end);
      const kind = i.repeat ? (i.kind === 'event' ? 'routine' : i.kind) : i.kind;
      const body = toEventInput({
        title: i.title.trim(),
        date: t.start.slice(0, 10),
        start: t.start.slice(11),
        end: t.end.slice(11),
        cat: draft({ ...i, ...t }).category,
        kind,
        rrule: i.repeat ? REPEATS[i.repeat] : undefined,
      }) as EventInput;
      if (i.repeat && body.rrule == null) body.rrule = REPEATS[i.repeat];
      const ev = await createEvent(ctx.userId, body);
      await refresh(ctx);
      return {
        output: { id: handleOf(ev.id), created: span(t.start, t.end) },
        applied: { summary: `Added "${ev.title}"`, eventIds: [ev.id], undo: [{ op: 'delete', id: ev.id }] },
      };
    },
  },

  change_event: {
    description:
      'Change an existing block: new time (start AND end, same day), new title, or new kind. Only pass what changes (null for the rest). ' +
      'Changing the time of a repeating block moves every repeat. Events from Google can only change kind. Never create a copy instead.',
    parameters: {
      type: 'object',
      properties: {
        event: EVENT,
        start: { ...LOCAL_TIME, type: ['string', 'null'] },
        end: { ...LOCAL_TIME, type: ['string', 'null'] },
        title: { type: ['string', 'null'] },
        kind: { type: ['string', 'null'], enum: [...KINDS, null] },
      },
      required: ['event', 'start', 'end', 'title', 'kind'],
      additionalProperties: false,
    },
    label: () => 'Drafting a change',
    approve: async (i, ctx, callId) => {
      const ev = eventByHandle(ctx, i.event);
      const cur = toCalEvent(ev);
      const t = i.start != null || i.end != null ? checkSpan(i.start, i.end) : null;
      const patch = { ...(t && { start: t.start, end: t.end }), ...(i.title != null && { title: i.title }) };
      if (ev.origin === 'imported' && lockedFields(ev.origin, patch).length) throw new Error(IMPORTED_LOCKED_MESSAGE);
      const parts = [
        t && `${local(ev.start).slice(11)}–${local(ev.end).slice(11)} → ${span(t.start, t.end)}${ev.rrule ? ' (every repeat)' : ''}`,
        i.title != null && `rename to "${i.title}"`,
        i.kind != null && `make it a ${i.kind}`,
      ].filter(Boolean);
      return {
        id: callId,
        action: t ? 'move' : 'change',
        summary: `"${ev.title}": ${parts.join(', ') || 'no change'}`,
        clash: t ? clashNote(ctx, t.start, t.end, ev.id) : undefined,
        blocks: t
          ? [draft({ title: i.title ?? ev.title, start: t.start, end: t.end, kind: i.kind ?? cur.kind, category: cur.cat }, { replaces: ev.id })]
          : [],
      };
    },
    run: async (i, ctx) => {
      const ev = eventByHandle(ctx, i.event);
      const cur = toCalEvent(ev);
      const t = i.start != null || i.end != null ? checkSpan(i.start, i.end) : null;
      const patch: Partial<CalEvent> = {
        ...(t && { date: ev.rrule ? cur.date : t.start.slice(0, 10), start: t.start.slice(11), end: t.end.slice(11) }),
        ...(i.title != null && { title: i.title }),
        ...(i.kind != null && { kind: i.kind }),
      };
      const body = toEventPatch(cur, patch);
      if (ev.origin === 'imported' && lockedFields(ev.origin, body).length) throw new Error(IMPORTED_LOCKED_MESSAGE);
      const out = await updateEvent(ctx.userId, ev.id, body);
      if (!out) throw new Error('that event no longer exists');
      await refresh(ctx);
      return {
        output: { id: i.event, changed: true },
        applied: {
          summary: `Changed "${ev.title}"`,
          eventIds: [ev.id],
          undo: [{ op: 'restore', id: ev.id, patch: { title: ev.title, start: ev.start, end: ev.end } }],
        },
      };
    },
  },

  delete_event: {
    description: 'Delete a block (a repeating one: the whole series). Events from Google cannot be deleted here.',
    parameters: { type: 'object', properties: { event: EVENT }, required: ['event'], additionalProperties: false },
    label: () => 'Drafting a removal',
    approve: async (i, ctx, callId) => {
      const ev = eventByHandle(ctx, i.event);
      if (ev.origin === 'imported') throw new Error(IMPORTED_LOCKED_MESSAGE);
      return {
        id: callId,
        action: 'delete',
        summary: `Delete "${ev.title}" · ${span(local(ev.start), local(ev.end))}${ev.rrule ? ' and every repeat' : ''}`,
        blocks: [],
      };
    },
    run: async (i, ctx) => {
      const ev = eventByHandle(ctx, i.event);
      if (ev.origin === 'imported') throw new Error(IMPORTED_LOCKED_MESSAGE);
      const ok = await deleteEvent(ctx.userId, ev.id);
      if (!ok) throw new Error('that event no longer exists');
      await refresh(ctx);
      return {
        output: { deleted: i.event },
        applied: {
          summary: `Deleted "${ev.title}"`,
          eventIds: [ev.id],
          undo: [
            {
              op: 'recreate',
              input: { title: ev.title, start: ev.start, end: ev.end, category: 'other', itemType: ev.itemType, flexibility: ev.flexibility },
            },
          ],
        },
      };
    },
  },

  block_time_off: {
    description:
      'Block out time away — a vacation, a trip, a day off — from a start to an end. Dates alone mean whole days ("the 17th to the 22nd" includes the 22nd). ' +
      'Use this, not create_event, for anything longer than a day.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'e.g. "Copenhagen" or "Day off"' },
        start: { type: 'string', description: 'YYYY-MM-DD or YYYY-MM-DDTHH:MM' },
        end: { type: 'string', description: 'YYYY-MM-DD or YYYY-MM-DDTHH:MM' },
      },
      required: ['title', 'start', 'end'],
      additionalProperties: false,
    },
    label: (i) => `Drafting time off: ${i.title}`,
    approve: async (i, ctx, callId) => {
      const now = `${todayIn(ctx.timeZone)}T${toHHMM(nowMinutesIn(ctx.timeZone))}:00.000Z`;
      const c = checkTimeOff(i.start, i.end, now);
      if (!c.ok) throw new Error(c.reason);
      const days = splitByDay(c.span);
      return {
        id: callId,
        action: 'time-off',
        summary: `Block "${i.title}" · ${span(local(c.span.startISO), local(c.span.endISO))} (${days.length} day${days.length === 1 ? '' : 's'})`,
        blocks: days.map((d) => draft({ title: i.title, start: local(d.startISO), end: local(d.endISO), kind: 'event', category: 'admin' })),
      };
    },
    run: async (i, ctx) => {
      const now = `${todayIn(ctx.timeZone)}T${toHHMM(nowMinutesIn(ctx.timeZone))}:00.000Z`;
      const c = checkTimeOff(i.start, i.end, now);
      if (!c.ok) throw new Error(c.reason);
      const ids: string[] = [];
      try {
        for (const d of splitByDay(c.span)) {
          const ev = await createEvent(ctx.userId, {
            title: i.title,
            start: d.startISO,
            end: d.endISO,
            category: 'other',
            itemType: 'event',
            flexibility: 'fixed',
            origin: 'manual',
          });
          ids.push(ev.id);
        }
      } catch (err) {
        // All or nothing: half a vacation would read as the whole one saved.
        await Promise.all(ids.map((id) => deleteEvent(ctx.userId, id).catch(() => false)));
        throw err;
      }
      await refresh(ctx);
      return {
        output: { blocked: ids.length },
        applied: { summary: `Blocked "${i.title}"`, eventIds: ids, undo: ids.map((id) => ({ op: 'delete' as const, id })) },
      };
    },
  },
};
