import type { ApiEvent, EventInput } from '@/lib/api-types';

// Relative with the extension, unlike the '@/lib' type import above: this is a
// value import, and the check harness loads this file directly in node, which
// resolves neither the alias nor an extensionless path.
import { isImported } from '../lib/synced-fields.ts';

import type { CatKey } from './tokens';
import type { CalEvent, EventKind } from './types';

/**
 * `ApiEvent` (the calendar_events wire shape) <-> `CalEvent` (this screen's
 * model). The mapping is the crux of API-backing the calendar:
 *
 *  - string id   <-> number id via a stable hash (+ a reverse map in cal-store)
 *  - ISO instant <-> `date` + `HH:MM`   (naive wall-clock, server runs UTC)
 *  - category    <-> cat                 (meeting<->sync, deep-work<->deep, ...)
 *  - itemType/flexibility/origin/isDraft <-> kind
 */

const CAT_TO_CATEGORY: Record<CatKey, string> = {
  deep: 'deep-work',
  design: 'design',
  research: 'research',
  sync: 'meeting',
  admin: 'admin',
};

const CATEGORY_TO_CAT: Record<string, CatKey> = {
  'deep-work': 'deep',
  design: 'design',
  research: 'research',
  meeting: 'sync',
  admin: 'admin',
  learning: 'admin',
  break: 'admin',
  other: 'admin',
};

/** Stable 32-bit FNV-1a, kept positive and well under 2^31 so it is a safe
 *  React key and array index. Deterministic: the same server id always hashes
 *  to the same number, on every device and every reload. */
export function hashId(serverId: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < serverId.length; i++) {
    h ^= serverId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2_000_000_000;
}

function isoToParts(iso: string): { date: string; hhmm: string } {
  // '2026-09-09T11:00:00.000Z' -> date '2026-09-09', hhmm '11:00'
  return { date: iso.slice(0, 10), hhmm: iso.slice(11, 16) };
}

function partsToIso(date: string, hhmm: string): string {
  return `${date}T${hhmm}:00.000Z`;
}

/**
 * Wire row -> kind. Order matters, most-specific first: a proposal is a
 * proposal even if it also repeats, and a protected block outranks the fact
 * that it is on a weekly rule.
 */
function kindFromApi(e: ApiEvent): EventKind {
  if (e.origin === 'ai' || e.isDraft) return 'ai';
  if (e.itemType === 'break') return 'break';
  if (e.itemType === 'task') return 'task';
  if (e.itemType === 'deepwork' || e.flexibility === 'protected') return 'focus';
  if (e.rrule) return 'routine';
  return 'event';
}

/** The weekly rule a block written as a routine gets. */
export const DEFAULT_RRULE = 'FREQ=WEEKLY';

const KIND_TO_ITEM_TYPE: Record<EventKind, string> = {
  event: 'event',
  task: 'task',
  routine: 'event',
  focus: 'deepwork',
  ai: 'event',
  break: 'break',
};

export function toCalEvent(e: ApiEvent): CalEvent {
  const s = isoToParts(e.start);
  const en = isoToParts(e.end);
  const cal: CalEvent = {
    id: hashId(e.id),
    date: s.date,
    start: s.hhmm,
    end: en.hhmm,
    title: e.title,
    cat: CATEGORY_TO_CAT[e.category] ?? 'admin',
    project: e.projectLabel ?? '',
    kind: kindFromApi(e),
    notes: e.notes ?? '',
  };
  if (e.rrule) cal.rrule = e.rrule;
  if (e.flexibility === 'flexible') cal.flexible = true;
  // Dropped on the floor before this, so the calendar offered Edit and Delete
  // on events it had no way to change.
  if (isImported(e.origin)) cal.imported = true;
  if (e.calendarId) cal.calendarId = e.calendarId;
  if (e.allDay) cal.allDay = true;
  if (en.date !== s.date) cal.endDate = en.date;
  return cal;
}

