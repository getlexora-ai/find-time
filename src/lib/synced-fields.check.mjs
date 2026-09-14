/**
 * Self-check for src/lib/synced-fields.ts.
 *   node src/lib/synced-fields.check.mjs
 */
import assert from 'node:assert/strict';

const { isImported, lockedFields, PROVIDER_OWNED_FIELDS } = await import('./synced-fields.ts');

// Only imported events are locked.
assert.deepEqual(lockedFields('manual', { title: 'x', start: 'a', end: 'b' }), []);
assert.deepEqual(lockedFields('ai', { title: 'x', notes: 'n' }), []);
assert.deepEqual(lockedFields(null, { title: 'x' }), []);

// Google owns the title, times and notes of an imported event.
assert.deepEqual(lockedFields('imported', { title: 'x', flexibility: 'protected' }), ['title']);
assert.deepEqual(lockedFields('imported', { start: 'a', end: 'b', notes: 'n' }).sort(), ['end', 'notes', 'start']);

// Find time's own metadata stays editable — this is what Protect relies on.
assert.deepEqual(
  lockedFields('imported', { flexibility: 'protected', itemType: 'event', category: 'design', projectLabel: 'p' }),
  [],
);

// Changing origin would remove the marker the locks depend on.
assert.deepEqual(lockedFields('imported', { origin: 'manual' }), ['origin']);

// Presence, not value.
assert.deepEqual(lockedFields('imported', { notes: null }), ['notes']);

assert.equal(isImported('imported'), true);
assert.equal(isImported('manual'), false);
assert.equal(isImported(undefined), false);
assert.ok(PROVIDER_OWNED_FIELDS.includes('title'));

console.log('synced-fields.check: ok');
