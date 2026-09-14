/**
 * Self-check for the pure parts of src/server/ai/capture-core.ts and the track-B
 * note builders in scoring.ts.
 *   node src/server/ai/capture.check.mjs
 *
 * The DB writers are not exercised here — they are thin inserts whose whole
 * contract is "never throw", and the interesting logic is the shaping that
 * happens before them.
 */
import assert from 'node:assert/strict';

const {
  hashInput,
  editKind,
  candidatesFrom,
  MAX_CANDIDATES,
  EXPLORE_RATE,
  shouldExplore,
  parseReport,
  REPORT_REASON_CODES,
  REPORT_NOTE_MAX,
} = await import('./capture-core.ts');
const { slotNotes, NOTE_MAX, slotFeatures } = await import('./scoring.ts');
const { buildScoreContext, spreadPick, rankFreeSlots, selectSlots } = await import('./find-time.ts');
const { defaultProfile } = await import('./preferences.ts');

let n = 0;
const ok = (label) => { n++; if (process.env.VERBOSE) console.log('  ✓', label); };

// 2026-09-15 is a Tuesday.
const TUE = '2026-09-15';
const iso = (hhmm, day = TUE) => `${day}T${hhmm}:00.000Z`;
const at = (hhmm, day = TUE) => Date.parse(iso(hhmm, day));

// ── input hashing ───────────────────────────────────────────────────────────
{
  // Key order must not change the hash, or replays of one question scatter
  // across many hashes and never group.
  assert.equal(hashInput({ a: 1, b: 2 }), hashInput({ b: 2, a: 1 }));
  assert.notEqual(hashInput({ a: 1 }), hashInput({ a: 2 }));
  assert.equal(hashInput({ a: [1, { x: 1, y: 2 }] }), hashInput({ a: [1, { y: 2, x: 1 }] }));
  assert.notEqual(hashInput({ a: [1, 2] }), hashInput({ a: [2, 1] }), 'array order is meaningful');
  ok('input hash is stable under key order, sensitive to values');
}

// ── edit classification ─────────────────────────────────────────────────────
{
  const p = { startISO: iso('09:00'), endISO: iso('11:00') };

  assert.equal(editKind(p, { startISO: iso('14:00'), endISO: iso('16:00') }), 'moved_time');
  assert.equal(
    editKind(p, { startISO: iso('09:00'), endISO: iso('10:00') }),
    'changed_duration',
    'same start, shorter block is about length, not time',
  );
  assert.equal(
    editKind(p, { startISO: iso('09:00', '2026-09-17'), endISO: iso('11:00', '2026-09-17') }),
    'changed_day',
  );
  assert.equal(
    editKind(p, { startISO: iso('09:00', '2026-09-17'), endISO: iso('10:00', '2026-09-17') }),
    'changed_day_and_duration',
  );
  // A two-minute nudge is the UI's grid, not an opinion about the hour.
  assert.equal(editKind(p, { startISO: iso('09:02'), endISO: iso('11:02') }), 'moved_time');
  ok('edits separate "wrong length" from "wrong time"');
}

// ── spread picking ──────────────────────────────────────────────────────────
{
  const list = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  const picked = spreadPick(list, 4);
  assert.equal(picked.length, 4);
  assert.equal(picked[0], 0, 'the best option is always included');
  assert.equal(picked[picked.length - 1], 9, 'the far end of the range is reached');
  // The whole purpose: not the top slice.
  assert.notDeepEqual(picked, [0, 1, 2, 3]);

  assert.deepEqual(spreadPick([1, 2], 5), [1, 2], 'asking for more than exists returns what exists');
  assert.deepEqual(spreadPick([], 3), []);
  assert.deepEqual(spreadPick([7], 1), [7]);
  ok('spread draws across the range, keeping the top option');
}

{
  // Deterministic: a logged occasion has to be replayable from the ranking.
  const list = Array.from({ length: 20 }, (_, i) => i);
  assert.deepEqual(spreadPick(list, 5), spreadPick(list, 5));
  ok('spread is deterministic');
}

// ── exploration rate ────────────────────────────────────────────────────────
{
  assert.ok(EXPLORE_RATE > 0 && EXPLORE_RATE < 0.5, 'rate is a slice, not the norm');
  assert.equal(shouldExplore(0), false);
  assert.equal(shouldExplore(1), true);
  ok('exploration is a bounded slice of occasions');
}

// ── candidate shaping ───────────────────────────────────────────────────────
{
  const profile = defaultProfile();
  const spec = {
    durationMin: 60,
    count: 1,
    earliestISO: iso('08:00'),
    latestISO: iso('18:00', '2026-09-17'),
    dayStartHour: 8,
    dayEndHour: 18,
    bufferMin: 10,
    skipWeekends: true,
    category: 'deep-work',
  };
  const ranked = rankFreeSlots([], spec, profile);
  assert.ok(ranked.length > 5, 'fixture produces a real field');

  const { chosen, alternatives } = selectSlots(ranked, { count: 1, bufferMin: 10, alternatives: 2 });
  const cands = candidatesFrom(ranked, [...chosen, ...alternatives]);

  assert.equal(cands.length, ranked.length, 'every ranked slot becomes a row');
  assert.equal(cands[0].rank, 0, 'rank is the position in the ranking');
  assert.ok(cands.every((c) => typeof c.score === 'number'));

  const offered = cands.filter((c) => c.offered);
  assert.equal(offered.length, chosen.length + alternatives.length, 'offered marks what was shown');
  assert.ok(
    offered.some((c) => c.startISO === chosen[0].startISO),
    'the block the user got is marked offered',
  );
  assert.ok(cands.every((c) => c.notes === undefined), 'notes are opt-in');
  ok('ranked slots become candidate rows with the offered set flagged');
}

