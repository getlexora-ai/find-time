import { isConfigured, query, queryOne } from '../db.ts';

/**
 * The global monthly ceiling on model spend (db/025 ai_spend), over every user.
 * Per-user credits sit under it (credits.ts).
 */

// gpt-6-luna, USD per token (input $0.10 / output $0.50 per 1M, Sept 2026).
// ponytail: one model's price; if OPENAI_MODEL changes, change these too.
export const USD_IN = 0.1 / 1e6;
export const USD_OUT = 0.5 / 1e6;
const budget = () => Number(process.env.AI_BUDGET_USD ?? 1);
const month = () => new Date().toISOString().slice(0, 7);

/** Under this month's AI budget. No database, or it can't answer: no model. */
export async function underBudget(): Promise<boolean> {
  if (!isConfigured()) return false;
  const row = await queryOne<{ usd: string }>(`select usd from ai_spend where month = $1`, [month()]);
  return Number(row?.usd ?? 0) < budget();
}

export async function addSpend(usd: number): Promise<void> {
  await query(
    `insert into ai_spend (month, usd, calls) values ($1, $2, 1)
     on conflict (month) do update set usd = ai_spend.usd + excluded.usd, calls = ai_spend.calls + 1`,
    [month(), usd],
  );
}
