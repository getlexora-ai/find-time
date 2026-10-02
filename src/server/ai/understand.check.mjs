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

// ── the task backlog ──
r = say('Add task: write the quarterly report, 3h, due Friday');
assert.equal(r.name, 'add_task');
assert.equal(r.args.title, 'Write the quarterly report');
assert.equal(r.args.durationMin, 180);
assert.equal(r.args.dueByISO, '2026-10-03T00:00:00.000Z', 'due Friday = the whole of Friday');
assert.equal(r.args.splittable, true, 'over 2h splits unless told otherwise');
assert.equal(r.args.priority, 'medium');

r = say('add a task: urgent tax forms 90 min by tomorrow in one go');
assert.equal(r.name, 'add_task');
assert.equal(r.args.title, 'Tax forms');
assert.equal(r.args.priority, 'high');
assert.equal(r.args.splittable, false);
assert.equal(r.args.dueByISO, '2026-10-03T00:00:00.000Z');

r = say('todo: read the design doc, 1 hour, mornings, no rush');
assert.deepEqual([r.name, r.args.title, r.args.priority, r.args.preferredWindow, r.args.category], ['add_task', 'Read the design doc', 'low', 'morning', 'design']);
assert.equal(r.args.dueByISO, undefined, 'no due date is fine');

// "add task: work out why the build is slow" is a task, not a "why?"
r = say('add task: work out why the build is slow, 2h');
assert.equal(r.name, 'add_task');

// no length: ask, never guess — and the answer finishes the task
r = say('add task: prepare the board deck due Monday');
assert.equal(r.name, 'ask_clarification');
assert.match(r.args.question, /How long will Prepare the board deck take/);
r = talk('add task: prepare the board deck due Monday', '2 hours');
assert.equal(r.name, 'add_task');
assert.equal(r.args.durationMin, 120);
assert.equal(r.args.dueByISO, '2026-10-06T00:00:00.000Z');
r = talk('add task: prepare the board deck due Monday', 'never mind');
assert.equal(r.name, 'answer');

for (const s of ['plan my week', 'Plan my tasks', 'replan', 'schedule my backlog for next week', 'can you organise my to-do list?']) {
  assert.equal(say(s).name, 'plan_week', s);
}
for (const s of ['my tasks', 'show my tasks', 'what are my tasks?', 'todos']) assert.equal(say(s).name, 'list_tasks', s);

const titles = ['Write the quarterly report', 'Tax forms'];
const sayT = (text) => understand(text, { nowISO, previous: null, lastProposals: [], taskTitles: titles });
r = sayT('done with the quarterly report');
assert.deepEqual([r.name, r.args.match], ['task_done', 'Write the quarterly report']);
r = sayT('mark tax forms as done');
assert.deepEqual([r.name, r.args.match], ['task_done', 'Tax forms']);
r = sayT('split the quarterly report');
assert.deepEqual([r.name, r.args.match, r.args.splittable], ['update_task', 'Write the quarterly report', true]);
r = sayT('tax forms due next week');
assert.deepEqual([r.name, r.args.match, r.args.dueByISO], ['update_task', 'Tax forms', '2026-10-12T00:00:00.000Z']);
r = sayT('Tax forms takes 2h');
assert.deepEqual([r.name, r.args.durationMin], ['update_task', 120]);
// …but only for tasks that exist: ordinary requests are untouched
assert.equal(sayT('gym takes 1h on Friday').name !== 'update_task', true);
assert.equal(sayT('2h of deep work on Thursday').name, 'propose_blocks');

// ── postpone / not before (Thursday 1 Oct) ──
r = sayT('postpone the quarterly report a week');
assert.deepEqual([r.name, r.args.match, r.args.notBeforeISO], ['postpone_task', 'Write the quarterly report', '2026-10-08T00:00:00.000Z']);
r = sayT('push tax forms to next week');
assert.deepEqual([r.name, r.args.notBeforeISO], ['postpone_task', '2026-10-05T00:00:00.000Z']);
r = sayT('snooze tax forms 3 hours');
assert.equal(r.args.notBeforeISO, '2026-10-01T12:00:00.000Z');
r = sayT("tax forms can't start before Monday");
assert.deepEqual([r.name, r.args.notBeforeISO], ['postpone_task', '2026-10-05T00:00:00.000Z']);
r = sayT("don't start tax forms until November");
assert.deepEqual([r.name, r.args.notBeforeISO], ['postpone_task', '2026-11-01T00:00:00.000Z']);
// No "until when": asked with the usual choices, and the answer carries on.
r = sayT('postpone tax forms');
assert.equal(r.name, 'ask_clarification');
assert.deepEqual(r.args.options, ['1 hour', '3 hours', 'Tomorrow', 'Next week']);
r = understand('Tomorrow', { nowISO, previous: r.draft, lastProposals: [], taskTitles: titles });
assert.deepEqual([r.name, r.args.match, r.args.notBeforeISO], ['postpone_task', 'Tax forms', '2026-10-02T00:00:00.000Z']);
// A task they don't have is said, not guessed.
assert.equal(sayT('postpone the budget').name, 'answer');
// On a new task, "not before" is a start, never mistaken for the due date.
r = say('add task: tax return, 3h, due 30 Oct, not before 20 Oct');
assert.deepEqual([r.args.title, r.args.dueByISO, r.args.notBeforeISO], ['Tax return', '2026-10-31T00:00:00.000Z', '2026-10-20T00:00:00.000Z']);
r = say('add task: write summary after the meeting, 1h');
assert.equal(r.args.title, 'Write summary after the meeting', '"after the meeting" is not a date');
assert.equal(r.args.notBeforeISO, undefined);

