/**
 * Send Clerk beta invitations to waitlist signups.
 *
 * The beta gate is Clerk's *restricted sign-ups* (allowlist) mode — turn it on
 * once in the Clerk Dashboard so only invited addresses can create an account
 * (see docs/beta-access.md). This script creates the invitations; Clerk emails
 * the link and, on redeem, drops the person into normal sign-up.
 *
 * Usage:
 *   node --env-file=.env.local scripts/invite-beta.mjs --dry-run [--limit N]
 *   node --env-file=.env.local scripts/invite-beta.mjs --limit 25
 *   node --env-file=.env.local scripts/invite-beta.mjs a@x.com b@y.com
 *
 *   no emails  -> select from waitlist where status='pending', oldest first, limit N (default 25)
 *   emails     -> invite exactly those addresses
 *   --dry-run  -> print the list and exit before any Clerk call (run this first)
 *
 * Needs CLERK_SECRET_KEY, plus DATABASE_URL when no emails are passed.
 * Exits non-zero if any invite fails.
 */
import { createClerkClient } from '@clerk/backend';
import pg from 'pg';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 25;
const emails = args.filter((a) => a.includes('@'));

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error('CLERK_SECRET_KEY is not set — add it to .env.local (Clerk Dashboard → API keys).');
  process.exit(1);
}
if (!Number.isFinite(limit) || limit < 1) {
  console.error(`--limit must be a positive number, got ${JSON.stringify(args[limitIdx + 1])}`);
  process.exit(1);
}

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://findtime.ai').replace(/\/$/, '');
const redirectUrl = `${SITE_URL}/login`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetsFromDb() {
  if (!process.env.DATABASE_URL) {
    console.error('No emails passed and DATABASE_URL is not set — nothing to invite.');
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    const { rows } = await client.query(
      `select email from waitlist where status = 'pending' order by created_at asc limit $1`,
      [limit],
    );
    return rows.map((r) => r.email);
  } finally {
    await client.end();
  }
}

const targets = emails.length ? emails : await targetsFromDb();

if (targets.length === 0) {
  console.log('Nothing to invite.');
  process.exit(0);
}

console.log(`${dryRun ? '[dry-run] ' : ''}${targets.length} invitation(s), redirect → ${redirectUrl}`);
for (const email of targets) console.log(`  ${email}`);

if (dryRun) process.exit(0);

const clerk = createClerkClient({ secretKey: SECRET });
let failed = 0;

for (const email of targets) {
  try {
    await clerk.invitations.createInvitation({
      emailAddress: email,
      redirectUrl,
      ignoreExisting: true,
      notify: true,
    });
    console.log(`OK    ${email}`);
  } catch (err) {
    // Clerk 422s when the address already has an account or a live invitation.
    const msg = err?.errors?.[0]?.message || err?.message || String(err);
    if (/already|exists|duplicate/i.test(msg)) {
      console.log(`SKIP  ${email} — ${msg}`);
    } else {
      console.error(`FAIL  ${email} — ${msg}`);
      failed++;
    }
  }
  await sleep(250); // stay clear of Clerk's burst limit
}

// ponytail: no invited_at write-back — Clerk's invitation list is the source of
// truth for who's been invited. Add a waitlist column when you need it in SQL.
process.exit(failed ? 1 : 0);
