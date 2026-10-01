import type { ToolsResponse } from '@/lib/api-types';
import { AGENT_TOOLS } from '@/lib/agent-tools';

/**
 * GET /api/ai/tools — how the agent's tools and steps look in the chat.
 * No user data, so no auth; the panel fetches it once per session.
 */
export function GET(): Response {
  return Response.json({ tools: AGENT_TOOLS } satisfies ToolsResponse, {
    headers: { 'cache-control': 'public, max-age=300' },
  });
}