// ── track B notes ───────────────────────────────────────────────────────────
{
  const profile = defaultProfile();
  const spec = {
    durationMin: 60,
    count: 1,
    earliestISO: iso('08:00'),
    latestISO: iso('18:00'),
    dayStartHour: 8,
    dayEndHour: 18,
    bufferMin: 10,
    skipWeekends: false,
    category: 'deep-work',
  };
  const busy = [{ start: iso('10:00'), end: iso('11:00') }];
  const ctx = buildScoreContext(busy, spec);
  const notes = slotNotes(profile, ctx, at('14:00'), at('15:00'));

  const keys = ['hourFit', 'energy', 'fragmentation', 'dayLoad', 'backToBack', 'earliness', 'weekdayFit'];
  for (const k of keys) {
    assert.equal(typeof notes[k], 'string', `${k} has a note`);
    assert.ok(notes[k].length > 0, `${k} note is not empty`);
    // The cap is the mechanism, not a hope: db/016 stores these as varchar(24).
    assert.ok(notes[k].length <= NOTE_MAX, `${k} note fits the column: ${notes[k]}`);
  }

  assert.match(notes.hourFit, /^14h\//, 'hourFit names the hour it landed on');
  assert.match(notes.earliness, /^\+/, 'earliness is a distance from the earliest moment');
  assert.match(notes.weekdayFit, /^tue/, 'weekdayFit names the day');
  ok('every factor gets a note that fits its column');
}

{
  // A note must describe the same slot the number describes, so the two
  // cannot drift: one ctx builds both.
  const profile = defaultProfile();
  const spec = {
    durationMin: 60,
    count: 1,
    earliestISO: iso('08:00'),
    latestISO: iso('18:00'),
    dayStartHour: 8,
    dayEndHour: 18,
    bufferMin: 0,
    skipWeekends: false,
    category: 'deep-work',
  };
  const ctx = buildScoreContext([], spec);
  const early = slotNotes(profile, ctx, at('08:00'), at('09:00'));
  const late = slotNotes(profile, ctx, at('16:00'), at('17:00'));
  assert.notEqual(early.hourFit, late.hourFit, 'different slots get different notes');
  assert.equal(early.earliness, '+0d', 'the earliest slot is zero days out');

  const f = slotFeatures(profile, ctx, at('08:00'), at('09:00'));
  assert.ok(f.earliness > 0.99, 'and the number agrees with the note');
  ok('notes track the slot they describe');
}

// ── candidate cap ───────────────────────────────────────────────────────────
{
  assert.ok(MAX_CANDIDATES >= 20, 'enough of the field to see the decision');
  assert.ok(MAX_CANDIDATES <= 100, 'not the whole grid');
  ok('candidate cap keeps the head of the ranking');
}

// ── reported replies ────────────────────────────────────────────────────────
{
  const good = parseReport({ messageId: 'msg_abc', reason: 'ignored-rule' });
  assert.deepEqual(good, { messageId: 'msg_abc', reason: 'ignored-rule', note: null });
  ok('a message id plus a known reason is a report');

  assert.equal(parseReport(null), null);
  assert.equal(parseReport({ reason: 'other' }), null, 'no message id');
  assert.equal(parseReport({ messageId: 'msg_abc' }), null, 'no reason');
  assert.equal(parseReport({ messageId: 'msg_abc', reason: 'too-early' }), null, 'slot reasons are not report reasons');
  assert.equal(parseReport({ messageId: 'sug_abc', reason: 'other' }), null, 'only messages can be reported');
  assert.equal(parseReport({ messageId: `msg_${'x'.repeat(100)}`, reason: 'other' }), null, 'id length is bounded');
  ok('anything else is rejected');

  const long = parseReport({ messageId: 'msg_abc', reason: 'other', note: `  it   kept\n${'a'.repeat(300)}` });
  assert.equal(long.note.length, REPORT_NOTE_MAX, 'note is cut to the column width');
  assert.ok(long.note.startsWith('it kept a'), 'whitespace collapsed before cutting');
  assert.equal(parseReport({ messageId: 'msg_abc', reason: 'other', note: '   ' }).note, null, 'blank note is no note');
  ok('the note is shaped to fit reason_note');

  assert.equal(new Set(REPORT_REASON_CODES).size, REPORT_REASON_CODES.length);
  ok('report reasons are distinct');
}

console.log(`capture.check: ok (${n} checks)`);
