import { useSyncExternalStore } from 'react';

import { seedEvents } from './sample-data';
import type { CalendarEvent } from './types';

/**
 * Tiny in-memory event store shared by the Calendar and Plan screens.
 * Cross-platform (web + iOS + Android), no dependencies.
 *
 * MVP scope: state lives in memory for the session. The next milestone swaps this
 * for a real API layer (auth via Clerk, persistence in Postgres) behind the same hooks.
 */
let events: CalendarEvent[] = seedEvents();
const listeners = new Set<() => void>();

function emit() {
  events = [...events].sort((a, b) => a.start.localeCompare(b.start));
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return events;
}

export function useEvents(): CalendarEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function addEvents(next: CalendarEvent[]) {
  events = [...events, ...next];
  emit();
}

export function confirmDraft(id: string) {
  events = events.map((e) => (e.id === id ? { ...e, draft: false } : e));
  emit();
}

export function removeEvent(id: string) {
  events = events.filter((e) => e.id !== id);
  emit();
}

export function confirmAllDrafts() {
  events = events.map((e) => (e.draft ? { ...e, draft: false } : e));
  emit();
}

export function discardDrafts() {
  events = events.filter((e) => !e.draft);
  emit();
}
