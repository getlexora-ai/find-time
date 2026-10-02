/**
 * Client calls for onboarding, shared by the web (`src/auth/dom/Onboarding.tsx`)
 * and native (`src/auth/native/Onboarding.tsx`) screens.
 */
import { apiFetch } from '@/lib/api';

import type { Group, OnboardingAnswers, PreviewBlock, TrackAction, TrackStep } from './onboarding';

export type OnboardingState = {
  existing: boolean;
  answers: OnboardingAnswers | null;
  connected: boolean;
  meetings: PreviewBlock[] | null;
  weekOf: string | null;
};

export async function loadOnboarding(): Promise<OnboardingState | null> {
  try {
    const res = await apiFetch('/api/onboarding');
    if (!res.ok) return null;
    return (await res.json()) as OnboardingState;
  } catch {
    return null;
  }
}

/** Save (or skip). Throws with the server's message on failure. */
export async function saveOnboarding(
  body: { skip: true } | { answers: OnboardingAnswers; changed?: Group[] },
): Promise<{ saved: boolean }> {
  const res = await apiFetch('/api/onboarding', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; saved?: boolean };
  if (!res.ok) throw new Error(data.error ?? `Could not save (${res.status}).`);
  return { saved: Boolean(data.saved) };
}

/** Fire-and-forget drop-off event (db/022). Never throws, never awaited by the UI. */
export function track(step: TrackStep, action: TrackAction, client: 'web' | 'native' = 'web'): void {
  void apiFetch('/api/onboarding/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ step, action, client }),
  }).catch(() => {});
}

/** Pull connected calendars now (after a connect), so the preview shows them. */
export async function syncCalendars(): Promise<void> {
  try {
    await apiFetch('/api/calendar/sync?force=1', { method: 'POST' });
  } catch {
    // the preview falls back to whatever is already imported
  }
}
