/**
 * Date helpers — ported verbatim from design/from_user/calendar.html.
 * Monday-start weeks, ISO week numbers, minute math. Kept as `Date`-based (local
 * time) exactly like the reference so the seed fixtures and TODAY/NOW line up.
 */

export const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const WD_LONG = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
export const MO = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const sameDay = (a: Date, b: Date) => iso(a) === iso(b);
/** Monday-start week (spec §1.4). */
export const startOfWeek = (d: Date) => addDays(d, -((d.getDay() + 6) % 7));
export const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
export const fromMin = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function isoWeek(d: Date) {
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
  const first = new Date(t.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((t.getTime() - first.getTime()) / 86400000 - 3 + ((first.getDay() + 6) % 7)) / 7,
    )
  );
}

/** Weekday index with Monday = 0. */
export const wdIndex = (d: Date) => (d.getDay() + 6) % 7;
