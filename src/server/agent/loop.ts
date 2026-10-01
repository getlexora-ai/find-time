import OpenAI from 'openai';
import type { FunctionTool, ResponseInputItem, ResponseOutputItem } from 'openai/resources/responses/responses';

import type { AgentEvent, AgentRequest, PendingChange } from '@/lib/agent-types';

import { ambiguousTime } from '../ai/place-at';
import { getSettings } from '../calendar/settings-repo';
import { listEvents } from '../events-repo';
import { context, RULES } from './prompt';
import { type Ctx, TOOLS } from './tools';

/**
 * One turn of Plan with AI v2 — find-time-agent's manual tool loop, on OpenAI's
 * Responses API, streaming.
 *
 *   look (find_events, find_free_slots) → maybe ask (ask_user) → draft changes
 *   → pause for Approve → apply what was approved → reply
 *
 * Stateless: the client sends the transcript (`items`) back each turn, and
 * nothing is stored at OpenAI (`store: false`; reasoning comes back encrypted
 * and is passed through untouched).
 *
 * Every write waits for an explicit Approve for that exact call ("fail
 * closed"); a model can draft anything but apply nothing on its own.
 */

const MODEL = process.env.OPENAI_MODEL ?? 'gpt-6-luna';
const MAX_ROUNDS = 8;
const MAX_ITEMS = 400;

let client: OpenAI | null = null;
const openai = () => (client ??= new OpenAI({ timeout: 60_000, maxRetries: 2 })); // reads OPENAI_API_KEY

export const agentConfigured = () => Boolean(process.env.OPENAI_API_KEY);

const TOOL_DEFS: FunctionTool[] = Object.entries(TOOLS).map(([name, t]) => ({
  type: 'function',
  name,
  description: t.description,
  parameters: t.parameters,
  strict: true,
}));

type Call = { call_id: string; name: string; arguments: string };

const isCall = (i: unknown): i is Call & { type: 'function_call' } =>
  typeof i === 'object' && i !== null && (i as { type?: string }).type === 'function_call';
const outputIds = (items: unknown[]) =>
  new Set(
    items
      .filter((i): i is { type: 'function_call_output'; call_id: string } => (i as { type?: string })?.type === 'function_call_output')
      .map((i) => i.call_id),
  );

/** Calls in the transcript that still have no output — the open question or the pending changes. */
function openCalls(items: unknown[]): Call[] {
  const done = outputIds(items);
  return items.filter(isCall).filter((c) => !done.has(c.call_id));
}

const out = (call_id: string, output: string): ResponseInputItem => ({ type: 'function_call_output', call_id, output });
const parse = (s: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
};

/** The newest thing the user typed, unless they have since answered a question. */
function lastUserText(items: unknown[]): string | null {
  for (let k = items.length - 1; k >= 0; k--) {
    const it = items[k] as { role?: string; content?: unknown; type?: string; output?: unknown };
    if (it.type === 'function_call_output' && typeof it.output === 'string' && it.output.startsWith('The user answered')) return null;
    if (it.role === 'user') return typeof it.content === 'string' ? it.content : null;
  }
  return null;
}

/** am/pm guard, in code: models skip the prompt rule when one reading "seems likely". */
function ampmBlock(items: unknown[], call: Call, args: Record<string, unknown>): string | null {
  if (call.name !== 'create_event' && call.name !== 'change_event') return null;
  const text = lastUserText(items);
  const amb = text ? ambiguousTime(text) : null;
  const start = typeof args.start === 'string' ? args.start.slice(11, 16) : null;
  if (!amb || !start || ![amb.am, amb.pm].includes(start)) return null;
  return `Not run: the user wrote "${amb.said}" without am/pm. Call ask_user first with options "${amb.am}" and "${amb.pm}" (likelier first).`;
}

