/**
 * The same readings through the API, one call per task — the way the app
 * would call the model (llm.ts `extractWithTool`: forced tool call, one retry).
 * Writes JSON lines the existing `score` commands read. Model: OPENAI_MODEL,
 * default gpt-6-luna.
 *
 *   node --env-file=.env.local src/server/ai/eval/run-model.mjs natural <tasks.jsonl> <out.jsonl>
 *   node --env-file=.env.local src/server/ai/eval/run-model.mjs nemotron <fromRow> <toRow> <out.jsonl>
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractWithTool } from '../llm.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (p) => readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const PARALLEL = 5;

const str = { type: 'string' };
const TOOLS = {
  natural: {
    name: 'record_constraints',
    description: 'Record the constraints copied from the scheduling request.',
    input_schema: {
      type: 'object',
      properties: {
        durationMin: { type: 'integer' },
        days: { type: 'array', items: str },
        busy: { type: 'array', items: { type: 'array', items: str, minItems: 3, maxItems: 3 } },
        avoid: { type: 'array', items: { type: 'array', items: str, minItems: 1, maxItems: 3 } },
      },
      required: ['durationMin', 'days', 'busy', 'avoid'],
      additionalProperties: false,
    },
  },
  nemotron: {
    name: 'record_events',
    description: 'Record every event the user asked for, with its latest length and condition.',
    input_schema: {
      type: 'object',
      properties: {
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'integer' },
              durationMin: { type: 'integer' },
              constraint: { anyOf: [{ type: 'null' }, { type: 'array', items: str, minItems: 2, maxItems: 3 }] },
            },
            required: ['id', 'durationMin', 'constraint'],
            additionalProperties: false,
          },
        },
      },
      required: ['events'],
      additionalProperties: false,
    },
  },
};

const [kind, ...args] = process.argv.slice(2);
let tasks, out, system;
if (kind === 'natural') {
  tasks = load(args[0]).map((t) => ({ id: t.id, text: t.task }));
  out = args[1];
  system = readFileSync(join(HERE, 'extract-prompt.md'), 'utf8');
} else if (kind === 'nemotron') {
  const rows = load(join(HERE, 'nemotron', 'calendar-500.jsonl')).slice(Number(args[0]), Number(args[1]));
  // The user's turns only, as the sub-agent runs saw them.
  tasks = rows.map((r) => ({ id: r.id, text: r.turns.filter((t) => t.role === 'user').map((t, i) => `${i + 1}. ${t.text}`).join('\n') }));
  out = args[2];
  system = readFileSync(join(HERE, 'nemotron', 'extract-prompt.md'), 'utf8');
} else {
  console.log('usage: natural <tasks.jsonl> <out.jsonl> | nemotron <fromRow> <toRow> <out.jsonl>');
  process.exit(1);
}
system += '\n\nReturn the result for this one task by calling the tool. Leave out the "id" of the task; it is added for you.';

const results = new Array(tasks.length);
let next = 0;
let failed = 0;
let done = 0;
const t0 = Date.now();
async function worker() {
  while (next < tasks.length) {
    const i = next++;
    try {
      const got = await extractWithTool({ system, user: tasks[i].text, tool: TOOLS[kind], maxTokens: 8000 });
      results[i] = { id: tasks[i].id, ...got };
    } catch (err) {
      failed++;
      results[i] = { id: tasks[i].id, error: String(err.message ?? err).slice(0, 200) };
    }
    done++;
    process.stdout.write(`\r${done}/${tasks.length} done · ${failed} failed`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));
writeFileSync(out, results.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`\nwrote ${results.length} lines to ${out} in ${Math.round((Date.now() - t0) / 1000)}s (${failed} failed calls — scored as misses)`);
