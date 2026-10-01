/**
 * Self-check for src/server/ai/plan-week.ts. No test runner:
 *   node src/server/ai/plan-week.check.mjs
 *
 * Bracketed numbers point at the trap in docs/fluidcalendar-lessons.md that a
 * case guards against.
 */
import assert from 'node:assert/strict';

const { planWeek, verifyPlan, sessionSize, dueLabel, MAX_SESSION_MIN } = await import('./plan-week.ts');
const { defaultProfile } = await import('./preferences.ts');

// Monday 7 Sep 2026, 08:07 — work hours 9–18 Mon–Fri, 10-min buffer.
const NOW = '2026-09-07T08:07:00.000Z';
const profile = defaultProfile();
const D = (day, hm) => `2026-09-${String(day).padStart(2, '0')}T${hm}:00.000Z`;
/** Exclusive end-of-day bound for a due date in September. */
const due = (day) => D(day + 1, '00:00');

const task = (over) => ({
  id: over.id ?? over.title,
  title: 'Task',
  category: 'deep-work',
  durationMin: 60,
  priority: 'medium',
  splittable: false,
  minChunkMin: 30,
  ...over,
});
const run = (over) => {
  const input = { nowISO: NOW, busy: [], existing: [], profile, ...over };
  const plan = planWeek(input);
  assert.deepEqual(verifyPlan(input, plan), [], 'plan breaks a hard rule');
  return plan;
};
const mins = (b) => (Date.parse(b.endISO) - Date.parse(b.startISO)) / 60_000;
const of = (plan, id) => plan.blocks.filter((b) => b.taskId === id);

// ── deadlines are hard bounds, and sooner is better inside them [1][2] ──────
{
  // An empty week and a task due Friday goes in today, not on Friday.
  const p = run({ tasks: [task({ id: 'r', title: 'Report', dueByISO: due(11) })] });
  assert.equal(of(p, 'r').length, 1);
  // Today, at the energy peak — not pushed toward Friday.
  assert.equal(of(p, 'r')[0].startISO, D(7, '10:00'));
}
{
  // Due today still means today, until the end of the day [2].
  const p = run({ tasks: [task({ id: 'r', title: 'Report', dueByISO: due(7) })] });
  assert.equal(of(p, 'r').length, 1);
  assert.ok(Date.parse(of(p, 'r')[0].endISO) <= Date.parse(due(7)));
  assert.equal(dueLabel(due(7)), 'Mon 7 Sep');
}
{
  // Only an hour free before the deadline: nothing is placed after it, and the
  // miss says why and what would help [1][9].
  const busy = [
    { start: D(7, '09:00'), end: D(7, '18:00') },
    { start: D(8, '10:00'), end: D(8, '18:00') },
  ];
  const p = run({ busy, tasks: [task({ id: 'r', title: 'Report', durationMin: 180, splittable: true, dueByISO: due(8) })] });
  for (const b of of(p, 'r')) assert.ok(Date.parse(b.endISO) <= Date.parse(due(8)));
  assert.equal(p.unplaced.length, 1);
  assert.match(p.unplaced[0].reason, /needs 3h before Tue 8 Sep and only 1h is free — I placed 1h, 2h still has no slot/);
  assert.ok(p.unplaced[0].options.includes('Report due next week'));
  assert.ok(p.unplaced[0].options.some((o) => /^Report takes /.test(o)));
}
{
  // A deadline already past is reported, never quietly scheduled late [1].
  const p = run({ tasks: [task({ id: 'r', title: 'Report', dueByISO: due(4) })] });
  assert.equal(p.blocks.length, 0);
  assert.match(p.unplaced[0].reason, /was due Fri 4 Sep, which has passed/);
}

