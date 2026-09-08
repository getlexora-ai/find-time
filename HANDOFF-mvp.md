# HANDOFF — MVP beta (signup · signin · add calendar · AI find-time)

Branch `mvp-beta` (off `google-calendar-connect`). Companion to `HANDOFF.md`
(calendar), `HANDOFF-landing.md`, `HANDOFF-google-calendar.md`.

Goal: a URL beta testers can hit — create an account, sign in, connect Google
Calendar, and use "Find time" (real Claude call) to place blocks.

---

## 1. What this branch adds

| Piece | Files |
|---|---|
| Email/password accounts | `db/011_password_auth.sql` (adds `users.password_hash`), `src/server/auth/password.ts` (stdlib scrypt) + `.check.mjs`, `src/server/users-repo.ts` |
| Auth routes | `src/app/api/auth/{signup,login,logout}+api.ts` — set/clear the same signed `ft_session` cookie the Google flow uses. `google/logout+api.ts` was folded into `auth/logout`. |
| Login screen | `src/app/login.tsx` — email + password, mode toggle, **Continue with Google** (reuses `/api/auth/google/start`). Registered in `src/app/_layout.tsx`. |
| Auth gate | `src/app/app/index.tsx` — `/app` redirects to `/login` unless `/api/calendar/accounts` reports `signedIn` (was: silent seed-data demo). |
| AI find-time | `src/server/ai/anthropic.ts` (raw `fetch` to Anthropic Messages API, no SDK — matches `google/oauth.ts`), `src/server/ai/find-time.ts` (deterministic slot placer) + `.check.mjs`, `src/app/api/ai/find-time+api.ts` |
| AI wired into the UI | `src/calendar/components/AiPanel.tsx` now calls `POST /api/ai/find-time`; `applyProposals()` in `cal-store.ts` creates each proposed block via `POST /api/events`. The old mocked `applyFindTime` / `resolveWedClash` were deleted. |
| Wire types | `FindTimeProposal` / `FindTimeResponse` in `src/lib/api-types.ts` |
| Deploy | `railway.json`, `build:web` + `serve` scripts in `package.json` |

**How find-time works:** Claude parses the sentence into bounds + preferences
only (`durationMin`, `count`, earliest/latest, day-hour window) — it never picks
slots. `findFreeSlots()` walks the user's real calendar (events from `/api/events`
in the next 21 days; `flexibility='flexible'` blocks are treated as movable, the
rest as hard conflicts) and returns non-overlapping slots. The model cannot
produce a double-book. Model: `claude-opus-5`, thinking disabled, `effort: low`.

**Checks green:** `npm run typecheck`, `npm run lint`,
`node src/server/auth/password.check.mjs`, `node src/server/ai/find-time.check.mjs`,
`npx expo export --platform web` (routes: `/login` + `/api/auth/{signup,login,logout}`
+ `/api/ai/find-time` all bundle; `/` 87KB and `/app` 34KB unchanged).

---

## 2. Human steps to go live

### 2a. Database — apply two migrations to prod Neon

```sh
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/schema.sql          # if not already applied (now includes password_hash)
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/010_oauth_tokens.sql # from HANDOFF-google-calendar, if not done
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/011_password_auth.sql
```

`011` is just `alter table users add column if not exists password_hash text` —
safe to run against a live DB, no lock of consequence.

### 2b. Secrets — fill `.env.local` (dev) and set the same in Railway (prod)

| var | how |
|---|---|
| `DATABASE_URL` | Neon pooled URL (host has `-pooler`) — already set in dev |
| `DATABASE_URL_UNPOOLED` | Neon direct URL — for the `psql` migrations above |
| `SESSION_SECRET` | `openssl rand -base64 32` — **required now** (both auth paths sign `ft_session` with it) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → APIs & Services → Credentials → OAuth client ID → **Web application** |
| `GOOGLE_REDIRECT_URI` | dev: `http://localhost:8081/api/auth/google/callback`; prod: `https://<your-app>.up.railway.app/api/auth/google/callback` — add **both** as Authorized redirect URIs on the client |
| `TOKEN_ENC_KEY` | `openssl rand -base64 32` (must decode to exactly 32 bytes) |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |
| `EXPO_PUBLIC_API_URL` | leave empty for the web deploy (same-origin `/api/...`) |

Google Cloud one-time (from HANDOFF-google-calendar §2): enable **Google Calendar
API**; OAuth consent screen → External, scopes `openid` `email` `profile`
`.../auth/calendar.readonly`; add each beta tester as a **Test user** (stays in
"Testing" — no verification). Password signup has no such allow-list, so testers
without a Test-user slot can still use email/password (just not Google connect).

### 2c. Railway

1. New project → Deploy from the `find-time` GitHub repo, branch `mvp-beta`
   (or push `mvp-beta` → `main` first if you want `main` to be the deploy branch —
   do **not** merge without checking the calendar/landing branches, see below).
2. `railway.json` is picked up automatically: build `npm run build:web`,
   start `npx expo serve --port $PORT`.
3. Add every var from 2b under the service's **Variables**.
4. First deploy → note the `*.up.railway.app` URL → add its
   `/api/auth/google/callback` to the Google OAuth client's redirect URIs.

**If `expo serve` doesn't bind Railway's `$PORT` / `0.0.0.0`** (unverified from
here — it's meant for device testing): swap the start command for a 15-line
`@expo/server/adapter/http` (or `/express`) entry that serves `dist/` and calls
`listen(process.env.PORT, '0.0.0.0')`. Expo's "Deploy to any host" doc has the
snippet. EAS Hosting (`npx eas deploy`) is the zero-config alternative if Railway
fights you.

---

## 3. Verify (after 2a–2c)

Local: `npx expo start --web`, then

1. `/app` with no cookie → redirected to `/login`.
2. `/login` → create account (email + 8-char password) → land on `/app`, empty
   calendar. `psql "$DATABASE_URL" -c "select id,email,password_hash is not null as has_pw from users where id like 'e_%'"`.
3. Sign out (sidebar user chip) → back to `/login`. Sign in with the same
   creds → `/app`.
4. **Continue with Google** → consent → back on `/app`, chip shows the Google
   name, "Calendars" panel lists your calendars, real events render.
5. **Find time** (header button ≥1024, "Ask AI" nav below): type
   *"2 hours of deep work on Thursday morning"* → proposals appear with real
   dates that dodge your existing events → **Add** → blocks land on the grid and
   in `select * from calendar_events where origin='ai'`.
6. `ANTHROPIC_API_KEY` unset → Find time toasts the 503 message, no crash.

---

## 4. Known gaps / deferred

- **Native (iOS/Android) auth:** password login works via `fetch`; Google OAuth
  on native is still deferred (HANDOFF-google-calendar §5). Beta is web.
- **Find time = add only.** It proposes new blocks; it does not move or delete
  existing flexible events (the canned mock used to show "moves"). Rescheduling
  is the next iteration.
- **No email verification / password reset.** Single-step signup. Fine for a
  closed beta; add before public launch (needs an email vendor — Resend is
  already used in the Lexora sibling project).
- **`.expo/types/router.d.ts` is stale** (doesn't list `/login`), so `/app`'s
  gate casts `'/login' as Href`. `expo start` regenerates the file and the cast
  becomes a no-op; harmless either way.
- **`expo serve` on Railway is unverified** — see the fallback in §2c.
- **No rate limiting** on `/api/auth/*` or `/api/ai/find-time`. Add a simple
  per-IP throttle before opening the URL widely (find-time spends Anthropic
  credits per call).
- Branch not merged to `main`; `main` still predates the Google-calendar work.
