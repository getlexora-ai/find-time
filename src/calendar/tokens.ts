import { Platform, type ViewStyle } from 'react-native';

/**
 * The calendar's design system — Nexus (docs/calendar-spec.md §1).
 *
 * Source: nexus-ai-data-pipeline-2.html and the "B · Nexus — Calendar" artboard.
 * One light theme, monochrome. Every colour has one meaning; components never
 * hard-code a colour, shadow, radius or size that is not in here.
 *
 * The landing page and the auth screens still use `@/design/tokens` (the old
 * dark system). Nothing in `src/calendar/` imports it, except the Ask panel,
 * which is deliberately the dark "terminal" card from the artboard.
 */

/* ───────────────────────── colour ───────────────────────── */

export const N = {
  /** page behind the frame */
  ground: '#FAFAFA',
  /** the framed column the app sits in */
  frame: 'rgba(255,255,255,0.6)',
  /** grid columns, cards, buttons */
  surface: '#FFFFFF',
  /** recessed fills: routine/break tiles, inputs, the all-day lane */
  sunken: '#F5F5F5',
  /** under the off-hours hatch: a breath off white, so "off" reads before the hatch does */
  offHours: '#FBFBFB',
  /** translucent white: the phone bar and the rail over the hatched ground, the block being drawn */
  glass: 'rgba(255,255,255,0.92)',
  glassSoft: 'rgba(255,255,255,0.5)',
  /** the dashed ghost a dragged tile leaves at its origin */
  ghostFill: 'rgba(250,250,250,0.6)',

  /** text, primary buttons, focus tiles, today's header cell */
  ink: '#171717',
  /** secondary text on white */
  ink2: '#525252',
  /** captions, day names */
  muted: '#737373',
  /** mono labels, hour numbers, corner brackets */
  faint: '#A3A3A3',
  /** disabled glyphs, the quietest marks */
  ghost: '#D4D4D4',

  /** every divider and hour line */
  line: 'rgba(229,229,229,0.9)',
  /** half-hour lines */
  lineSoft: 'rgba(229,229,229,0.45)',
  /** a line that has to read on white at a glance (inputs, outlines) */
  lineStrong: '#D4D4D4',
  /** the inset edge of a routine tile, on its grey hatch */
  lineInset: 'rgba(0,0,0,0.08)',

  /**
   * The one accent. Strokes and text only — never an area (user, 2026-10-01).
   * Used for: a proposal's dashed outline, the now-line hairline, clash marks.
   */
  accent: '#EA580C',
  /** accent as text on white (AA at 12px) */
  accentInk: '#C2410C',

  /** on an ink surface */
  onInk: '#FFFFFF',
  onInkMuted: '#A3A3A3',
  /** a glyph on a solid category tile (icons need 3:1, text gets onInk) */
  onSolidSoft: 'rgba(255,255,255,0.78)',

  /** wash under a hovered row/button */
  hover: 'rgba(23,23,23,0.04)',
  /** a hovered primary (ink) button */
  inkHover: '#262626',
  /** wash under a hovered control on an ink surface (the toast) */
  hoverOnInk: 'rgba(255,255,255,0.1)',
  pressed: 'rgba(23,23,23,0.07)',
  /** behind sheets and modals */
  scrim: 'rgba(10,10,10,0.28)',
} as const;

/** ink at an alpha — for the rare tint that has no named token. */
export const ink = (a: number) => `rgba(23,23,23,${a})`;

/** hex + alpha → rgba(). Used for a calendar's own Google colour. */
export const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ───────────────────────── type ───────────────────────── */

export const SANS = Platform.select({
  web: "'Google Sans Flex', 'Google Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
  default: undefined, // platform system face on native
}) as string | undefined;

export const MONO = Platform.select({
  web: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace",
  ios: 'Menlo',
  android: 'monospace',
  default: 'monospace',
}) as string;

/** Type roles (spec §1.2). Sizes are fixed; colour comes from the caller. */
export const T = {
  kpi: { fontSize: 30, lineHeight: 32, fontWeight: '600', letterSpacing: -0.9 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', letterSpacing: -0.3 },
  heading: { fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: -0.4 },
  body: { fontSize: 13, lineHeight: 18, fontWeight: '500' },
  tile: { fontSize: 12, lineHeight: 16, fontWeight: '500' },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '400' },
  meta: { fontSize: 10, lineHeight: 13, fontWeight: '400' },
  label: { fontSize: 10, lineHeight: 14, fontWeight: '500', letterSpacing: 0.6 },
} as const;

/* ───────────────────────── shape & depth ───────────────────────── */

export const R = { xs: 3, sm: 4, md: 6, lg: 8, xl: 12, full: 9999 } as const;

/**
 * The three Nexus shadows ("beautiful-shadows" skill), nothing else.
 *   sm — controls, meeting tiles, chips
 *   md — primary button, popovers
 *   lg — a tile while it is dragged, sheets
 * React Native ≥0.76 takes the CSS `boxShadow` string on web and native.
 */
