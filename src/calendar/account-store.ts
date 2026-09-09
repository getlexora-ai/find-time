import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

import type { AccountsResponse, ApiAccount } from '@/lib/api-types';
import { apiFetch } from '@/lib/api';

import { refresh as refreshEvents } from './cal-store';

/**
 * Store for the sidebar "Calendars" panel: the connected Google accounts +
 * calendars and the connect / disconnect / toggle / sync actions. Same
 * `useSyncExternalStore` surface as `cal-store.ts`.
 *
 * `signedIn` here just mirrors "the API accepted our Clerk token" — the real
 * auth gate is Clerk on `/app`. Every mutation that can change which events
 * exist ends by re-fetching the event store, so the grid updates without a reload.
 */

export type AccountState = {
  loading: boolean;
  signedIn: boolean;
  user: AccountsResponse['user'];
  accounts: ApiAccount[];
  syncing: boolean;
  error: string | null;
};

let state: AccountState = {
  loading: true,
  signedIn: false,
  user: null,
  accounts: [],
  syncing: false,
  error: null,
};

const listeners = new Set<() => void>();
function set(patch: Partial<AccountState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
function getSnapshot() {
  return state;
}

export function useAccounts(): AccountState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export async function refreshAccounts(): Promise<void> {
  try {
    const res = await apiFetch(`/api/calendar/accounts`);
    if (!res.ok) throw new Error(`GET /api/calendar/accounts ${res.status}`);
    const data = (await res.json()) as AccountsResponse;
    set({
      loading: false,
      signedIn: data.signedIn,
      user: data.user,
      accounts: data.accounts,
      error: null,
    });
  } catch {
    set({ loading: false }); // keep last-known; the calendar still works on seed data
  }
}

/**
 * Start a Google Calendar connect (web only — native connect is deferred).
 * `/api/auth/google/start` is bearer-authed and returns the consent URL.
 */
export async function connect(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const res = await apiFetch(`/api/auth/google/start`, { method: 'POST' });
    if (!res.ok) throw new Error(String(res.status));
    const { url } = (await res.json()) as { url?: string };
    if (url) window.location.assign(url);
  } catch {
    set({ error: 'Could not start Google connect.' });
  }
}

/** Clear the local calendar snapshot on sign-out (Clerk does the real thing). */
export async function resetAccounts(): Promise<void> {
  set({ signedIn: false, user: null, accounts: [] });
  await refreshEvents();
}

export async function disconnect(accountId: string): Promise<void> {
  try {
    await apiFetch(`/api/calendar/accounts/${accountId}`, { method: 'DELETE' });
  } catch {
    /* ignore — refetch below reconciles */
  }
  await refreshAccounts();
  await refreshEvents();
}

export async function setCalRead(calendarId: string, readEnabled: boolean): Promise<void> {
  // optimistic
  set({
    accounts: state.accounts.map((a) => ({
      ...a,
      calendars: a.calendars.map((c) => (c.id === calendarId ? { ...c, readEnabled } : c)),
    })),
  });
  try {
    const res = await apiFetch(`/api/calendar/calendars/${calendarId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ readEnabled }),
    });
    if (!res.ok) throw new Error(String(res.status));
    await refreshEvents();
  } catch {
    await refreshAccounts(); // revert to server truth
  }
}

let lastSync = 0;
export async function syncNow(force = false): Promise<void> {
  if (state.syncing) return;
  if (!force && Date.now() - lastSync < 30_000) return;
  lastSync = Date.now();
  set({ syncing: true });
  try {
    const res = await apiFetch(`/api/calendar/sync${force ? '?force=1' : ''}`, { method: 'POST' });
    if (res.ok) {
      await refreshEvents();
      await refreshAccounts();
    }
  } catch {
    /* ignore */
  } finally {
    set({ syncing: false });
  }
}
