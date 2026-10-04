import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import { apiFetch, currentUserId, hasTokenGetter, onTokenGetter } from '@/lib/api';
import { IMPORTED_ORIGIN, lockedFields } from '@/lib/synced-fields';

import { DEFAULT_RRULE, toCalEvent, toEventInput, toEventPatch } from './api-adapter';
import { toMin } from './cal-date';
import { PendingSaves } from './pending-saves';
import type { CatKey } from './tokens';
import type { CalEvent } from './types';

/**
 * Event store for the calendar screen. Same `useSyncExternalStore` surface as
 * before — every export below is unchanged for callers — but the data now comes
 * from `/api/events` (Postgres, via the +api.ts routes).
 *
 * Reads:  the signed-in user's own cache instantly, then server truth. A
 *         failed load is reported (useCalLoad), never papered over: no sample
 *         week, and never another account's cache — the cache is keyed by the
 *         signed-in user, because two accounts on one browser share its storage.
 * Writes: optimistic local update + emit immediately, network in the
 *         background. Every mutation returns a promise of whether the server
 *         actually took the write, so callers confirm once it has landed
 *         instead of announcing success up front. On failure the store
 *         re-fetches, which puts what is really saved back on screen.
 */

/** The old shared cache, readable by whoever signed in next. Deleted on load. */
const LEGACY_CACHE_KEY = 'ft-cal-events-v1';
const cacheKey = (userId: string) => `ft-cal-events-v2:${userId}`;

let events: CalEvent[] = [];
/** Whose events `events` holds. Nothing is cached until this is known. */
let owner: string | null = null;
/** numeric CalEvent.id -> server (text) id. Rebuilt from every fetch. */
const idMap = new Map<number, string>();
/** ids for events created locally before the server has answered. */
let tempSeq = -1;
const listeners = new Set<() => void>();
/** Set by the first successful fetch; the cache must never overwrite it. */
let loadedFromServer = false;
/**
 * Dev-only `/preview`: a fixture week, no network. Writes apply locally and
 * report success, so every gesture can be exercised without an account.
 */
let preview = false;
export function startPreview(list: CalEvent[]) {
  preview = true;
  loadedFromServer = true;
  events = list;
  emit();
}

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
  // Imported titles and notes are live from Google and never stored, not even
  // on the device: the cache keeps their times only.
  const cached = events.map((e) => (e.imported ? { ...e, title: '', notes: '' } : e));
  if (owner && !preview) AsyncStorage.setItem(cacheKey(owner), JSON.stringify(cached)).catch(() => {});
}

export type CalLoad = { status: 'loading' | 'ready' | 'error'; error: string | null };
let load: CalLoad = { status: 'loading', error: null };
const loadListeners = new Set<() => void>();
function setLoad(next: CalLoad) {
  load = next;
  loadListeners.forEach((l) => l());
}

/** Whether the calendar on screen is the server's — so a failed load can say so. */
export function useCalLoad(): CalLoad {
  return useSyncExternalStore(
    (l) => {
      loadListeners.add(l);
      return () => {
        loadListeners.delete(l);
      };
    },
    () => load,
    () => load,
  );
}

/**
 * A different account is now signed in: drop everything the last one had on
 * screen, fail its queued writes rather than send them as the new user, and
 * show the new user's own cache while the fetch runs.
 */