export const SHADOW = {
  sm: {
    boxShadow:
      '0px 2px 3px -1px rgba(0,0,0,0.1), 0px 1px 0px 0px rgba(25,28,33,0.02), 0px 0px 0px 1px rgba(25,28,33,0.08)',
  },
  md: {
    boxShadow:
      '0px 0px 0px 1px rgba(0,0,0,0.06), 0px 1px 1px -0.5px rgba(0,0,0,0.06), 0px 3px 3px -1.5px rgba(0,0,0,0.06), 0px 6px 6px -3px rgba(0,0,0,0.06), 0px 12px 12px -6px rgba(0,0,0,0.06), 0px 24px 24px -12px rgba(0,0,0,0.06)',
  },
  lg: {
    boxShadow:
      '0px 2.8px 2.2px rgba(0,0,0,0.034), 0px 6.7px 5.3px rgba(0,0,0,0.048), 0px 12.5px 10px rgba(0,0,0,0.06), 0px 22.3px 17.9px rgba(0,0,0,0.072), 0px 41.8px 33.4px rgba(0,0,0,0.086), 0px 100px 80px rgba(0,0,0,0.12)',
  },
} as const satisfies Record<string, ViewStyle>;

/**
 * The 45° hatch — the Nexus texture. Three strengths, three meanings:
 *   ground  page behind the frame (2%)
 *   off     inside your hours but outside working hours (3.5%)
 *   tile    routine / break tiles (5%)
 * CSS-only, so web gets the pattern and native gets the flat fill under it.
 */
const hatch = (a: number, gap: number): ViewStyle =>
  Platform.select({
    web: {
      backgroundImage: `repeating-linear-gradient(-45deg, rgba(0,0,0,${a}) 0px, rgba(0,0,0,${a}) 1px, transparent 1px, transparent ${gap}px)`,
    } as unknown as ViewStyle,
    default: {},
  }) as ViewStyle;

const hatchLight = (a: number, gap: number): ViewStyle =>
  Platform.select({
    web: {
      backgroundImage: `repeating-linear-gradient(-45deg, rgba(255,255,255,${a}) 0px, rgba(255,255,255,${a}) 1px, transparent 1px, transparent ${gap}px)`,
    } as unknown as ViewStyle,
    default: {},
  }) as ViewStyle;

export const HATCH = {
  /** white hatch over a solid tile: routine / break (§12) */
  onSolid: hatchLight(0.14, 7),
  ground: hatch(0.02, 8),
  off: hatch(0.035, 6),
  tile: hatch(0.05, 5),
} as const;

/**
 * A tile that ended before now keeps its colour at this opacity (spec §3.3,
 * §12). Note: on the solids it puts the white title at ~2.2–2.7:1.
 */
export const PAST = 0.55;

/* ───────────────────────── motion ───────────────────────── */

export const MOTION = {
  press: 160,
  popover: 200,
  settle: 180,
  ease: 'cubic-bezier(.2,.8,.2,1)',
} as const;

/** Web-only CSS transition on hover/press props. No-op on native. */
export const TRANSITION = Platform.select({
  web: {
    transitionProperty: 'background-color, box-shadow, transform, opacity, border-color',
    transitionDuration: `${MOTION.press}ms`,
    transitionTimingFunction: MOTION.ease,
  } as unknown as ViewStyle,
  default: {},
}) as ViewStyle;

/* ───────────────────────── categories ───────────────────────── */

/**
 * Category colours — solids (docs/calendar-spec.md §12). They replace the black
 * and grey tiles: focus, routine and break are drawn as the solid with white
 * text. Every solid carries white text at ≥ 4.5:1. The white tiles (event,
 * task, proposal) keep their B shapes and show the colour as a small square.
 */
export type CatKey = 'deep' | 'design' | 'research' | 'sync' | 'admin';
export const CATS: Record<CatKey, { label: string; color: string }> = {
  deep: { label: 'Deep work', color: '#2563EB' },
  sync: { label: 'Meetings', color: '#7C3AED' },
  design: { label: 'Design', color: '#BE185D' },
  research: { label: 'Research', color: '#0F766E' },
  admin: { label: 'Admin', color: '#A16207' },
};

/** Breaks are recovery, not a category: one calm green of their own (white text 5.5:1). */
export const BREAK_COLOR = '#047857';
export const CAT_KEYS = Object.keys(CATS) as CatKey[];

/* ───────────────────────── time grid ───────────────────────── */

/** px per hour. 15 min = 14px, which is the smallest tile that can carry a title. */
export const ROW = 56;
/** minutes every create, move and resize snaps to */
export const SNAP = 15;
/** shortest block a gesture can make */
export const MIN_DUR = 15;
/** default length of a click-created block */
export const CLICK_DUR = 30;
/** pointer travel (px) before a press on a tile becomes a drag */
export const DRAG_SLOP = 4;
/** overlapping tiles drawn side by side before the rest collapse to "+n" */
export const MAX_COLS = 3;
/** narrowest a side-by-side tile may get; a narrower column draws fewer side by side */
export const MIN_TILE_W = 64;

/** Your hours, until the user sets them (spec §5). */
export const DEFAULT_WINDOW = { start: 6, end: 22 } as const;

/** the row pinned above / below the hours that holds "↑ 1 before 06:00" chips */
export const EDGE_ROW_H = 30;

export const GUTTER = 56;
export const GUTTER_PHONE = 42;
/** below this the week stops showing seven columns and scrolls three at a time */
export const MIN_COL = 88;

export const DESKTOP_BP = 1024;

export const durLabel = (m: number) =>
  m >= 60 ? (m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`) : `${m}m`;
