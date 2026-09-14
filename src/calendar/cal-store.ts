import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { FindTimeProposal } from '@/lib/api-types';
import { apiFetch, hasTokenGetter, onTokenGetter } from '@/lib/api';
import { IMPORTED_ORIGIN, lockedFields } from '@/lib/synced-fields';

import { toCalEvent, toEventInput, toEventPatch } from './api-adapter';
import { toMin } from './cal-date';
import { PendingSaves } from './pending-saves';
import { seedEvents } from './seed';
import type { CatKey } from './tokens';
import type { CalEvent } from './types';

/**
 * Event store for the calendar screen. Same `useSyncExternalStore` surface as
 * before — every export below is unchanged for callers — but the data now comes
 * from `/api/events` (Postgres, via the +api.ts routes).
 *
 * Reads:  fetch on load, fall back to an AsyncStorage cache, then to the seed
 *         fixtures (offline / first run).
 * Writes: optimistic local update + emit immediately, network in the
 *         background. Every mutation returns a promise of whether the server
 *         actually took the write, so callers confirm once it has landed
 *         instead of announcing success up front. On failure the store
 *         re-fetches, which puts what is really saved back on screen.
 */

const CACHE_KEY = 'ft-cal-events-v1';

let events: CalEvent[] = seedEvents();
/** numeric CalEvent.id -> server (text) id. Rebuilt from every fetch. */
const idMap = new Map<number, string>();
/** ids for events created locally before the server has answered. */
let tempSeq = -1;
const listeners = new Set<() => void>();
/** Set by the first successful fetch; the cache must never overwrite it. */
let loadedFromServer = false;

/** How long a write may wait for its server id before it is reported failed. */
const PENDING_TIMEOUT_MS = 15_000;

/** Writes made before their event's server id was known — see pending-saves.ts. */
const pending = new PendingSaves<Partial<CalEvent>>(PENDING_TIMEOUT_MS, () => {
  void refresh();
});

/** What to tell someone when a write did not land. By the time they read it
 *  the store has re-fetched, so the calendar already shows what is saved. */
export const SAVE_FAILED = "Couldn't save that change. Check your connection and try again.";

function emit() {
  events = [...events];
  listeners.forEach((l) => l());
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(events)).catch(() => {});
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSnapshot() {
  return events;
}

export function useCalEvents(): CalEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Non-hook read, for imperative code paths (nav counts, AI apply). */
export function allEvents() {
  return events;
}

export const byDate = (list: CalEvent[], d: string) =>
  list.filter((e) => e.date === d).sort((a, b) => toMin(a.start) - toMin(b.start));

// ── network ────────────────────────────────────────────────────────────────

async function fetchList(): Promise<CalEvent[]> {
  const res = await apiFetch(`/api/events`);
  if (!res.ok) throw new Error(`GET /api/events ${res.status}`);
  const { events: rows } = (await res.json()) as {
    events: Parameters<typeof toCalEvent>[0][];
  };
  idMap.clear();
  return rows.map((row) => {
    const cal = toCalEvent(row);
    idMap.set(cal.id, row.id);
    return cal;
  });
}

/**
 * Replace the store with server truth, then send any writes that were waiting
 * for it. Silent on failure — keeps the cache/seed snapshot.
 */
export async function refresh() {
  let fresh: CalEvent[];
  try {
    fresh = await fetchList();
  } catch {
    return; // offline, API down, or not signed in yet
  }
  loadedFromServer = true;
  events = fresh;
  // Queued writes are applied to the fresh rows BEFORE emitting, so an edit
  // does not flash back to its old value between the fetch and the flush.
  const sends = takeReadyWrites();
  emit();
  await Promise.all(sends.map((send) => send()));
}

async function hydrateFromCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    // A fetch that finished first is newer than anything cached.
    if (raw && !loadedFromServer) {
      events = JSON.parse(raw) as CalEvent[];
      emit();
    }
  } catch {
    // ignore a corrupt/absent cache
  }
}

// Last-known data instantly, then server truth.
//
// This module is imported before AuthBridge mounts, and the API only accepts a
// Bearer token, so a load fired here with no token getter always 401'd. The id
// map then stayed empty until some unrelated screen action refreshed the store,
// and every edit in between changed the screen without ever being sent. So:
// load now only if a getter already exists, and again whenever one arrives.
void (async () => {
  await hydrateFromCache();
  if (hasTokenGetter()) await refresh();
})();
onTokenGetter(() => {
  void refresh();
});

