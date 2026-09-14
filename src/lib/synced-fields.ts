/**
 * Which fields of an event Google owns.
 *
 * Imported events come from src/server/google/sync.ts, which only pulls.
 * Whenever a Google event changes, and on every full re-sync, `upsertEvent`
 * rewrites its title, description and times from the provider copy, and it
 * clears `deleted_at` on anything Google still has. Nothing is ever pushed
 * back. So an edit to one of these fields on an imported event never reaches
 * the calendar that matters, and is eventually overwritten in the one that
 * doesn't. The honest behaviour is to refuse it up front.
 *
 * Shared by the calendar (to hide the controls and refuse the write before it
 * shows on screen) and the API route (to reject it for any client), so the two
 * cannot disagree. No imports, so the check harness can load it directly.
 *
 * What stays editable is Find time's own metadata about an event — whether it
 * is protected, its category, its project — none of which sync touches.
 */

export const IMPORTED_ORIGIN = 'imported';

/**
 * EventInput keys that may not be written on an imported event.
 *
 * `origin` is not overwritten by sync, but letting it change would strip the
 * event of the one marker that says Google owns it, after which every lock here
 * silently stops applying.
 */
export const PROVIDER_OWNED_FIELDS = ['title', 'start', 'end', 'notes', 'origin'] as const;

export const IMPORTED_LOCKED_MESSAGE = 'This event is synced from Google Calendar. Change it there.';

export function isImported(origin: string | null | undefined): boolean {
  return origin === IMPORTED_ORIGIN;
}

/**
 * The fields in `patch` that may not be changed on an event with this origin.
 * Empty means the write is allowed. Presence is what counts, not value: a patch
 * that sets `notes: null` is still an attempt to change the notes.
 */
export function lockedFields(
  origin: string | null | undefined,
  patch: Record<string, unknown>,
): string[] {
  if (!isImported(origin)) return [];
  return PROVIDER_OWNED_FIELDS.filter((k) => k in patch);
}