// ── order: earliest deadline first, then priority [5] ───────────────────────
{
  // One free hour on Monday. The task due Monday gets it even though the other
  // one is high priority; the high-priority one goes to Tuesday.
  const busy = [{ start: D(7, '10:00'), end: D(7, '18:00') }];
  const p = run({
    busy,
    tasks: [
      task({ id: 'big', title: 'Big', priority: 'high', dueByISO: due(11) }),
      task({ id: 'soon', title: 'Soon', priority: 'low', dueByISO: due(7) }),
    ],
  });
  assert.deepEqual(p.order, ['soon', 'big']);
  assert.equal(of(p, 'soon')[0].startISO, D(7, '09:00'));
  assert.ok(of(p, 'big')[0].startISO.startsWith('2026-09-08'));
  assert.equal(p.unplaced.length, 0);
}
{
  // No deadlines: priority decides who gets the only slot.
  const busy = [{ start: D(7, '10:00'), end: D(7, '18:00') }];
  const days = [8, 9, 10, 11, 14, 15, 16, 17, 18].map((d) => ({ start: D(d, '09:00'), end: D(d, '18:00') }));
  const p = run({
    busy: [...busy, ...days],
    tasks: [task({ id: 'lo', title: 'Lo', priority: 'low' }), task({ id: 'hi', title: 'Hi', priority: 'high' })],
  });
  assert.deepEqual(p.order, ['hi', 'lo']);
  assert.equal(of(p, 'hi').length, 1);
  assert.equal(p.unplaced[0].taskId, 'lo');
}

// ── splitting ───────────────────────────────────────────────────────────────
{
  // 5h, splittable, due Friday: sessions of at most 2h, one a day.
  const p = run({ tasks: [task({ id: 'd', title: 'Deck', durationMin: 300, splittable: true, dueByISO: due(11) })] });
  const s = of(p, 'd');
  assert.equal(s.reduce((n, b) => n + mins(b), 0), 300);
  assert.ok(s.every((b) => mins(b) <= MAX_SESSION_MIN));
  assert.equal(new Set(s.map((b) => b.startISO.slice(0, 10))).size, s.length, 'one session a day');
}
{
  // Not splittable, and no 3h gap anywhere before Wednesday: asked to split [9].
  const busy = [7, 8].flatMap((d) => [
    { start: D(d, '11:00'), end: D(d, '11:30') },
    { start: D(d, '14:00'), end: D(d, '14:30') },
    { start: D(d, '16:30'), end: D(d, '17:00') },
  ]);
  const p = run({ busy, tasks: [task({ id: 'w', title: 'Write-up', durationMin: 180, dueByISO: due(8) })] });
  assert.equal(p.blocks.length, 0);
  assert.match(p.unplaced[0].reason, /no single free stretch of 3h before Tue 8 Sep/);
  assert.ok(p.unplaced[0].options.includes('split Write-up'));
}
assert.equal(sessionSize(90, { splittable: true, minChunkMin: 30 }), 90);
assert.equal(sessionSize(150, { splittable: true, minChunkMin: 45 }), 105, 'never leaves a remainder below the chunk');
assert.equal(sessionSize(130, { splittable: true, minChunkMin: 150 }), 130, 'never more than is left');
assert.equal(sessionSize(300, { splittable: false, minChunkMin: 30 }), 300);

// ── re-planning: keep what can stay, move only what must [15][17] ───────────
{
  // A future block that still works stays put; nothing new is proposed.
  const existing = [{ eventId: 'e1', taskId: 'r', startISO: D(9, '14:00'), endISO: D(9, '15:00'), pinned: false }];
  const p = run({ existing, tasks: [task({ id: 'r', title: 'Report', dueByISO: due(11) })] });
  assert.deepEqual(p.blocks.map((b) => [b.status, b.eventId]), [['kept', 'e1']]);
  assert.equal(p.moved.length, 0);
}
{
  // A meeting has since landed on it: it moves, and the new block says which one it replaces.
  const existing = [{ eventId: 'e1', taskId: 'r', startISO: D(9, '14:00'), endISO: D(9, '15:00'), pinned: false }];
  const busy = [{ start: D(9, '14:30'), end: D(9, '15:30') }];
  const p = run({ busy, existing, tasks: [task({ id: 'r', title: 'Report', dueByISO: due(11) })] });
  assert.equal(p.moved[0].eventId, 'e1');
  assert.match(p.moved[0].why, /something else is now booked/);
  assert.equal(of(p, 'r')[0].status, 'new');
  assert.equal(of(p, 'r')[0].replacesEventId, 'e1');
}
{
  // A pinned block stays even with something on top of it.
  const existing = [{ eventId: 'e1', taskId: 'r', startISO: D(9, '14:00'), endISO: D(9, '15:00'), pinned: true }];
  const busy = [{ start: D(9, '14:30'), end: D(9, '15:30') }];
  const p = run({ busy, existing, tasks: [task({ id: 'r', title: 'Report', dueByISO: due(11) })] });
  assert.deepEqual(p.blocks.map((b) => b.status), ['pinned']);
}
{
  // A session missed last Friday is not progress: the full hour is planned again [17].
  const existing = [{ eventId: 'old', taskId: 'r', startISO: D(4, '10:00'), endISO: D(4, '11:00'), pinned: true }];
  const p = run({ existing, tasks: [task({ id: 'r', title: 'Report', dueByISO: due(11) })] });
  assert.equal(of(p, 'r').length, 1);
  assert.equal(of(p, 'r')[0].status, 'new');
}
{
  // Kept time counts: 2h task with 1h already booked gets one more hour.
  const existing = [{ eventId: 'e1', taskId: 'r', startISO: D(8, '09:00'), endISO: D(8, '10:00'), pinned: false }];
  const p = run({ existing, tasks: [task({ id: 'r', title: 'Report', durationMin: 120, splittable: true, dueByISO: due(11) })] });
  const added = of(p, 'r').filter((b) => b.status === 'new');
  assert.equal(added.reduce((n, b) => n + mins(b), 0), 60);
}