// ── mutations (optimistic; network in the background) ───────────────────────

export type NewEvent = {
  date: string;
  start: string;
  end: string;
  title: string;
  cat: CatKey;
  project?: string;
  notes?: string;
  kind?: CalEvent['kind'];
};

function optimistic(input: NewEvent): CalEvent {
  const temp: CalEvent = {
    id: tempSeq--,
    project: '',
    notes: '',
    kind: 'event',
    ...input,
  };
  events = [...events, temp];
  emit();
  return temp;
}

/** POST an optimistically-added block. Resolves with the reconciled server row;
 *  rolls the optimistic row back and rejects if the write fails. */
async function persist(temp: CalEvent): Promise<CalEvent> {
  let saved: CalEvent;
  let serverId: string;
  try {
    const res = await apiFetch(`/api/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toEventInput(temp)),
    });
    if (!res.ok) throw new Error(`POST /api/events ${res.status}`);
    const { event: row } = (await res.json()) as {
      event: Parameters<typeof toCalEvent>[0];
    };
    saved = toCalEvent(row);
    serverId = row.id;
  } catch (err) {
    events = events.filter((e) => e.id !== temp.id);
    emit();
    pending.take(temp.id)?.settle(false);
    throw err;
  }
  idMap.set(saved.id, serverId);

  // Anything done to the block while its POST was in flight was queued under
  // the temp id. Hand it over now: otherwise the row the server just returned,
  // which predates the edit, would replace it on screen and the edit would be
  // lost without ever being sent.
  const queued = pending.take(temp.id);
  if (queued?.op.kind === 'delete') {
    // Already gone from the screen; make it gone on the server too.
    void sendDelete(saved.id, serverId).then(queued.settle);
    return saved;
  }
  if (queued?.op.kind === 'patch') {
    const patch = queued.op.patch;
    const merged = { ...saved, ...patch };
    events = events.map((e) => (e.id === temp.id ? merged : e));
    emit();
    void sendPatch(serverId, saved, patch).then(queued.settle);
    return merged;
  }
  events = events.map((e) => (e.id === temp.id ? saved : e));
  emit();
  return saved;
}

/** Fire-and-forget create, for callers that must stay synchronous. */
export function createEvent(input: NewEvent): CalEvent {
  const temp = optimistic(input);
  void persist(temp).catch(() => {});
  return temp;
}

/** Create and wait for the server, so the caller can report what really saved. */
export function createEventAsync(input: NewEvent): Promise<CalEvent> {
  return persist(optimistic(input));
}

// ── sending ────────────────────────────────────────────────────────────────

/** An edit Google would overwrite (src/lib/synced-fields.ts). */
function isLockedPatch(cur: CalEvent, patch: Partial<CalEvent>): boolean {
  return cur.imported === true && lockedFields(IMPORTED_ORIGIN, toEventPatch(cur, patch)).length > 0;
}

/** `current` is the event as it was BEFORE `patch` — times and the imported
 *  flag are resolved against it (api-adapter.ts, toEventPatch). */
async function sendPatch(serverId: string, current: CalEvent, patch: Partial<CalEvent>): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/events/${serverId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(toEventPatch(current, patch)),
    });
    if (!res.ok) throw new Error(`PATCH /api/events ${res.status}`);
    return true;
  } catch {
    void refresh(); // server is truth
    return false;
  }
}

async function sendDelete(id: number, serverId: string): Promise<boolean> {
  try {
    const res = await apiFetch(`/api/events/${serverId}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`DELETE /api/events ${res.status}`);
    idMap.delete(id);
    return true;
  } catch {
    void refresh();
    return false;
  }
}

/**
 * After a successful fetch: apply each queued write whose id now has a server
 * counterpart, and return the network calls to make. Synchronous on purpose —
 * see refresh(). Temp ids are skipped; persist() hands those over itself.
 */
function takeReadyWrites(): (() => Promise<void>)[] {
  const sends: (() => Promise<void>)[] = [];
  for (const id of pending.ids()) {
    if (id < 0) continue;
    const taken = pending.take(id);
    if (!taken) continue;

    const serverId = idMap.get(id);
    const cur = events.find((e) => e.id === id);
    // The fetch succeeded and the row is not in it: a seed or stale-cache event
    // that never existed on the server. There is nowhere to save the write.
    if (!serverId || !cur) {
      taken.settle(false);
      continue;
    }

    if (taken.op.kind === 'delete') {
      if (cur.imported) {
        taken.settle(false);
        continue;
      }
      events = events.filter((e) => e.id !== id);
      sends.push(() => sendDelete(id, serverId).then(taken.settle));
    } else {
      const patch = taken.op.patch;
      // Cached rows from before `imported` existed carry no flag, so the lock
      // is only knowable against the fresh row.
      if (isLockedPatch(cur, patch)) {
        taken.settle(false);
        continue;
      }
      events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
      sends.push(() => sendPatch(serverId, cur, patch).then(taken.settle));
    }
  }
  return sends;
}