// ── habits ──
const sayH = (text, previous = null) =>
  understand(text, { nowISO, previous, lastProposals: [], taskTitles: titles, habitTitles: ['Gym'] });
r = say('habit: gym 3x a week, 1h, mornings');
assert.deepEqual(
  [r.name, r.args.title, r.args.category, r.args.perWeek, r.args.durationMin, r.args.preferredWindow],
  ['add_habit', 'Gym', 'personal', 3, 60, 'morning'],
);
r = say('I want to go running twice a week for 45 minutes');
assert.deepEqual([r.name, r.args.title, r.args.perWeek, r.args.durationMin], ['add_habit', 'Running', 2, 45]);
r = say('add habit meditate every day for 15 min');
assert.deepEqual([r.args.title, r.args.perWeek], ['Meditate', 7]);
// Missing pieces are asked for, one at a time, never guessed.
r = say('habit: yoga');
assert.match(r.args.question, /How many times a week for Yoga/);
r = say('3x a week', r.draft);
assert.match(r.args.question, /How long is each Yoga session/);
r = say('1h', r.draft);
assert.deepEqual([r.name, r.args.perWeek, r.args.durationMin], ['add_habit', 3, 60]);
// Changing the one they have.
assert.deepEqual([sayH('gym 2x a week').name, sayH('gym 2x a week').args.perWeek], ['update_habit', 2]);
assert.deepEqual([sayH('gym takes 45 min').name, sayH('gym takes 45 min').args.durationMin], ['update_habit', 45]);
assert.equal(sayH('stop the gym habit').args.stop, true);
assert.equal(sayH('stop gym').args.stop, true);
// "delete gym tomorrow" is about blocks, not the habit.
assert.equal(sayH('delete gym tomorrow').name, 'delete_blocks');
assert.equal(sayH('my habits').name, 'list_tasks');

// ── effort, habit ranges, how hard work is laid out ──
r = say("add task: board deck, 3h, due Friday, it's a hard one");
assert.deepEqual([r.args.title, r.args.effort], ['Board deck', 'hard']);
assert.equal(say('add task: expenses, 30 min, easy').args.effort, 'light');
r = say('add task: back up the hard drive, 1h');
assert.deepEqual([r.args.title, r.args.effort], ['Back up the hard drive', undefined], '"hard drive" is a title');
r = understand('the report is hard', { nowISO, previous: null, lastProposals: [], taskTitles: ['Report'] });
assert.deepEqual([r.name, r.args.effort], ['update_task', 'hard']);
r = understand('tax forms are easy', { nowISO, previous: null, lastProposals: [], taskTitles: titles });
assert.deepEqual([r.name, r.args.match, r.args.effort], ['update_task', 'Tax forms', 'light']);
r = say('habit: gym 2-3x a week, 1h');
assert.deepEqual([r.args.perWeek, r.args.minPerWeek], [3, 2]);
r = say('I want to run at least 2 times a week, ideally 4, 45 min');
assert.deepEqual([r.args.title, r.args.perWeek, r.args.minPerWeek, r.args.durationMin], ['Run', 4, 2, 45]);
r = sayH('gym 2 or 3 times a week');
assert.deepEqual([r.name, r.args.perWeek, r.args.minPerWeek], ['update_habit', 3, 2]);
assert.equal(sayH('gym 4x a week').args.minPerWeek, null, 'a plain count clears an old minimum');
assert.deepEqual(say('spread out my hard work').args, { reply: '', hardWork: 'spread' });
assert.equal(say('batch hard tasks together').args.hardWork, 'cluster');
assert.equal(say('no more than 4 hours of deep work a day').args.dailyBudgetMin, 240);
assert.equal(say('find 2 hours of deep work tomorrow').name, 'propose_blocks', 'asking for time is not a setting');
assert.notEqual(say('I work hard every day').name, 'plan_settings');

// ── travel time ──
assert.deepEqual([say('travel takes 30 min').name, say('travel takes 30 min').args.minutes], ['set_travel', 30]);
assert.equal(say('allow 20 minutes for travel').args.minutes, 20);
assert.equal(say('no travel time').args.minutes, 0);
r = say('add travel time');
assert.equal(r.name, 'ask_clarification');
assert.equal(say('45 min', r.draft).args.minutes, 45);
// Travelling somewhere is still time away.
assert.equal(say("I'm travelling to Copenhagen from the 17th to the 22nd").name, 'block_time_off');

// ── a named time that overlaps something: the route asks, the next turn answers ──
{
  // What the route stores after asking "12:00 overlaps Lunch — put Gym there anyway?"
  const asked = { ...say('gym at 12pm tomorrow for 30 min').draft, placed: false, clashAsked: true };
  r = say('Yes, put it there', asked);
  assert.deepEqual([r.name, r.args.startISO, r.args.overlapOk], ['place_at', '2026-10-02T12:00:00.000Z', true]);
  assert.equal(say('yes', asked).args.overlapOk, true);
  assert.equal(say('put it there anyway', asked).args.overlapOk, true);
  // Picking an offered time re-places it there — and is checked again, not waved through.
  r = say('14:30', asked);
  assert.deepEqual([r.name, r.args.startISO, r.args.endISO, r.args.overlapOk], ['place_at', '2026-10-02T14:30:00.000Z', '2026-10-02T15:00:00.000Z', undefined]);
  assert.equal(r.draft.clashAsked, false);
  r = say('no', asked);
  assert.equal(r.name, 'answer');
  assert.match(r.args.reply, /haven't added Gym/);
  // Without a pending clash question, "yes" means nothing special.
  assert.notEqual(say('yes', { ...asked, clashAsked: false }).args.overlapOk, true);
}

console.log('understand.check: ok');
