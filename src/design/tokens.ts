/**
 * Design tokens — ported verbatim from design/from_user/calendar-design-spec.md §1
 * and design/from_user/calendar.html. Every value here is an explicit number lifted
 * from the reference; do not "improve" it (HANDOFF.md §3).
 *
 * The reference is Tailwind + `cdn.tailwindcss.com`. This is a StyleSheet port, so the
 * class recipes become the numbers below. Tailwind scale used across the reference:
 *   text-[10px]/10  text-[11px]/11  text-xs/12  text-sm/14  text-base/16
 *   text-lg/18  text-xl/20  text-2xl/24  text-3xl/30
 *   p-1/4  p-1.5/6  p-2/8  p-2.5/10  p-3/12  p-4/16  p-5/20
 *   rounded/4  rounded-md/6  rounded-lg/8  rounded-xl/12  rounded-2xl/16  rounded-full/9999
 */

/** rgba(255,255,255,a) — the dark text/þorder ramp (spec §1.1). */
export const w = (a: number) => `rgba(255,255,255,${a})`;
/** rgba(18,18,18,a) — the #121212 ramp used on the light agenda (spec §1.1). */
export const ink = (a: number) => `rgba(18,18,18,${a})`;
/** hex + alpha → rgba(). Ported from calendar.html `rgba()`. */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Fixed colour tokens that never move with the background theme (spec §1.1). */
export const C = {
  canvas: '#2047e6',
  surface: '#121212',
  recessed: '#0e0e0e',
  otherMonth: '#0d0d0d',
  input: '#1d1d1d',
  light: '#f4f4f4',
  lightCard: '#ffffff',
  lightRecessed: '#ececec',
  lime: '#ccff00',
  limeHover: '#d7ff33',
  orange: '#ff4400',
  orangeOnLight: '#cc3600',
  /** "Protected" blue, lightened so it reads on the dark agenda (was #2047e6 on white). */
  protectedOnDark: '#6b86ff',
  hairline: 'rgba(255,255,255,0.10)',
  scrim: 'rgba(7,18,63,0.70)',
} as const;

/**
 * Landing-only fills, lifted verbatim from design/from_user/landing.html. They are
 * not part of the calendar's palette, so they sit apart from `C` rather than
 * widening it.
 */
export const LANDING = {
  /** `bg-[#1739bc]/95` — the three feature cards. */
  featureCard: 'rgba(23,57,188,0.95)',
  /** `bg-[#c8c8ff]` — the AI response block on the phone card. */
  aiResponse: '#c8c8ff',
  /** `bg-[#121212]/70` — the task-modal scrim. */
  modalScrim: 'rgba(18,18,18,0.70)',
  /** `bg-white/70` — the capacity panel on the light phone card. */
  phonePanel: 'rgba(255,255,255,0.70)',
} as const;

/** Category palette — five, deliberately; #ff4400 is held back for conflicts (spec §1.2). */
export type CatKey = 'deep' | 'design' | 'research' | 'sync' | 'admin';
export const CATS: Record<CatKey, { label: string; color: string }> = {
  deep: { label: 'Deep work', color: '#ccff00' },
  design: { label: 'Design', color: '#c8c8ff' },
  research: { label: 'Research', color: '#ffb39a' },
  sync: { label: 'Meetings', color: '#ffd600' },
  admin: { label: 'Admin', color: '#ff7040' },
};
export const CAT_KEYS = Object.keys(CATS) as CatKey[];

/** Time rhythm — must not drift (spec §1.4, calendar.html). */
export const DAY_START = 7;
export const DAY_END = 21;
export const ROW = 56; // px per hour
export const SNAP = 15; // minutes

/** Type scale (spec §1.3). fontFamily is applied globally in the screen. */
export const T = {
  micro: { fontSize: 10, lineHeight: 14 },
  mini: { fontSize: 11, lineHeight: 15 },
  xs: { fontSize: 12, lineHeight: 16 },
  sm: { fontSize: 14, lineHeight: 20 },
  base: { fontSize: 16, lineHeight: 24 },
  lg: { fontSize: 18, lineHeight: 26 },
  xl: { fontSize: 20, lineHeight: 26 },
  xl2: { fontSize: 24, lineHeight: 30 },
  xl3: { fontSize: 30, lineHeight: 36 },
} as const;

/** Radii (spec §1.4). */
export const R = {
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  xl2: 16,
  full: 9999,
} as const;

/** The one global focus ring (spec §6). */
export const FOCUS_RING = { outlineColor: C.lime, outlineWidth: 2, outlineStyle: 'solid' as const, outlineOffset: 2 };

/** Breakpoint between the mobile list world and the desktop grid world (spec §4). */
export const DESKTOP_BP = 1024;

export const durLabel = (m: number) =>
  m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`) : `${m}m`;