/** A `CalEvent` (or the partial from the compose sheet) -> the API body. */
export function toEventInput(c: Partial<CalEvent>): Partial<EventInput> {
  const out: Partial<EventInput> = {};
  if (c.title !== undefined) out.title = c.title;
  if (c.date !== undefined && c.start !== undefined) out.start = partsToIso(c.date, c.start);
  // An overnight block ends on the next day; `end` alone would put it before its start.
  if (c.date !== undefined && c.end !== undefined) out.end = partsToIso(c.endDate ?? c.date, c.end);
  if (c.cat !== undefined) out.category = CAT_TO_CATEGORY[c.cat];
  if (c.notes !== undefined) out.notes = c.notes || null;
  if (c.project !== undefined) out.projectLabel = c.project || null;

  if (c.kind !== undefined) {
    out.itemType = KIND_TO_ITEM_TYPE[c.kind];
    out.origin = c.kind === 'ai' ? 'ai' : 'manual';
    out.flexibility = c.kind === 'focus' ? 'protected' : 'flexible';
    // "Routine" is not a column — it is the presence of a recurrence rule. Send
    // one when the block becomes a routine and clear it when it stops being
    // one, or a block edited out of Routine keeps repeating on the server.
    out.rrule = c.kind === 'routine' ? c.rrule ?? DEFAULT_RRULE : null;
  } else if (c.rrule !== undefined) {
    out.rrule = c.rrule || null;
  } else if (c.flexible !== undefined) {
    out.flexibility = c.flexible ? 'flexible' : 'fixed';
  }
  return out;
}

/**
 * The PATCH body for applying `patch` to `current`.
 *
 * Not simply `toEventInput(patch)`, for two reasons.
 *
 * Times are sent whole. `start` and `end` are instants built from `date` plus
 * `HH:MM`, and `toEventInput` only builds one when both halves are in the patch
 * — so a patch that moved `start` alone produced no time at all and saved
 * nothing. Any change to date, start or end now sends both instants, taken from
 * the merged event.
 *
 * An imported event keeps its origin and its `fixed` flexibility. `toEventInput`
 * derives origin from kind, so protecting and then unprotecting a Google event
 * rewrote it as a manual, movable block — which both removed it from the locks
 * in synced-fields.ts and told the scheduler it was free to plan over it.
 */
export function toEventPatch(current: CalEvent, patch: Partial<CalEvent>): Partial<EventInput> {
  const merged: CalEvent = { ...current, ...patch };
  const out: Partial<EventInput> = {};

  if (patch.title !== undefined) out.title = patch.title;
  if (patch.date !== undefined || patch.start !== undefined || patch.end !== undefined || 'endDate' in patch) {
    out.start = partsToIso(merged.date, merged.start);
    out.end = partsToIso(merged.endDate ?? merged.date, merged.end);
  }
  if (patch.cat !== undefined) out.category = CAT_TO_CATEGORY[patch.cat];
  if (patch.notes !== undefined) out.notes = patch.notes || null;
  if (patch.project !== undefined) out.projectLabel = patch.project || null;

  if (patch.kind !== undefined) {
    const k = toEventInput({ kind: patch.kind, flexible: merged.flexible, rrule: merged.rrule });
    out.itemType = k.itemType;
    out.flexibility = k.flexibility;
    if (current.imported) {
      if (patch.kind !== 'focus') out.flexibility = 'fixed';
    } else {
      out.origin = k.origin;
      // Routine is the recurrence rule (see toEventInput). Google owns the
      // recurrence of an imported event, so only Find time's own blocks carry it.
      out.rrule = k.rrule;
    }
  } else if (patch.rrule !== undefined && !current.imported) {
    out.rrule = patch.rrule || null;
  } else if (patch.flexible !== undefined) {
    out.flexibility = patch.flexible ? 'flexible' : 'fixed';
  }
  return out;
}