// ── candidate slots [6][7][8] ───────────────────────────────────────────────
{
  const p = run({
    tasks: [
      task({ id: 'a', title: 'A', durationMin: 45, dueByISO: due(7) }),
      task({ id: 'b', title: 'B', durationMin: 45, dueByISO: due(7) }),
    ],
  });
  // On the 15-minute grid even though "now" is 08:07 [6].
  for (const b of p.blocks) assert.equal(new Date(b.startISO).getUTCMinutes() % 15, 0);
  // Inside work hours, ending by 18:00 to the minute [7].
  for (const b of p.blocks) assert.ok(b.endISO <= D(7, '18:00') && b.startISO >= D(7, '09:00'));
  // The buffer actually separates two new blocks [8].
  const [x, y] = p.blocks;
  assert.ok(Date.parse(y.startISO) - Date.parse(x.endISO) >= 10 * 60_000);
}
{
  // Work stays off the weekend; personal time may use it.
  const busy = [7, 8, 9, 10, 11].map((d) => ({ start: D(d, '00:00'), end: D(d + 1, '00:00') }));
  const p = run({
    busy,
    tasks: [
      task({ id: 'w', title: 'Work', dueByISO: due(14) }),
      task({ id: 'g', title: 'Gym', category: 'personal', dueByISO: due(14) }),
    ],
  });
  assert.ok(of(p, 'w')[0].startISO.startsWith('2026-09-14'));
  assert.ok(['2026-09-12', '2026-09-13'].includes(of(p, 'g')[0].startISO.slice(0, 10)));
}
{
  // A preferred afternoon is honoured when the afternoon has room.
  const p = run({ tasks: [task({ id: 'r', title: 'Review', preferredWindow: 'afternoon', dueByISO: due(11) })] });
  assert.ok(of(p, 'r')[0].startISO >= D(7, '12:00'));
}
{
  // Completing early is preferred when there is a soft target.
  const p = run({
    busy: [{ start: D(7, '09:00'), end: D(7, '18:00') }],
    tasks: [task({ id: 'r', title: 'Review', preferByISO: due(8), dueByISO: due(11) })],
  });
  assert.ok(of(p, 'r')[0].startISO.startsWith('2026-09-08'));
}

// ── the verifier catches a broken plan on its own ───────────────────────────
{
  const input = {
    nowISO: NOW,
    busy: [{ start: D(7, '09:00'), end: D(7, '10:00') }],
    existing: [],
    profile,
    tasks: [task({ id: 'r', title: 'Report', dueByISO: due(7) })],
  };
  const bad = {
    blocks: [
      { taskId: 'r', title: 'Report', category: 'deep-work', startISO: D(7, '09:30'), endISO: D(7, '10:30'), status: 'new', score: 0, reason: '' },
      { taskId: 'r', title: 'Report', category: 'deep-work', startISO: D(8, '09:00'), endISO: D(8, '10:00'), status: 'new', score: 0, reason: '' },
    ],
    unplaced: [],
    order: ['r'],
    moved: [],
  };
  const problems = verifyPlan(input, bad).join('\n');
  assert.match(problems, /overlaps busy time/);
  assert.match(problems, /ends after the deadline/);
  assert.match(problems, /120 min placed for a 60-min task/);
}

console.log('plan-week.check: ok');
