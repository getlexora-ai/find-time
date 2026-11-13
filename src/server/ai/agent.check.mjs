/**
 * Self-check for Plan with AI's agent (agent.ts) and its engine tools
 * (tools/look.ts, tools/changes.ts). The model is scripted: each case says
 * which tools it calls, and the engine and handlers run for real. Fixed clock:
 * Thursday 2026-10-01, 09:00. No test runner:
 *   node src/server/ai/agent.check.mjs
 * With OPENAI_API_KEY set, a live part sends real sentences to the model.
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

const { AGENT_TOOLS, agentSystem, runAgent, shownToModel, usualMinutes } = await import('./agent.ts');
const { freeTime, findEvents } = await import('./tools/look.ts');
const { changePlan } = await import('./tools/changes.ts');
const { DEFAULT_WORK_HOURS, defaultProfile } = await import('./preferences.ts');

const nowISO = '2026-10-01T09:00:00.000Z';
const horizonISO = '2026-10-22T09:00:00.000Z';
const profile = { workHours: { ...DEFAULT_WORK_HOURS }, rules: [], learned: [] };
const ev = (id, title, start, end, over = {}) => ({
  id, title, start: `2026-10-01T${start}:00.000Z`, end: `2026-10-01T${end}:00.000Z`,
  category: 'personal', itemType: 'event', flexibility: 'fixed', origin: 'manual', isDraft: false, rrule: null, projectLabel: null, notes: null, ...over,
});
const events = [
  ev('e_meet', 'Standup', '10:00', '11:00'),
  ev('e_lunch', 'Lunch', '13:00', '14:00', { flexibility: 'flexible' }), // flexible: doesn't block time
  ev('e_gym', 'Gym', '17:30', '18:30'),
  ev('e_doc', 'Dentist', '15:00', '15:30', { origin: 'imported', googleEditable: false }),
];

/** A scripted model: returns the given calls in order, and records what it was sent. */
function script(...calls) {
  const sent = [];
  const offered = [];
  const forced = [];
  let i = 0;
  const call = async ({ input, tools, force }) => {
    forced.push(force);
    sent.push(JSON.parse(JSON.stringify(input)));
    offered.push(tools.map((t) => t.name));
    const c = calls[i++];
    if (!c) throw new Error('script ran out');
    return { name: c[0], args: c[1], callId: `c${i}`, output: [{ type: 'function_call', call_id: `c${i}`, name: c[0], arguments: JSON.stringify(c[1]) }], promptTokens: 100, outputTokens: 20 };
  };
  return { call, sent, offered, forced };
}

const steps = [];
const ctxFor = (text, s, over = {}) => ({
  text,
  history: [{ role: 'user', content: text }],
  nowISO,
  horizonISO,
  profile,
  events,
  readCtx: { nowISO, previous: null, lastProposals: [] },
  step: (x) => steps.push(x),
  charge: async () => {},
  call: s.call,
  route: async () => ({ kind: 'request', understood: 'test' }),
  ...over,
});
const lastOutput = (s) => {
  const input = s.sent[s.sent.length - 1];
  return JSON.parse(input[input.length - 1].output);
};

// ── the tools are strict-valid: every object closed, every property required ──
for (const t of AGENT_TOOLS) {
  (function closed(s, path) {
    if (s.anyOf) return s.anyOf.forEach((x, k) => closed(x, `${path}|${k}`));
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false, `${path} must be closed`);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort(), `${path}: every property required`);
      for (const [k, v] of Object.entries(s.properties)) closed(v, `${path}.${k}`);
    }
    if (s.items) closed(s.items, `${path}[]`);
  })(t.input_schema, t.name);
  assert.equal(t.strict, true, t.name);
}

// ── engine: free time ──
{
  const [today] = freeTime(events, profile, nowISO, '2026-10-01');
  // 09:00–18:00 minus Standup 10–11, Dentist 15–15:30, Gym 17:30–18:30 (lunch is flexible).
  assert.deepEqual(today.gaps, ['09:00–10:00', '11:00–15:00', '15:30–17:30']);
  assert.equal(today.free_min, 60 + 240 + 120);
  assert.equal(today.working_day, true);
  // Saturday is a day off: the personal window is counted, and said so.
  const [sat] = freeTime(events, profile, nowISO, '2026-10-03');
  assert.equal(sat.working_day, false);
  assert.ok(sat.free_min > 0);
}

// ── engine: find events — the model reads titles, so it knows what an event is ──
{
  const all = findEvents(events, '', '2026-10-01', 1);
  assert.equal(all.find((e) => e.id === 'e_doc').title, 'Dentist', 'a Google title is read');
  assert.ok(!Object.keys(all[0]).some((k) => ['notes', 'location', 'guests', 'attendees'].includes(k)), 'only title and time go out');
  assert.equal(all.find((e) => e.id === 'e_doc').editable, false);
  assert.equal(findEvents(events, 'dentist', '2026-10-01', 1)[0].id, 'e_doc');
  assert.deepEqual(findEvents(events, 'gym', '2026-10-01', 1).map((e) => [e.id, e.start, e.editable]), [['e_gym', '17:30', true]]);
}

