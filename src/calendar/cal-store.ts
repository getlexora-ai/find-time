import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { FindTimeProposal } from '@/lib/api-types';

import { toCalEvent, toEventInput } from './api-adapter';
import { toMin } from './cal-date';
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
 * Writes: optimistic local update + emit immediately (callers stay synchronous),
 *         network in the background, re-fetch to reconcile on failure.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';
const CACHE_KEY = 'ft-cal-events-v1';

let events: CalEvent[] = seedEvents();
/** numeric CalEvent.id -> server (text) id. Rebuilt from every fetch. */
const idMap = new Map<number, string>();
/** ids for events created locally before the server has answered. */
let tempSeq = -1;
const listeners = new Set<() => void>();

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
  const res = await fetch(`${BASE}/api/events`);
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

/** Replace the store with server truth. Silent on failure — keeps cache/seed. */
export async function refresh() {
  try {
    events = await fetchList();
    emit();
  } catch {
    // offline or API down; leave the current snapshot in place.
  }
}

async function hydrateFromCache() {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      events = JSON.parse(raw) as CalEvent[];
      emit();
    }
  } catch {
    // ignore a corrupt/absent cache
  }
}

// Kick off load: last-known data instantly, then reconcile with the server.
void (async () => {
  await hydrateFromCache();
  await refresh();
})();

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

export function createEvent(input: NewEvent): CalEvent {
  const temp: CalEvent = {
    id: tempSeq--,
    project: '',
    notes: '',
    kind: 'event',
    ...input,
  };
  events = [...events, temp];
  emit();

  void (async () => {
    try {
      const res = await fetch(`${BASE}/api/events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toEventInput(temp)),
      });
      if (!res.ok) throw new Error(`POST /api/events ${res.status}`);
      const { event: row } = (await res.json()) as {
        event: Parameters<typeof toCalEvent>[0];
      };
      const saved = toCalEvent(row);
      idMap.set(saved.id, row.id);
      events = events.map((e) => (e.id === temp.id ? saved : e));
      emit();
    } catch {
      events = events.filter((e) => e.id !== temp.id);
      emit();
    }
  })();

  return temp;
}

export function updateEvent(id: number, patch: Partial<CalEvent>) {
  events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();

  const serverId = idMap.get(id);
  if (!serverId) return; // temp/seed row with no server counterpart yet

  void (async () => {
    try {
      const res = await fetch(`${BASE}/api/events/${serverId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(toEventInput(patch)),
      });
      if (!res.ok) throw new Error(`PATCH /api/events ${res.status}`);
    } catch {
      void refresh(); // server is truth
    }
  })();
}

export function deleteEvent(id: number) {
  events = events.filter((e) => e.id !== id);
  emit();

  const serverId = idMap.get(id);
  if (!serverId) return;

  void (async () => {
    try {
      const res = await fetch(`${BASE}/api/events/${serverId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`DELETE /api/events ${res.status}`);
      idMap.delete(id);
    } catch {
      void refresh();
    }
  })();
}

/** Toggle a block between protected (`focus`) and flexible (`event`). */
export function toggleProtected(id: number) {
  const cur = events.find((e) => e.id === id);
  if (!cur) return;
  updateEvent(id, { kind: cur.kind === 'focus' ? 'event' : 'focus' });
}

const API_CAT_TO_CAT: Record<string, CatKey> = {
  'deep-work': 'deep',
  design: 'design',
  research: 'research',
  meeting: 'sync',
  admin: 'admin',
};

/** Apply the AI "Find time" proposals from POST /api/ai/find-time: create each
 *  as an AI-kind block (dashed lime). Goes through the normal `createEvent`
 *  path, so each one is persisted to /api/events. Returns how many were added. */
export function applyProposals(proposals: FindTimeProposal[]): number {
  for (const p of proposals) {
    createEvent({
      date: p.startISO.slice(0, 10),
      start: p.startISO.slice(11, 16),
      end: p.endISO.slice(11, 16),
      title: p.title,
      cat: API_CAT_TO_CAT[p.category] ?? 'deep',
      kind: 'ai',
    });
  }
  return proposals.length;
}

