import { isConfigured, query, queryOne } from '../db.ts';
import { aiConfigured, chatWithTools, type ToolDef } from './llm.ts';
import { TOOL_ASK, TOOL_PLACE_AT, TOOL_PROPOSE } from './tools/names.ts';
import { type Draft, NOT_UNDERSTOOD, type Understood } from './understand.ts';

/**
 * The model as a fallback reader. When understand.ts can't read a sentence,
 * or reads it into a long leftover title (what it does with slang, typos or
 * another language: "U squeeze a deep work thing in arvo"), the model rewrites
 * it into the plain phrasing the rules do read, and the rules run again on
 * that. The model never picks a time or a slot: every check (ask before
 * placing, am/pm, clashes) still runs on the rewrite.
 *
 * Sent to OpenAI: the sentence the user typed and today's date. Nothing from
 * the calendar (privacy policy, "AI features"). Capped at AI_BUDGET_USD a
 * month (default $1, db/025); over it, the rules read alone.
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
  'add task: prep for the investor call, 3h, due Oct 14',
  'habit: gym 3x a week, 1h, mornings',
  'add habit meditate every day for 15 min',
  'add habit read every day for 20 min, evenings',
  '30 min call with mom this weekend after 10am',
  'never book me before 10',
  'no meetings on Fridays',
  'keep Friday afternoons free',
  '15 minutes between meetings',
  "I'm off from the 17th to the 22nd",
  'Berlin trip from Oct 6 to Oct 8',
  'vacation in Lisbon next week',
  'cancel gym tomorrow',
  'clear everything on Friday',
  'make it 90 minutes',
  'not Tuesday',
  'later',
];

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function system(nowISO: string, lastQuestion?: string): string {
  const d = new Date(nowISO);
  return [
    'You rewrite a calendar request into one short English sentence that a strict rule-based reader understands.',
    `Today is ${WD[d.getUTCDay()]} ${nowISO.slice(0, 10)}.`,
    'Phrasings it understands:',
    ...EXAMPLES.map((e) => `- ${e}`),
    'Rules:',
    '- Keep every fact the user gave: what, how long, which day, what time, how often. Keep their own words for the title, short (2-4 words).',
    '- Never add a day, a length or a time the user did not say; leave it out and the app will ask.',
    '- Use weekday names, "today", "tomorrow", "next week" or dates like "Oct 17"; for a span of days use dates ("from Oct 6 to Oct 8"). Write times as 18:00 or 6pm. Write lengths as "30 min" or "2h", never inside the title.',
    '- Work with a deadline or spread over several days is a task: "add task: <title>, <length>, due <day>".',
    '- Something every day or several times a week is a habit: "add habit <title> every day for <length>" or "habit: <title> 3x a week, <length>".',
    '- Drop conditions the app cannot check (how many meetings a day has, other people, weather); never put them in the title.',
    '- Travel or being away is a trip: "<place> trip from <day> to <day>".',
    '- Translate other languages to English. Fix typos and slang.',
    '- If it is not a request about planning their time, return "".',
    ...(lastQuestion
      ? [
          `The app just asked: "${lastQuestion}". If the message answers it, return only the answer in the phrasing above ("18:00", "90 min", "afternoon", "Tuesday"), not a new request.`,
        ]
      : []),
  ].join('\n');
}

/**
 * Worth a second reading: the rules gave up, or a scheduling read kept more
 * than three words as the title. Real titles are short ("Dentist", "Deep
 * work"); a longer real one ("Write the blog post") costs one call, comes back
 * unchanged and keeps its first reading.
 *
 * Mid-conversation, a reply read as a new item is also worth one: "pm" or
 * "like 90 mins" after a question became blocks titled "Pm" and "Like". With
 * the question (rewriteForRules' lastQuestion) the model turns them into "18:00"
 * and "90 min"; a real new request comes back as itself.
 */
export function weakRead(c: Understood, previous: Draft | null = null): boolean {
  if (c.summary === NOT_UNDERSTOOD) return true;
  if (c.name !== TOOL_PROPOSE && c.name !== TOOL_PLACE_AT && c.name !== TOOL_ASK) return false;
  const title = typeof c.args.title === 'string' ? c.args.title : (c.draft?.title ?? '');
  if (previous?.title && c.draft?.title && c.draft.title !== previous.title) return true;
  return title.trim().split(/\s+/).length > 3;
}

// gpt-6-luna, USD per token (input $0.10 / output $0.50 per 1M, Sept 2026).
// ponytail: one model's price; if OPENAI_MODEL changes, change these too.
const USD_IN = 0.1 / 1e6;
const USD_OUT = 0.5 / 1e6;
const budget = () => Number(process.env.AI_BUDGET_USD ?? 1);
const month = () => new Date().toISOString().slice(0, 7);

/** Under this month's AI budget (db/025). No database, or it can't answer: no model. */
async function underBudget(): Promise<boolean> {
  if (!isConfigured()) return false;
  const row = await queryOne<{ usd: string }>(`select usd from ai_spend where month = $1`, [month()]);
  return Number(row?.usd ?? 0) < budget();
}

async function addSpend(usd: number): Promise<void> {
  await query(
    `insert into ai_spend (month, usd, calls) values ($1, $2, 1)
     on conflict (month) do update set usd = ai_spend.usd + excluded.usd, calls = ai_spend.calls + 1`,
    [month(), usd],
  );
}

/** The rewrite, or null (no key, over budget, not a request, timeout, any failure). */
export async function rewriteForRules(text: string, nowISO: string, lastQuestion?: string): Promise<string | null> {
  if (!aiConfigured()) return null;
  try {
    if (!(await underBudget())) return null;
    const r = await chatWithTools({
      system: system(nowISO, lastQuestion?.slice(0, 200)),
      history: [{ role: 'user', text }],
      tools: [TOOL], // the only tool, and a call is required: forced
      signal: AbortSignal.timeout(8000),
    });
    await addSpend((r.promptTokens ?? 0) * USD_IN + (r.outputTokens ?? 0) * USD_OUT);
    const s = typeof r.args.sentence === 'string' ? r.args.sentence.trim().slice(0, 300) : '';
    return s && s.toLowerCase() !== text.trim().toLowerCase() ? s : null;
  } catch (err) {
    console.warn('[ai] rewrite failed:', err instanceof Error ? err.message.slice(0, 120) : err);
    return null;
  }
}
