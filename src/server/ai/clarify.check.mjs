/**
 * Self-check for the clarification policy. No test runner:
 *   node src/server/ai/clarify.check.mjs
 */
import assert from 'node:assert/strict';

import { dayWindowFor, durationOptions, missingInfo, questionFor, whenOptions } from './clarify.ts';
import { defaultProfile } from './preferences.ts';

// the message that started this: "I want to go to gym, when can I do it, it
// takes 2 hours" — the length is theirs, the day is not
assert.equal(missingInfo({ whenFrom: 'guessed', durationFrom: 'user' }), 'when');
// "…today in the evening", answered on the next turn
assert.equal(missingInfo({ whenFrom: 'user', durationFrom: 'conversation' }), null);
// the day is asked before the length
assert.equal(missingInfo({ whenFrom: 'guessed', durationFrom: 'guessed' }), 'when');
assert.equal(missingInfo({ whenFrom: 'conversation', durationFrom: 'guessed' }), 'duration');
// a model that leaves the field out has not shown it knows
assert.equal(missingInfo({}), 'when');
assert.equal(missingInfo({ whenFrom: 'user' }), 'duration');

// personal time searches the waking day; work searches working hours
const profile = defaultProfile();
assert.deepEqual(dayWindowFor(profile, 'personal'), { start: 7, end: 22 });
assert.deepEqual(dayWindowFor(profile, 'deep-work'), { start: 9, end: 18 });

// Thursday 2026-09-24 12:14 UTC, the time of the gym request
const nowMs = Date.parse('2026-09-24T12:14:00.000Z');
const horizonMs = nowMs + 21 * 86_400_000;
const base = { profile, nowMs, horizonMs, durationMin: 120 };

// an empty calendar: every bucket has room
assert.deepEqual(whenOptions({ ...base, busy: [], category: 'personal' }), [
  'Today',
  'Tomorrow',
  'Later this week',
  'Next week',
]);

// today fully booked until 22:00 — "Today" is not offered, because tapping it
// would lead straight to "no free time"
const busyToday = [{ start: '2026-09-24T12:00:00.000Z', end: '2026-09-24T22:00:00.000Z' }];
assert.deepEqual(
  whenOptions({ ...base, busy: busyToday, category: 'personal' }).slice(0, 2),
  ['Tomorrow', 'Later this week'],
);

// "Later this week" for work on a Thursday means Friday only; the weekend is
// personal time. Friday booked solid removes it for work but not for the gym.
const busyFriday = [{ start: '2026-09-25T00:00:00.000Z', end: '2026-09-26T00:00:00.000Z' }];
const work = whenOptions({ ...base, busy: [...busyFriday], category: 'deep-work' });
assert.equal(work.includes('Tomorrow'), false);
assert.equal(work.includes('Later this week'), false);
assert.equal(work.includes('Next week'), true);
assert.equal(
  whenOptions({ ...base, busy: [...busyFriday], category: 'personal' }).includes('Later this week'),
  true,
);

// nothing free anywhere: no options, and the question says so
const wall = [{ start: '2026-09-01T00:00:00.000Z', end: '2026-12-01T00:00:00.000Z' }];
assert.deepEqual(whenOptions({ ...base, busy: wall, category: 'personal' }), []);
assert.match(questionFor('when', 'Gym', false), /can't see a free gap/);
assert.equal(questionFor('when', 'Gym', true), 'When would you like to fit in Gym?');
assert.equal(questionFor('duration', 'Gym', true), 'How long do you need for Gym?');

assert.equal(durationOptions('meeting')[0], '15 min');
assert.equal(durationOptions('personal').length, 4);

console.log('clarify.check: ok');
