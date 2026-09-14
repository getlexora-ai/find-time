/**
 * Self-check for the ApiEvent <-> CalEvent mapping. No test runner:
 *   node src/calendar/api-adapter.check.mjs
 */
import assert from 'node:assert/strict';

import { hashId, toCalEvent, toEventInput, toEventPatch } from './api-adapter.ts';

const api = {
  id: 'evt_abc',
  title: 'Deep work',
  start: '2026-09-09T11:00:00.000Z',
  end: '2026-09-09T12:30:00.000Z',
  category: 'deep-work',
  itemType: 'event',
  flexibility: 'protected',
  origin: 'manual',
  isDraft: false,
  projectLabel: 'Mobile launch',
  notes: 'map the flow',
};

const cal = toCalEvent(api);
assert.equal(cal.date, '2026-09-09');
assert.equal(cal.start, '11:00');
assert.equal(cal.end, '12:30');
assert.equal(cal.cat, 'deep');
assert.equal(cal.kind, 'focus');
assert.equal(cal.project, 'Mobile launch');
assert.equal(cal.id, hashId('evt_abc'));
assert.ok(cal.id > 0 && Number.isInteger(cal.id));

const back = toEventInput(cal);
assert.equal(back.start, '2026-09-09T11:00:00.000Z');
assert.equal(back.end, '2026-09-09T12:30:00.000Z');
assert.equal(back.category, 'deep-work');
assert.equal(back.flexibility, 'protected');
assert.equal(back.itemType, 'event');
assert.equal(back.projectLabel, 'Mobile launch');

// kind derivation precedence
assert.equal(toCalEvent({ ...api, itemType: 'break', flexibility: 'protected' }).kind, 'break');
assert.equal(toCalEvent({ ...api, origin: 'ai', flexibility: 'protected' }).kind, 'ai');
assert.equal(toCalEvent({ ...api, isDraft: true }).kind, 'ai');
assert.equal(toCalEvent({ ...api, flexibility: 'flexible' }).kind, 'event');
assert.equal(toCalEvent({ ...api, flexibility: 'flexible' }).flexible, true);

// unknown category falls back, never throws
assert.equal(toCalEvent({ ...api, category: 'wat' }).cat, 'admin');

// hash is stable and collision-free on a small spread
const ids = ['evt_1', 'evt_2', 'evt_abc', 'evt_abd', 'u1', 'evt_' + 'x'.repeat(40)];
assert.equal(new Set(ids.map(hashId)).size, ids.length);
assert.equal(hashId('evt_abc'), hashId('evt_abc'));

// imported events are flagged, and a kind change never un-imports them
const g = toCalEvent({ ...api, origin: 'imported', flexibility: 'fixed' });
assert.equal(g.imported, true);
assert.equal(g.kind, 'event');
assert.equal(toCalEvent(api).imported, undefined);

const protect = toEventPatch(g, { kind: 'focus' });
assert.equal(protect.flexibility, 'protected');
assert.equal('origin' in protect, false, 'protecting a Google event must not rewrite it as manual');
const unprotect = toEventPatch({ ...g, kind: 'focus' }, { kind: 'event' });
assert.equal(unprotect.flexibility, 'fixed', 'unprotecting returns it to fixed, not movable');
assert.equal('origin' in unprotect, false);

// accepting an AI block still makes it manual
const proposed = toCalEvent({ ...api, origin: 'ai', flexibility: 'flexible' });
assert.equal(toEventPatch(proposed, { kind: 'event' }).origin, 'manual');

// a patch that touches one time field still sends whole instants
assert.equal(toEventInput({ start: '14:00' }).start, undefined, 'the old path sent no time at all');
const onlyStart = toEventPatch(cal, { start: '14:00' });
assert.equal(onlyStart.start, '2026-09-09T14:00:00.000Z');
assert.equal(onlyStart.end, '2026-09-09T12:30:00.000Z');
const newDay = toEventPatch(cal, { date: '2026-09-10' });
assert.equal(newDay.start, '2026-09-10T11:00:00.000Z');
assert.equal(newDay.end, '2026-09-10T12:30:00.000Z');

// untouched fields are not sent
assert.deepEqual(Object.keys(toEventPatch(cal, { title: 'x' })), ['title']);

console.log('api-adapter.check: ok');