export async function runTurn(userId: string, req: AgentRequest, emit: (e: AgentEvent) => void): Promise<void> {
  const items: unknown[] = Array.isArray(req.items) ? req.items.slice(-MAX_ITEMS) : [];
  const ctx: Ctx = { userId, timeZone: req.timeZone, settings: await getSettings(userId), events: await listEvents(userId) };

  /* ── 1. close what the last turn left open: an answer, or approvals ── */
  const open = openCalls(items);
  let consumedMessage = false;
  for (const call of open) {
    const tool = TOOLS[call.name];
    const args = parse(call.arguments) ?? {};
    if (call.name === 'ask_user') {
      const answer = req.answers?.[call.call_id] ?? (req.message && !consumedMessage ? req.message : undefined);
      if (answer === undefined) {
        items.push(out(call.call_id, 'The user did not answer; they moved on.'));
        continue;
      }
      if (answer === req.message) consumedMessage = true;
      emit({ type: 'tool', id: call.call_id, status: 'done', label: 'You answered', detail: answer.slice(0, 80) });
      items.push(out(call.call_id, `The user answered: ${answer}`));
      continue;
    }
    if (tool?.approve) {
      // Fail closed: only an explicit true for this exact call applies it.
      if (req.approvals?.[call.call_id] !== true) {
        items.push(out(call.call_id, 'The user rejected this change. Do not retry it unless they ask again.'));
        emit({ type: 'tool', id: call.call_id, status: 'done', label: tool.label(args), detail: 'rejected' });
        continue;
      }
      emit({ type: 'tool', id: call.call_id, status: 'running', label: 'Applying' });
      try {
        const r = await tool.run(args, ctx);
        if (r.applied) emit({ type: 'applied', id: call.call_id, ...r.applied });
        emit({ type: 'tool', id: call.call_id, status: 'done', label: r.applied?.summary ?? 'Applied' });
        items.push(out(call.call_id, JSON.stringify(r.output)));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: 'tool', id: call.call_id, status: 'error', label: 'Could not apply', detail: msg });
        items.push(out(call.call_id, `Error: ${msg}`));
      }
      continue;
    }
    items.push(out(call.call_id, 'Not run.'));
  }
  if (req.message && !consumedMessage) items.push({ role: 'user', content: req.message.slice(0, 4000) });

  /* ── 2. the loop ── */
  const instructions = `${RULES}\n\n${context(ctx.timeZone, ctx.settings)}`;
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = await openai().responses.create({
      model: MODEL,
      instructions,
      input: items as ResponseInputItem[],
      tools: TOOL_DEFS,
      parallel_tool_calls: true,
      reasoning: { effort: 'low' },
      store: false,
      include: ['reasoning.encrypted_content'],
      stream: true,
    });

    let output: ResponseOutputItem[] | null = null;
    for await (const ev of stream) {
      if (ev.type === 'response.output_text.delta') emit({ type: 'text', delta: ev.delta });
      else if (ev.type === 'response.completed') output = ev.response.output;
      else if (ev.type === 'response.failed') throw new Error(ev.response.error?.message ?? 'The model failed.');
      else if (ev.type === 'response.incomplete') throw new Error('The reply was cut short. Try a smaller request.');
      else if (ev.type === 'error') throw new Error(ev.message);
    }
    if (!output) throw new Error('No reply from the model.');
    items.push(...output);

    const calls = output.filter(isCall) as Call[];
    if (!calls.length) {
      emit({ type: 'done', items });
      return;
    }

    // A question ends the step: everything else it asked for in parallel waits.
    const ask = calls.find((c) => c.name === 'ask_user');
    const askArgs = ask ? parse(ask.arguments) : null;
    const askOk =
      askArgs &&
      typeof askArgs.question === 'string' &&
      Array.isArray(askArgs.options) &&
      askArgs.options.length >= 2 &&
      askArgs.options.every((o) => typeof o === 'string' && o.length <= 60);
    if (ask && askOk) {
      for (const c of calls) if (c !== ask) items.push(out(c.call_id, 'Not run: you asked the user a question in the same step. Call it again if still needed.'));
      emit({
        type: 'question',
        question: { id: ask.call_id, question: String(askArgs!.question), options: (askArgs!.options as string[]).slice(0, 4) },
      });
      emit({ type: 'done', items });
      return;
    }

    const pending: PendingChange[] = [];
    for (const call of calls) {
      const tool = TOOLS[call.name];
      const args = parse(call.arguments);
      if (!tool || !args || (call === ask && !askOk)) {
        items.push(out(call.call_id, `Error: ${!tool ? `unknown tool ${call.name}` : 'arguments were not valid JSON for this tool'}`));
        continue;
      }
      const blocked = ampmBlock(items, call, args);
      if (blocked) {
        items.push(out(call.call_id, blocked));
        continue;
      }
      let label = call.name;
      try {
        label = tool.label(args);
      } catch {
        // a label is decoration; never let it fail a call
      }
      emit({ type: 'tool', id: call.call_id, status: 'running', label });
      try {
        if (tool.approve) {
          pending.push(await tool.approve(args, ctx, call.call_id));
          emit({ type: 'tool', id: call.call_id, status: 'done', label, detail: 'waiting for you' });
        } else {
          const r = await tool.run(args, ctx);
          emit({ type: 'tool', id: call.call_id, status: 'done', label, detail: r.detail });
          items.push(out(call.call_id, JSON.stringify(r.output)));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        emit({ type: 'tool', id: call.call_id, status: 'error', label, detail: msg });
        items.push(out(call.call_id, `Error: ${msg}`));
      }
    }

    if (pending.length) {
      emit({ type: 'pending', changes: pending });
      emit({ type: 'done', items });
      return;
    }
  }
  throw new Error('That took too many steps. Try asking for one thing at a time.');
}
