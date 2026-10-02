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

---

## 5. Custom sign in / sign up + onboarding (web)

Clerk's prebuilt `<SignIn/>` / `<SignUp/>` card is replaced on web by our own
pages on Clerk's headless hooks, in the landing's Nexus light language
(`src/auth/dom/auth.css`, scoped `.au`). Native `login.tsx` is unchanged.

| Route | File | What |
|---|---|---|
| `/login` | `login.web.tsx` → `src/auth/dom/AuthPage.tsx` | email + password; Clerk second factor (`email_code`) when it asks; **forgot password** (emailed code → new password); Google |
| `/signup` | `signup.web.tsx` → same page | email + password → 6-digit code (`Otp.tsx`: paste, autofill, auto-submit, resend after 30 s) → `/welcome` |
| `/sso-callback` | `sso-callback.web.tsx` | Google returns here; `clerk.handleRedirectCallback` (transferable sign-in ⇄ sign-up) → `/app` |
| `/welcome` | `welcome.web.tsx` → `src/auth/dom/Onboarding.tsx` | 5 steps: name · working days + hours · best hours · deep work a day + spread/cluster · time zone, clock, week start, Google connect |
| `POST /api/onboarding` | `src/app/api/onboarding+api.ts` | saves the answers, sets Clerk `publicMetadata.onboarded = true`; `{ skip: true }` only sets the flag |

Native gets redirect stubs for `/signup` (→ `/login`), `/welcome` and
`/sso-callback` (→ `/app`).

**Where each answer goes** (`src/auth/onboarding.ts`, shared by page + API):
days/hours → `work_hours`; best hours → `energy_curve` (1.0 across the peak,
−0.15/h either side, 6–21h); deep work/day → `max_daily_focus_min` and
`focus_goal_h` (× working days); spread/cluster → `hard_work`; time zone, clock,
week start → the calendar settings; first name → the Clerk user.

**The preview** on the right is `MiniWeek.tsx` driven by `previewWeek()` — a
small stand-in for the planner over example meetings (labelled "example"), so
every answer visibly moves something. It is not the real planner.

**Gate:** on web, `/app` redirects a signed-in user without
`publicMetadata.onboarded` to `/welcome`. **Existing accounts see it once**
(they can "Skip for now"). Without a database the answers aren't stored, but
the flag is still set so nobody gets stuck (`saved: false`).

**Clerk dashboard:** nothing new to configure. The pages need Email + password
and Google enabled (already in §2a). If bot protection is on, the CAPTCHA mounts
in `#clerk-captcha` on the forms.

**Checks:** `npm run typecheck` · `npm run lint` · `npx tsx src/auth/onboarding.check.ts`
· `npx expo export --platform web` (all four routes + `/api/onboarding` bundle).
Rendered in Chromium at 1440 and 390 px with Clerk stubbed. **Not run against a
real Clerk instance from here** — sign up, the email code, reset, and Google
need a live `pk_test_` / `sk_test_` to verify end to end.

**Design sources:** MengTo/Skills — `animation-systems` (motion tokens: 160 /
240 / 520 ms, ease-out, 60 ms stagger, reduced-motion = instant),
`beautiful-shadows` (the sm/md/lg ramp, already the landing's), `no-ai-design-slop`
(no decorative orbs/gradients; every visual element shows state),
`product-proof-saas` (the product's own week as the hero, sample data labelled).

### 5.1 Second pass (2026-10-02)

| Change | Where |
|---|---|
| **Returning users keep their settings.** `GET /api/onboarding` returns the saved settings as answers (`answersFromProfile`; peak read back from the stored curve). The form opens on them ("Review your setup", "Keep my settings"), and `POST` writes only the groups the user touched (`changed`: name · hours · peak · focus · hardWork · prefs) — a learned energy curve is replaced only if they pick a peak. First-time users send no `changed` = everything. | `src/auth/onboarding.ts`, `api/onboarding+api.ts` |
| **More Clerk paths.** Sign-up that Clerk marks `missing_requirements` → "A few more details" (first/last name, username, terms checkbox; anything else is named as unsupported). Google sign-ups needing details continue at `/signup?continue=1` (`continueSignUpUrl`). Second factor: email code, SMS code, authenticator (TOTP) or backup code, with "Other ways" to switch. | `src/auth/dom/AuthPage.tsx`, `sso-callback.web.tsx` |
| **Focus + numbering.** Each step change moves focus to the new question (`h1 tabIndex=-1`); steppers no longer announce every click (value is in the button label). One numbering system: the rail (01–05); the eyebrow is just "Shape your week". | `Onboarding.tsx` |
| **Real planner in the preview.** `previewWeek` now places deep work with `rankFreeSlots` (src/server/ai/find-time.ts) using the profile the answers would save (`profileFrom`): energy curve, working hours, buffer. Each day's budget is split into even sittings ≤ 2½ h. | `src/auth/onboarding.ts` |
| **Google connect is step 2.** Connect leaves for Google with `{ returnTo: '/welcome' }` (start sets an `ft_oauth_return` cookie, allow-list `/app` · `/welcome`; the callback honours it). Back on `/welcome?connect=ok` the page syncs, and the preview plans around **this week's real meetings** (`GET /api/onboarding` → `meetings`, busy per `blocksTime`, the planner's rule). Answers survive the round trip (sessionStorage). | `api/auth/google/{start,callback}`, `server/auth/session.ts`, `Onboarding.tsx` |
| **Phone layout.** Below 980 px a sticky strip shows deep work per day + meeting counts while you answer. | `src/auth/dom/FocusStrip.tsx` |
| **Time zone** is a searchable combobox (type "tokyo", "kolkata"…), detected zone pinned first, offsets shown. Legacy ICU ids (Asia/Calcutta, Europe/Kiev…) are shown and saved under their current names. | `TimeZonePicker.tsx`, `modernZone` |
| **Sign-in panel** is today's date and this week, no sample data. | `AuthPage.tsx` `SignInStage` |
| **Native onboarding** at `/welcome` on iOS/Android: same steps, contract and API, Nexus tokens, per-day bar preview. Google connect stays web-only (step 2 says so). `/app` now gates native too. | `src/auth/native/Onboarding.tsx`, `app/welcome.tsx`, `app/app/index.tsx` |
| **Drop-off tracking.** `POST /api/onboarding/event` → `onboarding_events` (view / connect / connected / connect_failed / skip / finish per step, web or native). Funnel query in the migration header. **Apply `db/022_onboarding_events.sql`** before deploying (the endpoint tolerates its absence). | `db/022_onboarding_events.sql`, `api/onboarding/event+api.ts`, `src/auth/client.ts` |
| **Rate limits.** `onboarding` 30/h · 100/day and `onboarding-event` 120/h · 400/day per user, on the existing limiter. | `src/server/rate-limit.ts` |
| **E2E.** Playwright suite in `e2e/` (own package.json, so the app lockfile doesn't move): sign up → code → all five steps → done → `/app`; sign in again; skip; error states; signed-out gate; phone strip. Runs against a Clerk **dev** instance in test mode — see `e2e/README.md`. | `e2e/` |

**Verified here:** typecheck · lint · `onboarding.check.ts` · web + iOS export · unauthenticated calls to the new routes → 401 · the callback sends `ft_oauth_return=/welcome` back to `/welcome` and an injected URL to `/app`. Rendered in Chromium (1440 / 1200 / 390 px) with Clerk and the API stubbed: returning-user prefill, the connect round trip with real meetings, the time-zone search, the phone strip, sign-in panel, authenticator-code and extra-details steps. `e2e` lists its 7 tests but **has not run against a real Clerk instance** — no keys in this environment.
