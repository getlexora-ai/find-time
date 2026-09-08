/**
 * Minimal Anthropic Messages API client — raw `fetch`, no vendor SDK. Matches
 * the rest of src/server/ (see google/oauth.ts: "Raw fetch, no googleapis").
 *
 * One entry point: `extractWithTool` forces a single tool call and returns its
 * validated input object, which is how we get structured JSON out of the model.
 *
 * Server-only. Never import from the app bundle — this reads ANTHROPIC_API_KEY.
 */

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-opus-5';

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

type MessagesResponse = {
  content: { type: string; name?: string; input?: Record<string, unknown> }[];
};

export async function extractWithTool(opts: {
  system: string;
  user: string;
  tool: ToolDef;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set.');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model ?? DEFAULT_MODEL,
      max_tokens: opts.maxTokens ?? 1024,
      // Trivial extraction — no reasoning needed, keep it fast and cheap.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      tools: [opts.tool],
      // Force the one tool so the reply is always structured args, never prose.
      tool_choice: { type: 'tool', name: opts.tool.name },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as MessagesResponse;
  const block = data.content?.find((b) => b.type === 'tool_use' && b.name === opts.tool.name);
  if (!block?.input) throw new Error('Anthropic returned no tool_use block.');
  return block.input;
}
