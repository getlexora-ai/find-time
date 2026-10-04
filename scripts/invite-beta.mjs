/**
 * Invite waitlist signups to the beta.
 *
 * The beta gate is `BETA_INVITE_ONLY=1` on the server: sign-up (email or
 * Google) is refused unless `waitlist.invited_at` is set for that email
 * (src/server/auth/auth.ts, db/027). This script sets it and emails the
 * person a link to `/signup` with their address filled in
 * (see docs/beta-access.md).
 *
 * Usage:
 *   node --env-file=.env.local scripts/invite-beta.mjs --dry-run [--limit N]
 *   node --env-file=.env.local scripts/invite-beta.mjs --limit 25
 *   node --env-file=.env.local scripts/invite-beta.mjs a@x.com b@y.com
 *
 *   no emails  -> waitlist rows not yet invited (pending or confirmed), oldest first, limit N (default 25)
 *   emails     -> invite exactly those addresses (added to the waitlist if missing)
 *   --dry-run  -> print the list and exit before writing or sending anything (run this first)
 *
 * Needs DATABASE_URL. Sends through Resend when RESEND_API_KEY is set (from
 * EMAIL_FROM); without it, prints each email instead of sending.
 * Exits non-zero if any invite fails.
 */
import pg from 'pg';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx !== -1 ? Number(args[limitIdx + 1]) : 25;
const emails = args.filter((a) => a.includes('@'));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — add it to .env.local.');
  process.exit(1);
}
if (!Number.isFinite(limit) || limit < 1) {
  console.error(`--limit must be a positive number, got ${JSON.stringify(args[limitIdx + 1])}`);
  process.exit(1);
}

const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || 'https://www.usefindtime.com').replace(/\/$/, '');
const FROM = process.env.EMAIL_FROM || 'Find Time <hello@usefindtime.com>';
const RESEND = process.env.RESEND_API_KEY;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function inviteMail(email) {
  const link = `${SITE_URL}/signup?email=${encodeURIComponent(email)}`;
  const text = `You're in.\n\nYour Find Time beta invite is ready. Create your account with this email:\n${link}\n\nSee you inside.`;
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#121212">
<div style="max-width:440px;margin:0 auto;padding:40px 24px">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;margin:0 0 12px">Find Time</p>
<h1 style="font-size:22px;font-weight:600;margin:0 0 16px">You're in.</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 24px">Your beta invite is ready. Create your account with this email address.</p>
<p style="margin:0 0 24px"><a href="${link}" style="display:inline-block;background:#121212;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:15px">Create your account →</a></p>
<p style="font-size:13px;color:#6b6b6b;margin:0">If you didn't join the waitlist, ignore this email.</p>
</div></body></html>`;
  return { from: FROM, to: email, subject: 'Your Find Time invite', text, html };
}

async function send(mail) {
  if (!RESEND) {
    console.log(`\n[no RESEND_API_KEY — not sent] to ${mail.to}: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(mail),
  });
  if (!res.ok) throw new Error(`Resend ${res.status} ${await res.text().catch(() => '')}`);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();

let failed = 0;
try {
  const targets = emails.length
    ? emails
    : (
        await client.query(
          `select email from waitlist
            where status in ('pending', 'confirmed') and invited_at is null
            order by created_at asc limit $1`,
          [limit],
        )
      ).rows.map((r) => r.email);

  if (targets.length === 0) {
    console.log('Nothing to invite.');
  } else {
    console.log(`${dryRun ? '[dry-run] ' : ''}${targets.length} invitation(s), link → ${SITE_URL}/signup`);
    for (const email of targets) console.log(`  ${email}`);

    if (!dryRun) {
      for (const email of targets) {
        try {
          // Mark first: a sent email whose address can't sign up would be worse than a retry.
          await client.query(
            `insert into waitlist (email, source, invited_at) values ($1, 'invite', now())
             on conflict (email) do update set invited_at = coalesce(waitlist.invited_at, now()), updated_at = now()`,
            [email],
          );
          await send(inviteMail(email));
          console.log(`OK    ${email}`);
        } catch (err) {
          console.error(`FAIL  ${email} — ${err?.message ?? String(err)}`);
          failed++;
        }
        await sleep(250); // stay clear of Resend's burst limit
      }
    }
  }
} finally {
  await client.end();
}

process.exit(failed ? 1 : 0);
