/**
 * The model: OpenAI's Responses API, raw `fetch`, no vendor SDK. Request shape
 * as agent-v2 used it against the same model (reasoning effort low, no
 * temperature — a reasoning model rejects it).
 *
 * Model: OPENAI_MODEL, default `gpt-6-luna`. `store: false`: OpenAI keeps no
 * conversation state for us. (Its API still holds requests up to 30 days for
 * abuse monitoring and doesn't train on them — the privacy policy says so.)
 *
 * Every call forces a tool call: the model picks an action and fills its
 * arguments, deterministic code decides whether to carry it out. Calendar text
 * read into a prompt can never come back out as a free-text instruction.
 *
 * Server-only. Never import from the app bundle — this reads OPENAI_API_KEY.
 */

const URL_ = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-6-luna';
const RETRY_DELAY_MS = 800;

function model(): string {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** `strict`: OpenAI enforces the schema exactly (every property required, no extras) — for forms code reads field by field. */
export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown>; strict?: boolean };
export type ChatTurn = { role: 'user' | 'assistant'; text: string };

/** The model's choice and what it cost. */
export type ToolChoice = {
  name: string;
  args: Record<string, unknown>;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
};

type Response = {
  model?: string;
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; name?: string; arguments?: string; call_id?: string }[];
  usage?: { input_tokens?: number; output_tokens?: number };
};

/** Overloaded, rate-limited, or answered without the forced tool call: worth one more try. */
class LlmError extends Error {
  // A plain field, not a constructor parameter property: Node's type stripping
  // can't run those, and the evals import this file directly.
  readonly retryable: boolean;
  constructor(message: string, retryable: boolean) {
    super(message);
    this.retryable = retryable;
  }
}

async function callOnce(opts: {
  system: string;
  history: ChatTurn[];
  tools: ToolDef[];
  /** one tool name forces that tool; otherwise any one of them */
  force?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<ToolChoice> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set.');
  if (opts.tools.length === 0) throw new Error('Needs at least one tool.');

  const startedAt = Date.now();
  const res = await fetch(URL_, {
    method: 'POST',
    signal: opts.signal,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model(),
      instructions: opts.system,
      input: opts.history.map((m) => ({ role: m.role, content: m.text })),
      tools: opts.tools.map((t) => ({
        type: 'function',
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
        strict: t.strict ?? false,
      })),
      tool_choice: opts.force ? { type: 'function', name: opts.force } : 'required',
      parallel_tool_calls: false,
      reasoning: { effort: 'low' },
      // includes reasoning tokens, hence the headroom
      max_output_tokens: opts.maxTokens ?? 2048,
      store: false,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError(`OpenAI ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500);
  }

  const data = (await res.json()) as Response;
  const names = opts.tools.map((t) => t.name);
  const call = data.output?.find((o) => o.type === 'function_call' && names.includes(o.name ?? ''));
  let args: Record<string, unknown> | null = null;
  try {
    args = call?.arguments ? (JSON.parse(call.arguments) as Record<string, unknown>) : null;
  } catch {
    // malformed JSON arguments — same as no call
  }
  if (!call?.name || !args) {
    const reason = data.incomplete_details?.reason ?? data.status;
    throw new LlmError(`Model returned no tool call${reason ? ` (${reason})` : ''}.`, true);
  }
  return {
    name: call.name,
    args,
    model: data.model ?? model(),
    latencyMs: Date.now() - startedAt,
    promptTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

async function withRetry(opts: Parameters<typeof callOnce>[0]): Promise<ToolChoice> {
  try {
    return await callOnce(opts);
  } catch (err) {
    if (!(err instanceof LlmError) || !err.retryable || opts.signal?.aborted) throw err;
  }
  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
  return callOnce(opts);
}

/** One forced tool call; returns its arguments. Structured JSON out of a sentence. */
export async function extractWithTool(opts: {
  system: string;
  user: string;
  tool: ToolDef;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const r = await withRetry({
    system: opts.system,
    history: [{ role: 'user', text: opts.user }],
    tools: [opts.tool],
    force: opts.tool.name,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
  });
  return r.args;
}

/* ── the agent loop: several steps, each one tool call, results fed back ── */

/** One item of a stateless Responses conversation: a message, the model's own output, or a tool result. */
export type AgentItem = Record<string, unknown>;

export type AgentStep = {
  name: string;
  args: Record<string, unknown> | null;
  callId: string;
  /** the model's output items, to send back next step (reasoning included, encrypted) */
  output: AgentItem[];
  promptTokens: number;
  outputTokens: number;
};

/**
 * One step: the model must call one of `tools`. `store: false` keeps nothing at
 * OpenAI, so each step resends the conversation, including the model's own
 * earlier output (its reasoning comes back encrypted and is passed through).
 * Malformed arguments come back as `args: null` — the caller tells the model.
 */
export async function agentStep(opts: {
  system: string;
  input: AgentItem[];
  tools: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<AgentStep> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set.');
  const res = await fetch(URL_, {
    method: 'POST',
    signal: opts.signal,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: model(),
      instructions: opts.system,
      input: opts.input,
      tools: opts.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.input_schema, strict: t.strict ?? false })),
      tool_choice: 'required',
      parallel_tool_calls: false,
      reasoning: { effort: 'low' },
      include: ['reasoning.encrypted_content'],
      max_output_tokens: opts.maxTokens ?? 2048,
      store: false,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError(`OpenAI ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500);
  }
  const data = (await res.json()) as Response;
  const call = data.output?.find((o) => o.type === 'function_call');
  if (!call?.name || !call.call_id) {
    throw new LlmError(`Model returned no tool call (${data.incomplete_details?.reason ?? data.status ?? 'unknown'}).`, true);
  }
  let args: Record<string, unknown> | null = null;
  try {
    args = JSON.parse(call.arguments ?? '') as Record<string, unknown>;
  } catch {
    // reported back to the model by the caller
  }
  return {
    name: call.name,
    args,
    callId: call.call_id,
    output: (data.output ?? []) as AgentItem[],
    promptTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

/** The conversational counterpart: carries history, offers several tools, the model picks exactly one. */
export async function chatWithTools(opts: {
  system: string;
  history: ChatTurn[];
  tools: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<ToolChoice> {
  return withRetry(opts);
}
