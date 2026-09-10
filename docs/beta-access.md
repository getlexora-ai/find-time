# Beta access — how to let testers in

Find Time's private beta is **web only**. The flow:

```
lands on /  →  clicks "WAITLIST"  →  /waitlist page  →  row in `waitlist` table
                                                              │
                          you run scripts/invite-beta.mjs  ───┘
                                     │
                          Clerk emails an invitation link
                                     │
              tester clicks it  →  Clerk sign-up (allowed because invited)
                                     │
                          lands on /login  →  /app
```

Nothing here is a separate app build or TestFlight — testers use the same
deployed site, and Clerk's *restricted sign-ups* setting is what keeps everyone
else out.

---

## 1. One-time Clerk setup (you must do this in the dashboard)

Do this once **per Clerk instance** — your dev instance and your production
instance are configured separately.

1. Clerk Dashboard → **Configure → Restrictions**.
2. Turn on **Restricted sign-ups** (a.k.a. allowlist mode). With this on, a
   normal `/login` sign-up is rejected unless the email has a pending
   invitation. Without it, invitations still send but anyone can sign up — the
   gate is decorative.
3. While you're there, confirm:
   - **Email → Invitation** template looks right (Clerk sends it).
   - The sign-up **after-sign-up redirect** lands somewhere sane (the script
     passes `redirectUrl = <site>/login`, which then forwards to `/app`).

That's the whole dashboard side.

## 2. Prerequisites for the script

`.env.local` needs:

| var | why | where |
|---|---|---|
| `CLERK_SECRET_KEY` | create invitations | Clerk Dashboard → API keys (matches the instance you restricted) |
| `DATABASE_URL` | read the waitlist (only when you don't pass emails) | Neon, pooled URL |
| `EXPO_PUBLIC_SITE_URL` | build the redirect link | your deployed origin, no trailing slash (defaults to `https://findtime.ai`) |

## 3. Sending invites

Always dry-run first:

```sh
npm run invite:beta -- --dry-run --limit 10
```

That prints the 10 oldest `pending` waitlist emails and the redirect URL, then
exits without touching Clerk. If the list looks right:

```sh
npm run invite:beta -- --limit 10
```

Output is one line per address: `OK`, `SKIP` (already invited or already has an
account), or `FAIL`. The command exits non-zero if anything actually failed.

Invite specific people regardless of the waitlist:

```sh
npm run invite:beta -- alice@example.com bob@example.com
```

## 4. What the tester sees

1. Email from Clerk: "You've been invited…" → **Accept the invitation**.
2. Clerk sign-up screen (email + password or OAuth). Allowed because the address
   is invited.
3. Redirects to `/login`, then straight through to `/app`.

## 5. Revoking / troubleshooting

- **Revoke:** Clerk Dashboard → invitations list → revoke. The link stops working.
- **`SKIP … already exists`:** the person already signed up or has a live
  invitation. Not an error.
- **Invitation expired:** default is 30 days. Re-run the script for that address
  (`ignoreExisting: true` lets it re-issue).
- **Tester says sign-up is blocked and they *were* invited:** the invitation and
  the `CLERK_SECRET_KEY` you used must belong to the **same** Clerk instance as
  the deployed site. Dev key + prod site (or vice versa) is the usual cause.

## 6. Reading the waitlist

```sql
select email, name, reason, created_at
from waitlist
order by created_at desc;
```

`name` and `reason` are the optional fields from the `/waitlist` page (migration
`db/014_waitlist_details.sql`); they're null for the landing-page email-only
signups.
