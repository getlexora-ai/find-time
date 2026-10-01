import type { ToolUi } from './api-types';

/**
 * The agent's tools and pipeline steps, as the chat shows them.
 *
 * One list, owned by the server and served at GET /api/ai/tools. The panel
 * holds no labels or icons of its own: it draws whatever this says. To add a
 * tool, add its `ToolDef` to CHAT_TOOLS (src/server/ai/chat.ts) and an entry
 * here with the same `key` — its trace row, live row, colour and (optionally)
 * composer shortcut appear without touching the client.
 *
 * Plain data with no server imports, so the dev-only `/preview` route can use
 * the same list.
 */

/** Steps the route itself runs around the model call. */
export const STEP = {
  read: 'read_calendar',
  rules: 'apply_rules',
  model: 'model',
  rank: 'rank_slots',
  check: 'check_time',
  saveRule: 'save_rule',
  block: 'block_time',
  ask: 'ask',
} as const;

export const AGENT_TOOLS: ToolUi[] = [
  /* ── the model's tools (names match CHAT_TOOLS) ── */
  {
    key: 'propose_blocks',
    label: 'Find time',
    running: 'Finding time',
    icon: 'magic',
    color: 'deep',
    shortcut: { label: 'Find time', seed: 'Find time for ' },
  },
  {
    key: 'place_at',
    label: 'Place at a time',
    running: 'Placing it',
    icon: 'clock',
    color: 'sync',
    shortcut: { label: 'At a time', seed: 'Put ' },
  },
  {
    key: 'record_rule',
    label: 'Save a rule',
    running: 'Saving a rule',
    icon: 'shield',
    color: 'research',
    shortcut: { label: 'Rule', seed: 'Never book me ' },
  },
  {
    key: 'block_time_off',
    label: 'Block time off',
    running: 'Blocking time off',
    icon: 'calendar-mark',
    color: 'admin',
    shortcut: { label: 'Time off', seed: "I'm away " },
  },
  {
    key: 'delete_blocks',
    label: 'Delete blocks',
    running: 'Finding the blocks',
    icon: 'trash',
    color: 'admin',
    shortcut: { label: 'Delete', seed: 'Delete ' },
  },
  { key: 'ask_clarification', label: 'Ask you', running: 'Working out what to ask', icon: 'chat', color: 'admin' },
  { key: 'answer', label: 'Answer', running: 'Writing an answer', icon: 'chat', color: 'sync' },

  /* ── pipeline steps ── */
  { key: STEP.read, label: 'Read your calendar', running: 'Reading your calendar', icon: 'calendar', color: 'deep' },
  { key: STEP.rules, label: 'Applied your rules', running: 'Applying your rules', icon: 'shield', color: 'research' },
  { key: STEP.model, label: 'Understood your request', running: 'Working out what you need', icon: 'magic', color: 'sync' },
  { key: STEP.rank, label: 'Scored free slots', running: 'Scoring free slots', icon: 'chart', color: 'design' },
  { key: STEP.check, label: 'Checked that time', running: 'Checking that time', icon: 'clock', color: 'deep' },
  { key: STEP.saveRule, label: 'Saved a rule', running: 'Saving the rule', icon: 'stars', color: 'research' },
  { key: STEP.block, label: 'Blocked the time', running: 'Blocking the time', icon: 'calendar-mark', color: 'admin' },
  { key: STEP.ask, label: 'Needs one detail', running: 'Checking what is missing', icon: 'chat', color: 'admin' },
];

export const agentTool = (key: string): ToolUi | undefined => AGENT_TOOLS.find((t) => t.key === key);
