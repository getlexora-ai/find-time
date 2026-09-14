/**
 * Self-check for src/server/ai/learn.ts. No test runner:
 *   node src/server/ai/learn.check.mjs
 */
import assert from 'node:assert/strict';

const { claimsFrom, mergeClaim, updateWeights, learnFrom, describeClaim, MAX_STEP } =
  await import('./learn.ts');
const { defaultProfile, DEFAULT_WEIGHTS, WEIGHT_MAX, WEIGHT_MIN } = await import('./preferences.ts');

const F = (over = {}) => ({
  hourFit: 0.5, energy: 0.5, fragmentation: 0.5, dayLoad: 0.5,
  backToBack: 0.5, earliness: 0.5, weekdayFit: 0.5, ...over,
});

let n = 0;
const ok = (label) => { n++; if (process.env.VERBOSE) console.log('  ✓', label); };

// ── updateWeights ───────────────────────────────────────────────────────────

// The user chose a slot that scored higher on `energy` than the one we proposed,
// so `energy` must become more important and nothing else may move.
{
  const { weights, delta } = updateWeights(
    { ...DEFAULT_WEIGHTS },
    F({ energy: 0.2 }),
    F({ energy: 0.9 }),
    1,
  );
  assert.ok(weights.energy > DEFAULT_WEIGHTS.energy, 'energy weight should rise');
  assert.deepEqual(Object.keys(delta), ['energy'], 'only energy should change');
  ok('updateWeights moves the discriminating feature only');
}

// Symmetry: preferring a slot that scored LOWER on a feature must lower it.
{
  const { weights } = updateWeights({ ...DEFAULT_WEIGHTS }, F({ earliness: 0.9 }), F({ earliness: 0.1 }), 1);
  assert.ok(weights.earliness < DEFAULT_WEIGHTS.earliness, 'earliness weight should fall');
  ok('updateWeights is symmetric');
}

// A single wild correction must not be able to rewrite the vector.
{
  const { weights } = updateWeights(
    { ...DEFAULT_WEIGHTS },
    F({ hourFit: 0, energy: 0, fragmentation: 0, dayLoad: 0, backToBack: 0, earliness: 0, weekdayFit: 0 }),
    F({ hourFit: 1, energy: 1, fragmentation: 1, dayLoad: 1, backToBack: 1, earliness: 1, weekdayFit: 1 }),
    1,
  );
  for (const [k, v] of Object.entries(weights)) {
    assert.ok(v <= WEIGHT_MAX && v >= WEIGHT_MIN, `${k} stays in band`);
    assert.ok(Math.abs(v - DEFAULT_WEIGHTS[k]) <= MAX_STEP + 0.05, `${k} step is capped`);
  }
  ok('updateWeights clamps a single extreme correction');
}

// A weak signal (acceptance) must move things far less than a strong one (edit).
{
  const strong = updateWeights({ ...DEFAULT_WEIGHTS }, F({ energy: 0.2 }), F({ energy: 0.9 }), 1);
  const weak = updateWeights({ ...DEFAULT_WEIGHTS }, F({ energy: 0.2 }), F({ energy: 0.9 }), 0.15);
  assert.ok(
    strong.weights.energy > weak.weights.energy,
    'a strong signal must move the weight further than a weak one',
  );
  ok('signal strength is respected');
}

// ── claimsFrom ──────────────────────────────────────────────────────────────

const proposal = {
  outcome: 'rejected',
  category: 'deep-work',
  proposedStart: '2026-09-15T09:00:00.000Z', // a Tuesday
  proposedEnd: '2026-09-15T10:00:00.000Z',
  proposedFeatures: F(),
};

// THE important case: "I didn't need it after all" says nothing about *time*.
// Learning an hour preference from it is exactly the confounding that makes
// naive versions of this feature train on noise.
{
  assert.deepEqual(claimsFrom({ ...proposal, reasonCode: 'not-needed' }), []);
  assert.deepEqual(claimsFrom({ ...proposal, reasonCode: 'other' }), []);
  assert.deepEqual(claimsFrom({ ...proposal, reasonCode: null }), []);
  ok('a rejection with no time-bearing reason teaches nothing');
}

{
  const c = claimsFrom({ ...proposal, reasonCode: 'too-early' });
  assert.equal(c.length, 1);
  assert.equal(c[0].kind, 'avoid-hours');
  assert.equal(c[0].scope, 'deep-work');
  ok('too-early produces a scoped avoid-hours claim');
}

{
  const c = claimsFrom({ ...proposal, reasonCode: 'wrong-day' });
  assert.deepEqual(c.map((x) => [x.kind, x.scope]), [['avoid-weekday', 'tue']]);
  ok('wrong-day produces an avoid-weekday claim for the right day');
}

{
  const c = claimsFrom({ ...proposal, reasonCode: 'back-to-back' });
  assert.equal(c[0].kind, 'buffer');
  ok('back-to-back asks for more air');
}

// An edit is the strong case: destination is evidence for, origin against.
{
  const c = claimsFrom({
    ...proposal,
    outcome: 'edited',
    finalStart: '2026-09-15T15:00:00.000Z',
    finalEnd: '2026-09-15T16:00:00.000Z',
  });
  const kinds = c.map((x) => x.kind);
  assert.ok(kinds.includes('preferred-hours'), 'destination hour is evidence for');
  assert.ok(kinds.includes('avoid-hours'), 'origin hour is evidence against');
  ok('an hour edit produces both sides of the comparison');
}

