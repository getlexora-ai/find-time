/**
 * Self-check for the rule-based reader behind Plan with AI. Real sentences,
 * fixed clock (Thursday 2026-10-01, 09:00 UTC). No test runner:
 *   node src/server/ai/understand.check.mjs
 */
import assert from 'node:assert/strict';

import { understand } from './understand.ts';

const nowISO = '2026-10-01T09:00:00.000Z';
const say = (text, previous = null, lastProposals = []) => understand(text, { nowISO, previous, lastProposals });

/** Run a conversation; the route marks a draft placed when the turn produced blocks. */
function talk(...lines) {
  let draft = null;
  let out;
  for (const line of lines) {
    out = say(line, draft);
    draft = out.draft && { ...out.draft, placed: out.name === 'propose_blocks' || out.name === 'place_at', lastStartISO: '2026-10-02T09:00:00.000Z' };
  }
  return out;
}

// ── the panel's own examples ──
let r = say('Make room for 2h of deep work on Thursday');
assert.equal(r.name, 'propose_blocks');
assert.equal(r.args.title, 'Deep work');
assert.equal(r.args.category, 'deep-work');
assert.equal(r.args.durationMin, 120);
assert.equal(r.args.earliestISO, '2026-10-01T00:00:00.000Z');
assert.equal(r.args.latestISO, '2026-10-02T00:00:00.000Z');
assert.equal(r.args.whenFrom, 'user');
assert.equal(r.args.durationFrom, 'user');

r = say('Put the gym at 18:00 on Friday');
assert.equal(r.name, 'ask_clarification', 'no length given: ask, never guess');
assert.match(r.args.question, /How long do you need for Gym/);
r = talk('Put the gym at 18:00 on Friday', '1 hour');
assert.equal(r.name, 'place_at');
assert.deepEqual([r.args.title, r.args.category, r.args.startISO, r.args.endISO], ['Gym', 'personal', '2026-10-02T18:00:00.000Z', '2026-10-02T19:00:00.000Z']);

r = say('Never book me before 10');
assert.equal(r.name, 'record_rule');
assert.deepEqual([r.args.kind, r.args.startHour, r.args.endHour], ['protected', 0, 10]);

// ── finding time ──
r = say('Find time for the onboarding spec this week, 90 min');
assert.deepEqual([r.args.title, r.args.durationMin, r.args.latestISO], ['Onboarding spec', 90, '2026-10-05T00:00:00.000Z']);

r = say('three review slots on Tuesday, 30 min each');
assert.deepEqual([r.args.title, r.args.count, r.args.oneBlockPerDay, r.args.earliestISO], ['Review', 3, false, '2026-10-06T00:00:00.000Z']);

r = say('2 hours of research tomorrow afternoon');
assert.deepEqual([r.args.category, r.args.dayStartHour, r.args.dayEndHour, r.args.earliestISO], ['research', 12, 17, '2026-10-02T00:00:00.000Z']);

r = say('I need 2 hours to write the report before Friday');
assert.deepEqual([r.args.title, r.args.latestISO], ['Write the report', '2026-10-02T00:00:00.000Z']);

r = say('an hour and a half of design next week after 2pm');
assert.deepEqual([r.args.category, r.args.durationMin, r.args.dayStartHour, r.args.earliestISO], ['design', 90, 14, '2026-10-05T00:00:00.000Z']);

r = say('gym every morning next week for 45 min');
assert.deepEqual([r.args.count, r.args.dayStartHour, r.args.category], [5, 8, 'personal']);

r = say('1h focus on Saturday');
assert.equal(r.args.weekdaysOnly, false, 'a named weekend day invites the weekend');

r = say('1 hour of deep work between 2 and 5 tomorrow');
assert.equal(r.name, 'propose_blocks', 'a window wider than the block is a bound');
assert.deepEqual([r.args.dayStartHour, r.args.dayEndHour], [14, 17]);

// ── never guesses the day or length ──
r = say('write the blog post');
assert.deepEqual([r.name, r.args.whenFrom, r.args.durationFrom], ['propose_blocks', 'guessed', 'guessed']);
r = say('when can I fit in a haircut?');
assert.deepEqual([r.args.title, r.args.category, r.args.whenFrom], ['Haircut', 'personal', 'guessed']);

