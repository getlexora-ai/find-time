# HANDOFF — Clerk auth + Neon (settings + delete account)

Companion to `HANDOFF-mvp.md`. Replaces the homegrown email/password + signed
`ft_session` cookie with **Clerk** as the identity provider. Neon Postgres is
unchanged; `users` becomes a thin mirror of Clerk.

---

## 1. What changed

| Area | Before | Now |
|---|---|---|
| Sessions | signed `ft_session` cookie, value = user id | Clerk session token, sent as `Authorization: Bearer …` on every `/api` call |
| Server auth | `currentUserId(req)` → id or `DEMO_USER_ID` | `requireUserId(req)` (`src/server/auth/clerk.ts`) → verifies the token with `@clerk/backend`, lazily upserts the `users` row, returns the Clerk id or `null` |
| `users.id` | `e_<uuid>` / `g_<sub>` / `u1` | the Clerk user id (`user_…`) |
| Login | `src/app/login.tsx` custom form → `/api/auth/{signup,login}` | `login.web.tsx` (Clerk prebuilt `<SignIn/>`/`<SignUp/>`), `login.tsx` (native custom flow: email+password+code, Google SSO) |
| `/app` gate | account-store `signedIn` | Clerk `useAuth().isSignedIn` |
| Google connect | **was** the login too; set `ft_session` | calendar-connect only. `POST /api/auth/google/start` (bearer-authed) → `{ url }`; the signed `state` carries the Clerk id; the callback attaches `connected_accounts` to that id, sets no session |
| Client fetch | `fetch(\`${BASE}/api/…\`)` in 3 files | `apiFetch()` (`src/lib/api.ts`) — one wrapper that attaches the bearer token; `AuthBridge` in `app/_layout.tsx` feeds it `useAuth().getToken` |
| Settings | none | No custom screen. `AccountButton` (`src/calendar/components/AccountButton.{web,}.tsx`) in the sidebar (desktop) + header (mobile). **Web:** Clerk `<UserButton/>` — "Manage account" opens `<UserProfile/>` as a modal overlay; plus a custom "Delete account" menu item. **Native:** an action sheet (manage on web / sign out / delete). |
| Delete account | none | The "Delete account" item → `DELETE /api/me` → `delete from users where id=$1` (FKs cascade to profiles / connected accounts / calendars / events) → `clerkClient.users.deleteUser()` → client signs out |

**Deleted:** `src/app/api/auth/{login,signup,logout}+api.ts`,
`src/server/auth/password.ts` (+`.check.mjs`), `src/server/auth/session.check.mjs`,
`src/server/users-repo.ts`. `src/server/auth/session.ts` is now just the Google
OAuth `state` signer.

**New deps:** `@clerk/clerk-expo`, `@clerk/backend`, and Expo peers
`expo-crypto` `expo-web-browser` `expo-auth-session` `expo-secure-store`
(installed with `--legacy-peer-deps`, like `pg`).

**Checks green:** `npm run typecheck`, `npm run lint`,
`npx expo export --platform web` (routes `/login` + `/app/settings` + `/api/me`
all bundle).

---

## 2. Human steps to go live

### 2a. Clerk — create a dev instance

1. dashboard.clerk.com → **Add application** → enable **Email** + **Google** as
   sign-in options → keep the **Development** instance.
2. **API keys** → copy the **Publishable key** (`pk_test_…`) and **Secret key**
   (`sk_test_…`).
3. (native Google only) API keys → the mobile SSO redirect is
   `findtime://` — Clerk lists the exact value under **SSO connections**; the
   scheme is already set in `app.json`.
4. For the closed beta you can leave "Restrict sign-ups" off, or add an
   allow-list under **User & authentication → Restrictions**.

### 2b. Env — `.env.local` (dev) and Railway (prod)

| var | value |
|---|---|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `pk_test_…` (bundled into the app — fine) |
| `CLERK_SECRET_KEY` | `sk_test_…` (server only) |
| `SESSION_SECRET` | still needed — now only signs the Google OAuth `state` |
| everything else | unchanged from `HANDOFF-mvp.md` |

### 2c. Database — one migration

```sh
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/012_clerk_auth.sql
```

`012` drops `users.password_hash` and downgrades `users_email_idx` from unique to
a plain index. Safe on a live DB. A fresh DB from `db/schema.sql` already has the
new shape.

### 2d. Google Cloud

No change to the OAuth client. The redirect URI is still
`…/api/auth/google/callback`. Google testers no longer need a "Test user" slot to
*log in* (Clerk does that) — only to *connect a calendar*.

---

## 3. Verify

Local: `npx expo start --web`, then

1. `/app` with no session → redirected to `/login` → Clerk sign-up → land on
   `/app`. `psql "$DATABASE_URL" -c "select id,email from users"` shows one row
   with a `user_…` id.
2. Reload `/app` → still in (Clerk session persists). Click the avatar
   (sidebar on desktop, top-right on mobile) → **Manage account** opens Clerk's
   `<UserProfile/>` as an overlay on top of the calendar.
3. **Connect Google Calendar** (sidebar "Calendars" panel) → consent → back on
   `/app`, calendars listed, real events render, `select * from
   connected_accounts` has your row keyed by the `user_…` id.
4. Avatar menu → **Delete account** → confirm → signed out at `/login`. Every
   table keyed on that user id is empty; the Clerk user is gone from the
   dashboard.
5. Sign in again → fresh empty `users` row, no leftover events.

---

## 4. Known gaps / follow-ups

- **`@clerk/clerk-expo` prints a deprecation notice** (renamed to `@clerk/expo`
  in Clerk core-3). `2.20.0` is stable; migrate when convenient — core-3 has
  breaking changes, see the guide the notice links.
- **`verifyToken` fetches JWKS on cold start** (one extra network hop). Set
  `CLERK_JWT_KEY` (dashboard → API keys → **Show JWT public key** → PEM) and pass
  it to `verifyToken` to make verification fully offline.
- **Native Google SSO is wired but unverified from here** — same status as the
  old Google flow. Beta is web.
- **No Clerk webhooks.** The `users` row is filled lazily on first authed
  request; a Clerk-side email/name change lands on the *next* request (the
  process-level cache in `clerk.ts` refreshes per boot). Add a
  `user.updated` webhook if that lag matters.
- **`DELETE /api/me` order:** DB rows go first (cascade), then the Clerk user. If
  the Clerk delete fails the data is already gone and the response is still
  `200 { clerkDeleted: false }` — the shell account can be removed by hand.
- **Rate limiting** on `/api/*` still not added (noted in `HANDOFF-mvp.md`).