// ── a course: all-day, already running, months long — found, and a window can open after it ──
{
  const threshold = ev('e_thr', 'Threshold', '00:00', '00:00', { allDay: true, origin: 'imported', start: '2026-09-20T00:00:00.000Z', end: '2026-10-09T00:00:00.000Z' });
  const far = ev('e_far', 'Part-time job starts', '09:00', '17:00', { start: '2026-12-01T09:00:00.000Z', end: '2026-12-01T17:00:00.000Z' });
  const [found] = findEvents([threshold], 'threshold', '2026-10-01', 120);
  assert.deepEqual([found.id, found.all_day, found.end_date, found.editable], ['e_thr', true, '2026-10-08', false]);

  const seen = [];
  const s = script(['find_events', { match: 'part-time', from: null, days: null }], ['answer', { text: 'It starts on 1 Dec.' }]);
  await runAgent(ctxFor('when does my job start', s, { seen, eventsIn: async () => [far] }));
  assert.equal(lastOutput(s).events[0].title, 'Part-time job starts', 'a lookup reaches past the turn window');
  assert.deepEqual(seen.map((e) => e.id), ['e_far'], 'and is kept for the saved-copy scrub');

  const s2 = script(['find_events', { match: 'threshold', from: null, days: null }], ['find_slot', { title: 'German', duration_min: 60, from: null, to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: 'e_thr', before_event_id: null }]);
  const r = await runAgent(ctxFor('after threshold find an hour for german', s2, { events: [...events, threshold] }));
  assert.equal(r.args.earliestISO, '2026-10-09T00:00:00.000Z', 'the window opens when it ends, from the calendar');

  const s3 = script(['find_slot', { title: 'German', duration_min: 60, from: null, to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: 'nope', before_event_id: null }], ['ask', { question: 'When is it?', options: [] }]);
  await runAgent(ctxFor('after x find an hour', s3));
  assert.match(JSON.stringify(s3.sent[1]), /unknown event id/, 'a made-up id goes back to the model');

  const s4 = script(['find_events', { match: 'part-time', from: null, days: null }], ['find_slot', { title: 'German', duration_min: 60, from: null, to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: 'e_far', before_event_id: null }], ['answer', { text: 'Later.' }]);
  await runAgent(ctxFor('an hour of german after the job starts', s4, { seen: [], eventsIn: async () => [far] }));
  assert.match(JSON.stringify(s4.sent[2]), /can be planned up to/, 'past the window is said, not silently moved');
}

// ── remember: saved at once; a contradiction asks first ──
{
  const none = { type: 'preference', rule_kind: null, preference_kind: 'preferred-hours', category: 'deep-work', day: null, start_hour: 14, end_hour: 17, minutes: null, label: 'deep work in the afternoon', replace_existing: false };
  const s = script(['remember', none]);
  const saved = await runAgent(ctxFor('i write better in the afternoon', s));
  assert.equal(saved.name, 'record_preference');
  assert.deepEqual(saved.args.value, { hourStart: 14, hourEnd: 17 });

  const morning = { id: 'p1', kind: 'preferred-hours', scope: 'deep-work', value: { hourStart: 8, hourEnd: 12 }, strength: 1, evidenceCount: 5, userVerdict: 'confirmed' };
  const withPref = { ...profile, learned: [morning] };
  const asked = await runAgent(ctxFor('i write better in the afternoon', script(['remember', none]), { profile: withPref }));
  assert.equal(asked.name, 'ask_clarification', 'a contradiction is asked about');
  const replaced = await runAgent(ctxFor('Use the new one', script(['remember', { ...none, replace_existing: true }]), { profile: withPref, pendingQuestion: 'Which should I keep?' }));
  // Nobody asked: the model can't overwrite what they said before by itself.
  const overwrite = await runAgent(ctxFor('actually afternoons', script(['remember', { ...none, replace_existing: true }]), { profile: withPref }));
  assert.equal(overwrite.name, 'ask_clarification', 'replacing is the person\'s choice');
  assert.deepEqual(replaced.args.replacePrefIds, ['p1'], 'and only a yes replaces it');

  const rule = await runAgent(ctxFor('never before 10', script(['remember', { ...none, type: 'rule', rule_kind: 'protected', preference_kind: null, category: null, start_hour: 0, end_hour: 10, label: 'nothing before 10:00' }])));
  assert.deepEqual([rule.name, rule.args.kind, rule.args.endHour], ['record_rule', 'protected', 10]);

  const bad = script(['remember', { ...none, start_hour: 17, end_hour: 14 }], ['ask', { question: 'Which hours?', options: [] }]);
  await runAgent(ctxFor('x', bad));
  assert.match(JSON.stringify(bad.sent[1]), /start_hour before end_hour/, 'a bad argument goes back to the model');
}

// ── a day said in the sentence comes from the date reader, whatever the model wrote ──
{
  const placed = await runAgent(ctxFor('dentist friday 9:30am for half an hour', script(['place_at', { title: 'Dentist', date: null, start: '09:30', end: null, duration_min: 30, repeat: null }])));
  assert.equal(placed.args.startISO, '2026-10-02T09:30:00.000Z', 'the model left the day out');
  const wrong = await runAgent(ctxFor('dentist friday 9:30am for half an hour', script(['place_at', { title: 'Dentist', date: '2026-10-09', start: '09:30', end: null, duration_min: 30, repeat: null }])));
  assert.equal(wrong.args.startISO, '2026-10-02T09:30:00.000Z', 'the model got the day wrong');
  const slot = await runAgent(ctxFor('find 2 hours on tuesday', script(['find_slot', { title: 'Focus', duration_min: 120, from: '2026-10-13', to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: null, before_event_id: null }])));
  assert.equal(slot.args.earliestISO, '2026-10-06T00:00:00.000Z');
}

