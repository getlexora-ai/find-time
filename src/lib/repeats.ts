import { addDays, fromIso, startOfWeek, wdIndex } from '../calendar/cal-date';

/**
 * Repeat expansion, shared by the calendar grid (src/calendar/layout.ts) and the
 * server agent (src/server/agent/). Pure: no React Native imports.
 */

const BYDAY: Record<string, number> = { MO: 0, TU: 1, WE: 2, TH: 3, FR: 4, SA: 5, SU: 6 };

/**
 * Does a repeating event fall on `day`? A routine is stored once (its first
 * date plus an RRULE body); the grid used to draw only that first date, so a
 * weekly standup appeared in one week and vanished from every other.
 *
 * Supports what Find Time writes and what Google commonly sends:
 * FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY (weekly), COUNT, UNTIL.
 * Anything else falls back to the first date only — never a wrong guess.
 */
export function repeatsOn(ev: { date: string; rrule?: string | null; exdates?: string[] }, day: string): boolean {
  if (!ev.rrule) return ev.date === day;
  if (ev.exdates?.includes(day)) return false;
  if (day < ev.date) return false;
  if (day === ev.date) return true;

  const rule: Record<string, string> = {};
  for (const part of ev.rrule.replace(/^RRULE:/i, '').split(';')) {
    const [k, v] = part.split('=');
    if (k && v) rule[k.toUpperCase()] = v.toUpperCase();
  }
  const freq = rule.FREQ;
  const interval = Math.max(1, Number(rule.INTERVAL) || 1);
  if (rule.UNTIL) {
    const u = rule.UNTIL.slice(0, 8);
    const untilIso = `${u.slice(0, 4)}-${u.slice(4, 6)}-${u.slice(6, 8)}`;
    if (day > untilIso) return false;
  }

  const start = fromIso(ev.date);
  const target = fromIso(day);
  const days = Math.round((target.getTime() - start.getTime()) / 86_400_000);

  let hit: (d: Date, offset: number) => boolean;
  if (freq === 'DAILY') {
    hit = (_d, off) => off % interval === 0;
  } else if (freq === 'WEEKLY') {
    const by = rule.BYDAY
      ? rule.BYDAY.split(',')
          .map((d) => BYDAY[d.slice(-2)])
          .filter((n) => n !== undefined)
      : [wdIndex(start)];
    const weekOf = (d: Date) => Math.floor((startOfWeek(d).getTime() - startOfWeek(start).getTime()) / (7 * 86_400_000) + 0.5);
    hit = (d) => by.includes(wdIndex(d)) && weekOf(d) % interval === 0;
  } else if (freq === 'MONTHLY') {
    hit = (d) => {
      const months = (d.getFullYear() - start.getFullYear()) * 12 + d.getMonth() - start.getMonth();
      return d.getDate() === start.getDate() && months % interval === 0;
    };
  } else {
    return false;
  }

  if (!hit(target, days)) return false;
  if (!rule.COUNT) return true;
  // COUNT: this is the n-th occurrence only if fewer than COUNT came before it.
  const count = Number(rule.COUNT);
  let seen = 0;
  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i);
    if (i === 0 || hit(d, i)) seen++;
    if (seen > count) return false;
  }
  return true;
}

