/**
 * Self-check for src/server/ai/scoring.ts and the ranked placer in find-time.ts.
 *   node src/server/ai/scoring.check.mjs
 */
import assert from 'node:assert/strict';

const { ruleBlocks, anyRuleBlocks, slotFeatures, scoreFeatures, hourOf, weekdayOf } =
  await import('./scoring.ts');
const { rankFreeSlots, selectSlots } = await import('./find-time.ts');
const { defaultProfile, WEIGHT_KEYS } = await import('./preferences.ts');

let n = 0;
const ok = (label) => { n++; if (process.env.VERBOSE) console.log('  ✓', label); };

// 2026-09-15 is a Tuesday.
const TUE = '2026-09-15';
const at = (hhmm, day = TUE) => Date.parse(`${day}T${hhmm}:00.000Z`);

// ── time helpers ────────────────────────────────────────────────────────────
{
  assert.equal(hourOf(at('09:30')), 9.5);
  assert.equal(weekdayOf(at('09:00')), 'tue');
  assert.equal(weekdayOf(at('09:00', '2026-09-19')), 'sat');
  ok('hour/weekday helpers use UTC wall-clock');
}

// ── hard rules filter, they do not score ────────────────────────────────────

const hardRule = (kind, rule) => ({ id: 'r', kind, rule, hard: true, label: '', source: 'chat' });

{
  const r = hardRule('protected', { start: 12, end: 13 });
  assert.equal(ruleBlocks(r, at('12:00'), at('12:30'), 'deep-work'), true, 'inside is blocked');
  assert.equal(ruleBlocks(r, at('11:00'), at('12:00'), 'deep-work'), false, 'abutting is fine');
  assert.equal(ruleBlocks(r, at('13:00'), at('14:00'), 'deep-work'), false, 'after is fine');
  assert.equal(ruleBlocks(r, at('11:30'), at('12:30'), 'deep-work'), true, 'overlap is blocked');
  ok('a protected window blocks only genuine overlap');
}

{
  // A soft rule of the same shape must never filter — that is the whole
  // hard/soft distinction.
  const soft = { ...hardRule('protected', { start: 12, end: 13 }), hard: false };
  assert.equal(ruleBlocks(soft, at('12:00'), at('12:30'), 'deep-work'), false);
  ok('a soft rule never filters');
}

{
  const r = hardRule('work-hours', { start: 9, end: 17 });
  assert.equal(ruleBlocks(r, at('08:00'), at('09:00'), 'deep-work'), true, 'before hours');
  assert.equal(ruleBlocks(r, at('16:00'), at('17:00'), 'deep-work'), false, 'ends exactly on close');
  assert.equal(ruleBlocks(r, at('16:30'), at('17:30'), 'deep-work'), true, 'runs past close');
  ok('work-hours requires the block to sit inside the window');
}

{
  const r = hardRule('no-meetings', { start: 9, end: 12 });
  assert.equal(ruleBlocks(r, at('10:00'), at('11:00'), 'meeting'), true);
  assert.equal(ruleBlocks(r, at('10:00'), at('11:00'), 'deep-work'), false, 'only meetings');
  ok('no-meetings applies to meetings only');
}

{
  // A weekday-scoped rule must not leak onto other days.
  const r = hardRule('protected', { day: 'fri', start: 9, end: 17 });
  assert.equal(ruleBlocks(r, at('10:00', TUE), at('11:00', TUE), 'deep-work'), false);
  assert.equal(ruleBlocks(r, at('10:00', '2026-09-18'), at('11:00', '2026-09-18'), 'deep-work'), true);
  ok('a day-scoped rule only applies on that day');
}

{
  assert.equal(anyRuleBlocks([], at('10:00'), at('11:00'), 'deep-work'), false);
  ok('no rules means nothing is blocked');
}

// ── features stay in range ──────────────────────────────────────────────────
{
  const profile = defaultProfile();
  const ctx = {
    busy: [{ s: at('11:00'), e: at('12:00') }],
    earliest: at('08:00'),
    latest: at('18:00'),
    category: 'deep-work',
    dayStartHour: 9,
    dayEndHour: 18,
  };
  for (const h of ['09:00', '10:00', '12:00', '14:00', '17:00']) {
    const f = slotFeatures(profile, ctx, at(h), at(h) + 3_600_000);
    for (const k of WEIGHT_KEYS) {
      assert.ok(f[k] >= 0 && f[k] <= 1, `${k} at ${h} must be in [0,1], got ${f[k]}`);
    }
    const s = scoreFeatures(f, profile);
    assert.ok(s >= 0 && s <= 1, `score at ${h} must be in [0,1], got ${s}`);
  }
  ok('every feature and score stays in [0,1]');
}

{
  // Fragmentation: a block that strands a 15-minute orphan should score worse
  // than one aligned to the edge of the same gap.
  const profile = defaultProfile();
  const ctx = {
    busy: [{ s: at('11:00'), e: at('12:00') }],
    earliest: at('09:00'),
    latest: at('18:00'),
    category: 'deep-work',
    dayStartHour: 9,
    dayEndHour: 18,
  };
  const aligned = slotFeatures(profile, ctx, at('09:00'), at('10:00'));
  const stranding = slotFeatures(profile, ctx, at('09:15'), at('10:15'));
  assert.ok(
    aligned.fragmentation > stranding.fragmentation,
    'stranding a sliver must score worse on fragmentation',
  );
  ok('fragmentation penalises stranded slivers');
}