// A small drag is tidying, not a preference.
{
  const c = claimsFrom({
    ...proposal,
    outcome: 'edited',
    finalStart: '2026-09-15T09:30:00.000Z',
    finalEnd: '2026-09-15T10:30:00.000Z',
  });
  assert.equal(c.length, 0, 'a sub-hour nudge should not be learned from');
  ok('a small drag is ignored');
}

// A resize is the user correcting our duration estimate.
{
  const c = claimsFrom({
    ...proposal,
    outcome: 'edited',
    finalStart: '2026-09-15T09:00:00.000Z',
    finalEnd: '2026-09-15T10:30:00.000Z', // 60 -> 90 min
  });
  const bias = c.find((x) => x.kind === 'duration-bias');
  assert.ok(bias && bias.value.multiplier > 1, 'a lengthened block means we under-estimate');
  ok('a resize updates duration bias');
}

// Moving across days must be attributed to the days involved, not the hours.
{
  const c = claimsFrom({
    ...proposal,
    outcome: 'edited',
    finalStart: '2026-09-17T09:00:00.000Z', // Thursday, same hour
    finalEnd: '2026-09-17T10:00:00.000Z',
  });
  const pairs = c.map((x) => [x.kind, x.scope]);
  assert.ok(pairs.some(([k, s]) => k === 'preferred-weekday' && s === 'thu'));
  assert.ok(pairs.some(([k, s]) => k === 'avoid-weekday' && s === 'tue'));
  ok('a day move is attributed to the weekdays');
}

// ── mergeClaim ──────────────────────────────────────────────────────────────

// Re-deriving something the user just deleted is how an adaptive system starts
// feeling deaf. A rejected claim must stay dead.
{
  const rejected = {
    id: 'lp_1', kind: 'avoid-hours', scope: 'deep-work',
    value: { hourStart: 8, hourEnd: 10 }, strength: 0.8,
    evidenceCount: 9, userVerdict: 'rejected',
  };
  const merged = mergeClaim(rejected, {
    kind: 'avoid-hours', scope: 'deep-work', value: { hourStart: 8, hourEnd: 10 }, direction: 1,
  }, 1, () => 'lp_new');
  assert.equal(merged, null, 'a user-rejected claim must never be re-learned');
  ok('a deleted preference is never re-derived');
}

{
  const first = mergeClaim(undefined, {
    kind: 'preferred-hours', scope: 'design', value: { hourStart: 14, hourEnd: 16 }, direction: 1,
  }, 1, () => 'lp_x');
  assert.equal(first.evidenceCount, 1);
  assert.ok(first.strength > 0);

  const second = mergeClaim(first, {
    kind: 'preferred-hours', scope: 'design', value: { hourStart: 14, hourEnd: 16 }, direction: 1,
  }, 1, () => 'lp_y');
  assert.equal(second.evidenceCount, 2, 'evidence accumulates');
  assert.ok(second.strength > first.strength, 'repeated evidence strengthens the claim');
  assert.equal(second.id, first.id, 'the claim updates in place');
  ok('repeated evidence strengthens a claim in place');
}

// ── learnFrom ───────────────────────────────────────────────────────────────

// A bare rejection tells us this slot was wrong but not what better looks like,
// so it must not move the weight vector.
{
  const p = defaultProfile();
  const res = learnFrom(p, { ...proposal, reasonCode: 'too-early' }, () => 'lp_z');
  assert.deepEqual(res.weightDelta, {}, 'a rejection alone must not move weights');
  assert.ok(res.claims.length > 0, 'but it should still produce a claim');
  ok('rejection updates claims but not weights');
}

// An edit supplies both sides, so it may.
{
  const p = defaultProfile();
  const res = learnFrom(
    p,
    {
      ...proposal,
      outcome: 'edited',
      finalStart: '2026-09-15T15:00:00.000Z',
      finalEnd: '2026-09-15T16:00:00.000Z',
      finalFeatures: F({ energy: 0.95 }),
      proposedFeatures: F({ energy: 0.2 }),
    },
    () => 'lp_w',
  );
  assert.ok(Object.keys(res.weightDelta).length > 0, 'an edit should move weights');
  ok('an edit updates weights');
}

// A single data point must not be announced to the user as a learned fact.
{
  const p = defaultProfile();
  const res = learnFrom(p, { ...proposal, reasonCode: 'too-early' }, () => 'lp_q');
  assert.deepEqual(res.notes, [], 'one observation is a coincidence, not a preference');
  ok('a single observation is not announced');
}

// ── describeClaim ───────────────────────────────────────────────────────────

// Every acted-on preference must be sayable in one sentence — if it cannot be
// explained it should not be touching the calendar.
{
  const text = describeClaim({
    id: 'x', kind: 'preferred-hours', scope: 'design',
    value: { hourStart: 14, hourEnd: 16 }, strength: 0.6, evidenceCount: 7, userVerdict: null,
  });
  assert.match(text, /14:00/);
  assert.match(text, /design/);
  ok('a learned preference explains itself in words');
}

{
  // A multiplier that has drifted back to ~1 is not worth saying out loud.
  const text = describeClaim({
    id: 'x', kind: 'duration-bias', scope: 'admin',
    value: { multiplier: 1.02 }, strength: 0.5, evidenceCount: 9, userVerdict: null,
  });
  assert.equal(text, null, 'a negligible bias should not be surfaced');
  ok('a negligible claim is not surfaced');
}

console.log(`learn.check: ok (${n} checks)`);
