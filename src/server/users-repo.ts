import { randomUUID } from 'node:crypto';

import { queryOne } from './db';
import { hashPassword, verifyPassword } from './auth/password';

/**
 * Email/password user rows. Google sign-in has its own upsert path in
 * src/app/api/auth/google/callback+api.ts (user id `g_<sub>`); password users get
 * `e_<uuid>`. Both live in the same `users` table and the same `ft_session`.
 *
 * Server-only.
 */

type UserRow = { id: string; email: string; name: string; password_hash: string | null };
export type PublicUser = { id: string; email: string; name: string };

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  return queryOne<UserRow>(
    `select id, email, name, password_hash from users where lower(email) = lower($1)`,
    [email],
  );
}

/** Create a password account. Returns null if the email is already taken. */
export async function createPasswordUser(
  email: string,
  password: string,
  name: string,
): Promise<PublicUser | null> {
  if (await findUserByEmail(email)) return null;
  // Bare `do nothing` (no target) also covers the users_email_idx expression
  // index, so a concurrent signup with the same email returns null, not a 500.
  const row = await queryOne<PublicUser>(
    `insert into users (id, email, name, password_hash) values ($1, $2, $3, $4)
     on conflict do nothing
     returning id, email, name`,
    [`e_${randomUUID()}`, email, name, await hashPassword(password)],
  );
  return row ?? null;
}

export async function authenticate(email: string, password: string): Promise<PublicUser | null> {
  const row = await findUserByEmail(email);
  if (!row?.password_hash) return null;
  const ok = await verifyPassword(password, row.password_hash);
  return ok ? { id: row.id, email: row.email, name: row.name } : null;
}