// ── ranked placement ────────────────────────────────────────────────────────

const spec = {
  durationMin: 60,
  count: 1,
  earliestISO: `${TUE}T00:00:00.000Z`,
  latestISO: `${TUE}T23:59:00.000Z`,
  dayStartHour: 9,
  dayEndHour: 17,
  bufferMin: 0,
  category: 'deep-work',
};

{
  const profile = defaultProfile();
  const ranked = rankFreeSlots([], spec, profile);
  assert.ok(ranked.length > 0, 'an empty day should yield candidates');
  // Sorted best-first.
  for (let i = 1; i < ranked.length; i++) {
    assert.ok(ranked[i - 1].score >= ranked[i].score, 'ranked output must be sorted');
  }
  assert.ok(ranked[0].reason.length > 0, 'the top slot must explain itself');
  ok('rankFreeSlots returns explained candidates, best first');
}

{
  // Never propose over a hard conflict.
  const profile = defaultProfile();
  const busy = [{ start: `${TUE}T09:00:00.000Z`, end: `${TUE}T12:00:00.000Z` }];
  const ranked = rankFreeSlots(busy, spec, profile);
  for (const r of ranked) {
    assert.ok(
      Date.parse(r.startISO) >= at('12:00'),
      `candidate ${r.startISO} overlaps a busy block`,
    );
  }
  ok('ranked candidates never overlap a busy block');
}

{
  // A hard rule must remove candidates outright, not merely down-rank them.
  const profile = defaultProfile();
  profile.rules = [hardRule('protected', { start: 9, end: 12 })];
  const ranked = rankFreeSlots([], spec, profile);
  for (const r of ranked) {
    assert.ok(Date.parse(r.startISO) >= at('12:00'), `${r.startISO} violates a hard rule`);
  }
  ok('a hard rule filters candidates out entirely');
}

{
  // A learned preference reorders without removing anything.
  const withPref = defaultProfile();
  withPref.learned = [
    {
      id: 'lp1', kind: 'preferred-hours', scope: 'deep-work',
      value: { hourStart: 14, hourEnd: 16 }, strength: 0.9,
      evidenceCount: 20, userVerdict: 'confirmed',
    },
  ];
  const plain = rankFreeSlots([], spec, defaultProfile());
  const learned = rankFreeSlots([], spec, withPref);
  assert.equal(plain.length, learned.length, 'a soft preference must not remove candidates');

  const topHour = hourOf(Date.parse(learned[0].startISO));
  assert.ok(topHour >= 13 && topHour < 16, `expected an afternoon top pick, got ${topHour}`);
  ok('a learned preference reorders candidates without filtering');
}

// ── selection ───────────────────────────────────────────────────────────────
{
  const profile = defaultProfile();
  const ranked = rankFreeSlots([], { ...spec, count: 3 }, profile);
  const { chosen, alternatives } = selectSlots(ranked, { count: 3, bufferMin: 15 });
  assert.equal(chosen.length, 3);
  // No two picks may overlap, buffer included.
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      const a = chosen[i];
      const b = chosen[j];
      assert.ok(
        Date.parse(a.endISO) + 15 * 60000 <= Date.parse(b.startISO) ||
          Date.parse(b.endISO) + 15 * 60000 <= Date.parse(a.startISO),
        'picked blocks must not overlap or crowd each other',
      );
    }
  }
  assert.ok(alternatives.every((a) => !chosen.includes(a)), 'alternatives are distinct from picks');
  ok('selectSlots picks non-overlapping blocks and distinct alternatives');
}

{
  // maxPerDay is what stops "three slots this week" stacking on Monday morning.
  const profile = defaultProfile();
  const weekSpec = {
    ...spec,
    count: 3,
    earliestISO: `${TUE}T00:00:00.000Z`,
    latestISO: '2026-09-19T23:59:00.000Z',
    skipWeekends: true,
  };
  const ranked = rankFreeSlots([], weekSpec, profile);
  const { chosen } = selectSlots(ranked, { count: 3, maxPerDay: 1, bufferMin: 10 });
  const days = new Set(chosen.map((c) => c.startISO.slice(0, 10)));
  assert.equal(days.size, chosen.length, 'one block per day means distinct days');
  ok('maxPerDay spreads blocks across days');
}

{
  // Weekend exclusion.
  const profile = defaultProfile();
  const ranked = rankFreeSlots([], {
    ...spec,
    earliestISO: '2026-09-19T00:00:00.000Z', // Saturday
    latestISO: '2026-09-20T23:59:00.000Z',   // Sunday
    skipWeekends: true,
  }, profile);
  assert.equal(ranked.length, 0, 'weekdaysOnly must yield nothing across a weekend');
  ok('skipWeekends excludes Saturday and Sunday');
}

console.log(`scoring.check: ok (${n} checks)`);