// ── what the model is told about the user, and a named time against a rule ──
{
  const known = { ...profile, rules: [{ id: 'r', kind: 'protected', rule: { start: 0, end: 10 }, hard: true, label: 'nothing before 10:00', source: 'chat' }],
    learned: [{ id: 'p', kind: 'preferred-hours', scope: 'deep-work', value: { hourStart: 8, hourEnd: 12 }, strength: 1, evidenceCount: 5, userVerdict: 'confirmed' }] };
  const prompt = agentSystem(nowISO, known, [{ title: 'Thesis', durationMin: 360, dueBy: '2026-10-08T00:00:00.000Z' }], [{ title: 'Gym', perWeek: 3, durationMin: 60 }]);
  for (const part of ['nothing before 10:00', 'You prefer deep work between', 'Thesis (6h left', 'Gym (3× a week']) assert.ok(prompt.includes(part), part);
  assert.ok(!agentSystem(nowISO, known).includes('undefined'), 'an empty backlog reads as none yet');
}

// ── "how much free time do i have" — look up, then answer; never a plan ──
{
  const s = script(['free_time', { date: '2026-10-01', days: null }], ['answer', { text: 'You have 7h free today.' }]);
  const r = await runAgent(ctxFor('how much free time do i have', s));
  assert.equal(r.name, 'answer');
  assert.equal(lastOutput(s).days[0].free_min, 420, 'the model is handed the engine’s count');
}

// ── "gym today at 6pm for an hour" — the user's time is kept ──
{
  const s = script(
    ['find_slot', { title: 'Gym', duration_min: 60, from: '2026-10-01', to: null, count: null, earliest_hour: null, latest_hour: null }],
    ['place_at', { title: 'Gym', date: '2026-10-01', start: '19:00', end: null, duration_min: 60, repeat: null }],
  );
  const r = await runAgent(ctxFor('gym today at 7pm for an hour', s));
  assert.match(lastOutput(s).error ?? JSON.stringify(s.sent[1]), /named a time/, 'find_slot is refused when a time was said');
  assert.deepEqual([r.name, r.args.startISO, r.args.endISO], ['place_at', '2026-10-01T19:00:00.000Z', '2026-10-01T20:00:00.000Z']);
}

// ── "move my gym to 6pm and put german where it was" — look up, then one card ──
{
  const s = script(
    ['find_events', { match: 'gym', from: null, days: null }],
    [
      'change_plan',
      {
        changes: [
          { op: 'move', event_id: 'e_gym', title: null, date: null, start: '18:00', end: null, duration_min: null },
          { op: 'add', event_id: null, title: 'learn German', date: '2026-10-01', start: '17:30', end: '18:00', duration_min: null },
        ],
        overlap_ok: false,
        reply: 'Gym moves to 18:00 and German takes 17:30.',
      },
    ],
  );
  const r = await runAgent(ctxFor('move my gym to evening 6pm and replace the gym with learn german', s));
  assert.equal(r.name, 'change_plan');
  const res = await changePlan(r.args, { ...ctxFor('', s), step: () => {} });
  assert.equal(res.kind, 'plan', 'German at 17:30 is free once Gym moves — checked together');
  assert.deepEqual(
    res.changes.items.map((i) => [i.op, i.title, i.startISO?.slice(11, 16), i.endISO?.slice(11, 16)]),
    [['move', 'Gym', '18:00', '19:00'], ['add', 'Learn German', '17:30', '18:00']],
  );
  assert.equal(res.changes.items[0].fromStartISO, '2026-10-01T17:30:00.000Z');
}

// ── a clash is asked about with nearby free times; the named time is offered as asked ──
{
  const args = { changes: [{ op: 'add', event_id: null, title: 'Call', date: '2026-10-01', start: '10:00', end: '10:30', duration_min: null }], overlap_ok: false, reply: '' };
  const q = await changePlan(args, { ...ctxFor('', script()), step: () => {} });
  assert.equal(q.kind, 'question');
  assert.match(q.question.text, /Call at 10:00 overlaps Standup \(10:00–11:00\)/);
  assert.equal(q.question.options[0], 'Yes, apply as asked');
  assert.ok(q.question.options.some((o) => /^Use \d\d:\d\d instead$/.test(o)), 'a nearby free time is offered');
  const ok = await changePlan({ ...args, overlap_ok: true }, { ...ctxFor('', script()), step: () => {} });
  assert.equal(ok.kind, 'plan');
}

// ── the model gets an argument wrong: told why, it fixes it ──
{
  const s = script(
    ['change_plan', { changes: [{ op: 'move', event_id: 'nope', title: null, date: null, start: '18:00', end: null, duration_min: null }], overlap_ok: false, reply: '' }],
    ['ask', { question: 'Which event did you mean?', options: ['Gym', 'Standup'] }],
  );
  const r = await runAgent(ctxFor('move it to 6', s));
  assert.match(lastOutput(s).error, /unknown event_id/);
  assert.equal(r.name, 'ask_clarification');
  // A locked Google event can't be moved: the model is told so, in words it can pass on.
  const t = script(
    ['change_plan', { changes: [{ op: 'move', event_id: 'e_doc', title: null, date: null, start: '16:00', end: null, duration_min: null }], overlap_ok: false, reply: '' }],
    ['answer', { text: "That one is a Google event I can't move." }],
  );
  await runAgent(ctxFor('move my dentist to 4pm', t));
  assert.match(lastOutput(t).error, /change it in Google Calendar/);
}

