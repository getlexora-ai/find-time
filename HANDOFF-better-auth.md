# HANDOFF — Better Auth replaces Clerk

Supersedes `HANDOFF-clerk.md`. Sign in / sign up / sessions now run inside our
own API with [Better Auth](https://better-auth.com), on our own Neon database.
The screens look and behave as before; only what's behind them changed.

## What changed

| Area | Clerk | Better Auth |
|---|---|---|
| Server | `@clerk/backend` verifies a bearer token | `src/server/auth/auth.ts` (config) + `src/app/api/auth/[...auth]+api.ts` (endpoints); `requireUserId` in `src/server/auth/user.ts` reads the session |
| Session | Clerk JWT, `Authorization: Bearer` | httpOnly `ft.session_token` cookie. Web: same origin. Native: kept in SecureStore by the Expo plugin, sent as `Cookie` by `apiFetch` |
| Identity data | at Clerk | `auth_user` / `auth_session` / `auth_account` / `auth_verification` (db/027); `users` stays the FK row, same id |
| Email codes | Clerk sends | email-OTP plugin; `src/server/email.ts` sends via Resend |
| Onboarded flag | Clerk `publicMetadata.onboarded` | `auth_user.onboarded` |
| Delete account | DB rows, then Clerk API | one transaction: `users` + `auth_user` |
| Beta gate | Clerk restricted sign-ups + invitations | `BETA_INVITE_ONLY=1` + `waitlist.invited_at`; `scripts/invite-beta.mjs` sets it and emails a `/signup` link (docs/beta-access.md) |
| e2e | `@clerk/testing`, `+clerk_test` emails | `E2E_FIXED_OTP` makes every code fixed (never in production); cleanup via `DELETE /api/me` |

**Removed:** `@clerk/clerk-expo`, `@clerk/backend`, `src/server/auth/clerk.ts`,
`src/lib/clerkAppearance.ts`, `/sso-callback`. **Added:** `better-auth`,
`@better-auth/expo`, `expo-network`.

## Go live

1. **Database** — apply `db/027_better_auth.sql` to Neon (direct URL):
   `psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/027_better_auth.sql`
2. **Google Cloud** — on the existing OAuth client add the redirect URI
   `https://www.usefindtime.com/api/auth/callback/google` (and
   `http://localhost:8081/api/auth/callback/google` for dev).
3. **Resend** — verify the sending domain, create an API key.
4. **Railway env** — add `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
   `BETTER_AUTH_URL=https://www.usefindtime.com`, `RESEND_API_KEY`,
   `EMAIL_FROM`, and `BETA_INVITE_ONLY=1` if the beta stays closed. Remove
   `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`.
5. **Existing users** — Clerk accounts don't carry over: people sign up again
   (same email is fine). Their old `users` rows (`user_…` ids) are orphaned and
   can be deleted once nobody needs that data.

## Notes

- Without `RESEND_API_KEY`, development prints each email (and its code) to the
  server log; production logs an error and sends nothing.
- Native Google sign-in opens the system browser and returns on `findtime://`.
  Password reset on native still hands over to the web page.
