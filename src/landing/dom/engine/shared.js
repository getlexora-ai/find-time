// Find Time landing — 3D engine (plain three.js, framework-agnostic)
// Ported 1:1 from the approved artifact. Written for current three.js (r15x+).
import * as THREE from "three";

/* runtime environment — filled in by initEnv() at mount time (keeps the module SSR-safe) */
export const ENV = { reduce: false, dpr: 1.5, maxAniso: 8 };
export function initEnv() {
  ENV.reduce = !!(
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  ENV.dpr = Math.min(2.25, Math.max(1.5, (window.devicePixelRatio || 1) * 1.2));
  // The artifact was built on three r128, which had no colour management.
  // Turning it off keeps every hex colour (cobalt, lime, signal) exactly as designed.
  THREE.ColorManagement.enabled = false;
}
/* r155+ uses physical light units; legacy intensities were effectively ×π */
export const LEGACY_LIGHT = Math.PI;
export function makeCanvas(stage, label) {
  const c = document.createElement("canvas");
  c.setAttribute("role", "img");
  c.setAttribute("aria-label", label);
  stage.prepend(c);
  return c;
}
export function disposeScene(scene) {
  scene.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material)
      ? o.material
      : o.material
        ? [o.material]
        : [];
    mats.forEach((m) => {
      Object.values(m).forEach((v) => {
        if (v && v.isTexture) v.dispose();
      });
      m.dispose();
    });
  });
}
export const FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';
export const HEX = {
  cobalt: 0x2047e6,
  navy: 0x141d43,
  ink: 0x121212,
  lime: 0xccff00,
  signal: 0xff4400,
  paper: 0xf2f2f2,
};
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const seg = (t, a, d) => clamp((t - a) / d);
export const win = (t, a, b, f = 0.15) => seg(t, a, f) * (1 - seg(t, b, f));
export const ease = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
export const outBack = (t) => {
  const c1 = 1.70158,
    c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const outBounce = (t) => {
  const n = 7.5625,
    d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};

export function glOK() {
  try {
    const c = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl"))
    );
  } catch {
    return false;
  }
}
export function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  r.setPixelRatio(ENV.dpr);
  r.setClearColor(0x000000, 0);
  r.outputColorSpace = THREE.LinearSRGBColorSpace; // match the artifact (r128 had no output conversion)
  ENV.maxAniso = Math.max(ENV.maxAniso, r.capabilities.getMaxAnisotropy() || 8);
  return r;
}
/* keeps motion smooth: steps the resolution down if a machine can't hold ~35fps */
export function Perf(renderer) {
  let ema = 16,
    bad = 0,
    pr = ENV.dpr;
  return (ms) => {
    if (document.visibilityState !== "visible" || ms > 250) return;
    ema = ema * 0.93 + ms * 0.07;
    if (ema > 28) {
      if (++bad > 75 && pr > 1) {
        pr = Math.max(1, pr - 0.25);
        renderer.setPixelRatio(pr);
        bad = 0;
      }
    } else bad = Math.max(0, bad - 2);
  };
}
export function onVisible(el, cb) {
  const io = new IntersectionObserver(
    (es) => es.forEach((e) => cb(e.isIntersecting)),
    { threshold: 0.08 },
  );
  io.observe(el);
  return () => io.disconnect();
}
export function onResize(el, cb) {
  const ro = new ResizeObserver(() => cb(el.clientWidth, el.clientHeight));
  ro.observe(el);
  cb(el.clientWidth, el.clientHeight);
  return () => ro.disconnect();
}
export function rrShape(w, d, r) {
  const s = new THREE.Shape(),
    x = -w / 2,
    y = -d / 2;
  r = Math.min(r, w / 2, d / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + d - r);
  s.quadraticCurveTo(x + w, y + d, x + w - r, y + d);
  s.lineTo(x + r, y + d);
  s.quadraticCurveTo(x, y + d, x, y + d - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
export function rrPath(x, X, Y, w, h, r) {
  x.beginPath();
  x.moveTo(X + r, Y);
  x.lineTo(X + w - r, Y);
  x.quadraticCurveTo(X + w, Y, X + w, Y + r);
  x.lineTo(X + w, Y + h - r);
  x.quadraticCurveTo(X + w, Y + h, X + w - r, Y + h);
  x.lineTo(X + r, Y + h);
  x.quadraticCurveTo(X, Y + h, X, Y + h - r);
  x.lineTo(X, Y + r);
  x.quadraticCurveTo(X, Y, X + r, Y);
  x.closePath();
}
export function slabGeo(w, d, h, r) {
  const g = new THREE.ExtrudeGeometry(rrShape(w, d, r), {
    depth: h,
    bevelEnabled: false,
    curveSegments: 6,
  });
  g.rotateX(-Math.PI / 2);
  return g;
}
export function panelGeo(w, hgt, depth, r) {
  const g = new THREE.ExtrudeGeometry(rrShape(w, hgt, r), {
    depth,
    bevelEnabled: false,
    curveSegments: 8,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
/* crisp canvas textures: mipmapped + anisotropic so text stays sharp at oblique angles */
export function canvasTex(cw, ch, draw) {
  const c = document.createElement("canvas");
  c.width = cw;
  c.height = ch;
  const x = c.getContext("2d");
  draw(x, cw, ch);
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = ENV.maxAniso;
  return t;
}
export function capTex(tex, w, d) {
  tex.repeat.set(1 / w, 1 / d);
  tex.offset.set(0.5, 0.5);
  return tex;
}
export function fit(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(s + "…").width > maxW)
    s = s.slice(0, -1);
  return s + "…";
}
export function glowSprite(color, size, alpha) {
  const tex = canvasTex(256, 256, (x, w, h) => {
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
  });
  const s = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      opacity: alpha,
    }),
  );
  s.scale.set(size, size, 1);
  return s;
}
export function pointsMat(color, size) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
      uPR: { value: ENV.dpr },
    },
    vertexShader:
      "attribute float aA;varying float vA;uniform float uSize;uniform float uPR;void main(){vA=aA;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=uSize*uPR*(10./-mv.z);gl_Position=projectionMatrix*mv;}",
    fragmentShader:
      "uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,.15,d);gl_FragColor=vec4(uColor,a*vA);}",
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}
export function projectTo(v, camera, w, h) {
  const p = v.clone().project(camera);
  return { x: (p.x * 0.5 + 0.5) * w, y: (-p.y * 0.5 + 0.5) * h, z: p.z };
}
/* DOM callout pinned to a 3D point — real browser text, always sharp */
export function Chip(layer, cls, html, camera, view) {
  const el = document.createElement("div");
  el.className = "chip " + cls;
  el.innerHTML = html;
  layer.appendChild(el);
  let on = false;
  return {
    el,
    at(v, a) {
      a = clamp(a);
      if (a < 0.01) {
        if (on) {
          el.style.opacity = "0";
          on = false;
        }
        return;
      }
      on = true;
      const q = projectTo(v, camera, view.w, view.h);
      el.style.opacity = Math.min(1, a * 1.4).toFixed(3);
      el.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) translate(-50%,calc(-100% - 14px)) scale(${(0.72 + 0.28 * outBack(a)).toFixed(3)})`;
    },
    hide() {
      el.style.opacity = "0";
      on = false;
    },
  };
}
export function kf(t, frames) {
  if (t <= frames[0][0]) return frames[0][1];
  for (let i = 1; i < frames.length; i++) {
    const [t1, f1] = frames[i];
    if (t <= t1) {
      const [t0, f0] = frames[i - 1];
      const p = ease(clamp((t - t0) / Math.max(1e-6, t1 - t0)));
      return {
        x: lerp(f0.x, f1.x, p),
        y: lerp(f0.y, f1.y, p),
        z: lerp(f0.z, f1.z, p),
        zoom: lerp(f0.zoom, f1.zoom, p),
      };
    }
  }
  return frames[frames.length - 1][1];
}