// ── step one: a question can only look. No tool that changes anything is even offered ──
{
  const question = () => ({ route: async () => ({ kind: 'question', understood: 'how much is free' }) });
  const s = script(['free_time', { date: '2026-10-01', days: null }], ['answer', { text: 'You have 7h free.' }]);
  await runAgent(ctxFor('how much free time do i have', s, question()));
  assert.deepEqual([...s.offered[0]].sort(), ['answer', 'ask', 'check_fit', 'find_events', 'free_time']);

  // Even if a model calls one anyway, code refuses it and nothing happens.
  const t = script(['add_task', { title: 'X', duration_min: 60, due: null, not_before: null, priority: null, effort: null, preferred_window: null, category: null }], ['answer', { text: 'No.' }]);
  const r = await runAgent(ctxFor('do i have 1 hour', t, question()));
  assert.equal(r.name, 'answer');
  assert.match(JSON.stringify(t.sent[1]), /not available now/);

  // A request gets the planner's tools. revise_last only when there is something to revise.
  const u = script(['plan_week', {}]);
  assert.equal((await runAgent(ctxFor('plan my week', u))).name, 'plan_week');
  assert.ok(u.offered[0].includes('add_task') && !u.offered[0].includes('revise_last') && !u.offered[0].includes('use_rules'));

  // The real router's answer picks the mode; "reply" with nothing asked is a request.
  const v = script(['decide', { kind: 'reply', understood: 'x' }], ['plan_week', {}]);
  const w = await runAgent(ctxFor('plan my week', v, { route: undefined }));
  assert.match(w.summary, /^request/);
  assert.deepEqual(v.offered[0], ['decide']);
  const q = script(['decide', { kind: 'question', understood: 'x' }], ['answer', { text: 'Yes.' }]);
  assert.equal((await runAgent(ctxFor('am i free', q, { route: undefined }))).name, 'answer');
  assert.ok(!q.offered[1].includes('add_task'));
}

// ── the loop: the planner's forms, exact values, nothing rewritten into a sentence ──
{
  const tasks = [{ id: 't1', title: 'Thesis draft', durationMin: 360, dueBy: '2026-10-09T00:00:00.000Z' }];
  const habits = [{ id: 'h1', title: 'Gym', perWeek: 3, durationMin: 60 }];
  const backlog = { tasks, habits };
  const task = (over) => ({ title: 'Thesis chapter 3', duration_min: null, due: null, not_before: null, priority: null, effort: null, preferred_window: null, category: null, ...over });

  // 10 hours stays 10 hours, and the due day is the whole day.
  const big = await runAgent(ctxFor('thesis chapter 3 is due oct 20, about 10 hours of work', script(['add_task', task({ duration_min: 600, due: '2026-10-20' })]), backlog));
  assert.deepEqual([big.name, big.args.durationMin, big.args.dueByISO, big.args.splittable], ['add_task', 600, '2026-10-21T00:00:00.000Z', true]);

  // No length said: the planner reports it missing and the model asks.
  const s = script(['add_task', task({ title: 'Investor deck' })], ['ask', { question: 'How long will the investor deck take?', options: ['1 hour', '3 hours'] }]);
  const r = await runAgent(ctxFor('i have to prep the investor deck before the 12th', s, backlog));
  assert.equal(r.name, 'ask_clarification');
  assert.match(JSON.stringify(s.sent[1]), /missing.*how long it takes/);

  // A length nobody said is refused: the model's guess doesn't reach the planner.
  const g = script(['add_task', task({ title: 'Groceries', duration_min: 60 })], ['ask', { question: 'How long?', options: [] }]);
  assert.equal((await runAgent(ctxFor('add groceries to my todo', g, backlog))).name, 'ask_clarification');
  // Their answer to the question counts, in any language.
  const ans = await runAgent(ctxFor('deux heures', script(['add_task', task({ title: 'Groceries', duration_min: 120 })]), { ...backlog, pendingQuestion: 'How long?' }));
  assert.equal(ans.args.durationMin, 120);

  // Changing a listed task changes the field said, and nothing else.
  const longer = await runAgent(ctxFor('thesis will actually take 8 hours not 6', script(['update_task', { match: 'thesis', due: null, duration_min: 480, effort: null, splittable: null }]), backlog));
  assert.deepEqual([longer.name, longer.args.match, longer.args.durationMin, longer.args.dueByISO], ['update_task', 'Thesis draft', 480, undefined]);
  const moved = await runAgent(ctxFor('the thesis deadline moved to oct 15', script(['update_task', { match: 'thesis', due: '2026-10-15', duration_min: null, effort: null, splittable: null }]), backlog));
  assert.equal(moved.args.dueByISO, '2026-10-16T00:00:00.000Z');
  const none = script(['update_task', { match: 'nothing like it', due: null, duration_min: 480, effort: null, splittable: null }], ['ask', { question: 'Which task?', options: [] }]);
  await runAgent(ctxFor('that one takes 2 hours', none, backlog));
  assert.match(JSON.stringify(none.sent[1]), /no task called/);

  // A habit already listed is changed, never added twice.
  const dup = script(['add_habit', { title: 'Gym', per_week: 4, min_per_week: null, duration_min: 60, preferred_window: null, category: null }], ['update_habit', { match: 'gym', per_week: 4, duration_min: null, stop: false }]);
  const four = await runAgent(ctxFor('make gym 4 times a week', dup, backlog));
  assert.match(JSON.stringify(dup.sent[1]), /already a habit/);
  assert.deepEqual([four.name, four.args.perWeek], ['update_habit', 4]);

  // "every morning" is how often; only what's truly missing comes back.
  const med = await runAgent(ctxFor('meditate 10 mins every morning', script(['add_habit', { title: 'Meditate', per_week: 7, min_per_week: null, duration_min: 10, preferred_window: 'morning', category: 'personal' }]), backlog));
  assert.deepEqual([med.name, med.args.perWeek, med.args.durationMin, med.args.preferredWindow], ['add_habit', 7, 10, 'morning']);

  // Travel and focus are their own settings, not a buffer.
  assert.deepEqual((await runAgent(ctxFor('it takes me 30 minutes to get anywhere', script(['set_travel', { minutes: 30 }])))).name, 'set_travel');
  const focus = await runAgent(ctxFor('no more than 3 hours of focus a day', script(['set_focus', { daily_minutes: 180, hard_work: null }])));
  assert.deepEqual([focus.name, focus.args.dailyBudgetMin], ['plan_settings', 180]);

  // Time away and clearing a day.
  const off = await runAgent(ctxFor('im in paris from the 16th to the 18th', script(['time_off', { from: '2026-10-16', to: '2026-10-18', title: 'Paris trip' }])));
  assert.deepEqual([off.name, off.args.startISO, off.args.endISO, off.args.title], ['block_time_off', '2026-10-16', '2026-10-18', 'Paris trip']);
  const clear = await runAgent(ctxFor('clear friday', script(['clear_blocks', { match: '', from: '2026-10-02', to: null }])));
  assert.deepEqual([clear.name, clear.args.confirm, clear.args.latestISO, clear.draft.tool], ['delete_blocks', false, '2026-10-03T00:00:00.000Z', 'delete_blocks']);
  const all = script(['clear_blocks', { match: '', from: null, to: null }], ['ask', { question: 'Which day?', options: [] }]);
  await runAgent(ctxFor('clear everything', all));
  assert.match(JSON.stringify(all.sent[1]), /which day to clear/);

  // The kind of thing comes from the model, so a barber isn't deep work.
  const barber = await runAgent(ctxFor('barber tuesday at 4pm for 30 min', script(['place_at', { title: 'Barber', date: '2026-10-06', start: '16:00', end: null, duration_min: 30, repeat: null, category: 'personal', overlap_ok: false }])));
  assert.equal(barber.args.category, 'personal');
}

