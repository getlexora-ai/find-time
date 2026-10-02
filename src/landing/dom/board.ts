/**
 * The 3D week board — one persistent three.js world behind the hero and the
 * story (skills: threejs, build-threejs-scroll-worlds).
 *
 * One job: show a week being planned, with depth doing the explaining.
 * - Meetings are slabs set into the board.
 * - Proposals hover above it, casting soft shadows — not booked yet.
 * - Accepting drops them into place; that is the product's promise
 *   ("nothing lands until you say yes") acted out.
 *
 * React owns *what* is on the board (`setTiles`); this module only animates
 * the difference. Labels are canvas textures painted in the page's own fonts.
 * Rendering pauses offscreen and in hidden tabs; everything is disposed on
 * unmount; a lost context hands over to the DOM week (`onFail`).
 */
import { gsap } from 'gsap';
import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  SRGBColorSpace,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

import { DAYS, DAY_END, DAY_START, clock, dur } from './week-data';

export type BoardKind = 'meet' | 'away' | 'thesis' | 'gym' | 'new' | 'user';
export type BoardTile = {
  id: string;
  day: number;
  s: number;
  e: number;
  title: string;
  kind: BoardKind;
  state: 'proposal' | 'solid';
};
export type BoardMark = { id: string; day: number; s: number; e: number; kind: 'free' | 'crumb' };
export type BoardView = 'hero' | 'story';

export type Board = {
  setTiles: (tiles: BoardTile[]) => void;
  setMarks: (marks: BoardMark[]) => void;
  setView: (view: BoardView) => void;
  dispose: () => void;
};

/* ── geometry of the board (world units) ───────────────────────── */
const COL = 2;
const GUT = 0.95;
const HDR = 0.8;
const HOUR = 0.5;
const PAD = 0.28;
const HOURS = (DAY_END - DAY_START) / 60;
const BW = PAD * 2 + GUT + DAYS.length * COL;
const BD = PAD * 2 + HDR + HOURS * HOUR;
const T = 0.17; // tile thickness
const FLOAT = 0.62; // proposal hover height
const PX = 230; // texture pixels per world unit

const colX = (day: number) => -BW / 2 + PAD + GUT + day * COL + COL / 2;
const minZ = (m: number) => -BD / 2 + PAD + HDR + ((m - DAY_START) / 60) * HOUR;

/* ── palette (src/calendar/tokens.ts) ───────────────────────────── */
const INK = '#171717';
const INK2 = '#525252';
const MUTED = '#737373';
const FAINT = '#a3a3a3';
const LINE = '#ececec';
const ACCENT = '#ea580c';
const ACCENT_INK = '#c2410c';
const TINT: Record<BoardKind, string> = {
  meet: '#eae0fc',
  new: '#eae0fc',
  thesis: '#dce6fc',
  user: '#dce6fc',
  gym: '#d9e9e8',
  away: '#f2f2f2',
};
const SANS = "'Google Sans Flex', 'Google Sans', system-ui, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, Menlo, monospace";

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(w));
  c.height = Math.max(2, Math.round(h));
  return c;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function hatch(g: CanvasRenderingContext2D, w: number, h: number, color: string, gap: number) {
  g.save();
  g.strokeStyle = color;
  g.lineWidth = 2;
  for (let x = -h; x < w; x += gap) {
    g.beginPath();
    g.moveTo(x, h);
    g.lineTo(x + h, 0);
    g.stroke();
  }
  g.restore();
}

