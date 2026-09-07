import { Pool, type PoolClient } from 'pg';

/**
 * The one module that imports `pg`. Only `+api.ts` routes (which run on the
 * server, never in the app bundle) may import this.
 *
 * Connection string comes from DATABASE_URL — Neon's POOLED url in production
 * (the one with `-pooler` in the host). Never an EXPO_PUBLIC_ var: that would
 * ship the DB password inside the app.
 */

declare global {
  var __ftPool: Pool | undefined;
}

function makePool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — the API cannot reach Postgres.');
  }
  return new Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 10_000, // Neon scales to zero; first query pays a cold start
    // Neon terminates TLS at the proxy; we encrypt without pinning a CA chain.
    ssl: { rejectUnauthorized: false },
  });
}

// Reused across hot reloads in dev so Metro doesn't leak a pool per edit.
export const pool: Pool = globalThis.__ftPool ?? (globalThis.__ftPool = makePool());

export function isConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export async function query<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool.query(text, params as never);
  return res.rows as T[];
}

export async function queryOne<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params?: unknown[],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** BEGIN/COMMIT/ROLLBACK with guaranteed release. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
