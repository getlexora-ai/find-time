/**
 * Time math lives in code, not in the model (ported from find-time-agent's
 * dates.ts). The model only ever reads and writes wall-clock times in the
 * user's zone — "2026-10-02T09:00" — and resolves "next Tuesday" from the date
 * table, never by its own arithmetic.
 */

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayIn(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(now); // YYYY-MM-DD
}

/** Minutes since local midnight in `timeZone`. */
export function nowMinutesIn(timeZone: string, now = new Date()): number {
  const hm = now.toLocaleTimeString('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  return Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));
}

/** "Thursday 2026-10-01 (today)" lines for the next `days` days. */
export function dateTable(timeZone: string, now = new Date(), days = 21): string {
  const today = todayIn(timeZone, now);
  const lines: string[] = [];
  for (let i = 0; i <= days; i++) {
    const iso = addDays(today, i);
    const weekday = new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
    lines.push(`${weekday} ${iso}${i === 0 ? ' (today)' : i === 1 ? ' (tomorrow)' : ''}`);
  }
  return lines.join('\n');
}

/** "2026-10-02T09:00" → "Fri 2 Oct, 09:00"; a bare date → "Fri 2 Oct (all day)". */
export function when(local: string): string {
  if (local.length === 10) {
    return `${new Date(`${local}T00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })} (all day)`;
  }
  return new Date(`${local.slice(0, 16)}:00Z`).toLocaleString('en-GB', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const span = (start: string, end: string) =>
  `${when(start)}–${end.slice(0, 10) === start.slice(0, 10) ? end.slice(11, 16) : when(end)}`;

export const toMin = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const toHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
