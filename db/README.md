# find_time — database

Neon Postgres. Raw `pg` + hand-written SQL (rationale: [../docs/db/data-layer.md](../docs/db/data-layer.md)).
Calendar-specific design: [../docs/db/calendar-schema.md](../docs/db/calendar-schema.md).

## Files

| File | Tables |
|---|---|
| `001_core.sql` | `users`, `scheduler_profiles`, `notification_prefs`, `constraints`, `connected_accounts`, `calendars` |
| `002_projects_tasks.sql` | `projects`, `tasks` |
| `003_calendar_events.sql` | `calendar_events`, `calendar_event_reminders`, `reminder_dispatches`, `calendar_sync_state` |
| `004_ai.sql` | `ai_sessions`, `ai_messages`, `plan_drafts`, `ai_suggestions` |
| `005_signals_notifications.sql` | `email_signals`, `notifications` |
| `006_cross_refs.sql` | circular FKs, added last |
| `007_expo_calendar_compat.sql` | `calendar_events.project_label` (RN calendar carries `project` as free text) |
| `010_oauth_tokens.sql` | `oauth_tokens` — AES-256-GCM-encrypted Google tokens (src/server/crypto.ts) |
| `schema.sql` | **generated** — `001`–`007` concatenated; what a fresh DB gets. **Run `010` after it.** |

Each file is idempotent (`create table if not exists`, `do $$ … exception when duplicate_object`), so re-running one is safe.

## Apply

Neon gives you two connection strings. Use the **direct / unpooled** one for DDL
(the `-pooler` host can't run `create type`, advisory locks, or reliable DDL):

```sh
export DATABASE_URL='postgresql://...-pooler.neon.tech/find_time?sslmode=require'   # app, in .env.local
export DATABASE_URL_UNPOOLED='postgresql://...direct-host.neon.tech/find_time?sslmode=require'  # no -pooler; migrations only

# fresh database:
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/schema.sql
psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f db/010_oauth_tokens.sql

# or file by file, in order:
for f in db/00[1-7]_*.sql db/010_*.sql; do psql "$DATABASE_URL_UNPOOLED" -v ON_ERROR_STOP=1 -f "$f"; done
```

`NOTICE: … does not exist, skipping` on the first run is the `drop trigger if exists`
lines — harmless.

## Regenerate `schema.sql`

```sh
cat db/001_core.sql db/002_projects_tasks.sql db/003_calendar_events.sql \
    db/004_ai.sql db/005_signals_notifications.sql db/006_cross_refs.sql > db/schema.sql
# then re-prepend the header banner
```

## Seed

The demo dataset (`src/server/store/seed.ts`) still lands via the app on boot once
the repository layer exists — not applied here. Set `FT_SKIP_SEED=1` to turn it off.

## Not yet wired

These migrations create the tables. The app still reads `globalThis` Maps
(`src/server/store/db.ts`) until the connection module (`src/server/db/`) and
repository layer (`src/server/repo/`) land — see data-layer.md §3–4.