// ── place_at and find_slot: what's missing, a rule or a clash go back for the model to ask ──
{
  const place = (over) => ({ title: 'Gym', date: '2026-10-02', start: '08:00', end: null, duration_min: 60, repeat: null, category: 'personal', overlap_ok: false, ...over });
  const strict = { ...profile, rules: [{ id: 'r', kind: 'protected', rule: { start: 0, end: 10 }, hard: true, label: 'nothing before 10:00', source: 'chat' }] };

  const rule = script(['place_at', place()], ['ask', { question: 'That breaks your rule. Just this once?', options: ['Just this once', 'Keep my rule'] }]);
  assert.equal((await runAgent(ctxFor('gym friday 8am for an hour', rule, { profile: strict }))).name, 'ask_clarification');
  assert.match(JSON.stringify(rule.sent[1]), /goes_against_rule.*nothing before 10:00/);

  // Typed "just this once" goes through, once asked. The planner gets the go-ahead.
  const yes = await runAgent(ctxFor('just this once', script(['place_at', place({ overlap_ok: true })]), { profile: strict, pendingQuestion: 'Just this once?' }));
  assert.deepEqual([yes.name, yes.args.overlapOk], ['place_at', true]);
  // Nobody asked: the model can't wave it through by itself.
  const sly = script(['place_at', place({ overlap_ok: true })], ['ask', { question: 'Sure?', options: [] }]);
  await runAgent(ctxFor('gym friday 8am for an hour', sly, { profile: strict }));
  assert.match(JSON.stringify(sly.sent[1]), /goes_against_rule/);

  const clash = script(['place_at', { ...place(), date: '2026-10-01', start: '10:00', title: 'Call' }], ['ask', { question: 'Standup is there. Still?', options: [] }]);
  await runAgent(ctxFor('call today at 10:00 for an hour', clash));
  assert.match(JSON.stringify(clash.sent[1]), /overlaps.*Standup.*free_nearby/);

  const length = script(['place_at', place({ date: '2026-10-06', start: '16:00', duration_min: null })], ['ask', { question: 'How long?', options: ['30 min'] }]);
  await runAgent(ctxFor('barber tuesday at 4pm', length));
  assert.match(JSON.stringify(length.sent[1]), /missing.*length/);

  const ampm = script(['place_at', place({ start: '06:00' })], ['ask', { question: 'Morning or evening?', options: ['06:00', '18:00'] }]);
  await runAgent(ctxFor('gym friday at 6 for an hour', ampm));
  assert.match(JSON.stringify(ampm.sent[1]), /am or pm/);

  const invented = script(['place_at', place({ date: '2026-10-02', start: '14:00' })], ['ask', { question: 'What time?', options: [] }]);
  await runAgent(ctxFor('put the dentist on friday', invented));
  assert.match(JSON.stringify(invented.sent[1]), /what time/);

  const slot = (over) => ({ title: 'Report', category: null, duration_min: 120, from: null, to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: null, before_event_id: null, ...over });
  const noDay = script(['find_slot', slot()], ['ask', { question: 'Which day?', options: ['Tomorrow'] }]);
  await runAgent(ctxFor('find 2 hours for the report', noDay, { profile: defaultProfile() }));
  assert.match(JSON.stringify(noDay.sent[1]), /which day.*days_with_room/);
  const noLen = script(['find_slot', slot({ from: '2026-10-06' })], ['ask', { question: 'How long?', options: [] }]);
  await runAgent(ctxFor('find time for the report on tuesday', noLen));
  assert.match(JSON.stringify(noLen.sent[1]), /how long/);
}