// answering its own questions carries the request forward
r = talk('write the blog post', 'Tomorrow', '2 hours');
assert.deepEqual([r.args.title, r.args.whenFrom, r.args.durationFrom, r.args.durationMin], ['Write the blog post', 'conversation', 'user', 120]);
r = talk('write the blog post', 'Later this week');
assert.deepEqual([r.args.whenFrom, r.args.earliestISO, r.args.latestISO], ['user', '2026-10-03T00:00:00.000Z', '2026-10-05T00:00:00.000Z']);

// ── revising the last plan ──
r = talk('2h deep work tomorrow', 'make it 90 minutes');
assert.deepEqual([r.args.durationMin, r.args.revisesPrevious, r.args.correctionKind, r.args.title], [90, true, 'changed_duration', 'Deep work']);
r = talk('2h deep work this week', 'not Friday');
assert.deepEqual(r.args.excludeDates, ['2026-10-02']);
assert.equal(r.args.correctionKind, 'changed_day');
r = talk('2h deep work this week', 'later');
assert.equal(r.args.dayStartHour, 10);
r = talk('2h deep work this week', 'shorter');
assert.equal(r.args.durationMin, 60);
r = talk('2h deep work this week', 'what about next week?');
assert.equal(r.args.earliestISO, '2026-10-05T00:00:00.000Z');
r = talk('2h deep work this week', 'in the afternoon');
assert.deepEqual([r.args.dayStartHour, r.args.dayEndHour], [12, 17]);
// a new task after a plan is a new request, not a revision
r = talk('2h deep work this week', 'call with Anna tomorrow at 3pm for 30 min');
assert.deepEqual([r.name, r.args.title, r.args.category, r.args.startISO], ['place_at', 'Call with Anna', 'meeting', '2026-10-02T15:00:00.000Z']);

// ── a clock time ──
r = say('gym today 6-8pm');
assert.deepEqual([r.name, r.args.startISO, r.args.endISO], ['place_at', '2026-10-01T18:00:00.000Z', '2026-10-01T20:00:00.000Z']);
r = say('dentist Friday 9:30am for half an hour');
assert.deepEqual([r.args.title, r.args.startISO, r.args.endISO], ['Dentist', '2026-10-02T09:30:00.000Z', '2026-10-02T10:00:00.000Z']);
r = say('dinner at 7 on Saturday for 2h');
assert.equal(r.args.startISO, '2026-10-03T19:00:00.000Z');
r = say('gym at 6 tomorrow for an hour');
assert.equal(r.name, 'ask_clarification', 'bare "at 6" asks am or pm');
assert.deepEqual(r.args.options, ['18:00', '06:00']);
r = talk('gym at 6 tomorrow for an hour', '06:00');
assert.deepEqual([r.name, r.args.startISO], ['place_at', '2026-10-02T06:00:00.000Z']);
r = talk('gym at 6 tomorrow for an hour', '1 hour');
assert.equal(r.name, 'ask_clarification', 'still unanswered: ask again rather than pick');
r = say('gym at 18:00 for 1h');
assert.equal(r.name, 'ask_clarification');
assert.match(r.args.question, /Which day/);
r = talk('2h deep work tomorrow', 'move it to 2pm');
assert.deepEqual([r.name, r.args.startISO, r.args.endISO], ['place_at', '2026-10-02T14:00:00.000Z', '2026-10-02T16:00:00.000Z']);

// ── rules ──
const rule = (t) => say(t).args;
assert.deepEqual([rule('No meetings on Fridays').kind, rule('No meetings on Fridays').day], ['no-meetings', 'fri']);
assert.deepEqual([rule('no calls before 11am').startHour, rule('no calls before 11am').endHour], [0, 11]);
assert.deepEqual([rule('work hours 9 to 5').kind, rule('work hours 9 to 5').startHour, rule('work hours 9 to 5').endHour], ['work-hours', 9, 17]);
assert.deepEqual([rule('always leave 15 minutes between meetings').kind, rule('always leave 15 minutes between meetings').minutes], ['buffer', 15]);
assert.deepEqual([rule('leave by 17:00').kind, rule('leave by 17:00').endHour], ['leave-by', 17]);
assert.deepEqual([rule('keep Friday afternoons free').kind, rule('keep Friday afternoons free').day, rule('keep Friday afternoons free').startHour], ['protected', 'fri', 12]);
assert.deepEqual([rule('never book anything after 6').startHour, rule('never book anything after 6').endHour], [18, 24]);
assert.equal(say('always be nice').name, 'answer', 'a rule it cannot keep is said plainly, never saved');