export async function mountBoard(
  host: HTMLElement,
  opts: { offsetX: () => number; onFail: () => void },
): Promise<Board> {
  await document.fonts?.ready;

  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.className = 'board-gl';
  host.appendChild(renderer.domElement);
  const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new Scene();
  const camera = new PerspectiveCamera(28, 1, 0.1, 100);
  const look = new Vector3(0, 0, 0.2);

  scene.add(new HemisphereLight(0xffffff, 0xdcdce4, 1.75));
  const sun = new DirectionalLight(0xffffff, 1.6);
  sun.position.set(-3.5, 11, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  sun.shadow.bias = -0.0004;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 7, bottom: -7, near: 1, far: 30 });
  scene.add(sun);

  const disposables: { dispose: () => void }[] = [];
  const keep = <D extends { dispose: () => void }>(d: D) => (disposables.push(d), d);

  // the whole board tilts as one
  const world = new Group();
  scene.add(world);

  /* ── base slab + face ─────────────────────────────────────────── */
  const base = new Mesh(
    keep(new RoundedBoxGeometry(BW, 0.3, BD, 5, 0.22)),
    keep(new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9 })),
  );
  base.position.y = -0.15;
  base.receiveShadow = true;
  world.add(base);

  const faceTex = keep(new CanvasTexture(paintFace()));
  faceTex.colorSpace = SRGBColorSpace;
  faceTex.anisotropy = maxAniso;
  const face = new Mesh(
    keep(new PlaneGeometry(BW - 0.04, BD - 0.04)),
    keep(new MeshStandardMaterial({ map: faceTex, roughness: 1 })),
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.002;
  face.receiveShadow = true;
  world.add(face);

  const floor = new Mesh(keep(new PlaneGeometry(40, 40)), keep(new ShadowMaterial({ opacity: 0.12 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.31;
  floor.receiveShadow = true;
  world.add(floor);

  function paintFace() {
    const c = canvas(BW * PX, BD * PX);
    const g = c.getContext('2d')!;
    const u = (v: number) => v * PX;
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, c.width, c.height);
    // header
    g.textBaseline = 'middle';
    DAYS.forEach((d, i) => {
      const x = u(PAD + GUT + i * COL + 0.18);
      const y = u(PAD + HDR / 2);
      g.font = `400 ${u(0.26)}px ${SANS}`;
      g.fillStyle = MUTED;
      g.fillText(d.short, x, y);
      const w = g.measureText(d.short + ' ').width;
      g.font = `600 ${u(0.26)}px ${SANS}`;
      g.fillStyle = INK;
      g.fillText(String(d.num), x + w, y);
    });
    // grid
    g.strokeStyle = LINE;
    g.lineWidth = 3;
    const top = u(PAD + HDR);
    const bottom = u(BD - PAD);
    g.beginPath();
    g.moveTo(u(PAD), top);
    g.lineTo(u(BW - PAD), top);
    g.stroke();
    for (let i = 0; i <= DAYS.length; i++) {
      const x = u(PAD + GUT + i * COL);
      g.beginPath();
      g.moveTo(x, u(PAD));
      g.lineTo(x, bottom);
      g.stroke();
    }
    g.lineWidth = 2;
    g.font = `400 ${u(0.17)}px ${MONO}`;
    g.fillStyle = FAINT;
    g.textAlign = 'right';
    for (let h = 0; h < HOURS; h++) {
      const y = top + u(h * HOUR);
      if (h > 0) {
        g.strokeStyle = '#f3f3f3';
        g.beginPath();
        g.moveTo(u(PAD + GUT), y);
        g.lineTo(u(BW - PAD), y);
        g.stroke();
      }
      g.fillText(clock(DAY_START + h * 60), u(PAD + GUT - 0.14), y + u(0.14));
    }
    return c;
  }

  /* ── tiles ────────────────────────────────────────────────────── */
  type Live = {
    tile: BoardTile;
    group: Group;
    body: Mesh;
    label: Mesh;
    bodyMat: MeshStandardMaterial;
    labelMat: MeshBasicMaterial;
    tex: CanvasTexture;
    phase: number;
    floating: number; // 0 seated … 1 hovering, tweened
  };
  const live = new Map<string, Live>();

  function paintTile(t: BoardTile, w: number, d: number) {
    const c = canvas(w * PX, d * PX);
    const g = c.getContext('2d')!;
    const r = 0.07 * PX;
    const proposal = t.state === 'proposal';
    if (proposal) {
      g.fillStyle = 'rgba(255,255,255,0.97)';
      roundRect(g, 3, 3, c.width - 6, c.height - 6, r);
      g.fill();
      g.setLineDash([16, 10]);
      g.lineWidth = 6;
      g.strokeStyle = ACCENT;
      roundRect(g, 5, 5, c.width - 10, c.height - 10, r);
      g.stroke();
    } else if (t.kind === 'away') {
      g.fillStyle = TINT.away;
      g.fillRect(0, 0, c.width, c.height);
      hatch(g, c.width, c.height, 'rgba(0,0,0,0.07)', 16);
    } else if (t.kind === 'new') {
      g.lineWidth = 7;
      g.strokeStyle = ACCENT;
      roundRect(g, 4, 4, c.width - 8, c.height - 8, r);
      g.stroke();
    }
    const short = t.e - t.s <= 60;
    const pad = 0.12 * PX;
    const title = 0.2 * PX;
    g.textBaseline = 'top';
    g.font = `600 ${title}px ${SANS}`;
    g.fillStyle = proposal ? ACCENT_INK : t.kind === 'away' ? MUTED : INK;
    const maxW = c.width - pad * 2;
    let text = t.title;
    while (g.measureText(text).width > maxW && text.length > 3) text = text.slice(0, -2);
    if (text !== t.title) text = text.trimEnd() + '…';
    const ty = short ? (c.height - title) / 2 : pad * 0.9;
    g.fillText(text, pad, ty);
    if (!short && t.kind !== 'away') {
      g.font = `400 ${0.165 * PX}px ${SANS}`;
      g.fillStyle = proposal ? ACCENT_INK : INK2;
      g.fillText(`${clock(t.s)}–${clock(t.e)}`, pad, ty + title * 1.3);
    }
    return c;
  }

  function build(t: BoardTile): Live {
    const w = COL - 0.14;
    const d = ((t.e - t.s) / 60) * HOUR - 0.05;
    const group = new Group();
    const bodyMat = new MeshStandardMaterial({
      color: t.state === 'proposal' ? '#ffffff' : TINT[t.kind],
      roughness: 0.55,
      transparent: true,
    });
    const body = new Mesh(new RoundedBoxGeometry(w, T, d, 3, 0.05), bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    const tex = new CanvasTexture(paintTile(t, w, d));
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = maxAniso;
    const labelMat = new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    const label = new Mesh(new PlaneGeometry(w - 0.02, d - 0.02), labelMat);
    label.rotation.x = -Math.PI / 2;
    label.position.y = T / 2 + 0.003;
    group.add(body, label);
    group.position.set(colX(t.day), T / 2 + 0.004, minZ(t.s) + d / 2 + 0.025);
    world.add(group);
    return { tile: t, group, body, label, bodyMat, labelMat, tex, phase: Math.random() * 6, floating: 0 };
  }

  function repaint(l: Live) {
    const w = COL - 0.14;
    const d = ((l.tile.e - l.tile.s) / 60) * HOUR - 0.05;
    // a new size needs fresh texture storage, or the old pixels show through
    l.tex.dispose();
    l.tex.image = paintTile(l.tile, w, d);
    l.tex.needsUpdate = true;
  }

  function drop(l: Live) {
    l.group.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as Material).dispose();
      }
    });
    l.tex.dispose();
    world.remove(l.group);
  }

  const setTiles = (tiles: BoardTile[]) => {
    const next = new Map(tiles.map((t) => [t.id, t]));
    // leaving: lift and fade
    live.forEach((l, id) => {
      if (next.has(id)) return;
      live.delete(id);
      gsap.to(l.group.position, { y: '+=0.9', duration: 0.5, ease: 'power2.in' });
      gsap.to([l.bodyMat, l.labelMat], {
        opacity: 0,
        duration: 0.45,
        ease: 'power2.in',
        onComplete: () => drop(l),
      });
    });
    let i = 0;
    next.forEach((t, id) => {
      const had = live.get(id);
      if (!had) {
        const l = build(t);
        live.set(id, l);
        const delay = 0.05 * i++;
        if (t.state === 'proposal') {
          // arrives from above and hangs, not yet booked
          l.floating = 1;
          l.group.position.y += 2.4;
          l.bodyMat.opacity = 0;
          l.labelMat.opacity = 0;
          gsap.to(l.group.position, { y: T / 2 + 0.004 + FLOAT, duration: 1.1, delay, ease: 'expo.out' });
          gsap.to([l.bodyMat, l.labelMat], { opacity: 1, duration: 0.5, delay });
        } else {
          // already on the calendar: rises out of the board
          l.group.scale.y = 0.01;
          l.bodyMat.opacity = 0;
          l.labelMat.opacity = 0;
          gsap.to(l.group.scale, { y: 1, duration: 0.7, delay, ease: 'power3.out' });
          gsap.to([l.bodyMat, l.labelMat], { opacity: 1, duration: 0.5, delay });
        }
        return;
      }
      const was = had.tile;
      had.tile = t;
      if (was.state !== t.state) {
        repaint(had);
        if (t.state === 'solid') {
          // the yes: drop, settle, take colour
          gsap.to(had, { floating: 0, duration: 0.55, delay: 0.06 * i++, ease: 'power3.in' });
          const to = new Color(TINT[t.kind]);
          gsap.to(had.bodyMat.color, { r: to.r, g: to.g, b: to.b, duration: 0.5, delay: 0.35 });
          gsap.fromTo(
            had.group.scale,
            { y: 1 },
            { y: 0.72, duration: 0.09, delay: 0.55 + 0.06 * (i - 1), yoyo: true, repeat: 1, ease: 'power1.out' },
          );
        } else {
          gsap.to(had, { floating: 1, duration: 0.8, ease: 'expo.out' });
          had.bodyMat.color.set('#ffffff');
        }
      }
      if (was.e !== t.e || was.s !== t.s) {
        // resized by a replan: rebuild at the new length, tween from the old
        const oldD = ((was.e - was.s) / 60) * HOUR - 0.05;
        const d = ((t.e - t.s) / 60) * HOUR - 0.05;
        had.body.geometry.dispose();
        had.body.geometry = new RoundedBoxGeometry(COL - 0.14, T, d, 3, 0.05);
        had.label.geometry.dispose();
        had.label.geometry = new PlaneGeometry(COL - 0.16, d - 0.02);
        repaint(had);
        const z = minZ(t.s) + d / 2 + 0.025;
        gsap.fromTo(had.group.scale, { z: oldD / d }, { z: 1, duration: 0.8, ease: 'power3.inOut' });
        gsap.fromTo(
          had.group.position,
          { z: minZ(was.s) + oldD / 2 + 0.025 },
          { z, duration: 0.8, ease: 'power3.inOut' },
        );
      }
    });
  };

  /* ── marks: free stretches and crumbs, painted flat on the face ── */
  const marks = new Map<string, { mesh: Mesh; mat: MeshBasicMaterial; tex: CanvasTexture }>();
  const setMarks = (list: BoardMark[]) => {
    const want = new Set(list.map((m) => m.id));
    marks.forEach((m, id) => {
      if (want.has(id)) return;
      marks.delete(id);
      gsap.to(m.mat, {
        opacity: 0,
        duration: 0.4,
        onComplete: () => {
          m.mesh.geometry.dispose();
          m.mat.dispose();
          m.tex.dispose();
          world.remove(m.mesh);
        },
      });
    });
    list.forEach((mk, i) => {
      if (marks.has(mk.id)) return;
      const w = COL - 0.1;
      const d = ((mk.e - mk.s) / 60) * HOUR - 0.03;
      const c = canvas(w * PX, d * PX);
      const g = c.getContext('2d')!;
      if (mk.kind === 'free') {
        g.fillStyle = 'rgba(37,99,235,0.05)';
        g.fillRect(0, 0, c.width, c.height);
        hatch(g, c.width, c.height, 'rgba(37,99,235,0.14)', 18);
        g.setLineDash([12, 9]);
        g.lineWidth = 4;
        g.strokeStyle = 'rgba(37,99,235,0.6)';
        roundRect(g, 3, 3, c.width - 6, c.height - 6, 14);
        g.stroke();
        g.font = `500 ${0.16 * PX}px ${MONO}`;
        g.fillStyle = '#2563eb';
        g.textBaseline = 'top';
        g.fillText(`${dur(mk.e - mk.s)} free`, 0.1 * PX, 0.08 * PX);
      } else {
        g.setLineDash([10, 8]);
        g.lineWidth = 5;
        g.strokeStyle = ACCENT;
        roundRect(g, 3, 3, c.width - 6, c.height - 6, 8);
        g.stroke();
      }
      const tex = new CanvasTexture(c);
      tex.colorSpace = SRGBColorSpace;
      tex.anisotropy = maxAniso;
      const mat = new MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new Mesh(new PlaneGeometry(w, d), mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(colX(mk.day), 0.006, minZ(mk.s) + d / 2 + 0.015);
      world.add(mesh);
      marks.set(mk.id, { mesh, mat, tex });
      gsap.to(mat, { opacity: 1, duration: 0.6, delay: 0.03 * i });
    });
  };

  /* ── camera: fit the board into the visible part of the canvas ── */
  let view: BoardView = 'hero';
  const cam = { el: window.innerWidth < 700 ? 62 : 52, dist: 20, x: 0 };
  let W = 1;
  let H = 1;
  function fitDist(el: number) {
    const aspect = W / H;
    const visible = 1 - Math.abs(opts.offsetX()) * 2;
    const vf = (camera.fov * Math.PI) / 360;
    const hf = Math.atan(Math.tan(vf) * aspect * visible);
    const narrow = W < 700;
    const byW = (BW * (narrow ? 0.5 : 0.64)) / Math.tan(hf);
    const depth = BD * Math.sin((el * Math.PI) / 180) + 1.2 * Math.cos((el * Math.PI) / 180);
    const byH = (depth * (narrow ? 0.52 : 0.6)) / Math.tan(vf);
    return Math.max(byW, byH);
  }
  function resize() {
    const r = host.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    renderer.setSize(W, H, false);
    camera.aspect = W / H;
    const off = opts.offsetX();
    if (off) camera.setViewOffset(W, H, -off * W, 0, W, H);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    cam.dist = fitDist(cam.el);
  }
  const setView = (v: BoardView) => {
    if (v === view) return;
    view = v;
    const el = (v === 'hero' ? 52 : 62) + (W < 700 ? 10 : 0);
    gsap.to(cam, { el, dist: fitDist(el), duration: 1.4, ease: 'power3.inOut' });
  };

  /* ── pointer tilt (fine pointers) ─────────────────────────────── */
  const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    tilt.tx = (e.clientX / window.innerWidth - 0.5) * 2;
    tilt.ty = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  /* ── loop: only while on screen and the tab is visible ────────── */
  let visible = true;
  let raf = 0;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) start();
  });
  io.observe(host);
  const onVis = () => !document.hidden && start();
  document.addEventListener('visibilitychange', onVis);

  const t0 = performance.now();
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    const t = (performance.now() - t0) / 1000;
    tilt.x += (tilt.tx - tilt.x) * 0.05;
    tilt.y += (tilt.ty - tilt.y) * 0.05;
    world.rotation.y = tilt.x * 0.07;
    world.rotation.x = tilt.y * 0.035;

    const el = (cam.el * Math.PI) / 180;
    camera.position.set(cam.x, Math.sin(el) * cam.dist, Math.cos(el) * cam.dist + look.z);
    camera.lookAt(look);

    live.forEach((l) => {
      const bob = Math.sin(t * 1.4 + l.phase) * 0.045;
      if (!gsap.isTweening(l.group.position)) {
        l.group.position.y = T / 2 + 0.004 + l.floating * (FLOAT + bob);
      }
    });
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (!raf) raf = requestAnimationFrame(frame);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(host);
  resize();
  start();

  const onLost = (e: Event) => {
    e.preventDefault();
    opts.onFail();
  };
  renderer.domElement.addEventListener('webglcontextlost', onLost);

  return {
    setTiles,
    setMarks,
    setView,
    dispose: () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('visibilitychange', onVis);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      live.forEach((l) => {
        gsap.killTweensOf([l, l.group.position, l.group.scale, l.bodyMat, l.labelMat, l.bodyMat.color]);
        drop(l);
      });
      live.clear();
      marks.forEach((m) => {
        m.mesh.geometry.dispose();
        m.mat.dispose();
        m.tex.dispose();
      });
      marks.clear();
      gsap.killTweensOf(cam);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
