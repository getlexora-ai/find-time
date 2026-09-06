/**
 * Generates the Find Time app icon set from the "O — hex aperture" mark.
 *
 * The mark is the outline the user picked in ~/Downloads/Find-time/extracted/
 * combos.html ("Set 1 · O — hex aperture", first 120x120 tile). That trace fakes
 * its straight hexagon edges with 224 tiny cubic Beziers, so it looks bumpy from
 * across a room. This script keeps the exact drawn shape but rebuilds each edge
 * as one straight line: flatten every curve -> Ramer-Douglas-Peucker simplify ->
 * merge near-collinear segments -> emit M..L..Z.
 *
 * Source trace lives next to this output as assets/logo/mark-raw.svg.
 * Run: node scripts/gen-icon.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const p = (...s) => resolve(root, ...s);

// ── colourway ──────────────────────────────────────────────────────────────
const GROUND = '#2047e6'; // electric blue — matches splash + combos.html "white on blue" tile
const WHITE = '#ffffff';
const INK = '#121212';

// ── 1. straighten the trace ────────────────────────────────────────────────
const RAW = readFileSync(p('assets/logo/mark-raw.svg'), 'utf8');
const RAW_D = /\bd="([^"]+)"/.exec(RAW)[1];

/** Parse an absolute-command path (M/L/C/Z, the shapes this trace uses) into
 *  subpaths of {x,y} points; every C is flattened to `N` line segments. */
function parsePath(d) {
  if (/[mlczhvsqta]/.test(d)) throw new Error('relative/unhandled path command in trace');
  const toks = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/gi);
  const subs = [];
  let cur = null;
  let x = 0;
  let y = 0;
  let i = 0;
  let cmd = '';
  const num = () => Number(toks[i++]);
  while (i < toks.length) {
    if (/[MLCZ]/i.test(toks[i])) cmd = toks[i++].toUpperCase();
    if (cmd === 'Z') continue; // rebuild closes the ring
    if (cmd === 'M') {
      x = num();
      y = num();
      cur = [{ x, y }];
      subs.push(cur);
      cmd = 'L'; // extra pairs after M are implicit L
    } else if (cmd === 'L') {
      x = num();
      y = num();
      cur.push({ x, y });
    } else if (cmd === 'C') {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const ex = num();
      const ey = num();
      const N = 16;
      for (let t = 1; t <= N; t++) {
        const u = t / N;
        const m = 1 - u;
        cur.push({
          x: m * m * m * x + 3 * m * m * u * x1 + 3 * m * u * u * x2 + u * u * u * ex,
          y: m * m * m * y + 3 * m * m * u * y1 + 3 * m * u * u * y2 + u * u * u * ey,
        });
      }
      x = ex;
      y = ey;
    }
  }
  return subs;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [a, b] = [pts[0], pts[pts.length - 1]];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let maxD = -1;
  let idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs(dy * pts[i].x - dx * pts[i].y + b.x * a.y - b.y * a.x) / len;
    if (d > maxD) {
      maxD = d;
      idx = i;
    }
  }
  if (maxD <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

/** Drop a vertex of a closed ring when its two edges point within `degTol`
 *  degrees of each other (each real hexagon edge collapses to one segment). */
function mergeCollinear(pts, degTol) {
  const tol = (degTol * Math.PI) / 180;
  const bend = (a, b, c) => {
    let d = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(c.y - b.y, c.x - b.x));
    return d > Math.PI ? 2 * Math.PI - d : d;
  };
  let out = pts.slice();
  for (let pass = 0; pass < 3; pass++) {
    const next = [];
    for (let i = 0; i < out.length; i++) {
      const a = next.length ? next[next.length - 1] : out[(i - 1 + out.length) % out.length];
      const b = out[i];
      const c = out[(i + 1) % out.length];
      if (bend(a, b, c) > tol) next.push(b);
    }
    if (next.length === out.length) return next;
    out = next;
  }
  return out;
}

/** RDP on a closed ring: drop the duplicate closing point, break the loop at the
 *  vertex farthest from p0 (RDP degenerates when its two endpoints coincide),
 *  simplify each arc, then stitch back. */
function rdpClosed(pts, eps) {
  let r = pts.slice();
  if (r.length > 1 && Math.hypot(r[0].x - r.at(-1).x, r[0].y - r.at(-1).y) < 1e-6) r.pop();
  let far = 1;
  let farD = -1;
  for (let i = 1; i < r.length; i++) {
    const d = Math.hypot(r[i].x - r[0].x, r[i].y - r[0].y);
    if (d > farD) {
      farD = d;
      far = i;
    }
  }
  const a = rdp(r.slice(0, far + 1), eps);
  const b = rdp([...r.slice(far), r[0]], eps);
  return [...a.slice(0, -1), ...b.slice(0, -1)];
}

const EPS = 0.6; // in the 120-unit box
const DEG = 4;
const round = (n) => Math.round(n * 100) / 100;
const straightD = parsePath(RAW_D)
  .map((sub) => {
    const s = mergeCollinear(rdpClosed(sub, EPS), DEG);
    return 'M' + s.map((q) => `${round(q.x)} ${round(q.y)}`).join(' L ') + ' Z';
  })
  .join(' ');

const corners = straightD.match(/L/g).length + straightD.match(/M/g).length;
console.log(`straightened: ${RAW_D.length} chars / 224 curves  ->  ${straightD.length} chars / ${corners} corners`);

// ── 2. SVG masters ─────────────────────────────────────────────────────────
mkdirSync(p('assets/logo'), { recursive: true });
const svg = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><path fill-rule="evenodd" fill="${fill}" d="${straightD}"/></svg>`;
const masters = {
  'mark.svg': svg('currentColor'),
  'mark-white.svg': svg(WHITE),
  'mark-ink.svg': svg(INK),
};
for (const [name, body] of Object.entries(masters)) writeFileSync(p('assets/logo', name), body + '\n');

// mark centred + scaled inside the 120 box; optional ground behind it
const markSvg = (markFill, scale, bg) => {
  const off = (120 - 120 * scale) / 2;
  const ground = bg ? `<rect width="120" height="120" fill="${bg}"/>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">${ground}<g transform="translate(${round(off)} ${round(off)}) scale(${scale})"><path fill-rule="evenodd" fill="${markFill}" d="${straightD}"/></g></svg>`;
};
const tileSvg = (bg, markFill, scale = 0.6) => markSvg(markFill, scale, bg);

// ── 3. raster ──────────────────────────────────────────────────────────────
const png = (svgStr, size, out, flat) => {
  let s = sharp(Buffer.from(svgStr), { density: 384 }).resize(size, size, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  if (flat) s = s.flatten({ background: flat }); // iOS/Android grounds must be opaque
  return s
    .png()
    .toFile(p('assets/images', out))
    .then(() => console.log(`  ${out}  ${size}x${size}${flat ? '  opaque' : ''}`));
};

await Promise.all([
  png(tileSvg(GROUND, WHITE, 0.58), 1024, 'icon.png', GROUND),
  png(markSvg(WHITE, 0.62), 1024, 'android-icon-foreground.png'), // inside adaptive-icon safe area
  png(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1" fill="${GROUND}"/></svg>`, 1024, 'android-icon-background.png', GROUND),
  png(markSvg('#000000', 0.62), 1024, 'android-icon-monochrome.png'),
  png(tileSvg(GROUND, WHITE, 0.62), 196, 'favicon.png', GROUND),
  png(markSvg(WHITE, 0.92), 512, 'splash-icon.png'),
]);

console.log('done.');
