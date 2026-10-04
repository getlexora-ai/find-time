/**
 * Transactional email — the 6-digit sign-in codes and beta invitations.
 *
 * Sent through Resend's HTTP API when `RESEND_API_KEY` is set (no SDK; one
 * fetch). Without a key, development prints the message to the server log so
 * the flows still work locally; production logs an error and sends nothing.
 *
 * Server-only.
 */

const FROM = process.env.EMAIL_FROM || 'Find Time <hello@usefindtime.com>';

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      console.error(`sendMail: RESEND_API_KEY is not set — "${mail.subject}" to ${mail.to} was not sent.`);
    } else {
      console.log(`\n[email → ${mail.to}] ${mail.subject}\n${mail.text}\n`);
    }
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
  });
  if (!res.ok) throw new Error(`sendMail: Resend ${res.status} ${await res.text().catch(() => '')}`);
}

const SUBJECT = {
  'email-verification': 'Verify your email',
  'sign-in': 'Your sign-in code',
  'forget-password': 'Reset your password',
  'change-email': 'Confirm your new email',
} as const;

/**
 * Someone tried to sign up with an email that already has an account. The
 * page can't say so (that would reveal who has an account), so the owner of
 * the inbox hears it instead.
 */
export function existingAccountMail(to: string, site: string): Mail {
  const subject = 'You already have a Find Time account';
  const text = `Someone (probably you) tried to create a Find Time account with this email, but you already have one.\n\nSign in: ${site}/login\nForgot your password? Use "Forgot password?" on that page.\n\nIf it wasn't you, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#121212">
<div style="max-width:440px;margin:0 auto;padding:40px 24px">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;margin:0 0 12px">Find Time</p>
<h1 style="font-size:22px;font-weight:600;margin:0 0 16px">You already have an account</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">Someone (probably you) tried to create a Find Time account with this email. You can sign in instead, or reset your password from the sign-in page.</p>
<p style="margin:0 0 24px"><a href="${site}/login" style="display:inline-block;background:#121212;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px;font-size:14px">Sign in</a></p>
<p style="font-size:13px;color:#6b6b6b;margin:0">If it wasn't you, ignore this email.</p>
</div></body></html>`;
  return { to, subject, text, html };
}

/** The 6-digit code email for every email-OTP flow (src/server/auth/auth.ts). */
export function codeMail(to: string, code: string, type: keyof typeof SUBJECT): Mail {
  const subject = `${code} is your Find Time code`;
  const what = SUBJECT[type];
  const text = `${what}\n\nYour Find Time code is ${code}. It works for 10 minutes.\n\nIf you didn't ask for it, ignore this email.`;
  const html = `<!doctype html><html><body style="margin:0;background:#FAFAFA;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#121212">
<div style="max-width:440px;margin:0 auto;padding:40px 24px">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#6b6b6b;margin:0 0 12px">Find Time</p>
<h1 style="font-size:22px;font-weight:600;margin:0 0 16px">${what}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 20px">Enter this code to continue. It works for 10 minutes.</p>
<p style="font-family:'JetBrains Mono',ui-monospace,Menlo,monospace;font-size:32px;letter-spacing:.3em;font-weight:600;margin:0 0 24px">${code}</p>
<p style="font-size:13px;color:#6b6b6b;margin:0">If you didn't ask for it, ignore this email.</p>
</div></body></html>`;
  return { to, subject, text, html };
}