function switchOwner(userId: string) {
  owner = userId;
  events = [];
  idMap.clear();
  loadedFromServer = false;
  for (const id of pending.ids()) pending.take(id)?.settle(false);
  setLoad({ status: 'loading', error: null });
  // Notify without emit(): emit() would write this empty list over the new
  // user's cache before hydrateFromCache gets to read it.
  listeners.forEach((l) => l());
  void hydrateFromCache(userId);
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
 * for it. On failure the user's own cached copy stays, and useCalLoad reports it.
 */
export async function refresh() {
  if (preview) return;
  const userId = currentUserId();
  if (!userId) return; // not signed in yet; onTokenGetter runs this again
  if (userId !== owner) switchOwner(userId);
  let fresh: CalEvent[];
  try {
    fresh = await fetchList();
  } catch (err) {
    if (owner === userId && !loadedFromServer) {
      setLoad({ status: 'error', error: err instanceof Error ? err.message : String(err) });
    }
    return;
  }
  // Signed out or switched while the request was in flight: not ours to show.
  if (currentUserId() !== userId) return;
  loadedFromServer = true;
  setLoad({ status: 'ready', error: null });
  events = fresh;
  // Queued writes are applied to the fresh rows BEFORE emitting, so an edit
  // does not flash back to its old value between the fetch and the flush.
  const sends = takeReadyWrites();
  emit();
  await Promise.all(sends.map((send) => send()));
}

async function hydrateFromCache(userId: string) {
  try {
    const raw = await AsyncStorage.getItem(cacheKey(userId));
    // A fetch that finished first is newer than anything cached.
    if (raw && !loadedFromServer && owner === userId) {
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
  await AsyncStorage.removeItem(LEGACY_CACHE_KEY).catch(() => {});
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
  rrule?: string;
  /** set only when the block runs past midnight (see CalEvent.endDate) */
  endDate?: string;
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
  if (preview) return temp;
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
    events = swapIn(temp.id, merged);
    emit();
    void sendPatch(serverId, saved, patch).then(queued.settle);
    return merged;
  }
  events = swapIn(temp.id, saved);
  emit();
  return saved;
}

/** Replace the temp row with the saved one; a refresh during the POST may
 *  already have dropped the temp row, and the saved one must not vanish. */
function swapIn(tempId: CalEvent['id'], saved: CalEvent): CalEvent[] {
  if (events.some((e) => e.id === tempId)) return events.map((e) => (e.id === tempId ? saved : e));
  return events.some((e) => e.id === saved.id) ? events : [...events, saved];
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
  return cur.imported === true && lockedFields(IMPORTED_ORIGIN, toEventPatch(cur, patch), cur.googleEditable).length > 0;
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
      if (cur.imported && !cur.googleEditable) {
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
  if (preview) return Promise.resolve(true);

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
  // An editable one is deleted in Google first (google/edit.ts), so it stays gone.
  if (cur.imported && !cur.googleEditable) return Promise.resolve(false);

  events = events.filter((e) => e.id !== id);
  emit();
  if (preview) return Promise.resolve(true);

  const serverId = idMap.get(id);
  if (!serverId) return pending.enqueue(id, { kind: 'delete' });
  return sendDelete(id, serverId);
}

/**
 * Change what a block *is*. Replaces the old binary protect/unprotect toggle,
 * which could only ever say `focus` or `event` and so had no way to express
 * the task and routine kinds the grid now draws differently.
 *
 * Routine is the presence of a recurrence rule rather than a column of its own
 * (see api-adapter), so the rule is set and cleared alongside the kind here —
 * otherwise a block moved out of Routine keeps repeating on the server.
 *
 * Allowed on imported events: kind is Find time's metadata, not Google's.
 * Resolves true once the server has the change.
 */
export function setKind(id: number, kind: CalEvent['kind']): Promise<boolean> {
  const cur = events.find((e) => e.id === id);
  if (!cur) return Promise.resolve(false);
  if (cur.kind === kind) return Promise.resolve(true);
  return updateEvent(id, { kind, rrule: kind === 'routine' ? cur.rrule ?? DEFAULT_RRULE : undefined });
}

const API_CAT_TO_CAT: Record<string, CatKey> = {
  'deep-work': 'deep',
  design: 'design',
  research: 'research',
  meeting: 'sync',
  admin: 'admin',
  // No calendar colour for personal time yet; admin is the neutral one.
  personal: 'admin',
};

/** Accept an AI-proposed block: `kind: 'ai'` is what renders the dashed lime
 *  "tap to accept" state, and it comes back from the server as `origin: 'ai'`,
 *  so accepting has to persist `origin: 'manual'` or it reverts on reload. */
export function acceptEvent(id: number): Promise<boolean> {
  const cur = events.find((e) => e.id === id);
  if (!cur || cur.kind !== 'ai') return Promise.resolve(false);
  return updateEvent(id, { kind: 'event' });
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

