import { useSyncExternalStore } from 'react';

import { toMin } from './cal-date';
import { nextId, seedEvents } from './seed';
import type { CatKey } from './tokens';
import type { CalEvent } from './types';

/**
 * In-memory event store for the calendar screen. Same `useSyncExternalStore`
 * pattern as `src/lib/store.ts`, but a separate instance — this module never
 * imports or mutates the Plan tab's store.
 *
 * A later milestone swaps this for a real API layer behind the same hooks
 * (HANDOFF.md: no auth / DB this phase).
 */
let events: CalEvent[] = seedEvents();
const listeners = new Set<() => void>();

function emit() {
  events = [...events];
  listeners.forEach((l) => l());
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
  const ev: CalEvent = {
    id: nextId(),
    project: '',
    notes: '',
    kind: 'event',
    ...input,
  };
  events = [...events, ev];
  emit();
  return ev;
}

export function updateEvent(id: number, patch: Partial<CalEvent>) {
  events = events.map((e) => (e.id === id ? { ...e, ...patch } : e));
  emit();
}

export function deleteEvent(id: number) {
  events = events.filter((e) => e.id !== id);
  emit();
}

/** Toggle a block between protected (`focus`) and flexible (`event`). */
export function toggleProtected(id: number) {
  events = events.map((e) =>
    e.id === id ? { ...e, kind: e.kind === 'focus' ? 'event' : 'focus' } : e,
  );
  emit();
}

/** The mocked Find-time "apply" from calendar.html — moves two flexible blocks
 *  and adds one protected deep-work block. Behind this one function so a real
 *  scheduler can replace it later. */
export function applyFindTime() {
  const sr = events.find((e) => e.title === 'Stakeholder review');
  const dc = events.find((e) => e.title === 'Draft launch checklist');
  events = events.map((e) => {
    if (sr && e.id === sr.id) return { ...e, date: '2026-09-07', start: '16:00', end: '17:00' };
    if (dc && e.id === dc.id) return { ...e, date: '2026-09-11', start: '09:30', end: '10:30' };
    return e;
  });
  if (!events.some((e) => e.title === 'Deep work · onboarding spec')) {
    events = [
      ...events,
      {
        id: nextId(),
        date: '2026-09-10',
        start: '10:00',
        end: '12:00',
        title: 'Deep work · onboarding spec',
        cat: 'deep',
        project: 'Mobile launch',
        kind: 'focus',
        notes: 'Two clean hours found by Find time.',
      },
    ];
  }
  emit();
}

/** The day-view insight card action — resolve the Wed 11:00 clash. */
export function resolveWedClash() {
  events = events.map((e) => {
    if (e.title === 'Roadmap review with Maya')
      return { ...e, date: '2026-09-10', start: '14:00', end: '15:00', conflict: false };
    if (e.title === 'Product team sync' && e.date === '2026-09-09')
      return { ...e, conflict: false };
    return e;
  });
  emit();
}
