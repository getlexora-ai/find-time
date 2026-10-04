# Beta access — how to let testers in

Find Time's private beta is **web only**. The flow:

```
lands on /  →  clicks "WAITLIST"  →  /waitlist page  →  row in `waitlist` table
                                                              │
                          you run scripts/invite-beta.mjs  ───┘
                                     │
                  sets waitlist.invited_at + emails a /signup link
                                     │
       tester clicks it  →  /signup (email + password or Google)
                            allowed because the email is invited
                                     │
                          verify email code  →  /welcome  →  /app
```

Nothing here is a separate app build or TestFlight — testers use the same
deployed site. `BETA_INVITE_ONLY=1` on the server is what keeps everyone else
out: Better Auth refuses to create an account for an email without
`waitlist.invited_at` (src/server/auth/auth.ts, `databaseHooks.user.create`).

---

## 1. One-time setup

1. Apply `db/027_better_auth.sql` (adds `waitlist.invited_at`).
2. On Railway set `BETA_INVITE_ONLY=1`. Without it anyone can sign up — the
   invites still send, but the gate is decorative.
3. Set `RESEND_API_KEY` and `EMAIL_FROM` (a sender on a domain verified in
   Resend). The same key sends the sign-up codes.

## 2. Prerequisites for the script

`.env.local` needs:

| var | why |
|---|---|
| `DATABASE_URL` | read the waitlist and write `invited_at` — the **same** database the deployed site uses |
| `RESEND_API_KEY`, `EMAIL_FROM` | send the invite. Without a key the script prints each email instead |
| `EXPO_PUBLIC_SITE_URL` | build the link; your deployed origin, no trailing slash (defaults to `https://www.usefindtime.com`) |

## 3. Sending invites

Always dry-run first:

```sh
npm run invite:beta -- --dry-run --limit 10
```

That prints the 10 oldest not-yet-invited waitlist emails (`pending` or
`confirmed`) and exits without writing or sending. If the list looks right:

```sh
npm run invite:beta -- --limit 10
```

Output is one line per address: `OK` or `FAIL`. The command exits non-zero if
anything failed; re-running only picks up addresses that weren't marked.

Invite specific people regardless of the waitlist (they're added to it):

```sh
npm run invite:beta -- alice@example.com bob@example.com
```

## 4. What the tester sees

1. Email "Your Find Time invite" → **Create your account**.
2. `/signup` with their email filled in: password or Google. Google works as
   long as the Google account's email is the invited one.
3. A 6-digit code by email → `/welcome` → `/app`.

## 5. Revoking / troubleshooting

- **Revoke** (before they sign up):
  `update waitlist set invited_at = null where email = 'x@y.com';`
  Once they have an account, delete it instead.
- **Tester says sign-up is blocked and they *were* invited:** they're probably
  using a different address (e.g. a Google account on another email, or Apple's
  "Hide My Email"). Invite that address too. Also check the script ran against
  the same `DATABASE_URL` as the deployed site.

## 6. Reading the waitlist

```sql
select email, name, reason, invited_at, created_at
from waitlist
order by created_at desc;
```

`name` and `reason` are the optional fields from the `/waitlist` page (migration
`db/014_waitlist_details.sql`); they're null for the landing-page email-only
signups.
