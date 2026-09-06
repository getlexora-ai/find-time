/**
 * The 7 switchable backgrounds — ported from calendar.html `THEMES` +
 * `body[data-theme=…]` CSS. Only the ground moves; the interior palette is fixed
 * (spec §4, calendar-background-options.html).
 *
 * Panel-lift (spec §4): on every non-`electric` ground the `#121212` panels must
 * lift to ~`#17181d` with a lighter border, or they vanish into the darker canvas.
 * That is a real token here (`panel` / `recessed` / `otherMonth` / `panelBorder`),
 * not a one-off.
 */

export type ThemeKey = 'electric' | 'ink' | 'navy' | 'slate' | 'eclipse' | 'carbon' | 'graphite';

export type Theme = {
  key: ThemeKey;
  name: string;
  sw: string; // swatch in the menu
  tag: string;
  note: string;
  ground: string;
  gradTop: string;
  gradBottom: string;
  gradAngle: number; // degrees, for the SVG canvas gradient
  dot: string; // dot-grid colour
  chrome: string; // marquee / header / bottom-nav bar
  rail: string; // sidebar rail
  // interior surfaces — lifted on non-electric grounds
  panel: string;
  recessed: string;
  otherMonth: string;
  panelBorder: string;
};

const LIFT = {
  panel: '#17181d',
  recessed: '#131318',
  otherMonth: '#141419',
  panelBorder: 'rgba(255,255,255,0.14)',
};
const FLAT = {
  panel: '#121212',
  recessed: '#0e0e0e',
  otherMonth: '#0d0d0d',
  panelBorder: 'rgba(255,255,255,0.10)',
};

export const THEMES: Theme[] = [
  {
    key: 'electric',
    name: 'Electric (current)',
    sw: '#2047e6',
    tag: 'Current',
    note: 'Maximum energy — the loud one',
    ground: '#2047e6',
    gradTop: 'rgba(9,26,102,0.12)',
    gradBottom: 'rgba(32,71,230,0.96)',
    gradAngle: 135,
    dot: 'rgba(255,255,255,0.14)',
    chrome: 'rgba(23,58,191,0.90)',
    rail: 'rgba(23,58,191,0.30)',
    ...FLAT,
  },
  {
    key: 'ink',
    name: 'Ink',
    sw: '#0b0b0d',
    tag: 'Safe',
    note: 'Near-black; every accent pops',
    ground: '#0b0b0d',
    gradTop: '#16161b',
    gradBottom: '#0b0b0d',
    gradAngle: 160,
    dot: 'rgba(255,255,255,0.055)',
    chrome: 'rgba(20,20,24,0.85)',
    rail: 'rgba(16,16,20,0.55)',
    ...LIFT,
  },
  {
    key: 'navy',
    name: 'Deep Navy',
    sw: '#0a1126',
    tag: 'Pick',
    note: 'Still a blue app — calm, easy on the eyes',
    ground: '#0a1126',
    gradTop: '#0c1531',
    gradBottom: '#07091c',
    gradAngle: 160,
    dot: 'rgba(255,255,255,0.07)',
    chrome: 'rgba(20,36,95,0.88)',
    rail: 'rgba(14,24,52,0.45)',
    ...LIFT,
  },
  {
    key: 'slate',
    name: 'Slate',
    sw: '#161a22',
    tag: 'Safe',
    note: 'Desaturated blue-grey; neutral SaaS',
    ground: '#161a22',
    gradTop: '#1b202b',
    gradBottom: '#111419',
    gradAngle: 160,
    dot: 'rgba(255,255,255,0.07)',
    chrome: 'rgba(32,36,46,0.88)',
    rail: 'rgba(26,31,39,0.50)',
    ...LIFT,
  },
  {
    key: 'eclipse',
    name: 'Eclipse',
    sw: '#111a4d',
    tag: 'Brand',
    note: 'The current hue at ~20% brightness',
    ground: '#111a4d',
    gradTop: '#16215e',
    gradBottom: '#0d1340',
    gradAngle: 160,
    dot: 'rgba(255,255,255,0.09)',
    chrome: 'rgba(28,47,143,0.90)',
    rail: 'rgba(20,29,84,0.45)',
    ...LIFT,
  },
  {
    key: 'carbon',
    name: 'Warm Carbon',
    sw: '#141110',
    tag: 'Character',
    note: 'Warm near-black; lime and coral glow',
    ground: '#141110',
    gradTop: '#1d1713',
    gradBottom: '#120f0d',
    gradAngle: 160,
    dot: 'rgba(255,255,255,0.05)',
    chrome: 'rgba(26,22,19,0.86)',
    rail: 'rgba(23,19,16,0.50)',
    ...LIFT,
  },
  {
    key: 'graphite',
    name: 'Graphite + blue frame',
    sw: '#141416',
    tag: 'Balanced',
    note: 'Neutral field; blue kept as a frame accent',
    ground: '#141416',
    gradTop: 'rgba(28,47,143,0.40)',
    gradBottom: 'rgba(20,20,22,0)',
    gradAngle: 180,
    dot: 'rgba(255,255,255,0.055)',
    chrome: 'rgba(23,58,191,0.85)',
    rail: 'rgba(23,24,29,0.55)',
    ...LIFT,
  },
];

export const THEME_BY_KEY: Record<ThemeKey, Theme> = THEMES.reduce(
  (acc, t) => ({ ...acc, [t.key]: t }),
  {} as Record<ThemeKey, Theme>,
);

export const DEFAULT_THEME: ThemeKey = 'electric';
export const STORAGE_KEY = 'ft-theme';
