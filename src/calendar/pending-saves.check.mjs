/**
 * Self-check for src/calendar/pending-saves.ts.
 *   node src/calendar/pending-saves.check.mjs
 */
import assert from 'node:assert/strict';

const { PendingSaves } = await import('./pending-saves.ts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Patches to one id merge, and one settle answers every caller.
{
  const q = new PendingSaves(0);
  const a = q.enqueue(5, { kind: 'patch', patch: { title: 'a' } });
  const b = q.enqueue(5, { kind: 'patch', patch: { start: '10:00' } });
  const t = q.take(5);
  assert.deepEqual(t.op, { kind: 'patch', patch: { title: 'a', start: '10:00' } });
  t.settle(true);
  assert.deepEqual(await Promise.all([a, b]), [true, true]);
  assert.equal(q.has(5), false);
}

// A later patch wins key by key.
{
  const q = new PendingSaves(0);
  void q.enqueue(1, { kind: 'patch', patch: { title: 'first', notes: 'keep' } });
  void q.enqueue(1, { kind: 'patch', patch: { title: 'second' } });
  assert.deepEqual(q.take(1).op, { kind: 'patch', patch: { title: 'second', notes: 'keep' } });
}

// A delete wins over a patch in either order; patching a row being removed is moot.
{
  const q = new PendingSaves(0);
  void q.enqueue(2, { kind: 'patch', patch: { title: 'x' } });
  void q.enqueue(2, { kind: 'delete' });
  assert.deepEqual(q.take(2).op, { kind: 'delete' });

  void q.enqueue(3, { kind: 'delete' });
  void q.enqueue(3, { kind: 'patch', patch: { title: 'x' } });
  assert.deepEqual(q.take(3).op, { kind: 'delete' });
}

// Failure reaches every caller too.
{
  const q = new PendingSaves(0);
  const a = q.enqueue(4, { kind: 'patch', patch: {} });
  const b = q.enqueue(4, { kind: 'delete' });
  q.take(4).settle(false);
  assert.deepEqual(await Promise.all([a, b]), [false, false]);
}

// Ids are independent, and an unknown id is not an error.
{
  const q = new PendingSaves(0);
  void q.enqueue(7, { kind: 'delete' });
  void q.enqueue(-1, { kind: 'patch', patch: { title: 't' } });
  assert.deepEqual(q.ids().sort((x, y) => x - y), [-1, 7]);
  assert.equal(q.take(99), null);
}

// A write that never finds its id reports failure rather than hanging.
{
  let expired = null;
  const q = new PendingSaves(20, (id) => {
    expired = id;
  });
  const p = q.enqueue(9, { kind: 'patch', patch: { title: 'x' } });
  assert.equal(await p, false);
  assert.equal(expired, 9);
  assert.equal(q.has(9), false);
}

// Taking an entry cancels its timeout: it must not also report failure later.
{
  let expired = null;
  const q = new PendingSaves(20, (id) => {
    expired = id;
  });
  const p = q.enqueue(6, { kind: 'delete' });
  q.take(6).settle(true);
  assert.equal(await p, true);
  await sleep(40);
  assert.equal(expired, null);
}

console.log('pending-saves.check: ok');
