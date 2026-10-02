/**
 * Every time in the app is wall-clock: 09:00 in Berlin is stored and compared
 * as `09:00Z` (see google/map.ts). So "now" has to be the user's wall-clock
 * too. `new Date()` is real UTC — two hours behind a Berlin summer clock — and
 * comparing it against wall-clock times offered a 09:00 slot at 09:30 and
 * let "postpone 1h" land an hour in the past.
 *
 * Pure: no DB. The route reads the zone (scheduler_profiles.timezone) and
 * passes it in; wall-clock.check.mjs runs this directly.
 */

export const DEFAULT_ZONE = 'Europe/Berlin';

/** The wall-clock reading of instant `ms` in `zone`, stamped `Z`. Null for an unknown zone. */
export function wallClockAt(ms: number, zone: string): string | null {
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(ms);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`;
  } catch {
    return null;
  }
}

/** Now on the user's clock, as epoch ms in the app's wall-clock convention. An unknown zone falls back to Berlin. */
export function wallClockNow(zone: string | null | undefined, at: number = Date.now()): number {
  const s = wallClockAt(at, zone || DEFAULT_ZONE) ?? wallClockAt(at, DEFAULT_ZONE)!;
  return Date.parse(s);
}
