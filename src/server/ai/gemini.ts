/**
 * Minimal Gemini API client — raw `fetch`, no vendor SDK. Matches the rest of
 * src/server/ (see google/oauth.ts: "Raw fetch, no googleapis").
 *
 * One entry point: `extractWithTool` forces a single function call and returns
 * its validated args object, which is how we get structured JSON out of the
 * model. Callers pass a JSON-Schema-style `input_schema` (lowercase types,
 * `additionalProperties`, `minimum`/`maximum`) for parity with the shape the
 * rest of the app already writes; `toGeminiSchema` below converts it to
 * Gemini's OpenAPI-subset `Schema` (UPPERCASE types, no additionalProperties
 * or numeric bounds — those get folded into the field description instead).
 *
 * Server-only. Never import from the app bundle — this reads GEMINI_API_KEY.
 */

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash';

export function aiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

type GeminiResponse = {
  candidates?: { content?: { parts?: { functionCall?: { name?: string; args?: Record<string, unknown> } }[] } }[];
};

/** JSON-Schema (lowercase types) -> Gemini's Schema (UPPERCASE types, narrower field set). */
function toGeminiSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const type = typeof schema.type === 'string' ? schema.type.toUpperCase() : undefined;
  const out: Record<string, unknown> = {};
  if (type) out.type = type;

  let description = typeof schema.description === 'string' ? schema.description : undefined;
  const min = schema.minimum;
  const max = schema.maximum;
  if (typeof min === 'number' || typeof max === 'number') {
    // Gemini's Schema has no minimum/maximum — fold the bound into the text instead.
    const range = `${min ?? ''}–${max ?? ''}`;
    description = description ? `${description} (${range})` : `Range: ${range}`;
  }
  if (description) out.description = description;

  if (Array.isArray(schema.enum)) out.enum = schema.enum;

  if (type === 'OBJECT' && schema.properties && typeof schema.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties as Record<string, Record<string, unknown>>).map(([k, v]) => [
        k,
        toGeminiSchema(v),
      ]),
    );
    if (Array.isArray(schema.required)) out.required = schema.required;
    // additionalProperties is not part of Gemini's Schema — omitted, not forwarded.
  }
  if (type === 'ARRAY' && schema.items && typeof schema.items === 'object') {
    out.items = toGeminiSchema(schema.items as Record<string, unknown>);
  }
  return out;
}

export async function extractWithTool(opts: {
  system: string;
  user: string;
  tool: ToolDef;
  model?: string;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<Record<string, unknown>> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set.');

  const model = opts.model ?? DEFAULT_MODEL;
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    signal: opts.signal,
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': key,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.user }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: opts.tool.name,
              description: opts.tool.description,
              parameters: toGeminiSchema(opts.tool.input_schema),
            },
          ],
        },
      ],
      // Force the one function so the reply is always structured args, never prose.
      toolConfig: {
        functionCallingConfig: { mode: 'ANY', allowedFunctionNames: [opts.tool.name] },
      },
      generationConfig: {
        maxOutputTokens: opts.maxTokens ?? 1024,
        temperature: 0,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as GeminiResponse;
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const call = parts.find((p) => p.functionCall?.name === opts.tool.name)?.functionCall;
  if (!call?.args) throw new Error('Gemini returned no functionCall.');
  return call.args;
}
