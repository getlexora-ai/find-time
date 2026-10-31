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

const { AGENT_TOOLS, agentSystem, runAgent } = await import('./agent.ts');
const { freeTime, findEvents } = await import('./tools/look.ts');
const { changePlan } = await import('./tools/changes.ts');
const { DEFAULT_WORK_HOURS } = await import('./preferences.ts');

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
  let i = 0;
  const call = async ({ input }) => {
    sent.push(JSON.parse(JSON.stringify(input)));
    const c = calls[i++];
    if (!c) throw new Error('script ran out');
    return { name: c[0], args: c[1], callId: `c${i}`, output: [{ type: 'function_call', call_id: `c${i}`, name: c[0], arguments: JSON.stringify(c[1]) }], promptTokens: 100, outputTokens: 20 };
  };
  return { call, sent };
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
  await runAgent(ctxFor('german after the job starts', s4, { seen: [], eventsIn: async () => [far] }));
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
  const replaced = await runAgent(ctxFor('Use the new one', script(['remember', { ...none, replace_existing: true }]), { profile: withPref }));
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
    ['place_at', { title: 'Gym', date: '2026-10-01', start: '18:00', end: null, duration_min: 60, repeat: null }],
  );
  const r = await runAgent(ctxFor('gym today at 6pm for an hour', s));
  assert.match(lastOutput(s).error ?? JSON.stringify(s.sent[1]), /named a time/, 'find_slot is refused when a time was said');
  assert.deepEqual([r.name, r.args.startISO, r.args.endISO], ['place_at', '2026-10-01T18:00:00.000Z', '2026-10-01T19:00:00.000Z']);
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

// ── tasks, habits, rules go through the rules' own phrasing ──
{
  const s = script(['use_rules', { sentence: 'add task: write the quarterly report, 3h, due Friday' }]);
  const r = await runAgent(ctxFor('i need to get the quarterly report done by friday, about 3 hours', s));
  assert.equal(r.name, 'add_task');
  // A sentence the rules can't read goes back to the model, not to the user.
  const t = script(['use_rules', { sentence: '' }], ['ask', { question: 'What should I add?', options: [] }]);
  assert.equal((await runAgent(ctxFor('blorp', t))).name, 'ask_clarification');
  assert.match(lastOutput(t).error, /could not read/);
}

// ── no action in four steps, or the model fails: null, and the rules read it ──
{
  const s = script(...Array(4).fill(['free_time', { date: '2026-10-01', days: null }]));
  assert.equal(await runAgent(ctxFor('hmm', s)), null);
  assert.equal(await runAgent(ctxFor('hmm', { call: async () => { throw new Error('OpenAI 503'); } })), null);
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
