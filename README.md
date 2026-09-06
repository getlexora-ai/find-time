# Find Time

A cross-platform time-planning app built with **Expo + React Native**. One codebase
runs on **iOS, Android, and web**.

This is the ground-up rewrite of the earlier Next.js web prototype (preserved on the
[`v1`](https://github.com/getlexora-ai/find-time/tree/v1) branch). The rewrite exists so
every screen is a real React Native component that ships to native and web alike.

## What's in this MVP

Two functions, both working end to end with no configuration:

1. **Calendar** (`src/app/index.tsx`) — a 2-week day strip and an agenda list. Shows your
   events per day, colour-coded by type, including blocks proposed by the planner.
2. **Plan with AI** (`src/app/plan.tsx`) — describe what you need time for in plain
   English ("Find 2 hours for deep work tomorrow morning"). The planner reads your
   existing events, finds open slots, and proposes blocks you can drop onto the calendar
   and confirm.

Data lives in memory for the session (`src/lib/store.ts`) and is seeded on launch
(`src/lib/sample-data.ts`), so the app is fully functional the moment it starts.

## Run it

```bash
git clone https://github.com/getlexora-ai/find-time.git
cd find-time
npm install

npm run web        # open http://localhost:8081 in a browser
npm run ios        # iOS simulator (macOS + Xcode)
npm run android    # Android emulator (Android Studio)
npm start          # dev menu — scan the QR code with Expo Go on a real device
```

Requires Node 20+.

## Checks

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint (eslint-config-expo)
```

## Project layout

```
src/
  app/
    _layout.tsx        tab navigator (Calendar · Plan with AI)
    index.tsx          Calendar screen
    plan.tsx           Plan with AI screen
  lib/
    store.ts           in-memory event store + React hooks
    planner.ts         deterministic planner (natural language -> time blocks)
    sample-data.ts     seed events
    date.ts / types.ts helpers and shared types
  components/           themed primitives
  constants/theme.ts   colours, spacing, fonts
  hooks/               colour-scheme + theme hooks
```

## Roadmap (next milestones)

The MVP deliberately stops short of these; the code has plug points marked:

- **Auth** — Clerk, replacing the session-only store with a real user identity.
- **Database** — Postgres, persisting events per user behind an API layer that the
  `useEvents` / `addEvents` hooks already abstract.
- **Real AI planning** — swap `parseRequest` in `src/lib/planner.ts` for an LLM call
  (with an API key) that returns the same `PlanIntent`; keep `placeBlocks` as the
  deterministic scheduler.
