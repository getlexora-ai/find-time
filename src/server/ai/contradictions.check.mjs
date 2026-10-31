/**
 * Self-check for what the app asks about instead of guessing or averaging:
 * contradictions (contradictions.ts), a named time against a rule (brokenRule),
 * saved copies without Google titles (scrub.ts), a garbled rules title
 * (guardTitle). No test runner:
 *   node src/server/ai/contradictions.check.mjs
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

const { findConflict, conflictQuestion } = await import('./contradictions.ts');
const { brokenRule } = await import('./place-at.ts');
const { scrubTitles, STORED_NAME } = await import('./scrub.ts');
const { guardTitle, understand } = await import('./understand.ts');
const { mergeClaim } = await import('./learn.ts');
const { placeAt } = await import('./tools/blocks.ts');
const { changePlan } = await import('./tools/changes.ts');

const pref = (id, kind, scope, value, over = {}) => ({ id, kind, scope, value, strength: 1, evidenceCount: 5, userVerdict: 'confirmed', ...over });
const rule = (id, kind, r, label) => ({ id, kind, rule: r, hard: true, label, source: 'chat' });
const profile = (rules, learned) => ({ rules, learned });
const preferred = (start, end, scope = 'deep-work') => ({ type: 'preference', kind: 'preferred-hours', scope, value: { hourStart: start, hourEnd: end }, label: 'deep work then' });

const mornings = pref('p_am', 'preferred-hours', 'deep-work', { hourStart: 8, hourEnd: 12 });

// ── a new statement against an old one ──
{
  const c = findConflict(preferred(14, 17), profile([], [mornings]));
  assert.deepEqual(c.prefIds, ['p_am'], 'afternoons after mornings is a contradiction');
  assert.equal(findConflict(preferred(10, 13), profile([], [mornings])), null, 'overlapping hours are a refinement');
  assert.equal(findConflict(preferred(14, 17, 'design'), profile([], [mornings])), null, 'another kind of work is no contradiction');
  const q = conflictQuestion(c, 'deep work in the afternoon');
  assert.match(q.question, /deep work in the afternoon/);
  assert.deepEqual(q.options, ['Use the new one', 'Keep the old one']);

  const avoid = { type: 'preference', kind: 'avoid-hours', scope: 'deep-work', value: { hourStart: 9, hourEnd: 11 }, label: 'no deep work 9-11' };
  assert.deepEqual(findConflict(avoid, profile([], [mornings])).prefIds, ['p_am'], 'avoiding what you asked for');
  const fridays = pref('p_fri', 'avoid-weekday', 'fri', {});
  const wantFri = { type: 'preference', kind: 'preferred-weekday', scope: 'fri', value: {}, label: 'Fridays are good' };
  assert.deepEqual(findConflict(wantFri, profile([], [fridays])).prefIds, ['p_fri']);
}

// ── only what the app really believes counts ──
{
  const weak = { ...mornings, userVerdict: null, evidenceCount: 2 };
  assert.equal(findConflict(preferred(14, 17), profile([], [weak])), null, 'two data points are not a belief to argue with');
  const gone = { ...mornings, userVerdict: 'rejected' };
  assert.equal(findConflict(preferred(14, 17), profile([], [gone])), null);
}

// ── rules ──
{
  const before10 = rule('r_10', 'protected', { start: 0, end: 10 }, 'nothing before 10:00');
  assert.deepEqual(findConflict(preferred(8, 9), profile([before10], [])).ruleIds, ['r_10'], 'a preference inside forbidden hours');
  assert.equal(findConflict(preferred(11, 12), profile([before10], [])), null);
  assert.equal(findConflict(preferred(8, 12), profile([before10], [])), null, 'mornings next to "nothing before 10" still leaves 10 to 12');
  const friOnly = rule('r_fri', 'protected', { day: 'fri', start: 0, end: 10 }, 'Friday mornings free');
  assert.equal(findConflict(preferred(8, 9), profile([friOnly], [])), null, 'one weekday does not contradict every day');

  const newRule = { type: 'rule', kind: 'protected', start: 0, end: 10, label: 'nothing before 10:00' };
  const early = pref('p_e', 'preferred-hours', 'deep-work', { hourStart: 8, hourEnd: 10 });
  assert.deepEqual(findConflict(newRule, profile([], [early])).prefIds, ['p_e'], 'a rule against a saved preference');
  assert.equal(findConflict(newRule, profile([], [mornings])), null, 'a rule that leaves part of it free');
  const buffer = rule('r_b', 'buffer', { minutes: 15 }, '15 min between meetings');
  assert.deepEqual(findConflict({ type: 'rule', kind: 'buffer', minutes: 30, label: '30 min' }, profile([buffer], [])).ruleIds, ['r_b']);
  assert.equal(findConflict({ type: 'rule', kind: 'buffer', minutes: 15, label: 'same' }, profile([buffer], [])), null, 'saying it again is no conflict');
  const lunch = rule('r_l', 'protected', { start: 12, end: 13 }, 'lunch free');
  assert.equal(findConflict({ type: 'rule', kind: 'protected', start: 17, end: 24, label: 'evenings free' }, profile([lunch], [])), null, 'protected windows add up');
}

// ── a named time against a rule ──
{
  const span = (s, e, day = '2026-10-05') => ({ startISO: `${day}T${s}:00.000Z`, endISO: `${day}T${e}:00.000Z` });
  const before10 = rule('r_10', 'protected', { start: 0, end: 10 }, 'nothing before 10:00');
  assert.equal(brokenRule([before10], span('08:00', '09:00'), 'personal').id, 'r_10');
  assert.equal(brokenRule([before10], span('10:00', '11:00'), 'personal'), null, 'right after it is fine');
  const noMeet = rule('r_m', 'no-meetings', { day: 'mon' }, 'no meetings on Mondays');
  assert.equal(brokenRule([noMeet], span('11:00', '12:00'), 'meeting').id, 'r_m');
  assert.equal(brokenRule([noMeet], span('11:00', '12:00'), 'personal'), null, 'gym is not a meeting');
  const hours = rule('r_w', 'work-hours', { start: 9, end: 17 }, 'work 9-17');
  assert.equal(brokenRule([hours], span('19:00', '20:00'), 'personal'), null, 'evening gym breaks nothing');

  // What the rules save for "never before 10" has the shape this reads.
  const ctx = { nowISO: '2026-10-01T09:00:00.000Z', previous: null, lastProposals: [], taskTitles: [], habitTitles: [] };
  const saved = understand('never book me before 10', ctx).args;
  assert.equal(brokenRule([rule('r', saved.kind, { start: saved.startHour, end: saved.endHour }, 'x')], span('08:00', '09:00'), 'personal')?.id, 'r');
}

// ── the handlers ask before going against a rule; a yes goes through ──
{
  const before10 = rule('r_10', 'protected', { start: 0, end: 10 }, 'nothing before 10:00');
  const ctx = {
    userId: 'u', sessionId: 's', text: 'gym monday 8am for an hour', summary: '', now: new Date('2026-10-01T09:00:00.000Z'),
    nowISO: '2026-10-01T09:00:00.000Z', horizonISO: '2026-10-22T09:00:00.000Z',
    profile: { rules: [before10], learned: [], workHours: {} }, events: [], busy: [], shown: [], openTasks: [], habits: [], begin() {}, step() {},
  };
  const at = { title: 'Gym', category: 'personal', startISO: '2026-10-05T08:00:00.000Z', endISO: '2026-10-05T09:00:00.000Z' };
  const asked = await placeAt(at, ctx);
  assert.equal(asked.kind, 'question');
  assert.match(asked.question.text, /nothing before 10:00/);
  assert.deepEqual(asked.question.options, ['Yes, put it there', 'No, keep the rule']);
  assert.equal(asked.clashAsked, true, 'the yes is read like the yes to an overlap');
  assert.equal((await placeAt({ ...at, startISO: '2026-10-05T11:00:00.000Z', endISO: '2026-10-05T12:00:00.000Z', rrule: 'FREQ=NOPE' }, ctx)).reply, 'How often should it repeat?', 'a free hour is not asked about');

  const change = { changes: [{ op: 'add', title: 'Gym', date: '2026-10-05', start: '08:00', duration_min: 60 }] };
  const q = await changePlan(change, ctx);
  assert.match(q.question.text, /goes against your rule/);
  assert.equal((await changePlan({ ...change, overlap_ok: true }, ctx)).kind, 'plan', 'and a yes goes through');
}

// ── stated preferences stay as stated ──
{
  const claim = { kind: 'preferred-hours', scope: 'deep-work', value: { hourStart: 14, hourEnd: 17 }, direction: 1 };
  assert.equal(mergeClaim(mornings, claim, 1, () => 'x'), null, 'behaviour does not average a stated preference away');
  assert.ok(mergeClaim({ ...mornings, userVerdict: null }, claim, 1, () => 'x'), 'an inferred one still learns');
}

// ── nothing Google is saved ──
{
  const titles = ['Dr Meyer checkup', 'Busy', 'Team meeting'];
  const clean = (s, typed = '') => scrubTitles(s, titles, typed);
  assert.equal(clean('Your Dr Meyer checkup is at 9.'), `Your ${STORED_NAME} is at 9.`);
  assert.equal(clean('Meyer is at 9.'), `${STORED_NAME} is at 9.`, 'a partial mention counts');
  assert.equal(clean('You are busy on Friday.'), 'You are busy on Friday.', 'the fallback title is an ordinary word');
  assert.equal(clean('Is the meeting moved?'), 'Is the meeting moved?', 'a generic word says nothing');
  assert.equal(clean('After Meyer, then?', 'after meyer i want german'), 'After Meyer, then?', 'what they typed is in the chat already');
  assert.equal(clean('Dr Meyer checkup Meyer'), STORED_NAME, 'no stutter');
  assert.deepEqual(
    clean({ q: { text: 'Before Meyer?', options: ['Meyer', 'Other'] }, n: 3, draft: null }),
    { q: { text: `Before ${STORED_NAME}?`, options: [STORED_NAME, 'Other'] }, n: 3, draft: null },
    'every string, at any depth',
  );
  assert.equal(scrubTitles('Nothing', [], 'x'), 'Nothing');
}

// ── a sentence the rules misread is never repeated back as a title ──
{
  const ctx = { nowISO: '2026-10-31T09:00:00.000Z', previous: null, lastProposals: [], taskTitles: [], habitTitles: [] };
  const bad = guardTitle(understand('after threshold i wanted to do some german before going to work part time', ctx));
  assert.equal(bad.name, 'ask_clarification');
  assert.ok(!/threshold/i.test(bad.args.question));
  const fine = guardTitle(understand('write the blog post tomorrow', ctx));
  assert.notEqual(fine.args.question, bad.args.question, 'a real short title is left alone');
}

console.log('contradictions.check: ok');
