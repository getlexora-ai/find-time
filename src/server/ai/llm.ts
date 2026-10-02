/**
 * The model, via OpenRouter — raw `fetch`, no vendor SDK. OpenRouter speaks the
 * OpenAI chat-completions format, so tool schemas are plain JSON Schema and go
 * through unchanged.
 *
 * Model: OPENROUTER_MODEL, default `openai/gpt-6-luna`. OPENROUTER_FALLBACK_MODEL,
 * when set, rides in OpenRouter's `models` list and is used only if the first
 * one fails.
 *
 * Privacy: `zdr` + `data_collection: 'deny'` route only to endpoints that keep
 * no prompts and don't collect them. A request no such endpoint can serve
 * fails rather than falling back to one that does.
 *
 * Every call forces a tool call: the model picks an action and fills its
 * arguments, deterministic code decides whether to carry it out. Calendar text
 * read into a prompt can never come back out as a free-text instruction.
 *
 * Server-only. Never import from the app bundle — this reads OPENROUTER_API_KEY.
 */

const URL_ = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-6-luna';
const RETRY_DELAY_MS = 800;

function model(): string {
  return process.env.OPENROUTER_MODEL?.trim() || DEFAULT_MODEL;
}

export function aiConfigured(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

export type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };
export type ChatTurn = { role: 'user' | 'assistant'; text: string };

/** The model's choice; `model` is the one that actually answered (a fallback shows here). */
export type ToolChoice = {
  name: string;
  args: Record<string, unknown>;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  outputTokens?: number;
};

type Completion = {
  model?: string;
  choices?: {
    finish_reason?: string;
    message?: { tool_calls?: { function?: { name?: string; arguments?: string } }[] };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

/** Overloaded, rate-limited, or answered without the forced tool call: worth one more try. */
class LlmError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

async function callOnce(opts: {
  system: string;
  history: ChatTurn[];
  tools: ToolDef[];
  /** one tool name forces that tool; otherwise any one of them */
  force?: string;
  temperature: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<ToolChoice> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY is not set.');
  if (opts.tools.length === 0) throw new Error('Needs at least one tool.');

  const fallback = process.env.OPENROUTER_FALLBACK_MODEL?.trim();
  const startedAt = Date.now();
  const res = await fetch(URL_, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'HTTP-Referer': process.env.EXPO_PUBLIC_SITE_URL || 'https://findtime.ai',
      'X-OpenRouter-Title': 'Find Time',
    },
    body: JSON.stringify({
      ...(fallback && fallback !== model() ? { models: [model(), fallback] } : { model: model() }),
      messages: [
        { role: 'system', content: opts.system },
        ...opts.history.map((m) => ({ role: m.role, content: m.text })),
      ],
      tools: opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      })),
      tool_choice: opts.force ? { type: 'function', function: { name: opts.force } } : 'required',
      parallel_tool_calls: false,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens ?? 1024,
      provider: { zdr: true, data_collection: 'deny' },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new LlmError(`OpenRouter ${res.status}: ${body.slice(0, 300)}`, res.status === 429 || res.status >= 500);
  }

  const data = (await res.json()) as Completion;
  const names = opts.tools.map((t) => t.name);
  const fn = data.choices?.[0]?.message?.tool_calls?.find((c) => names.includes(c.function?.name ?? ''))?.function;
  let args: Record<string, unknown> | null = null;
  try {
    args = fn?.arguments ? (JSON.parse(fn.arguments) as Record<string, unknown>) : null;
  } catch {
    // malformed JSON arguments — same as no call
  }
  if (!fn?.name || !args) {
    const reason = data.choices?.[0]?.finish_reason;
    throw new LlmError(`Model returned no tool call${reason ? ` (finish_reason ${reason})` : ''}.`, true);
  }
  return {
    name: fn.name,
    args,
    model: data.model ?? model(),
    latencyMs: Date.now() - startedAt,
    promptTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
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
    temperature: 0,
    maxTokens: opts.maxTokens,
    signal: opts.signal,
  });
  return r.args;
}

/**
 * The conversational counterpart: carries history, offers several tools, the
 * model must pick exactly one. A shade above zero temperature so a rephrased
 * question doesn't get the same clarifying question back verbatim.
 */
export async function chatWithTools(opts: {
  system: string;
  history: ChatTurn[];
  tools: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<ToolChoice> {
  return withRetry({ ...opts, temperature: 0.2 });
}
