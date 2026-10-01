import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { PreferencesResponse } from '@/lib/api-types';
import { apiFetch, hasTokenGetter, onTokenGetter } from '@/lib/api';

import { DEFAULT_WINDOW } from './tokens';

/**
 * Two different things, kept apart (docs/calendar-spec.md §5):
 *
 *   window  — "your hours": the span you allow yourself to be scheduled in,
 *             e.g. 06–22. The grid draws exactly this, every week, so the page
 *             never changes height because one week had an early flight.
 *   work    — working hours per weekday, inside the window. Outside them the
 *             grid is hatched: still yours to use, visibly "off".
 *
 * The window is a per-device setting (AsyncStorage). Working hours come from
 * the scheduler profile the AI already plans with, so the grid and the AI can
 * never disagree about when you work.
 */

/** Monday-first, like every other day index in the calendar (`wdIndex`). */
export type DayHours = { start: number; end: number } | null;
export type Hours = {
  /** first hour drawn, 0–23 */
  start: number;
  /** hour the grid ends at, 1–24, > start */
  end: number;
  /** Mon..Sun; null = a non-working day */
  work: DayHours[];
};

const KEY = 'ft-hours';
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Same default the AI uses (server/ai/preferences.ts DEFAULT_WORK_HOURS). */
const DEFAULT_WORK: DayHours[] = [
  { start: 9, end: 18 },
  { start: 9, end: 18 },
  { start: 9, end: 18 },
  { start: 9, end: 18 },
  { start: 9, end: 18 },
  null,
  null,
];

let state: Hours = { start: DEFAULT_WINDOW.start, end: DEFAULT_WINDOW.end, work: DEFAULT_WORK };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function useHours(): Hours {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}

export const getHours = () => state;

/** Shortest window the grid accepts — anything less is not a day you can plan. */
export const MIN_WINDOW_H = 4;

/** Set your hours. Clamped so the window is always valid and at least 4h. */
export function setWindow(start: number, end: number) {
  const s = Math.max(0, Math.min(24 - MIN_WINDOW_H, Math.round(start)));
  const e = Math.min(24, Math.max(s + MIN_WINDOW_H, Math.round(end)));
  if (s === state.start && e === state.end) return;
  state = { ...state, start: s, end: e };
  emit();
  AsyncStorage.setItem(KEY, JSON.stringify({ start: s, end: e })).catch(() => {});
}

/** Working hours for a Monday-first day index, clipped to the window. */
export function workFor(h: Hours, wd: number): DayHours {
  const w = h.work[wd];
  if (!w) return null;
  const start = Math.max(h.start, w.start);
  const end = Math.min(h.end, w.end);
  return end > start ? { start, end } : null;
}

void (async () => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return;
    const v = JSON.parse(raw) as { start?: number; end?: number };
    if (typeof v.start === 'number' && typeof v.end === 'number') {
      state = { ...state, start: v.start, end: v.end };
      setWindow(v.start, v.end); // re-validates
      emit();
    }
  } catch {
    // corrupt or absent: keep the default
  }
})();

async function loadWorkHours() {
  try {
    const res = await apiFetch('/api/ai/preferences');
    if (!res.ok) return;
    const body = (await res.json()) as PreferencesResponse;
    if (!body.workHours) return;
    const work = WEEKDAY_KEYS.map((k, i) => {
      if (!(k in body.workHours!)) return DEFAULT_WORK[i];
      const v = body.workHours![k];
      return v && v.end > v.start ? { start: v.start, end: v.end } : null;
    });
    state = { ...state, work };
    emit();
  } catch {
    // offline / signed out: the default stands
  }
}

if (hasTokenGetter()) void loadWorkHours();
onTokenGetter(() => void loadWorkHours());