// ── two things asked: never one done and the other dropped; a hung call gets a second try ──
{
  const two = () => ({ route: async () => ({ kind: 'request', understood: 'x', things: 2 }) });
  const s = script(['place_at', { title: 'Gym', date: '2026-10-07', start: '19:00', end: null, duration_min: 60, repeat: null, category: 'personal', overlap_ok: false }], ['ask', { question: 'Gym and dinner: which first?', options: [] }]);
  assert.equal((await runAgent(ctxFor('gym wednesday 7pm for an hour and dinner thursday 8pm for 2 hours', s, two()))).name, 'ask_clarification');
  assert.match(JSON.stringify(s.sent[1]), /asked for 2 things/);
  // Asking first, or a card that covers both, goes through.
  assert.equal((await runAgent(ctxFor('x y', script(['ask', { question: 'Which?', options: [] }]), two()))).name, 'ask_clarification');

  let calls = 0;
  const flaky = async ({ tools }) => {
    calls++;
    if (calls === 1) throw new Error('OpenAI 503');
    return { name: 'answer', args: { text: 'Fine.' }, callId: 'c', output: [], promptTokens: 0, outputTokens: 0, tools };
  };
  assert.equal((await runAgent(ctxFor('hi', { call: flaky }))).name, 'answer', 'a failed call is tried again');
  assert.equal(calls, 2);
}

// ── small things that went wrong live ──
{
  // A clear time elsewhere in the sentence doesn't make "at 7" clear.
  const s = script(['change_plan', { changes: [{ op: 'add', event_id: null, title: 'Gym', date: '2026-10-07', start: '07:00', end: null, duration_min: 60 }], overlap_ok: false, reply: '' }], ['ask', { question: 'Morning or evening?', options: [] }]);
  await runAgent(ctxFor('gym at 7 on wednesday for an hour and a call thursday at 9am', s));
  assert.match(JSON.stringify(s.sent[1]), /am or pm/);
  // An end day with no start day is still a window.
  const slot = { title: 'Call', category: 'meeting', duration_min: 60, from: null, to: '2026-10-07', count: null, earliest_hour: null, latest_hour: null, after_event_id: null, before_event_id: null };
  const r = await runAgent(ctxFor('find an hour for a call before thursday', script(['find_slot', slot])));
  assert.deepEqual([r.name, r.args.latestISO], ['propose_blocks', '2026-10-08T00:00:00.000Z']);
  // A reply fills in one request, however the router counted it.
  const reply = { route: async () => ({ kind: 'reply', understood: 'x', things: 2 }), pendingQuestion: 'How long?' };
  const t = await runAgent(ctxFor('30 minutes tomorrow', script(['find_slot', { ...slot, title: 'Stretching', category: 'personal', duration_min: 30, to: null, from: '2026-10-02' }]), reply));
  assert.equal(t.name, 'propose_blocks');
}

// ── a question whose step fails after a lookup still gets answered; a habit's "3x" is one thing ──
{
  let calls = 0;
  const forced = [];
  const flaky = async ({ force }) => {
    calls++;
    forced.push(force);
    if (calls === 1) return { name: 'free_time', args: { date: '2026-10-01', days: null }, callId: 'c1', output: [], promptTokens: 0, outputTokens: 0 };
    if (calls === 2) throw new Error('Model returned no tool call (max_messages).');
    return { name: 'answer', args: { text: 'Monday is free.' }, callId: 'c3', output: [], promptTokens: 0, outputTokens: 0 };
  };
  const r = await runAgent(ctxFor('am i booked monday', { call: flaky }, { route: async () => ({ kind: 'question', understood: 'x' }) }));
  assert.equal(r.name, 'answer');
  assert.deepEqual(forced, [undefined, undefined, 'answer']);

  const run = await runAgent(ctxFor('running three times a week, 45 min each', script(['add_habit', { title: 'Running', per_week: 3, min_per_week: null, duration_min: 45, preferred_window: null, category: null }]), { route: async () => ({ kind: 'request', understood: 'x', things: 3 }) }));
  assert.equal(run.name, 'add_habit');
}

// ── "am i free": a date past the loaded window reads the real calendar, and never looks empty by accident ──
{
  const far = ev('e_far', 'Work', '09:00', '17:00', { start: '2026-12-01T09:00:00.000Z', end: '2026-12-01T17:00:00.000Z' });
  const lookup = ['free_time', { date: '2026-12-01', days: null }];
  const asked = { route: async () => ({ kind: 'question', understood: 'x' }) };
  const s = script(lookup, ['answer', { text: 'Only an hour.' }]);
  await runAgent(ctxFor('am i free on december 1', s, { ...asked, eventsIn: async () => [far] }));
  assert.deepEqual(lastOutput(s).days[0].gaps, ['17:00–18:00'], 'the event past the window is counted');
  const down = script(lookup, ['answer', { text: 'I could not check that day.' }]);
  await runAgent(ctxFor('am i free on december 1', down, { ...asked, eventsIn: async () => { throw new Error('db'); } }));
  assert.match(lastOutput(down).error, /never say it is free/);
  // Total free time isn't what fits: three hours in small pieces has no 2-hour gap.
  const bits = [ev('a', 'A', '10:00', '11:00'), ev('b', 'B', '12:00', '13:00'), ev('c', 'C', '14:00', '15:00'), ev('d', 'D', '16:00', '18:00')];
  const [day] = freeTime(bits, profile, nowISO, '2026-10-01');
  assert.deepEqual([day.free_min, day.longest_gap_min], [240, 60]);
}

// ── a time said once stays said ──
{
  const slot = { title: 'Massage', category: 'personal', duration_min: 60, from: '2026-10-09', to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: null, before_event_id: null };
  const s = script(['find_slot', slot], ['ask', { question: 'Friday at 5pm?', options: [] }]);
  const history = [{ role: 'user', content: 'massage on wednesday at 5pm' }, { role: 'assistant', content: 'How long?' }, { role: 'user', content: 'actually friday, an hour' }];
  await runAgent(ctxFor('actually friday, an hour', s, { history, pendingQuestion: 'How long?' }));
  assert.match(JSON.stringify(s.sent[1]), /named a time/, 'the time from before the question is kept');
  const h = script(['add_habit', { title: 'Weekly review', per_week: 1, min_per_week: null, duration_min: 30, preferred_window: null, category: null }], ['ask', { question: 'Every Friday at 4pm?', options: [] }]);
  await runAgent(ctxFor('weekly review every friday at 4pm for 30 min', h));
  assert.match(JSON.stringify(h.sent[1]), /repeat/, 'a habit would lose the time');
}

