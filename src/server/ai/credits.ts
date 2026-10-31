import { isConfigured, query, queryOne } from '../db.ts';
import { addSpend, underBudget, USD_IN, USD_OUT } from './budget.ts';

/**
 * Per-user AI credits (db/028). Each person gets AI_USER_CREDIT_USD of model
 * use a month (default $0.50 — at ~$0.0003 a message, well over a thousand
 * messages); the global AI_BUDGET_USD (db/025) stays the ceiling over everyone.
 * Out of credit, Plan with AI reads that person's messages with the rules.
 */

const credit = () => Number(process.env.AI_USER_CREDIT_USD ?? 0.5);
const month = () => new Date().toISOString().slice(0, 7);

/** May this user's message go to the model? No database, or it can't answer: no. */
export async function hasCredit(userId: string): Promise<boolean> {
  if (!isConfigured()) return false;
  try {
    if (!(await underBudget())) return false;
    const row = await queryOne<{ usd: string }>(`select usd from ai_user_spend where user_id = $1 and month = $2`, [userId, month()]);
    return Number(row?.usd ?? 0) < credit();
  } catch (err) {
    // Table not there yet (db/028 unapplied) or the DB hiccuped: fail closed, the rules still answer.
    console.warn('[ai] credit check failed:', err instanceof Error ? err.message.slice(0, 120) : err);
    return false;
  }
}

/** Count one model call against the user and the global budget. Never throws. */
export async function chargeTokens(userId: string, promptTokens: number, outputTokens: number): Promise<void> {
  const usd = promptTokens * USD_IN + outputTokens * USD_OUT;
  try {
    await addSpend(usd);
    await query(
      `insert into ai_user_spend (user_id, month, usd, calls) values ($1, $2, $3, 1)
       on conflict (user_id, month) do update set usd = ai_user_spend.usd + excluded.usd, calls = ai_user_spend.calls + 1`,
      [userId, month(), usd],
    );
  } catch (err) {
    console.warn('[ai] charge failed:', err instanceof Error ? err.message.slice(0, 120) : err);
  }
}
