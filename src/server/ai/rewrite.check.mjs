/**
 * The model fallback (rewrite.ts) behind Plan with AI. Fixed clock, real sentences.
 *   node src/server/ai/rewrite.check.mjs                          offline: the hand-off only
 *   node --env-file=.env.local src/server/ai/rewrite.check.mjs    + live OpenAI rewrites
 */
import assert from 'node:assert/strict';

import { rewriteForRules, weakRead } from './rewrite.ts';
import { understand } from './understand.ts';

const nowISO = '2026-10-01T09:00:00.000Z';
const ctx = { nowISO, previous: null, lastProposals: [] };
const read = (t) => understand(t, ctx);

// What the rules read well stays theirs: the model is never asked.
for (const t of ['2h of deep work on Thursday', 'hi', 'gym tomorrow 1h', 'dentist Friday 9:30am for half an hour', 'never book me before 10']) {
  assert.equal(weakRead(read(t)), false, t);
}
// Misreads and give-ups are handed to the model.
for (const t of ['hmm idk, whatever works', 'can u squeeze a 90 min deep work thing in on thu arvo', 'ich muss morgen 2 stunden für die steuer machen']) {
  assert.equal(weakRead(read(t)), true, t);
}

const MESSY = [
  'can u squeeze a 90 min deep work thing in on thu arvo',
  'ich muss morgen 2 stunden für die steuer machen',
  'pls block sth for the dentist fri half nine, 30m',
  'Mañana necesito una hora para el gimnasio',
  'set me up so mornings stay meeting-less',
];

if (!process.env.OPENAI_API_KEY) {
  assert.equal(await rewriteForRules('hmm idk', nowISO), null, 'no key: no call, the turn is unchanged');
  for (const t of MESSY) assert.equal(weakRead(read(t)), true, `handed off: ${t}`);
  console.log('rewrite.check: ok (offline; set OPENAI_API_KEY for the live part)');
} else {
  let miss = 0;
  for (const t of MESSY) {
    const s = await rewriteForRules(t, nowISO);
    const r = s ? read(s) : null;
    const ok = r && !weakRead(r);
    if (!ok) miss++;
    console.log(`  ${ok ? 'ok  ' : 'MISS'} ${t}\n       → ${s ?? '(none)'}\n       → ${r ? `${r.name} · ${r.summary}` : '-'}`);
  }
  // Not a request: the model returns "" and nothing is planned.
  assert.equal(await rewriteForRules('what is the capital of France', nowISO), null);
  assert.equal(miss, 0, `${miss} messy sentences still unread`);
  console.log('rewrite.check: ok (live)');
}
