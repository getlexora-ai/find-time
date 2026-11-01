/**
 * The whole loop through the real model, on a fixture calendar. Calls OpenAI.
 *   node --env-file=.env.local src/server/ai/eval/loop.live.mjs [route|fields|talk]
 *
 *   route   is this a question, a request, or a reply? The first decision.
 *   fields  the planner's form: right tool, and the exact values said.
 *   talk    whole conversations: the model's real question goes back into the
 *           history, the scripted person answers, until something is done.
 *
 * Stops at the handlers, so nothing is saved. Written to find failures: a miss
 * here means fix the code, not the expected answer.
 */
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../../../', import.meta.url));
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) spec = ${JSON.stringify(SRC)} + spec.slice(2) + (/\\.[a-z]+$/i.test(spec) ? '' : '.ts');
  else if (spec.startsWith('.') && !/\\.[a-z]+$/i.test(spec)) spec = spec + '.ts';
  return next(spec, ctx);
}`),
);

const { runAgent } = await import('../agent.ts');
const { DEFAULT_WORK_HOURS, defaultProfile } = await import('../preferences.ts');

// Saturday 31 October 2026, 09:00.
const nowISO = '2026-10-31T09:00:00.000Z';
const horizonISO = '2026-11-21T09:00:00.000Z';
const at = (d, h) => `2026-${d}T${h}:00.000Z`;
const ev = (id, title, start, end, over = {}) => ({ id, title, start, end, category: 'personal', itemType: 'event', flexibility: 'fixed', origin: 'manual', isDraft: false, rrule: null, projectLabel: null, notes: null, ...over });
const google = { origin: 'imported', googleEditable: false };
const events = [
  ev('e_thr', 'Threshold', at('10-20', '00:00'), at('11-07', '00:00'), { ...google, allDay: true }),
  ev('e_gym', 'Gym', at('11-02', '17:30'), at('11-02', '18:30')),
  ev('e_stand', 'Standup', at('11-02', '10:00'), at('11-02', '10:30'), google),
  ev('e_doc', 'Dentist', at('11-04', '15:00'), at('11-04', '15:30'), google),
  ev('e_read', 'Reading', at('11-03', '20:00'), at('11-03', '21:00')),
];
const later = [ev('e_job', 'Part-time job starts', at('12-01', '09:00'), at('12-01', '17:00'), google)];
const profile = {
  ...defaultProfile(),
  workHours: { ...DEFAULT_WORK_HOURS },
  defaultBufferMin: 10,
  travelMin: 0,
  maxDailyFocusMin: 240,
  minFocusBlockMin: 30,
  rules: [{ id: 'r_10', kind: 'protected', rule: { start: 0, end: 10 }, hard: true, label: 'nothing before 10:00', source: 'chat' }],
  learned: [{ id: 'p_am', kind: 'preferred-hours', scope: 'deep-work', value: { hourStart: 10, hourEnd: 12 }, strength: 1, evidenceCount: 5, userVerdict: 'confirmed' }],
};
const tasks = [{ id: 't1', title: 'Thesis draft', durationMin: 360, dueBy: '2026-11-09T00:00:00.000Z', preferBy: null, notBefore: null, priority: 'medium', effort: 'normal', preferredWindow: null, splittable: true, minChunkMin: 30, category: 'deep-work', status: 'backlog' }];
const habits = [{ id: 'h1', title: 'Gym', perWeek: 3, minPerWeek: null, durationMin: 60, preferredWindow: null, category: 'personal' }];

const WRITES = ['add_task', 'update_task', 'task_done', 'postpone_task', 'add_habit', 'update_habit', 'block_time_off', 'plan_week', 'delete_blocks', 'set_travel', 'plan_settings', 'place_at', 'propose_blocks', 'change_plan', 'record_rule', 'record_preference'];

async function turn(text, before = []) {
  const history = [...before.map(([role, content]) => ({ role, content })), { role: 'user', content: text }];
  const last = before.at(-1);
  const t0 = Date.now();
  const u = await runAgent({
    text, history, nowISO, horizonISO, profile, events, tasks, habits, seen: [],
    pendingQuestion: last?.[0] === 'assistant' ? last[1] : null,
    eventsIn: async () => [...events, ...later],
    readCtx: { nowISO, previous: null, lastProposals: [], taskTitles: tasks.map((t) => t.title), habitTitles: habits.map((h) => h.title) },
    step: () => {},
    charge: async () => {},
  });
  const said = String(u?.args?.reply ?? u?.args?.question ?? '');
  return { name: u?.name ?? '(model failed)', args: u?.args ?? {}, kind: (u?.summary ?? '').split(' · ')[0], summary: u?.summary ?? '', said, ms: Date.now() - t0 };
}

/* ── route: [what it is, the sentence, what came before] ── */
const ASKED = [['user', 'book a haircut'], ['assistant', 'Which day, and how long should it be?']];
const ROUTE = [
  ['question', 'what are the different habit did you learn'],
  ['question', 'do I have time for gym on friday?'],
  ['question', 'can I have meetings before 10?'],
  ['question', 'how busy is my tuesday'],
  ['question', 'when is my dentist'],
  ['question', 'is friday free'],
  ['question', "what's on my calendar monday"],
  ['question', 'will i get the thesis done in time?'],
  ['question', 'am i overcommitted this week?'],
  ['question', 'how many hours are left on the thesis'],
  ['question', 'why did you put gym on monday'],
  ['question', 'what can you do'],
  ['question', 'whats the weather in berlin'],
  ['question', 'do you remember my rule about mornings'],
  ['question', 'hey'],
  ['question', 'could i fit a 2 hour session on wednesday?'],
  ['question', 'how long is threshold'],
  ['question', 'what should i focus on tomorrow'],
  ['request', 'can you find me 2 hours for the report on tuesday'],
  ['request', 'could you move gym to wednesday at 6pm'],
  ['request', 'would you mind clearing friday'],
  ['request', 'I should really write that blog post this month'],
  ['request', 'after threshold i wanted to do some german before going to work part time'],
  ['request', 'i want to start running three times a week'],
  ['request', 'im off next friday'],
  ['request', 'i finished the thesis draft'],
  ['request', 'never book me before 10'],
  ['request', 'i write better in the mornings'],
  ['request', 'plan my week'],
  ['request', 'gym monday at 7pm for an hour'],
  ['request', 'am i free friday afternoon? if so block 2 hours for the report'],
  ['request', 'the thesis deadline moved to nov 15'],
  ['request', 'put lunch with sara on thursday at 12:30'],
  ['request', 'cancel reading'],
  ['reply', 'tuesday, 30 minutes', ASKED],
  ['reply', 'yes', [['user', 'gym monday 8am for an hour'], ['assistant', 'That goes against your rule "nothing before 10:00". Put it there anyway?']]],
  ['reply', 'the second one', [['user', 'move my call'], ['assistant', 'Which one: the call on Monday or the call on Friday?']]],
  ['reply', 'just this once', [['user', 'gym monday 8am for an hour'], ['assistant', 'That breaks your rule. Just this once, or keep the rule?']]],
  ['reply', '2h', [['user', 'add task: tax'], ['assistant', 'How long will Tax take?']]],
  ['question', 'actually what are my rules', ASKED],
  ['question', 'wait how busy am i tuesday', ASKED],
  ['request', 'forget that, plan my week', ASKED],
];

/* ── fields: [sentence, tools that are right, a check on the args] ── */
const FIELDS = [
  ['i need to finish my tax return by next friday, should take like 3 hours', ['add_task'], (a) => a.durationMin === 180 && a.dueByISO === '2026-11-07T00:00:00.000Z' && /tax/i.test(a.title) && !/\d/.test(a.title)],
  ['thesis chapter 3 is due nov 20, about 10 hours of work', ['add_task'], (a) => a.durationMin === 600 && a.dueByISO === '2026-11-21T00:00:00.000Z'],
  ['i have to prep the investor deck before the 12th', ['ask_clarification'], null],
  ['add groceries to my todo', ['ask_clarification'], null],
  ['i finished the thesis draft', ['task_done'], (a) => a.match === 'Thesis draft'],
  ['the thesis deadline moved to nov 15', ['update_task'], (a) => a.dueByISO === '2026-11-16T00:00:00.000Z' && a.durationMin === undefined],
  ['thesis will actually take 8 hours not 6', ['update_task'], (a) => a.durationMin === 480 && a.dueByISO === undefined],
  ['dont start the thesis before wednesday', ['postpone_task'], (a) => a.notBeforeISO === '2026-11-04T00:00:00.000Z'],
  ['i want to start running three times a week, 45 min each', ['add_habit'], (a) => a.perWeek === 3 && a.durationMin === 45],
  ['meditate 10 mins every morning', ['add_habit'], (a) => a.perWeek === 7 && a.durationMin === 10 && a.preferredWindow === 'morning'],
  ['i want to read more, maybe 20 mins a day', ['add_habit'], (a) => a.perWeek === 7 && a.durationMin === 20],
  ['make gym 4 times a week', ['update_habit'], (a) => a.perWeek === 4 && a.match === 'Gym'],
  ['drop gym to twice a week', ['update_habit'], (a) => a.perWeek === 2],
  ['stop the gym habit', ['update_habit'], (a) => a.stop === true],
  ["i'm on vacation from nov 10 to nov 14", ['block_time_off'], (a) => a.startISO === '2026-11-10' && a.endISO === '2026-11-14'],
  ['im in paris from the 16th to the 18th', ['block_time_off'], (a) => a.startISO === '2026-11-16' && a.endISO === '2026-11-18'],
  ['plan my week', ['plan_week'], null],
  ['can you sort out my week', ['plan_week'], null],
  ['clear friday', ['delete_blocks'], (a) => a.earliestISO === '2026-11-06T00:00:00.000Z'],
  ['cancel gym on monday', ['change_plan', 'delete_blocks'], null],
  ['it takes me 30 minutes to get anywhere', ['set_travel'], (a) => a.minutes === 30],
  ['no more than 3 hours of focus in a day', ['plan_settings'], (a) => a.dailyBudgetMin === 180],
  ['keep 15 mins between things', ['record_rule', 'record_preference'], (a) => a.minutes === 15 || a.value?.minutes === 15],
  ['change my work hours to 8 to 4', ['record_rule'], (a) => a.startHour === 8 && a.endHour === 16],
  ['lunch with priya next wednesday noon', ['ask_clarification'], null],
  ['barber on tuesday at 4pm for 30 min', ['place_at'], (a) => a.startISO === '2026-11-03T16:00:00.000Z' && a.category === 'personal'],
  ['dentist friday 9:30am for half an hour', ['ask_clarification', 'place_at'], (a) => a.question ? /10|rule/i.test(a.question) : false],
  ['gym wednesday 7pm for an hour', ['place_at'], (a) => a.category === 'personal'],
  ['find an hour for a call with the lawyer before thursday', ['propose_blocks'], (a) => a.durationMin === 60 && a.category === 'meeting'],
  ['need some time to prep before the dentist', ['ask_clarification'], null],
  ['finde mir 2 stunden am dienstag für die steuer', ['propose_blocks'], (a) => a.durationMin === 120 && a.earliestISO === '2026-11-03T00:00:00.000Z' && !/stunden|dienstag/i.test(a.title)],
  ['ich habe nächste woche urlaub', ['block_time_off'], (a) => a.startISO === '2026-11-02'],
  ['move gym to tuesday and cancel reading', ['change_plan', 'ask_clarification'], null],
  ['add gym on wednesday at 7pm for an hour and dinner on thursday at 8pm for 2 hours', ['change_plan'], (a) => a.changes?.length === 2],
];

/* ── talk: the opening, the person's replies in order, what must end up happening ── */
const TALK = [
  ['barber on tuesday at 4', ['30 min'], ['place_at'], (a) => a.endISO === '2026-11-03T16:30:00.000Z'],
  ['i have to prep the investor deck before the 12th', ['3 hours'], ['add_task'], (a) => a.durationMin === 180 && a.dueByISO === '2026-11-12T00:00:00.000Z'],
  ['add groceries to my todo', ['30 minutes'], ['add_task'], (a) => a.durationMin === 30],
  ['i want to start running', ['three times a week', '45 minutes'], ['add_habit'], (a) => a.perWeek === 3 && a.durationMin === 45],
  ['find me time for the report', ['2 hours on tuesday'], ['propose_blocks'], (a) => a.durationMin === 120 && a.earliestISO === '2026-11-03T00:00:00.000Z'],
  ['gym monday 8am for an hour', ['just this once'], ['place_at'], (a) => a.overlapOk === true],
  ['gym monday 8am for an hour', ['no, keep the rule'], ['answer'], null],
  ['vet tuesday at 3pm', ['actually make it thursday, 30 min'], ['place_at'], (a) => a.startISO === '2026-11-05T15:00:00.000Z'],
  ['gym wednesday at 6', ['pm', 'an hour'], ['place_at'], (a) => a.startISO === '2026-11-04T18:00:00.000Z'],
  ['after threshold i wanted to do some german before going to work part time', ['an hour, three times a week'], ['add_habit', 'ask_clarification', 'propose_blocks'], null],
  ['book a haircut', ['what are my rules'], ['answer'], (a) => /10/.test(a.reply)],
];

const list = process.argv[2];
const AT_ONCE = Number(process.env.LOOP_POOL ?? 3);
const pool = async (n, items, fn) => {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
};
console.warn = (...a) => console.log('  model:', a.join(' ').slice(0, 200));
const times = [];
let failures = 0;
const report = (name, rows) => {
  for (const r of rows.filter((x) => !x.pass)) console.log(`MISS [${name}] ${r.show}`);
  failures += rows.filter((x) => !x.pass).length;
  console.log(`${name}: ${rows.filter((x) => x.pass).length}/${rows.length}`);
};

if (!list || list === 'route') {
  const rows = await pool(AT_ONCE, ROUTE, async ([want, text, before = []]) => {
    const r = await turn(text, before);
    times.push(r.ms);
    const safe = want !== 'question' || !WRITES.includes(r.name);
    const pass = r.kind === want && safe;
    return { pass, show: `"${text}" wanted ${want}, got ${r.kind} → ${r.name}: ${(r.said || r.summary).slice(0, 170)}` };
  });
  report('route', rows);
}
if (!list || list === 'fields') {
  const rows = await pool(AT_ONCE, FIELDS, async ([text, want, check]) => {
    const r = await turn(text);
    times.push(r.ms);
    const toolOk = want.includes(r.name);
    const pass = toolOk && (!check || check(r.args));
    return { pass, show: `"${text}" wanted ${want.join('|')}, got ${r.name}: ${r.said.slice(0, 120)} ${JSON.stringify(r.args).slice(0, 230)}` };
  });
  report('fields', rows);
}
if (!list || list === 'talk') {
  const rows = await pool(AT_ONCE, TALK, async ([first, replies, want, check]) => {
    const before = [];
    let r = await turn(first);
    const log = [`you: ${first}`, `app: ${r.name} ${r.said.slice(0, 150)}`];
    for (const reply of replies) {
      if (r.name !== 'ask_clarification') break;
      before.push(['user', log[log.length - 2].slice(5)], ['assistant', r.said]);
      r = await turn(reply, before);
      log.push(`you: ${reply}`, `app: ${r.name} ${r.said.slice(0, 150)} ${JSON.stringify(r.args).slice(0, 120)}`);
    }
    times.push(r.ms);
    // A new event in a change_plan card is the same thing as place_at.
    const add = r.name === 'change_plan' && want.includes('place_at') ? r.args.changes?.find((c) => c.op === 'add') : null;
    const asPlace = add ? { startISO: `${add.date}T${add.start}:00.000Z`, endISO: `${add.date}T${String(Number(add.start.slice(0, 2)) + Math.floor((add.duration_min ?? 0) / 60)).padStart(2, '0')}:${String(Number(add.start.slice(3, 5)) + (add.duration_min ?? 0) % 60).padStart(2, '0')}:00.000Z` } : null;
    const pass = (want.includes(r.name) || Boolean(add)) && (!check || check(asPlace ?? r.args));
    return { pass, show: log.join('\n     ') };
  });
  report('talk', rows);
}
const sorted = [...times].sort((a, b) => a - b);
console.log(`turn time: median ${(sorted[sorted.length >> 1] / 1000).toFixed(1)}s, slowest ${(sorted[sorted.length - 1] / 1000).toFixed(1)}s`);
console.log(failures ? `loop.live: ${failures} missed` : 'loop.live: all passed');
