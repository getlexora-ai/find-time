# HANDOFF — Connect Google Calendar (pull-only, Google = login)

Branch `google-calendar-connect`. Companion to `HANDOFF.md` (calendar) and
`HANDOFF-landing.md`. Plan: `~/.claude/plans/curried-sniffing-fern.md`.

Lets a user click **Connect Google Calendar** in the calendar sidebar, sign in
with Google (that sign-in *is* the app login), and see their real Google
Calendar events in Find Time's Month/Week/Day views. **Read-only** — edits in
Find Time do not push back to Google.

---

## 1. What's built

| Piece | File(s) | Notes |
|---|---|---|
| Token encryption | `src/server/crypto.ts` (+ `.check.mjs`) | AES-256-GCM, key `TOKEN_ENC_KEY`. Layout `iv‖tag‖data`. |
| Session | `src/server/auth/session.ts` (+ `.check.mjs`) | `ft_session` = signed cookie whose value is the user id (`docs/db/data-layer.md`). `currentUserId(req)` → verified id, else `'u1'` (logged-out keeps working on seed data). |
| Token store | `db/010_oauth_tokens.sql` | `oauth_tokens(connected_account_id pk, access_token_enc bytea, refresh_token_enc bytea, expiry, scope)`. The column shape `db/001_core.sql` deliberately left out. |
| OAuth client | `src/server/google/oauth.ts` | `authUrl` · `exchangeCode` · `decodeIdToken` · `refresh` · `getValidAccessToken` (refreshes ~60s before expiry, re-stores) · `revokeAccount`. Raw `fetch`, no `googleapis`. |
| Auth routes | `src/app/api/auth/google/{start,callback,logout}+api.ts` | `start` → 302 to Google (+ `ft_oauth_state` CSRF cookie). `callback` → verify state, exchange, upsert `users` (`g_<sub>`) + `connected_accounts` + `oauth_tokens` in one `tx`, set `ft_session`, kick off first sync, 302 `/app?connect=ok`. `logout` → clear cookie. |
| Calendar API | `src/server/google/calendar.ts` | `listCalendars`, `collectEvents` (paginates, `syncToken` support, `SyncTokenExpired` on 410). |
| Mapping | `src/server/google/map.ts` (+ `.check.mjs`) | Google event → `calendar_events` row. All-day, cancelled→delete, recurring→`rrule` + `recurrence_unsupported=true` (not expanded). `origin='imported'`, `flexibility='fixed'`, `category='other'`. |
| Sync | `src/server/google/sync.ts` | `syncAccount(userId, accountId)`: refresh token → upsert `calendars` → per read-enabled calendar, `collectEvents` from stored `sync_token` (full sync `now-60d` if none) → manual upsert into `calendar_events` on `(calendar_id, provider_event_id)`, cancelled → `deleted_at` → persist `calendar_sync_state`. Rolls `connected_accounts.sync_status`. |
| Account repo | `src/server/accounts-repo.ts` | `listAccountsWithCalendars` · `deleteAccount` (revoke + drop imported events + row) · `setCalendarReadEnabled` (disable also soft-deletes that calendar's events) · `getUserProfile`. |
| Calendar routes | `src/app/api/calendar/{sync,accounts}+api.ts`, `accounts/[id]+api.ts`, `calendars/[id]+api.ts` | `POST sync` (throttled 60s/account, `?force=1`), `GET accounts`, `DELETE accounts/[id]`, `PATCH calendars/[id] {readEnabled}`. All 401 for the demo user. |
| Event routes | `src/app/api/events+api.ts`, `events/[id]+api.ts` | `USER_ID='u1'` → `currentUserId(request)`. No other change — repo already filters by `user_id`, so imported rows flow through `listEvents` → `api-adapter.toCalEvent` untouched. |
| Client store | `src/calendar/account-store.ts` | `useSyncExternalStore` over `/api/calendar/accounts`. `connect` (web → `window.location.assign('/api/auth/google/start')`), `disconnect`, `setCalRead` (optimistic), `syncNow` (throttled), `signOut`. Every mutation ends with `cal-store.refresh()`. |
| Sidebar UI | `src/calendar/components/GoogleCalendars.tsx` + edits to `Sidebar.tsx` | New "Calendars" panel: connect button (web only; native → "on the web"), per-account row (accent dot, email, sync status, sync + disconnect), per-calendar read checkbox. Old category list retitled "Categories". User chip shows the real Google name/email + sign-out when signed in. |
| Mount sync | `src/calendar/CalendarScreen.tsx` | `syncNow()` on mount when signed in; toasts `?connect=ok/error`. |

Shared wire types: `ApiAccount` / `ApiCalendar` / `AccountsResponse` added to
`src/lib/api-types.ts` (the no-imports module).

---

## 2. Config the user must provide

`.env.example` has the full walkthrough. Short version — into `.env.local`:

| var | how |
|---|---|
| `DATABASE_URL_UNPOOLED` | Neon Console → Connection Details → **untoggle** "Pooled connection" |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → APIs & Services → Credentials → OAuth client ID → **Web application** |
| `GOOGLE_REDIRECT_URI` | `http://localhost:8081/api/auth/google/callback` — must also be listed as an Authorized redirect URI on the client |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `TOKEN_ENC_KEY` | `openssl rand -base64 32` (must decode to exactly 32 bytes) |

Google Cloud one-time: enable **Google Calendar API**; OAuth consent screen →
External, scopes `openid` `email` `profile` `.../auth/calendar.readonly`, add
yourself as a **Test user** (stays in "Testing", no verification needed).

---

## 3. Apply the DB migration

```sh
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/schema.sql          # if not already applied
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/010_oauth_tokens.sql
```

`db/schema.sql` already includes `project_label` (migration 007), so
`src/server/events-repo.ts` matches the schema once it's applied.

---

## 4. Verify

**Static (done, green):**
- `node src/server/crypto.check.mjs` · `node src/server/auth/session.check.mjs` ·
  `node src/server/google/map.check.mjs` → all `ok`.
- `npm run typecheck` · `npm run lint` → clean.
- `npx expo export --platform web` → `/`, `/app`, and 10 API routes
  (`/api/auth/google/*`, `/api/calendar/*`) all bundle. `/` still 87 KB SSR,
  `/app` 34 KB — no SSR regression.

**Live (needs §2 + §3):** `npx expo start --web`, then
1. Sidebar → **Connect Google Calendar** → Google consent → back on `/app`, chip
   shows your name, toast "Google Calendar connected".
2. `psql "$DATABASE_URL" -c "select id,email,sync_status from connected_accounts"` /
   `"select count(*) from oauth_tokens"` (tokens are `bytea`, unreadable) /
   `"select provider_event_id,title from calendar_events where origin='imported' limit 5"`.
3. Real Google events show in Month/Week/Day.
4. Untick a secondary calendar → its events vanish; tick + Sync → back.
5. Disconnect → `connected_accounts` / `oauth_tokens` / imported `calendar_events`
   for that account gone; calendar falls back to the logged-out seed view.

**Logged-out regression:** `curl localhost:8081/api/events` still returns the
seed-free list (or 503 if DB down); `/app` still renders on seed data.

---

## 5. Deferred (documented ceilings — see plan)

Two-way push to Google (`sync_state='pending_push'` worklist + `If-Match` etag
PUT) · `events.watch` webhooks + a background sync worker · RRULE expansion for
imported recurring events · native (iOS/Android) OAuth · Microsoft / Apple
providers · `TOKEN_ENC_KEY` rotation · `db/001_waitlist.sql` shares the `001_`
prefix with `db/001_core.sql` (cosmetic).
