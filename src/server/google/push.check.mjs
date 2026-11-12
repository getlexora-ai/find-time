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

const { canWriteTo, copyBody, copyMoveSteps, copyTransparency, needsFlip, sendCopy, wantsCopy } = await import('./push.ts');

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

// ── which calendars a block may be copied to ──
{
  assert.equal(canWriteTo({ id: 'me@gmail.com', accessRole: 'owner' }), true, 'your primary');
  assert.equal(canWriteTo({ id: 'team@group.calendar.google.com', accessRole: 'writer' }), true, 'a shared one you can edit');
  assert.equal(canWriteTo({ id: 'boss@corp.com', accessRole: 'reader' }), false, 'read-only: never offered');
  assert.equal(canWriteTo({ id: 'boss@corp.com', accessRole: 'freeBusyReader' }), false);
  assert.equal(canWriteTo({ id: 'en.german#holiday@group.v.calendar.google.com', accessRole: 'owner' }), false, 'holidays: never');
}

// ── changing a block's calendar: the old copy comes down first ──
{
  assert.deepEqual(copyMoveSteps({ calendar_id: 'cal_a', provider_event_id: 'g1' }, 'cal_a'), [], 'same calendar: nothing to do');
  assert.deepEqual(copyMoveSteps({ calendar_id: 'cal_a', provider_event_id: 'g1' }, 'cal_b'), ['remove-old', 'set-calendar'], 'moved: delete in A, then B');
  assert.deepEqual(copyMoveSteps({ calendar_id: 'cal_a', provider_event_id: 'g1' }, null), ['remove-old', 'set-calendar'], 'Find Time only: copy removed');
  assert.deepEqual(copyMoveSteps({ calendar_id: 'cal_a', provider_event_id: null }, 'cal_b'), ['set-calendar'], 'never copied yet: just point it elsewhere');
  assert.deepEqual(copyMoveSteps({ calendar_id: null, provider_event_id: null }, 'cal_b'), ['set-calendar']);
}

// ── free while far, busy within a day (sessions only) ──
{
  const now = Date.parse('2026-11-12T09:00:00.000Z'); // wall-clock
  const at = (h) => new Date(now + h * 3_600_000);
  const task = { task_id: 't1', habit_id: null };
  const habit = { task_id: null, habit_id: 'h1' };
  const focus = { task_id: null, habit_id: null };
  assert.equal(copyTransparency({ ...task, start_at: at(48) }, now), 'transparent', 'a task session two days out: free');
  assert.equal(copyTransparency({ ...habit, start_at: at(30) }, now), 'transparent', 'a habit session too');
  assert.equal(copyTransparency({ ...task, start_at: at(20) }, now), 'opaque', 'within a day: busy, it holds');
  assert.equal(copyTransparency({ ...focus, start_at: at(48) }, now), 'opaque', 'focus and your own events: always busy');
  assert.equal(copyBody({ title: 'x', start_at: at(48), end_at: at(49), all_day: false }, 'UTC', 'transparent').transparency, 'transparent');

  // the flip: written free two days ago, now inside the day
  const real = Date.parse('2026-11-12T08:00:00.000Z'); // = 09:00 in Berlin (winter)
  const due = { ...task, start_at: new Date('2026-11-13T08:00:00.000Z') };
  assert.equal(needsFlip({ ...due, remote_updated_at: new Date(real - 2 * 86_400_000) }, 'Europe/Berlin', real), true, 'went out free, now within a day');
  assert.equal(needsFlip({ ...due, remote_updated_at: new Date(real - 3_600_000) }, 'Europe/Berlin', real), false, 'already written busy');
  assert.equal(needsFlip({ ...due, remote_updated_at: null }, 'Europe/Berlin', real), false, 'pushed before this existed: busy');
  assert.equal(
    needsFlip({ ...task, start_at: new Date('2026-11-15T08:00:00.000Z'), remote_updated_at: new Date(real - 86_400_000) }, 'Europe/Berlin', real),
    false,
    'still more than a day away: stays free',
  );
  assert.equal(needsFlip({ ...focus, start_at: due.start_at, remote_updated_at: new Date(real - 2 * 86_400_000) }, 'Europe/Berlin', real), false);
}

console.log('push.check: ok');