// ── time off ──
r = say("I'm off from the 17th to the 22nd");
assert.deepEqual([r.name, r.args.startISO, r.args.endISO, r.args.title], ['block_time_off', '2026-10-17', '2026-10-22', 'Time off']);
r = say("I'm in Copenhagen from the 17th evening till the 22nd");
assert.deepEqual([r.args.startISO, r.args.endISO, r.args.title], ['2026-10-17T18:00', '2026-10-22', 'Away — Copenhagen']);
r = say("I'm out Friday afternoon");
assert.deepEqual([r.args.startISO, r.args.endISO], ['2026-10-02T13:00', '2026-10-02']);
r = say('at a wedding all weekend');
assert.deepEqual([r.args.startISO, r.args.endISO, r.args.title], ['2026-10-03', '2026-10-04', 'Wedding']);
r = say('vacation in Lisbon next week');
assert.deepEqual([r.args.startISO, r.args.endISO, r.args.title], ['2026-10-05', '2026-10-11', 'Vacation — Lisbon']);
r = say("don't book anything tomorrow afternoon");
assert.deepEqual([r.name, r.args.startISO, r.args.title], ['block_time_off', '2026-10-02T13:00', 'Kept free']);
r = say("I'm on vacation");
assert.equal(r.name, 'ask_clarification');
r = talk("I'm on vacation", 'the 12th to the 16th');
assert.deepEqual([r.name, r.args.startISO, r.args.endISO, r.args.title], ['block_time_off', '2026-10-12', '2026-10-16', 'Vacation']);
assert.equal(say('kick-off meeting tomorrow 1h').name, 'propose_blocks', 'kick-off is not time off');

// ── deleting: always a list first, then a yes ──
r = say('delete work');
assert.deepEqual([r.name, r.args.confirm, r.args.match, r.args.earliestISO], ['delete_blocks', false, 'work', undefined]);
r = say('cancel gym tomorrow');
assert.deepEqual([r.args.match, r.args.earliestISO, r.args.latestISO], ['gym', '2026-10-02T00:00:00.000Z', '2026-10-03T00:00:00.000Z']);
r = say('clear everything on Friday');
assert.deepEqual([r.name, r.args.match, r.args.earliestISO], ['delete_blocks', '', '2026-10-02T00:00:00.000Z']);
r = say('remove all my events');
assert.equal(r.name, 'ask_clarification', 'clearing everything needs a day');
r = talk('remove all my events', 'Tomorrow');
assert.deepEqual([r.name, r.args.match, r.args.earliestISO], ['delete_blocks', '', '2026-10-02T00:00:00.000Z']);
const listed = { tool: 'delete_blocks', match: 'work', deleteIds: ['evt_1', 'evt_2'] };
r = say('Delete them', listed);
assert.deepEqual([r.name, r.args.confirm, r.args.ids], ['delete_blocks', true, ['evt_1', 'evt_2']]);
assert.equal(say('yes', listed).args.confirm, true);
r = say('Keep them', listed);
assert.deepEqual([r.name, r.draft], ['answer', null]);
assert.notEqual(say('gym tomorrow 1h', listed).name, 'delete_blocks', 'a new request is not a yes');
r = say('cancel that', { tool: 'propose_blocks', title: 'X', placed: true });
assert.equal(r.name, 'answer', 'cancelling a proposal deletes nothing');
assert.equal(say('keep Friday clear').name, 'block_time_off', '"clear" mid-sentence is not a delete');

// ── answers ──
assert.equal(say('hi').name, 'answer');
assert.equal(say("what's on my calendar tomorrow?").name, 'answer');
assert.equal(say('do taxes tomorrow for 2h').name, 'propose_blocks');
r = say('why that slot?', null, [{ startISO: '2026-10-02T09:00:00.000Z', reason: "it's when your energy is highest" }]);
assert.match(r.args.reply, /Tomorrow at 09:00: it's when your energy is highest/);
// an answer keeps the conversation's draft, so "why?" then "shorter" still revises
const kept = say('why?', { tool: 'propose_blocks', title: 'X', durationMin: 60, placed: true });
assert.equal(kept.draft?.title, 'X');

console.log('understand.check: ok');
