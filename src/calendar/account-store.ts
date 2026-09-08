import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';

import type { AccountsResponse, ApiAccount } from '@/lib/api-types';

import { refresh as refreshEvents } from './cal-store';

/**
 * Store for the sidebar "Calendars" panel: the signed-in Google user, their
 * connected accounts + calendars, and the connect / disconnect / toggle / sync
 * actions. Same `useSyncExternalStore` surface as `cal-store.ts`.
 *
 * Every mutation that can change which events exist ends by re-fetching the
 * event store, so the grid updates without a reload.
 */

const BASE = process.env.EXPO_PUBLIC_API_URL ?? '';

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
    const res = await fetch(`${BASE}/api/calendar/accounts`);
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

/** Start "Sign in with Google" (web only — native shows a hint instead). */
export function connect(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.location.assign(`${BASE}/api/auth/google/start`);
}

export async function signOut(): Promise<void> {
  try {
    await fetch(`${BASE}/api/auth/logout`, { method: 'POST' });
  } catch {
    /* ignore */
  }
  set({ signedIn: false, user: null, accounts: [] });
  await refreshEvents();
}

export async function disconnect(accountId: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/calendar/accounts/${accountId}`, { method: 'DELETE' });
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
    const res = await fetch(`${BASE}/api/calendar/calendars/${calendarId}`, {
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
  if (!state.signedIn || state.syncing) return;
  if (!force && Date.now() - lastSync < 30_000) return;
  lastSync = Date.now();
  set({ syncing: true });
  try {
    const res = await fetch(`${BASE}/api/calendar/sync${force ? '?force=1' : ''}`, { method: 'POST' });
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

// Kick off the first load.
void refreshAccounts();
