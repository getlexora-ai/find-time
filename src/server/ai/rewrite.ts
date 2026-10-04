import { aiConfigured, extractWithTool, type ToolDef } from './llm.ts';
import { TOOL_ASK, TOOL_PLACE_AT, TOOL_PROPOSE } from './tools/names.ts';
import { NOT_UNDERSTOOD, type Understood } from './understand.ts';

/**
 * The model as a fallback reader. When understand.ts can't read a sentence,
 * or reads it into a long leftover title (what it does with slang, typos or
 * another language: "U squeeze a deep work thing in arvo"), the model rewrites it into the plain phrasing the rules do read, and the
 * rules run again on that. The model never picks a time or a slot: every
 * check (ask before placing, am/pm, clashes) still runs on the rewrite.
 *
 * Sent to OpenAI: the sentence the user typed and today's date. Nothing from
 * the calendar (privacy policy, "AI features").
 */

const TOOL: ToolDef = {
  name: 'rewrite_request',
  description: 'The request rewritten as one plain sentence in the supported phrasing, or "" if it is not one.',
  input_schema: {
    type: 'object',
    properties: { sentence: { type: 'string' } },
    required: ['sentence'],
    additionalProperties: false,
  },
};

const EXAMPLES = [
  '2h of deep work on Thursday',
  '2 hours of research tomorrow afternoon',
  '1 hour of deep work between 2 and 5 tomorrow',
  'an hour and a half of design next week after 2pm',
  'three review slots on Tuesday, 30 min each',
  'gym every morning next week for 45 min',
  'dentist Friday 9:30am for half an hour',
  'dinner at 19:00 on Saturday for 2h',
  'add task: write the quarterly report, 3h, due Friday',
  'add task: tax return, 3h, due 30 Oct, not before 20 Oct',
  'habit: gym 3x a week, 1h, mornings',
  'add habit meditate every day for 15 min',
  'never book me before 10',
  'no meetings on Fridays',
  'keep Friday afternoons free',
  '15 minutes between meetings',
  "I'm off from the 17th to the 22nd",
  'vacation in Lisbon next week',
  'cancel gym tomorrow',
  'clear everything on Friday',
  'make it 90 minutes',
  'not Tuesday',
  'later',
];

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function system(nowISO: string): string {
  const d = new Date(nowISO);
  return [
    'You rewrite a calendar request into one short English sentence that a strict rule-based reader understands.',
    `Today is ${WD[d.getUTCDay()]} ${nowISO.slice(0, 10)}.`,
    'Phrasings it understands:',
    ...EXAMPLES.map((e) => `- ${e}`),
    'Rules:',
    '- Keep every fact the user gave: what, how long, which day, what time, how often. Keep their own words for the title.',
    '- Never add a day, a length or a time the user did not say; leave it out and the app will ask.',
    '- Use weekday names, "today", "tomorrow", "next week" or dates like "Oct 17". Write times as 18:00 or 6pm.',
    '- Translate other languages to English. Fix typos and slang.',
    '- If it is not a request about planning their time, return "".',
  ].join('\n');
}

/**
 * Worth a second reading: the rules gave up, or a scheduling read kept more
 * than three words as the title. Real titles are short ("Dentist", "Deep
 * work"); a longer real one ("Write the blog post") costs one call, comes back
 * unchanged and keeps its first reading.
 */
export function weakRead(c: Understood): boolean {
  if (c.summary === NOT_UNDERSTOOD) return true;
  if (c.name !== TOOL_PROPOSE && c.name !== TOOL_PLACE_AT && c.name !== TOOL_ASK) return false;
  const title = typeof c.args.title === 'string' ? c.args.title : (c.draft?.title ?? '');
  return title.trim().split(/\s+/).length > 3;
}

/** The rewrite, or null (no key, not a request, timeout, any failure). */
export async function rewriteForRules(text: string, nowISO: string): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    const out = await extractWithTool({ system: system(nowISO), user: text, tool: TOOL, signal: AbortSignal.timeout(8000) });
    const s = typeof out.sentence === 'string' ? out.sentence.trim().slice(0, 300) : '';
    return s && s.toLowerCase() !== text.trim().toLowerCase() ? s : null;
  } catch (err) {
    console.warn('[ai] rewrite failed:', err instanceof Error ? err.message.slice(0, 120) : err);
    return null;
  }
}