// ── mutations ──────────────────────────────────────────────────────────────

/** Resolves true once the server has the change, false if it does not. */
export function updateEvent(id: number, patch: Partial<CalEvent>): Promise<boolean> {
  const cur = events.find((e) => e.id === id);
  if (!cur) return Promise.resolve(false);
  // Refused before the optimistic update, not after it: showing a change and
  // then snapping it back is exactly the failure being removed here.
  if (isLockedPatch(cur, patch)) return Promise.resolve(false);

  events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();

  const serverId = idMap.get(id);
  // No server id yet — a create still in flight, or the first load has not
  // landed. Queue it; this used to return here and drop the write.
  if (!serverId) return pending.enqueue(id, { kind: 'patch', patch });
  return sendPatch(serverId, cur, patch);
}

/** Resolves true once the server has removed the event, false if not. */
export function deleteEvent(id: number): Promise<boolean> {
  const cur = events.find((e) => e.id === id);
  if (!cur) return Promise.resolve(false);
  // sync.ts clears deleted_at whenever Google sends the event again — when it
  // changes there, or on a full re-sync — so a local delete would come back.
  if (cur.imported) return Promise.resolve(false);

  events = events.filter((e) => e.id !== id);
  emit();

  const serverId = idMap.get(id);
  if (!serverId) return pending.enqueue(id, { kind: 'delete' });
  return sendDelete(id, serverId);
}

/** Toggle a block between protected (`focus`) and flexible (`event`). Allowed
 *  on imported events: protection is Find time's metadata, not Google's. */
export function toggleProtected(id: number): Promise<boolean> {
  const cur = events.find((e) => e.id === id);
  if (!cur) return Promise.resolve(false);
  return updateEvent(id, { kind: cur.kind === 'focus' ? 'event' : 'focus' });
}

const API_CAT_TO_CAT: Record<string, CatKey> = {
  'deep-work': 'deep',
  design: 'design',
  research: 'research',
  meeting: 'sync',
  admin: 'admin',
};

/** Accept an AI-proposed block: `kind: 'ai'` is what renders the dashed lime
 *  "tap to accept" state, and it comes back from the server as `origin: 'ai'`,
 *  so accepting has to persist `origin: 'manual'` or it reverts on reload. */
export function acceptEvent(id: number): Promise<boolean> {
  const cur = events.find((e) => e.id === id);
  if (!cur || cur.kind !== 'ai') return Promise.resolve(false);
  return updateEvent(id, { kind: 'event' });
}

/** Apply the AI "Find time" proposals from POST /api/ai/find-time: create each
 *  as an AI-kind block (dashed lime), persisted via POST /api/events.
 *
 *  Awaits the writes and returns how many actually landed. This used to be
 *  synchronous and return `proposals.length` unconditionally, so a failed POST
 *  showed "N blocks added to your calendar" and then silently removed them. */
export async function applyProposals(proposals: FindTimeProposal[]): Promise<number> {
  const results = await Promise.all(
    proposals.map((p) =>
      createEventAsync({
        date: p.startISO.slice(0, 10),
        start: p.startISO.slice(11, 16),
        end: p.endISO.slice(11, 16),
        title: p.title,
        cat: API_CAT_TO_CAT[p.category] ?? 'deep',
        kind: 'ai',
      }).then(
        () => true,
        () => false,
      ),
    ),
  );
  return results.filter(Boolean).length;
}

/** Create one agent-proposed block at an explicit time. Used by the chat panel,
 *  which accepts proposals one at a time so each one can carry its own outcome
 *  back to the learner (src/calendar/agent-store.ts). */
export function createAgentBlock(input: {
  title: string;
  category: string;
  startISO: string;
  endISO: string;
}): Promise<unknown> {
  return createEventAsync({
    date: input.startISO.slice(0, 10),
    start: input.startISO.slice(11, 16),
    end: input.endISO.slice(11, 16),
    title: input.title,
    cat: API_CAT_TO_CAT[input.category] ?? 'deep',
    kind: 'ai',
  });
}

