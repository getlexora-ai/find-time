/**
 * Self-check for what reaches Google (push.ts). No database, no network:
 *   node src/server/google/push.check.mjs
 */
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../', import.meta.url));
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) spec = ${JSON.stringify(SRC)} + spec.slice(2) + (/\\.[a-z]+$/i.test(spec) ? '' : '.ts');
  else if (spec.startsWith('.') && !/\\.[a-z]+$/i.test(spec)) spec = spec + '.ts';
  return next(spec, ctx);
}`),
);

const { copyBody, sendCopy, wantsCopy } = await import('./push.ts');

// ── which rows get a copy ──
{
  const block = { origin: 'manual', deleted_at: null, is_draft: false, rrule: null };
  assert.equal(wantsCopy(block), true, 'an ordinary block, not only focus time');
  assert.equal(wantsCopy({ ...block, origin: 'ai' }), true, 'an accepted AI block: a proposal has no row');
  assert.equal(wantsCopy({ ...block, origin: 'imported' }), false, 'Google already has it');
  assert.equal(wantsCopy({ ...block, is_draft: true }), false);
  assert.equal(wantsCopy({ ...block, deleted_at: new Date() }), false, 'deleted: the copy comes down');
  assert.equal(wantsCopy({ ...block, rrule: 'FREQ=WEEKLY' }), false, 'a repeat would come back doubled');
}

// ── what the copy says ──
{
  const ev = { title: 'German', start_at: new Date('2026-11-09T10:00:00.000Z'), end_at: new Date('2026-11-09T11:30:00.000Z'), all_day: false };
  const body = copyBody(ev, 'Europe/Berlin');
  assert.deepEqual(body.start, { dateTime: '2026-11-09T10:00:00', timeZone: 'Europe/Berlin' }, 'wall-clock in the zone, not shifted');
  assert.equal(body.summary, 'German');
  assert.equal(body.visibility, 'private', 'others see busy, not the title');
  assert.equal(body.transparency, 'opaque');
  const day = copyBody({ ...ev, start_at: new Date('2026-11-09T00:00:00.000Z'), end_at: new Date('2026-11-10T00:00:00.000Z'), all_day: true }, 'Europe/Berlin');
  assert.deepEqual([day.start, day.end], [{ date: '2026-11-09' }, { date: '2026-11-10' }]);
}

// ── making, updating, and a copy deleted by hand in Google ──
{
  const script = (...statuses) => {
    const calls = [];
    return { calls, send: async (method, path) => {
      calls.push(`${method} ${path}`);
      return new Response('{}', { status: statuses.shift() });
    } };
  };
  const fresh = script(200);
  await sendCopy(fresh.send, '/cal', null, {});
  assert.deepEqual(fresh.calls, ['POST /cal']);

  const moved = script(200);
  await sendCopy(moved.send, '/cal', 'g1', {});
  assert.deepEqual(moved.calls, ['PATCH /cal/g1'], 'a move updates the same event, never a second one');

  const gone = script(404, 200);
  await sendCopy(gone.send, '/cal', 'g1', {});
  assert.deepEqual(gone.calls, ['PATCH /cal/g1', 'POST /cal'], 'deleted in Google: made again');

  const refused = script(403);
  assert.equal((await sendCopy(refused.send, '/cal', 'g1', {})).status, 403, 'a refusal is reported, not retried as a new event');
}

console.log('push.check: ok');