// ── moving something to a bare "at 6" is asked about too, never a guess at 06:00 ──
{
  const s = script(
    ['change_plan', { changes: [{ op: 'move', event_id: 'e_gym', title: null, date: null, start: '06:00', end: null, duration_min: null }], overlap_ok: false, reply: '' }],
    ['ask', { question: 'Morning or evening?', options: ['18:00', '06:00'] }],
  );
  assert.equal((await runAgent(ctxFor('gym at 6', s))).name, 'ask_clarification');
  assert.match(JSON.stringify(s.sent[1]), /am or pm/);
}

// ── revise_last: a follow-up keeps what was proposed; with nothing to revise it's refused ──
{
  const t = script(['revise_last', { sentence: 'make it 90 minutes' }], ['ask', { question: 'What should I change?', options: [] }]);
  assert.equal((await runAgent(ctxFor('make it 90 minutes', t))).name, 'ask_clarification');
  assert.match(lastOutput(t).error ?? JSON.stringify(t.sent[1]), /not a follow-up|not available/);
}

// ── will it fit: the planner answers, nothing kept ──
{
  const tasks = [{ id: 't1', title: 'Thesis', durationMin: 6000, dueBy: '2026-10-02T00:00:00.000Z', priority: 'medium', effort: 'normal', splittable: true, minChunkMin: 30, category: 'deep-work', preferredWindow: null, preferBy: null, notBefore: null, status: 'backlog' }];
  const s = script(['check_fit', {}], ['answer', { text: 'No: the thesis does not fit.' }]);
  await runAgent(ctxFor('will i get the thesis done in time', s, { tasks, habits: [], profile: defaultProfile(), route: async () => ({ kind: 'question', understood: 'x' }) }));
  assert.deepEqual(s.forced, [undefined, 'answer'], 'once the planner has spoken, the answer is written');
  const seen = lastOutput(s);
  assert.equal(seen.fits, false);
  assert.equal(seen.does_not_fit[0].title, 'Thesis');
}

// ── the loop always ends: the last steps can only ask or answer; a dead model is null ──
{
  const s = script(...Array(4).fill(['free_time', { date: '2026-10-01', days: null }]), ['answer', { text: 'I could not work that out.' }]);
  assert.equal((await runAgent(ctxFor('hmm', s))).name, 'answer');
  assert.deepEqual([...s.offered[4]].sort(), ['answer', 'ask']);
  assert.equal(await runAgent(ctxFor('hmm', { call: async () => { throw new Error('OpenAI 503'); } })), null);
}

// ── an unfinished request is kept: the answer fills the gap, code keeps the rest ──
{
  const form = { title: 'Massage', date: '2026-10-07', start: '17:00', end: null, duration_min: null, repeat: null, category: 'personal', overlap_ok: false };
  const s = script(['place_at', form], ['ask', { question: 'How long is the massage?', options: [] }]);
  const asked = await runAgent(ctxFor('massage friday at 5pm', s));
  assert.equal(asked.name, 'ask_clarification');
  assert.equal(asked.pending.tool, 'place_at');
  assert.equal(asked.pending.args.date, '2026-10-02', 'the kept form holds the day the date reader read, not the model\'s');
  assert.equal(asked.pending.args.start, '17:00');
  assert.match(asked.pending.needs.join(), /long|length/i);

  // The reply: the model fills only the length and drops the rest. Nothing said before is lost.
  const blank = { title: '', date: null, start: null, end: null, duration_min: 60, repeat: null, category: null, overlap_ok: false };
  const r = script(['place_at', blank]);
  const history = [{ role: 'user', content: 'massage friday at 5pm' }, { role: 'assistant', content: 'How long is the massage?' }, { role: 'user', content: 'an hour' }];
  const reply = { history, pendingQuestion: 'How long is the massage?', pendingForm: asked.pending, route: async () => ({ kind: 'reply', understood: 'an hour' }) };
  const placed = await runAgent(ctxFor('an hour', r, reply));
  assert.equal(placed.name, 'place_at');
  assert.deepEqual([placed.args.title, placed.args.startISO, placed.args.endISO], ['Massage', '2026-10-02T17:00:00.000Z', '2026-10-02T18:00:00.000Z']);
  assert.equal(placed.pending, undefined, 'a finished request leaves nothing pending');

  // They change their mind in the answer: what they say now wins over what was kept.
  const moved = await runAgent(ctxFor('an hour, and make it 6pm', script(['place_at', { ...blank, start: '18:00' }]), reply));
  assert.equal(moved.args.startISO, '2026-10-02T18:00:00.000Z');
  // Still unclear: the same form stays pending for the next answer.
  const again = await runAgent(ctxFor('not sure', script(['ask', { question: 'About how long?', options: ['30 min', '1 hour'] }]), reply));
  assert.equal(again.pending.args.start, '17:00');
  // A new request is not an answer: the kept form is not mixed into it.
  const fresh = await runAgent(ctxFor('dentist friday 9:30am for half an hour', script(['place_at', { ...blank, title: 'Dentist', start: '09:30', duration_min: 30 }]), { pendingForm: asked.pending }));
  assert.equal(fresh.args.title, 'Dentist');
  assert.equal(fresh.args.startISO, '2026-10-02T09:30:00.000Z');
}

