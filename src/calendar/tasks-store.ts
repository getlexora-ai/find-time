import { useSyncExternalStore } from 'react';

import type { ApiHabit, ApiTask, TaskActionResponse, TasksResponse } from '@/lib/api-types';
import { apiFetch } from '@/lib/api';

import { refresh as refreshEvents } from './cal-store';

/**
 * Store for the Tasks page: the open backlog and the habits (GET /api/tasks),
 * and the three things you can do to them without a sentence — finish,
 * postpone, stop. Adding and changing go through Plan with AI. Same
 * `useSyncExternalStore` surface as the other stores. Each action ends by
 * re-reading the calendar, since it may have taken blocks off it.
 */

export type TasksState = {
  loading: boolean;
  tasks: ApiTask[];
  habits: ApiHabit[];
  error: string | null;
};

let state: TasksState = { loading: true, tasks: [], habits: [], error: null };

const listeners = new Set<() => void>();
function set(patch: Partial<TasksState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const getSnapshot = () => state;

export function useTasks(): TasksState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Dev-only `/preview`: fixed data, no network. */
let previewing = false;
export function previewTasks(tasks: ApiTask[], habits: ApiHabit[]) {
  previewing = true;
  set({ loading: false, tasks, habits, error: null });
}

export async function refreshTasks(): Promise<void> {
  if (previewing) return;
  try {
    const res = await apiFetch('/api/tasks');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as TasksResponse;
    set({ loading: false, tasks: data.tasks, habits: data.habits, error: null });
  } catch {
    set({ loading: false, error: "Couldn't load your tasks." });
  }
}

async function act(path: string, body: unknown): Promise<TaskActionResponse | null> {
  if (previewing) return { cleared: 0 };
  try {
    const res = await apiFetch(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const out = (await res.json()) as TaskActionResponse;
    await refreshTasks();
    if (out.cleared) void refreshEvents();
    return out;
  } catch {
    return null;
  }
}

export type PostponePreset = '1h' | '3h' | 'tomorrow' | 'next-week';

/** Each returns how many blocks came off the calendar, or null when it failed. */
export const finishTask = (id: string) => act(`/api/tasks/${encodeURIComponent(id)}`, { done: true });
export const postponeTask = (id: string, preset: PostponePreset) =>
  act(`/api/tasks/${encodeURIComponent(id)}`, { postpone: preset });
export const resumeTask = (id: string) => act(`/api/tasks/${encodeURIComponent(id)}`, { notBefore: null });
export const stopHabit = (id: string) => act(`/api/habits/${encodeURIComponent(id)}`, { stop: true });

/** Tools whose turns change the backlog — after one, the Tasks page re-reads it. */
export const TASK_TOOLS = new Set([
  'add_task',
  'task_done',
  'update_task',
  'postpone_task',
  'add_habit',
  'update_habit',
]);
