// Find Time landing — 3D engine (plain three.js, framework-agnostic)
// Ported 1:1 from the approved artifact. Written for current three.js (r15x+).
import * as THREE from "three";
import {
  ENV,
  HEX,
  FONT,
  LEGACY_LIGHT,
  clamp,
  lerp,
  ease,
  makeRenderer,
  makeCanvas,
  disposeScene,
  onVisible,
  onResize,
  panelGeo,
  canvasTex,
  capTex,
  glowSprite,
  pointsMat,
  projectTo,
  Perf,
} from "./shared";

/* ================= CONNECTORS — the orbit =================
   Each tool eases an on/off value m (0↔1) that drives orbit radius,
   material colour, label state and the particle stream into the core. */
export function createConnectorsOrbit(root) {
  const $ = (n) => root.querySelector(`[data-ft="${n}"]`);
  const ac = new AbortController();
  const on = (el, type, fn, opts) =>
    el.addEventListener(
      type,
      fn,
      Object.assign({}, opts, { signal: ac.signal }),
    );
  const cleanups = [];
  const track = (f) => {
    cleanups.push(f);
    return f;
  };
  let raf = 0,
    dead = false;
  const stage = $("stage-orbit"),
    tagsEl = $("tags-orbit");
  const canvas = makeCanvas(
    stage,
    "3D orbit of connected tools around the calendar",
  );
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xdfe6ff, 0x1a2470, 0.75 * LEGACY_LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 0.85 * LEGACY_LIGHT);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.PointLight(HEX.lime, 1.1 * LEGACY_LIGHT * 0.77, 14, 0);
  rim.position.set(0, 0, 0);
  scene.add(rim);

  /* starfield */
  (function () {
    const n = 420,
      pos = new Float32Array(n * 3),
      al = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = 18 + Math.random() * 22,
        th = Math.random() * Math.PI * 2,
        ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.6;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 10;
      al[i] = 0.15 + Math.random() * 0.45;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aA", new THREE.BufferAttribute(al, 1));
    scene.add(new THREE.Points(g, pointsMat(0xffffff, 2.2)));
  })();

  /* core: the calendar tile */
  const core = new THREE.Group();
  scene.add(core);
  const faceTex = capTex(
    canvasTex(512, 512, (x, w, h) => {
      x.fillStyle = "#CCFF00";
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#121212";
      x.fillRect(0, 0, w, 122);
      x.fillStyle = "#CCFF00";
      x.font = `700 40px ${FONT}`;
      x.textBaseline = "middle";
      x.fillText("SEP", 40, 70);
      x.textAlign = "right";
      x.fillText("2026", w - 40, 70);
      x.fillStyle = "#121212";
      x.textAlign = "center";
      x.font = `800 230px ${FONT}`;
      x.fillText("14", w / 2, 290);
      x.font = `700 40px ${FONT}`;
      x.fillText("MONDAY", w / 2, 430);
    }),
    2,
    2,
  );
  const coreBody = new THREE.Mesh(panelGeo(2, 2, 0.46, 0.3), [
    new THREE.MeshStandardMaterial({
      map: faceTex,
      emissive: 0xffffff,
      emissiveMap: faceTex,
      emissiveIntensity: 0.5,
      roughness: 0.55,
    }),
    new THREE.MeshStandardMaterial({ color: 0x9cc400, roughness: 0.5 }),
  ]);
  core.add(coreBody);
  [-0.5, 0.5].forEach((xp) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.17, 0.05, 12, 32),
      new THREE.MeshStandardMaterial({
        color: 0x121212,
        roughness: 0.4,
        metalness: 0.3,
      }),
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.set(xp, 1, 0);
    core.add(ring);
  });
  const halo = glowSprite("rgba(204,255,0,.9)", 7.5, 0.34);
  scene.add(halo);

  /* orbit rings, tilted */
  const orbit = new THREE.Group();
  orbit.rotation.set(0.3, 0, -0.08);
  scene.add(orbit);
  const circle = (r, mat, dashed) => {
    const pts = [];
    for (let i = 0; i <= 160; i++) {
      const a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      mat,
    );
    if (dashed) l.computeLineDistances();
    orbit.add(l);
    return l;
  };
  const R_ON = 3.25,
    R_OFF = 5.15;
  circle(
    R_ON,
    new THREE.LineBasicMaterial({
      color: HEX.lime,
      transparent: true,
      opacity: 0.32,
    }),
  );
  circle(
    R_OFF,
    new THREE.LineDashedMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.18,
      dashSize: 0.14,
      gapSize: 0.16,
    }),
    true,
  );

  /* tool builders — each a distinct little object */
  const P = 0xf2f2f2,
    L = HEX.lime,
    I = 0x121212,
    Cb = HEX.cobalt;
  function kit(tool) {
    const mats = [];
    const m = (on, off, extra = {}) => {
      const mm = new THREE.MeshStandardMaterial({
        color: on,
        roughness: 0.5,
        metalness: 0.05,
        ...extra,
      });
      mats.push({
        mm,
        on: new THREE.Color(on),
        off: new THREE.Color(off),
        em: extra.emissive !== undefined,
      });
      return mm;
    };
    tool.mats = mats;
    return m;
  }
  const OFFP = 0x333e6e,
    OFFL = 0x46507e,
    OFFI = 0x1a2150;
  const BUILD = {
    email(g, m) {
      g.add(new THREE.Mesh(panelGeo(1.05, 0.72, 0.14, 0.08), m(P, OFFP)));
      const f = m(I, OFFI);
      [-1, 1].forEach((s) => {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.06, 0.04), f);
        b.position.set(s * 0.25, 0.12, 0.09);
        b.rotation.z = s * 0.62;
        g.add(b);
      });
      const seal = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.085, 0.04, 20),
        m(L, OFFL, { emissive: L, emissiveIntensity: 0.25 }),
      );
      seal.rotation.x = Math.PI / 2;
      seal.position.set(0, -0.07, 0.1);
      g.add(seal);
    },
    slack(g, m) {
      const a = m(P, OFFP),
        b = m(L, OFFL, { emissive: L, emissiveIntensity: 0.2 });
      [
        [-0.17, 0, 0.05, a, 0],
        [0.17, 0, -0.05, a, 0],
        [0, 0.17, 0.0, b, 1],
        [0, -0.17, 0.1, b, 1],
      ].forEach(([x, y, z, mt, hz]) => {
        const bar = new THREE.Mesh(
          new THREE.BoxGeometry(hz ? 0.95 : 0.15, hz ? 0.15 : 0.95, 0.15),
          mt,
        );
        bar.position.set(x, y, z);
        if (!hz) bar.rotation.z = -0.16;
        g.add(bar);
      });
    },
    tasks(g, m) {
      const s = m(P, OFFP),
        c = m(L, OFFL, { emissive: L, emissiveIntensity: 0.25 }),
        o = m(I, OFFI);
      [0.32, 0, -0.32].forEach((y, i) => {
        const row = new THREE.Mesh(panelGeo(0.62, 0.2, 0.09, 0.05), s);
        row.position.set(0.14, y, 0);
        g.add(row);
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(0.2, 0.2, 0.2),
          i < 2 ? c : o,
        );
        box.position.set(-0.36, y, 0);
        g.add(box);
      });
    },
    meetings(g, m) {
      g.add(
        new THREE.Mesh(panelGeo(0.78, 0.6, 0.4, 0.12), m(P, OFFP)).translateX(
          -0.14,
        ),
      );
      const lens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.3, 0.34, 4, 1),
        m(L, OFFL, { emissive: L, emissiveIntensity: 0.2, flatShading: true }),
      );
      lens.rotation.z = -Math.PI / 2;
      lens.rotation.x = Math.PI / 4;
      lens.position.x = 0.4;
      g.add(lens);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 14, 10),
        m(HEX.signal, OFFL, { emissive: HEX.signal, emissiveIntensity: 0.5 }),
      );
      dot.position.set(-0.38, 0.17, 0.21);
      g.add(dot);
    },
    docs(g, m) {
      const a = m(P, OFFP),
        b = m(0xc9d2f0, OFFI),
        ln = m(I, OFFI);
      [
        [-0.14, -0.1, -0.12, b, 0.12],
        [0, 0, 0, a, -0.05],
      ].forEach(([x, y, z, mt, r]) => {
        const s = new THREE.Mesh(panelGeo(0.66, 0.86, 0.04, 0.04), mt);
        s.position.set(x, y, z);
        s.rotation.z = r;
        g.add(s);
      });
      [0.22, 0.08, -0.06, -0.2].forEach((y, i) => {
        const l = new THREE.Mesh(
          new THREE.BoxGeometry(i === 0 ? 0.4 : 0.48, 0.045, 0.03),
          i === 0 ? m(L, OFFL, { emissive: L, emissiveIntensity: 0.2 }) : ln,
        );
        l.position.set(-0.02 - (i === 0 ? 0.04 : 0), y, 0.04);
        l.rotation.z = -0.05;
        g.add(l);
      });
    },
    cloud(g, m) {
      const a = m(P, OFFP);
      [
        [0, 0.08, 0.34],
        [-0.34, -0.08, 0.24],
        [0.34, -0.06, 0.26],
        [0.1, -0.16, 0.24],
        [-0.12, -0.14, 0.22],
      ].forEach(([x, y, r]) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), a);
        s.position.set(x, y, 0);
        g.add(s);
      });
      const drop = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.22, 12),
        m(L, OFFL, { emissive: L, emissiveIntensity: 0.25 }),
      );
      drop.rotation.z = Math.PI;
      drop.position.set(0, -0.46, 0.05);
      g.add(drop);
    },
    browser(g, m) {
      g.add(new THREE.Mesh(panelGeo(1.05, 0.78, 0.1, 0.08), m(P, OFFP)));
      const bar = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.16, 0.12),
        m(I, OFFI),
      );
      bar.position.set(0, 0.31, 0.0);
      g.add(bar);
      [
        [HEX.signal, -0.4],
        [L, -0.3],
        [P, -0.2],
      ].forEach(([c, x]) => {
        const d = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 10, 8),
          m(c, OFFL),
        );
        d.position.set(x, 0.31, 0.07);
        g.add(d);
      });
      const scr = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 0.46, 0.02),
        m(Cb, OFFI, { emissive: Cb, emissiveIntensity: 0.3 }),
      );
      scr.position.set(0, -0.06, 0.055);
      g.add(scr);
      const cur = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.16, 3),
        m(L, OFFL, { emissive: L, emissiveIntensity: 0.3 }),
      );
      cur.position.set(0.18, -0.1, 0.1);
      cur.rotation.z = 0.5;
      g.add(cur);
    },
  };
  const TOOLS = [
    {
      k: "email",
      name: "EMAIL",
      src: "Gmail · Outlook",
      cap: "SPOTS REQUESTS · SENDS INVITES",
      on: true,
    },
    {
      k: "slack",
      name: "SLACK",
      src: "Channels · DMs · threads",
      cap: "POSTS OPTIONS · CONFIRMS",
      on: true,
    },
    {
      k: "tasks",
      name: "TASKS",
      src: "Linear · Asana · Todoist",
      cap: "DEADLINES → TIME BLOCKS",
      on: true,
    },
    {
      k: "meetings",
      name: "MEETINGS",
      src: "Zoom · Google Meet · Teams",
      cap: "NOTES · BOOKS FOLLOW-UPS",
      on: false,
    },
    {
      k: "docs",
      name: "DOCS",
      src: "Notion · Google Docs",
      cap: "AGENDAS · PREP NOTES",
      on: false,
    },
    {
      k: "cloud",
      name: "CLOUD",
      src: "Google Drive · Dropbox · OneDrive",
      cap: "ATTACHES THE RIGHT FILE",
      on: false,
    },
    {
      k: "browser",
      name: "BROWSER",
      src: "Any site you point it at",
      cap: "CHECKS VENUES · TRAVEL",
      on: false,
    },
  ];
  const pickables = [];
  TOOLS.forEach((tool, i) => {
    const holder = new THREE.Group(),
      g = new THREE.Group();
    holder.add(g);
    orbit.add(holder);
    BUILD[tool.k](g, kit(tool));
    g.traverse((o) => {
      o.userData.idx = i;
      if (o.isMesh) pickables.push(o);
    });
    const hit = new THREE.Mesh(
      new THREE.SphereGeometry(0.75, 10, 8),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.userData.idx = i;
    holder.add(hit);
    pickables.push(hit);
    Object.assign(tool, {
      holder,
      g,
      m: tool.on ? 1 : 0,
      hover: 0,
      phase: (i / TOOLS.length) * Math.PI * 2,
    });
    const tag = document.createElement("div");
    tag.className = "otag";
    tag.innerHTML = `${tool.name}<small></small>`;
    tagsEl.appendChild(tag);
    tool.tag = tag;
  });
  const coreTag = document.createElement("div");
  coreTag.className = "otag core";
  coreTag.textContent = "CALENDAR · CORE";
  tagsEl.appendChild(coreTag);

  /* data streams */
  const PER = 16,
    N = TOOLS.length * PER,
    spos = new Float32Array(N * 3),
    sal = new Float32Array(N);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  sg.setAttribute("aA", new THREE.BufferAttribute(sal, 1));
  scene.add(new THREE.Points(sg, pointsMat(HEX.lime, 5.5)));
  const links = TOOLS.map(() => {
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineBasicMaterial({
        color: HEX.lime,
        transparent: true,
        opacity: 0,
      }),
    );
    scene.add(l);
    return l;
  });

  /* list */
  const rowsEl = $("rows"),
    countEl = $("count");
  const coreRow = document.createElement("div");
  coreRow.className = "row is-on";
  coreRow.innerHTML = `<div class="nm">CALENDAR<span class="src">Google · Outlook</span></div><span class="corepill">CORE</span><div class="cap">READ · BOOK · MOVE · PROTECT</div>`;
  rowsEl.appendChild(coreRow);
  TOOLS.forEach((tool, i) => {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<div class="nm">${tool.name}<span class="src">${tool.src}</span></div><button class="sw" role="switch" type="button" id="sw-${tool.k}" aria-label="${tool.name}"></button><div class="cap">${tool.cap}</div>`;
    const sw = row.querySelector(".sw");
    on(row, "click", (e) => {
      toggle(i);
    });
    on(row, "pointerenter", () => {
      hoverRow = i;
    });
    on(row, "pointerleave", () => {
      if (hoverRow === i) hoverRow = -1;
    });
    rowsEl.appendChild(row);
    tool.row = row;
    tool.sw = sw;
  });
  function syncList() {
    let n = 1;
    TOOLS.forEach((t) => {
      t.sw.setAttribute("aria-checked", String(t.on));
      t.row.classList.toggle("is-on", t.on);
      if (t.on) n++;
      t.tag.classList.toggle("on", t.on);
      t.tag.classList.toggle("off", !t.on);
      t.tag.querySelector("small").textContent = t.on ? "ON · FEEDING" : "OFF";
    });
    countEl.textContent = `${n} OF 8 ON`;
  }
  function toggle(i) {
    TOOLS[i].on = !TOOLS[i].on;
    syncList();
    kick = true;
  }
  syncList();

  /* picking */
  const ray = new THREE.Raycaster(),
    ptr = new THREE.Vector2();
  let hover3d = -1,
    hoverRow = -1,
    kick = true;
  function pick(e) {
    const r = canvas.getBoundingClientRect();
    ptr.set(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1,
    );
    ray.setFromCamera(ptr, camera);
    const h = ray.intersectObjects(pickables, false)[0];
    return h ? h.object.userData.idx : -1;
  }
  on(canvas, "pointermove", (e) => {
    hover3d = pick(e);
    canvas.style.cursor = hover3d >= 0 ? "pointer" : "default";
    kick = true;
  });
  on(canvas, "pointerleave", () => {
    hover3d = -1;
  });
  on(canvas, "click", (e) => {
    const i = pick(e);
    if (i >= 0) toggle(i);
  });

  let W2 = 1,
    H2 = 1,
    visible = false;
  track(
    onResize(stage, (w, h) => {
      W2 = w;
      H2 = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      const tn = Math.tan(THREE.MathUtils.degToRad(17));
      const dist = Math.max(5.1 / (tn * camera.aspect), 3.75 / tn);
      camera.position.set(0, dist * 0.2, dist);
      camera.lookAt(0, -0.1, 0);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      kick = true;
    }),
  );
  track(
    onVisible(stage, (v) => {
      visible = v;
    }),
  );

  const wp = new THREE.Vector3(),
    cp = new THREE.Vector3(),
    ctrl = new THREE.Vector3();
  let clk = 0,
    prev = performance.now();
  const perf = Perf(renderer);
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const ms = now - prev,
      dt = Math.min(0.1, ms / 1000);
    prev = now;
    if (!visible && !kick) return;
    kick = false;
    perf(ms);
    clk += ENV.reduce ? 0 : dt;
    core.position.y = Math.sin(clk * 0.9) * 0.08;
    core.rotation.y = Math.sin(clk * 0.45) * 0.32;
    core.rotation.x = -0.06;
    halo.position.copy(core.position);
    halo.material.opacity = 0.26 + 0.06 * Math.sin(clk * 1.8);
    const spin = clk * 0.11;
    let active = 0;
    TOOLS.forEach((tool, i) => {
      tool.m += ((tool.on ? 1 : 0) - tool.m) * Math.min(1, dt * 3.2);
      if (ENV.reduce) tool.m = tool.on ? 1 : 0;
      const hv = hover3d === i || hoverRow === i ? 1 : 0;
      tool.hover += (hv - tool.hover) * Math.min(1, dt * 8);
      tool.row.classList.toggle("hot", hv === 1);
      const e = ease(clamp(tool.m)),
        a = tool.phase + spin,
        r = lerp(R_OFF, R_ON, e);
      tool.holder.position.set(
        Math.cos(a) * r,
        Math.sin(clk * 0.8 + i) * 0.12 + lerp(-0.35, 0, e),
        Math.sin(a) * r,
      );
      tool.holder.rotation.set(-orbit.rotation.x, 0, -orbit.rotation.z);
      tool.g.rotation.y = Math.sin(clk * 0.55 + i * 1.3) * 0.55;
      tool.g.rotation.x = Math.sin(clk * 0.4 + i) * 0.12;
      const sc = lerp(0.85, 1.22, e) * (1 + 0.18 * tool.hover);
      tool.g.scale.setScalar(sc);
      tool.mats.forEach((o) => {
        o.mm.color.copy(o.off).lerp(o.on, e);
        if (o.em) o.mm.emissiveIntensity = 0.28 * e;
      });
      tool.holder.getWorldPosition(wp);
      const q = projectTo(
        wp.clone().add(new THREE.Vector3(0, -0.72 * sc - 0.12, 0)),
        camera,
        W2,
        H2,
      );
      tool.tag.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) translate(-50%,0)`;
      tool.tag.style.opacity = (0.55 + 0.45 * Math.max(e, tool.hover)).toFixed(
        2,
      );
      cp.set(0, core.position.y, 0);
      ctrl.copy(wp).lerp(cp, 0.5);
      ctrl.y += 1.1;
      const ln = links[i];
      const lp = ln.geometry.attributes.position.array;
      lp[0] = wp.x;
      lp[1] = wp.y;
      lp[2] = wp.z;
      lp[3] = cp.x;
      lp[4] = cp.y;
      lp[5] = cp.z;
      ln.geometry.attributes.position.needsUpdate = true;
      ln.material.opacity = e * 0.14;
      for (let j = 0; j < PER; j++) {
        const s = (clk * 0.42 + j / PER + i * 0.13) % 1,
          u = 1 - s,
          k = i * PER + j;
        spos[k * 3] = u * u * wp.x + 2 * u * s * ctrl.x + s * s * cp.x;
        spos[k * 3 + 1] = u * u * wp.y + 2 * u * s * ctrl.y + s * s * cp.y;
        spos[k * 3 + 2] = u * u * wp.z + 2 * u * s * ctrl.z + s * s * cp.z;
        sal[k] = ENV.reduce ? e * 0.5 : e * Math.sin(Math.PI * s) * 0.95;
      }
      if (e > 0.02 || Math.abs(tool.m - (tool.on ? 1 : 0)) > 0.001) active++;
    });
    sg.attributes.position.needsUpdate = true;
    sg.attributes.aA.needsUpdate = true;
    const cq = projectTo(
      new THREE.Vector3(0, core.position.y + 1.3, 0),
      camera,
      W2,
      H2,
    );
    coreTag.style.transform = `translate(${cq.x.toFixed(1)}px,${cq.y.toFixed(1)}px) translate(-50%,-100%)`;
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(frame);

  return function dispose() {
    dead = true;
    cancelAnimationFrame(raf);
    ac.abort();
    cleanups.forEach((f) => f());
    disposeScene(scene);
    renderer.dispose();
    canvas.remove();
    tagsEl.replaceChildren();
    rowsEl.replaceChildren();
  };
}