// ── the planner runs inside the loop: what does not fit goes back to the model, which asks ──
{
  const slot = { title: 'Report', category: 'deep-work', duration_min: 120, from: null, to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: null, before_event_id: null };
  const ran = [];
  const run = async (choice) => { ran.push(choice.name); return { reply: 'No slot.', facts: ['No free 120-minute slot for Report on 2026-10-02.'] }; };
  const s = script(['find_slot', slot], ['ask', { question: 'Friday has no free 2 hours. Shorter, or another day?', options: ['90 minutes', 'Monday'] }]);
  const r = await runAgent(ctxFor('find 2 hours for the report on friday', s, { run }));
  assert.deepEqual(ran, ['propose_blocks'], 'the planner ran once, inside the loop');
  assert.equal(r.name, 'propose_blocks');
  assert.deepEqual(r.worded, { text: 'Friday has no free 2 hours. Shorter, or another day?', options: ['90 minutes', 'Monday'], question: true });
  assert.match(lastOutput(s).does_not_fit[0], /No free 120-minute slot/, 'the model is told what the planner found');
  assert.deepEqual([...s.offered[1]].sort(), ['answer', 'ask'], 'after the planner ran, the model can only talk to the person');
  assert.deepEqual([r.pending.tool, r.pending.args.duration_min, r.pending.args.from], ['find_slot', 120, '2026-10-02'], 'and the request is kept for their answer');

  // It fits: nothing to ask, the result is the turn's outcome and the handler is not run twice.
  const fits = await runAgent(ctxFor('find 2 hours for the report on friday', script(['find_slot', slot]), { run: async () => ({ kind: 'plan', proposals: [] }) }));
  assert.deepEqual([fits.ran.kind, fits.worded], ['plan', undefined]);
  // The model dies after the planner ran: the planner's own words stay, the turn is not lost.
  let n = 0;
  const dies = async (o) => { if (n++) throw new Error('OpenAI 503'); return script(['find_slot', slot]).call(o); };
  const kept = await runAgent(ctxFor('find 2 hours for the report on friday', { call: dies }, { run }));
  assert.deepEqual([kept.name, kept.ran.reply, kept.worded], ['propose_blocks', 'No slot.', undefined]);
  // Something else (a task) is not the planner's to run in the loop.
  const other = await runAgent(ctxFor('gym today at 7pm for an hour', script(['place_at', { title: 'Gym', date: null, start: '19:00', end: null, duration_min: 60, repeat: null, category: 'personal', overlap_ok: true }]), { run, pendingQuestion: 'x' }));
  assert.equal(other.ran, undefined);
}

// ── the model sees what it proposed and offered, and what the person did with it ──
{
  const parsed = { proposals: [{ id: 's1', title: 'Report', startISO: '2026-10-02T09:00:00.000Z', endISO: '2026-10-02T11:00:00.000Z' }, { id: 's2', title: 'Gym', startISO: '2026-10-03T17:00:00.000Z', endISO: '2026-10-03T18:00:00.000Z' }] };
  const shown = shownToModel('Here it is.', parsed, { s2: 'accepted' });
  assert.match(shown, /Report Fri 2026-10-02 09:00–11:00 \(not added yet\)/);
  assert.match(shown, /Gym Sat 2026-10-03 17:00–18:00 \(added to the calendar\)/);
  assert.match(shownToModel('How long?', { question: { options: ['30 min', '1 hour'] } }), /Options offered: 30 min · 1 hour/);
  assert.equal(shownToModel('Sure.', null), 'Sure.');
}

// ── a missing length comes with the person's own usual one ──
{
  assert.equal(usualMinutes('gym', { events }), 60);
  assert.equal(usualMinutes('Running', { events, habits: [{ title: 'Running', durationMin: 45 }] }), 45);
  assert.equal(usualMinutes('massage', { events }), null, 'nothing of theirs to go by: no default');
  const s = script(['find_slot', { title: 'Gym', category: 'personal', duration_min: null, from: null, to: null, count: null, earliest_hour: null, latest_hour: null, after_event_id: null, before_event_id: null }], ['ask', { question: 'An hour, like your other gym blocks?', options: ['1 hour'] }]);
  await runAgent(ctxFor('find time for gym tomorrow', s));
  assert.equal(lastOutput(s).your_usual_min, 60);
}

console.log('agent.check: ok (offline)');

// ── live: real sentences, the real model; which workflow did it pick? ──
if (process.env.OPENAI_API_KEY) {
  const live = async (text) => runAgent({ ...ctxFor(text, { call: undefined }), call: undefined });
  const cases = [
    ['how much free time do i have today', 'answer'],
    ['am I busy at 3pm?', 'answer'],
    ['gym today at 6pm for an hour', 'place_at'],
    ['find me 2 hours for the report tomorrow', 'propose_blocks'],
    // German in gym's old 17:30–18:30 overlaps gym's new 18:00: asking first, or a card the engine then asks about, are both right.
    ['move my gym to 6pm and put learn german where it was', ['change_plan', 'ask_clarification']],
    ['i have german class from 5.10.2026 till 29.10.2026, Monday till Thursday from 11am till 2:45pm', 'place_at'],
    ['add a task to file taxes, 3h, due next Friday', 'add_task'],
    ['never book anything before 10', 'record_rule'],
  ];
  let ok = 0;
  for (const [text, want] of cases) {
    const r = await live(text);
    const got = r?.name ?? '(fell back to rules)';
    const pass = [want].flat().includes(got);
    if (pass) ok++;
    console.log(`${pass ? 'PASS' : 'MISS'}  ${text}\n      → ${got}${r?.summary ? ` · ${r.summary}` : ''}`);
  }
  console.log(`agent.check: live ${ok}/${cases.length}`);
}
