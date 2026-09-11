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
  seg,
  win,
  ease,
  outBack,
  outBounce,
  makeRenderer,
  makeCanvas,
  disposeScene,
  onVisible,
  onResize,
  rrShape,
  rrPath,
  slabGeo,
  canvasTex,
  capTex,
  fit,
  Chip,
  kf,
  Perf,
} from "./shared";

/* ================= HERO · HOW IT PLANS — the 3D week board =================
   Everything on the board is a pure function of one timeline value `t`
   (PRE → 0..4 steps → END). Each scenario has update(t) + cam(t). */
export function createWeekBoard(root) {
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
  const stage = $("stage-plan"),
    tagsEl = $("tags-plan");
  const canvas = makeCanvas(
    stage,
    "3D week calendar showing the plan being built",
  );
  const renderer = makeRenderer(canvas);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const view = { w: 1, h: 1 };
  scene.add(new THREE.HemisphereLight(0xffffff, 0x22307a, 0.62 * LEGACY_LIGHT));
  const sun = new THREE.DirectionalLight(0xffffff, 0.62 * LEGACY_LIGHT);
  sun.position.set(-5, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -7.5,
    right: 7.5,
    top: 7.5,
    bottom: -7.5,
    near: 1,
    far: 40,
  });
  sun.shadow.bias = -0.0006;
  sun.shadow.radius = 4;
  scene.add(sun);

  const G = 0.8,
    HD = 0.72,
    CW = 1.7,
    RH = 0.64,
    PAD = 0.16;
  const W = G + 5 * CW + PAD,
    D = HD + 10 * RH + PAD;
  const dayX = (i) => -W / 2 + G + CW * (i + 0.5);
  const hourZ = (h) => -D / 2 + HD + (h - 8) * RH;
  const DAYS = ["MON", "TUE", "WED", "THU", "FRI"];
  const PPU = 300;
  const boardTex = canvasTex(
    Math.round(W * PPU),
    Math.round(D * PPU),
    (x, cw, ch) => {
      const px = (v) => (v + W / 2) * PPU,
        pz = (v) => (v + D / 2) * PPU;
      x.fillStyle = "#141D43";
      x.fillRect(0, 0, cw, ch);
      for (let i = 0; i < 5; i++) {
        if (i % 2) {
          x.fillStyle = "rgba(255,255,255,.03)";
          x.fillRect(
            px(dayX(i) - CW / 2),
            pz(hourZ(8)),
            CW * PPU,
            10 * RH * PPU,
          );
        }
      }
      x.textBaseline = "middle";
      for (let h = 8; h <= 18; h++) {
        const y = pz(hourZ(h));
        x.strokeStyle =
          h % 2 ? "rgba(255,255,255,.06)" : "rgba(255,255,255,.13)";
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(px(-W / 2 + G), y);
        x.lineTo(px(W / 2 - PAD), y);
        x.stroke();
        if (h % 2 === 0) {
          x.fillStyle = "rgba(255,255,255,.72)";
          x.font = `600 44px ${FONT}`;
          x.textAlign = "right";
          x.fillText(
            String(h).padStart(2, "0") + ":00",
            px(-W / 2 + G) - 18,
            y,
          );
        }
      }
      for (let i = 0; i <= 5; i++) {
        const X = px(-W / 2 + G + CW * i);
        x.strokeStyle = "rgba(255,255,255,.12)";
        x.lineWidth = 3;
        x.beginPath();
        x.moveTo(X, pz(-D / 2 + HD * 0.2));
        x.lineTo(X, pz(hourZ(18)));
        x.stroke();
      }
      for (let i = 0; i < 5; i++) {
        x.textAlign = "left";
        x.fillStyle = "#FFFFFF";
        x.font = `800 56px ${FONT}`;
        x.fillText(DAYS[i], px(dayX(i) - CW / 2) + 28, pz(-D / 2 + HD * 0.55));
        x.fillStyle = "#CCFF00";
        x.font = `600 48px ${FONT}`;
        x.textAlign = "right";
        x.fillText(
          String(14 + i),
          px(dayX(i) + CW / 2) - 28,
          pz(-D / 2 + HD * 0.55),
        );
      }
      x.fillStyle = "#CCFF00";
      x.fillRect(px(-W / 2 + G), pz(hourZ(8)) - 4, 5 * CW * PPU, 5);
    },
  );
  capTex(boardTex, W, D);
  const boardMat = new THREE.MeshStandardMaterial({
    map: boardTex,
    emissive: 0xffffff,
    emissiveMap: boardTex,
    emissiveIntensity: 0.55,
    roughness: 0.9,
  });
  const boardSide = new THREE.MeshStandardMaterial({
    color: 0x0c1236,
    roughness: 0.8,
  });
  const board = new THREE.Mesh(slabGeo(W, D, 0.42, 0.22), [
    boardMat,
    boardSide,
  ]);
  board.position.y = -0.42;
  board.receiveShadow = true;
  scene.add(board);
  scene.add(
    new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        rrShape(W, D, 0.22)
          .getPoints(12)
          .map((p) => new THREE.Vector3(p.x, 0.002, -p.y)),
      ),
      new THREE.LineBasicMaterial({
        color: HEX.lime,
        transparent: true,
        opacity: 0.45,
      }),
    ),
  );
  const floorShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(W * 1.5, D * 1.7),
    new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      map: canvasTex(256, 256, (x) => {
        const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
        g.addColorStop(0, "rgba(6,14,70,.55)");
        g.addColorStop(1, "rgba(6,14,70,0)");
        x.fillStyle = g;
        x.fillRect(0, 0, 256, 256);
      }),
    }),
  );
  floorShadow.rotation.x = -Math.PI / 2;
  floorShadow.position.set(0.5, -1.6, 0.6);
  scene.add(floorShadow);

  const K = {
    meet: { top: "#2B3777", fg: "#FFFFFF", side: 0x1a2254, h: 0.16, glow: 0.5 },
    focus: {
      top: "#CCFF00",
      fg: "#121212",
      side: 0x8db000,
      h: 0.46,
      glow: 0.5,
    },
    goal: {
      top: "#F2F2F2",
      fg: "#121212",
      side: 0xaeb6ce,
      h: 0.28,
      glow: 0.45,
    },
    book: {
      top: "#CCFF00",
      fg: "#121212",
      side: 0x8db000,
      h: 0.36,
      glow: 0.55,
    },
    move: {
      top: "#2047E6",
      fg: "#FFFFFF",
      side: 0x1331a6,
      h: 0.24,
      glow: 0.55,
    },
    clash: { top: "#FF4400", fg: "#FFFFFF", side: 0xb02f00, h: 0.3, glow: 0.6 },
    sam: { top: "#6D89FF", fg: "", side: 0x4460d0, h: 0.1, glow: 0.5 },
    priya: { top: "#E3E7F4", fg: "", side: 0x9ea6c0, h: 0.1, glow: 0.45 },
  };
  const texCache = new Map();
  const fmt = (h) => {
    const H = Math.floor(h),
      M = Math.round((h - H) * 60);
    return String(H).padStart(2, "0") + ":" + String(M).padStart(2, "0");
  };
  function blockTex(kind, label, w, d, start, dur) {
    const key = [kind, label, w.toFixed(2), d.toFixed(2), start, dur].join("|");
    if (texCache.has(key)) return texCache.get(key);
    const k = K[kind],
      pp = 300,
      cw = Math.round(w * pp),
      ch = Math.max(32, Math.round(d * pp));
    const t = canvasTex(cw, ch, (x) => {
      x.fillStyle = k.top;
      x.fillRect(0, 0, cw, ch);
      x.fillStyle = "rgba(255,255,255,.22)";
      x.fillRect(0, 0, cw, 5);
      if (!label) return;
      const fs = Math.round(clamp(ch * 0.5, 26, 46));
      x.fillStyle = k.fg;
      x.textBaseline = "middle";
      x.textAlign = "left";
      x.font = `800 ${fs}px ${FONT}`;
      const two = ch >= fs * 2.9;
      x.fillText(
        fit(x, label, cw - 40),
        20,
        two ? ch / 2 - fs * 0.6 : ch / 2 + 2,
      );
      if (two) {
        x.globalAlpha = 0.75;
        x.font = `600 ${Math.round(fs * 0.72)}px ${FONT}`;
        x.fillText(fmt(start) + "–" + fmt(start + dur), 20, ch / 2 + fs * 0.62);
      }
    });
    capTex(t, w, d);
    texCache.set(key, t);
    return t;
  }
  function Block(parent, s) {
    const w = CW - 0.2,
      d = Math.max(0.12, s.dur * RH - 0.07);
    const top = new THREE.MeshStandardMaterial({
      roughness: 0.75,
      emissive: 0xffffff,
      transparent: true,
    });
    const side = new THREE.MeshStandardMaterial({
      roughness: 0.8,
      transparent: true,
    });
    const mesh = new THREE.Mesh(slabGeo(w, d, 1, 0.07), [top, side]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    let cur = null,
      dimV = 1;
    const topV = new THREE.Vector3();
    const paint = () => {
      const k = K[cur];
      top.color.setScalar(dimV);
      top.emissiveIntensity = k.glow * dimV;
      side.color.setHex(k.side).multiplyScalar(dimV);
    };
    const api = {
      mesh,
      s,
      h: 0.2,
      kind(kd) {
        if (cur === kd) return;
        cur = kd;
        const tx = blockTex(kd, s.label, w, d, s.start, s.dur);
        top.map = tx;
        top.emissiveMap = tx;
        top.needsUpdate = true;
        api.h = K[kd].h;
        paint();
      },
      dim(v) {
        if (Math.abs(v - dimV) < 0.003) return;
        dimV = v;
        paint();
      },
      place(day, start, y, sy, a) {
        mesh.visible = a > 0.01 && sy > 0.002;
        mesh.position.set(dayX(day), y, hourZ(start + s.dur / 2));
        mesh.scale.set(1, Math.max(0.001, api.h * sy), 1);
        top.opacity = side.opacity = clamp(a);
        const opaque = a >= 0.999;
        top.transparent = side.transparent = !opaque;
        top.depthWrite = side.depthWrite = opaque;
      },
      top() {
        return topV.set(
          mesh.position.x,
          mesh.position.y + mesh.scale.y,
          mesh.position.z,
        );
      },
    };
    api.kind(s.kind);
    api.place(s.day, s.start, 0, 0, 0);
    return api;
  }
  function Pulse(parent) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.3, 0.42, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        color: HEX.lime,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    parent.add(m);
    return {
      at(day, start, dur, y, p) {
        m.visible = !ENV.reduce && p > 0 && p < 1;
        m.position.set(dayX(day), y, hourZ(start + dur / 2));
        const s = 1 + p * 2.6;
        m.scale.set(s, 1, s);
        m.material.opacity = (1 - p) * 0.95;
      },
    };
  }
  function GapPlane(parent, day, s, e) {
    const w = CW - 0.2,
      d = (e - s) * RH - 0.07,
      pp = 260,
      cw = Math.round(w * pp),
      ch = Math.round(d * pp);
    const tex = canvasTex(cw, ch, (x) => {
      rrPath(x, 5, 5, cw - 10, ch - 10, 22);
      x.fillStyle = "rgba(204,255,0,.16)";
      x.fill();
      x.setLineDash([22, 14]);
      x.lineWidth = 7;
      x.strokeStyle = "#CCFF00";
      x.stroke();
      x.setLineDash([]);
      x.fillStyle = "#CCFF00";
      x.font = `800 ${Math.round(clamp(ch * 0.22, 30, 44))}px ${FONT}`;
      x.textBaseline = "middle";
      x.textAlign = "center";
      x.fillText(`FREE · ${+(e - s).toFixed(1)}H`, cw / 2, ch / 2);
    });
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    m.position.set(dayX(day), 0.014, hourZ((s + e) / 2));
    m.visible = false;
    parent.add(m);
    return m;
  }
  const V = new THREE.Vector3();
  const P = (x, y, z) => V.set(x, y, z);
  const OV = { x: 0.15, y: 0.75, z: 0.2, zoom: 1 };

  const MEET_A = [
    [0, 9.5, 0.5, "STANDUP"],
    [0, 11, 1, "CLIENT"],
    [0, 15, 1, "HIRING"],
    [1, 9.5, 0.5, "STANDUP"],
    [1, 10.5, 1, "REVIEW"],
    [1, 14, 1, "PITCH"],
    [1, 16.5, 1, "VENDOR"],
    [2, 9.5, 0.5, "STANDUP"],
    [2, 11, 1.5, "KICKOFF"],
    [2, 15, 1, "ROADMAP"],
    [3, 9.5, 0.5, "STANDUP"],
    [3, 10.5, 1, "SPRINT"],
    [3, 16, 1, "SALES"],
    [4, 9.5, 1, "RETRO"],
    [4, 14, 1, "DEMO"],
  ];
  const meetsFrom = (g, list) =>
    list.map(([day, start, dur, label]) =>
      Block(g, { day, start, dur, label, kind: "meet" }),
    );
  const riseAll = (arr, t, at, stagger) =>
    arr.forEach((b, i) => {
      const p = seg(t, at + i * stagger, 0.35);
      b.place(b.s.day, b.s.start, 0, ease(p), p * 3);
    });
  const drop = (b, p, from = 3.4) => {
    b.place(b.s.day, b.s.start, (1 - outBounce(p)) * from, 1, clamp(p * 8));
  };
  const clock = { t: 0 };
  const SCEN = [];
  const chipOf = (list, cls, html) => {
    const c = Chip(tagsEl, cls, html, camera, view);
    list.push(c);
    return c;
  };

  /* ---- A · plan my week ---- */
  (function () {
    const g = new THREE.Group(),
      chips = [];
    const meets = meetsFrom(g, MEET_A);
    const gaps = [];
    for (let d = 0; d < 5; d++) {
      const busy = MEET_A.filter((m) => m[0] === d)
        .map((m) => [m[1], m[1] + m[2]])
        .sort((a, b) => a[0] - b[0]);
      let cur = 8;
      busy.concat([[18, 18]]).forEach(([s, e]) => {
        if (s - cur >= 1) gaps.push(GapPlane(g, d, cur, s));
        cur = Math.max(cur, e);
      });
    }
    const flagDefs = [
      [2, 17, "BRIEF DUE · WED 17:00"],
      [4, 12, "LAUNCH · FRI 12:00"],
    ];
    const flags = flagDefs.map(([day, h, label]) => {
      const fg = new THREE.Group();
      fg.position.set(dayX(day) + CW / 2 - 0.14, 0, hourZ(h));
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.035, 1.5, 12).translate(0, 0.75, 0),
        new THREE.MeshStandardMaterial({
          color: HEX.signal,
          emissive: HEX.signal,
          emissiveIntensity: 0.45,
        }),
      );
      pole.castShadow = true;
      fg.add(pole);
      const tri = new THREE.Shape();
      tri.moveTo(0, 0);
      tri.lineTo(-0.5, -0.17);
      tri.lineTo(0, -0.34);
      tri.closePath();
      const flag = new THREE.Mesh(
        new THREE.ShapeGeometry(tri),
        new THREE.MeshBasicMaterial({
          color: HEX.signal,
          side: THREE.DoubleSide,
        }),
      );
      flag.position.y = 1.5;
      fg.add(flag);
      fg.add(
        new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24),
          new THREE.MeshBasicMaterial({ color: HEX.signal }),
        ),
      );
      g.add(fg);
      return { fg, chip: chipOf(chips, "sig", label) };
    });
    const focus = [
      [0, 13, 1.5],
      [2, 13, 1.5],
      [3, 13, 1.5],
    ].map(([day, start, dur]) =>
      Block(g, { day, start, dur, label: "FOCUS · LAUNCH", kind: "focus" }),
    );
    const german = [
      [0, 8.5, 0.5],
      [2, 8.5, 0.5],
      [4, 8.5, 0.5],
    ].map(([day, start, dur]) =>
      Block(g, { day, start, dur, label: "GERMAN", kind: "goal" }),
    );
    const pulses = [0, 1, 2, 3, 4, 5].map(() => Pulse(g));
    const cMap = chipOf(
      chips,
      "ghost",
      `${MEET_A.length} MEETINGS · ${gaps.length} FREE GAPS`,
    );
    const fChips = focus.map(() => chipOf(chips, "lime", "+1.5H FOCUS"));
    const gChips = german.map((b, i) =>
      chipOf(chips, "paper", `GERMAN · ${DAYS[b.s.day]} 08:30`),
    );
    SCEN.push({
      key: "week",
      tab: "PLAN MY WEEK",
      group: g,
      chips,
      prompt: "Plan my week around the launch — and keep German going.",
      uses: ["TASKS", "CALENDAR"],
      steps: [
        ["TASKS", "Pulls this week’s deadlines from Linear"],
        ["CALENDAR", "Maps every meeting and every free gap"],
        ["CALENDAR", "Places focus blocks before each deadline"],
        ["CALENDAR", "Fits three German sessions into your mornings"],
      ],
      done: "WEEK PLANNED · 4.5H FOCUS · 3× GERMAN · 0 CONFLICTS",
      cam: (t) =>
        kf(t, [
          [-1, OV],
          [0.05, OV],
          [0.35, { x: 1.6, y: 0.9, z: 0.9, zoom: 1.28 }],
          [0.95, { x: 1.6, y: 0.9, z: 0.9, zoom: 1.28 }],
          [1.25, OV],
          [1.95, OV],
          [2.25, { x: -0.5, y: 0.6, z: hourZ(13.75), zoom: 1.32 }],
          [2.95, { x: 0.2, y: 0.6, z: hourZ(13.75), zoom: 1.32 }],
          [3.25, { x: 0.1, y: 0.6, z: hourZ(9.5), zoom: 1.3 }],
          [3.95, { x: 0.9, y: 0.6, z: hourZ(9.5), zoom: 1.3 }],
          [4, OV],
        ]),
      update(t) {
        flags.forEach((f, i) => {
          const p = seg(t, 0.15 + i * 0.3, 0.4);
          f.fg.visible = p > 0;
          f.fg.scale.set(1, Math.max(0.001, outBack(p)), 1);
          f.chip.at(
            P(f.fg.position.x, 1.55, f.fg.position.z),
            win(t, 0.4 + i * 0.3, 1.9),
          );
        });
        riseAll(meets, t, 1, 0.028);
        const dimA = 1 - 0.42 * seg(t, 1.95, 0.25) * (1 - seg(t, 3.75, 0.25));
        meets.forEach((b) => b.dim(dimA));
        const ga =
          seg(t, 1.4, 0.25) *
          (1 - 0.85 * seg(t, 2.0, 0.4)) *
          (1 - seg(t, 3.8, 0.2));
        gaps.forEach((m, i) => {
          m.material.opacity = ga * (0.8 + 0.2 * Math.sin(clock.t * 4 + i));
          m.visible = ga > 0.01;
        });
        cMap.at(P(dayX(2), 0.25, hourZ(8) - 0.05), win(t, 1.45, 1.95));
        focus.forEach((b, i) => {
          const a = 2.05 + i * 0.28;
          drop(b, seg(t, a, 0.55));
          pulses[i].at(
            b.s.day,
            b.s.start,
            b.s.dur,
            b.h + 0.02,
            seg(t, a + 0.38, 0.5),
          );
          fChips[i].at(b.top(), win(t, a + 0.42, a + 1.05));
        });
        german.forEach((b, i) => {
          const a = 3.05 + i * 0.26;
          drop(b, seg(t, a, 0.55));
          pulses[3 + i].at(
            b.s.day,
            b.s.start,
            b.s.dur,
            b.h + 0.02,
            seg(t, a + 0.38, 0.5),
          );
          gChips[i].at(b.top(), seg(t, a + 0.42, 0.15));
        });
      },
    });
  })();

  /* ---- B · book a meeting ---- */
  (function () {
    const g = new THREE.Group(),
      chips = [];
    const you = meetsFrom(g, [
      [0, 9.5, 0.5, "STANDUP"],
      [0, 11, 1.5, "CLIENT"],
      [1, 10, 1, "REVIEW"],
      [1, 14, 1, "PITCH"],
      [2, 9, 1.5, "KICKOFF"],
      [2, 14, 1.5, "ROADMAP"],
      [3, 9, 1, "STANDUP"],
      [3, 13, 1, "SALES"],
      [4, 9.5, 1, "RETRO"],
      [4, 15, 1, "DEMO"],
    ]);
    const layer = (kind, list) => {
      const lg = new THREE.Group();
      g.add(lg);
      const tex = canvasTex(
        Math.round(W * 160),
        Math.round(D * 160),
        (x, cw, ch) => {
          x.fillStyle = "rgba(20,29,67,.6)";
          x.fillRect(0, 0, cw, ch);
          x.strokeStyle = "rgba(255,255,255,.2)";
          x.lineWidth = 3;
          for (let h = 8; h <= 18; h += 2) {
            const y = (hourZ(h) + D / 2) * 160;
            x.beginPath();
            x.moveTo(G * 160, y);
            x.lineTo(cw - PAD * 160, y);
            x.stroke();
          }
          for (let i = 0; i <= 5; i++) {
            const X = (G + CW * i) * 160;
            x.beginPath();
            x.moveTo(X, HD * 160);
            x.lineTo(X, ch - PAD * 160);
            x.stroke();
          }
        },
      );
      const plateMat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      lg.add(
        new THREE.Mesh(
          new THREE.PlaneGeometry(W, D).rotateX(-Math.PI / 2),
          plateMat,
        ),
      );
      const edge = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(
          rrShape(W, D, 0.05)
            .getPoints(4)
            .map((p) => new THREE.Vector3(p.x, 0, -p.y)),
        ),
        new THREE.LineBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.5,
        }),
      );
      lg.add(edge);
      const blocks = list.map(([day, start, dur]) =>
        Block(lg, { day, start, dur, label: "", kind }),
      );
      return { lg, plateMat, edge, blocks };
    };
    const sam = layer("sam", [
      [0, 10, 2],
      [1, 9, 1.5],
      [1, 13, 1],
      [2, 11, 1],
      [2, 15, 2],
      [3, 11, 1.5],
      [3, 14, 2],
      [4, 10, 2],
      [0, 15, 1.5],
      [4, 16, 1],
    ]);
    const pri = layer("priya", [
      [0, 13, 2],
      [1, 11, 1],
      [1, 15, 1],
      [2, 10, 1.5],
      [2, 13, 1],
      [3, 8, 2],
      [3, 12, 1],
      [4, 13, 1.5],
      [0, 8, 1],
      [4, 8.5, 1],
    ]);
    const BW = CW - 0.2,
      BD = RH - 0.07;
    const scanner = new THREE.Mesh(
      new THREE.BoxGeometry(5 * CW, 1, 0.05),
      new THREE.MeshBasicMaterial({
        color: HEX.lime,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    scanner.position.x = dayX(2);
    g.add(scanner);
    const pillar = new THREE.Mesh(
      new THREE.BoxGeometry(BW, 1, BD).translate(0, 0.5, 0),
      new THREE.MeshBasicMaterial({
        color: HEX.lime,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    const pillarEdge = new THREE.LineSegments(
      new THREE.EdgesGeometry(
        new THREE.BoxGeometry(BW, 1, BD).translate(0, 0.5, 0),
      ),
      new THREE.LineBasicMaterial({ color: HEX.lime, transparent: true }),
    );
    const pg = new THREE.Group();
    pg.add(pillar, pillarEdge);
    pg.position.set(dayX(3), 0, hourZ(10.5));
    g.add(pg);
    const booked = Block(g, {
      day: 3,
      start: 10,
      dur: 1,
      label: "SAM · PRIYA · YOU",
      kind: "book",
    });
    const pulses = [Pulse(g), Pulse(g)];
    const cYou = chipOf(chips, "lime", "YOU"),
      cSam = chipOf(chips, "cob", "SAM"),
      cPri = chipOf(chips, "paper", "PRIYA");
    const cScan = chipOf(chips, "ghost", "SCANNING 08:00 → 18:00");
    const cFree = chipOf(chips, "lime", "THU 10:00 · ALL THREE FREE");
    const cSent = chipOf(chips, "lime", "✓ INVITE SENT");
    const LX = -W / 2 + 0.35,
      LZ = -D / 2 + 0.1;
    SCEN.push({
      key: "book",
      tab: "BOOK A MEETING",
      group: g,
      chips,
      prompt: "Find an hour with Sam and Priya next week.",
      uses: ["CALENDAR", "EMAIL"],
      steps: [
        ["CALENDAR", "Lifts your calendar, Sam’s and Priya’s"],
        ["CALENDAR", "Scans all three for the same free hour"],
        ["CALENDAR", "Lands on Thursday 10:00 — free for everyone"],
        ["EMAIL", "Sends one invite. No back-and-forth"],
      ],
      done: "MEETING BOOKED · THU 10:00 · 1 INVITE · 0 EMAILS",
      cam: (t) =>
        kf(t, [
          [-1, OV],
          [0.2, OV],
          [0.9, { x: 0.15, y: 1.6, z: 0.2, zoom: 0.93 }],
          [1.95, { x: 0.15, y: 1.6, z: 0.2, zoom: 0.93 }],
          [2.3, { x: dayX(3) - 0.3, y: 1.5, z: hourZ(10.5), zoom: 1.28 }],
          [3.0, { x: dayX(3) - 0.3, y: 1.5, z: hourZ(10.5), zoom: 1.28 }],
          [3.4, { x: dayX(3) - 0.2, y: 0.4, z: hourZ(10.5), zoom: 1.5 }],
          [3.95, { x: dayX(3) - 0.2, y: 0.4, z: hourZ(10.5), zoom: 1.5 }],
          [4, OV],
        ]),
      update(t) {
        const up = ease(seg(t, 0.3, 0.65)) * (1 - ease(seg(t, 3.0, 0.55)));
        const la = seg(t, 0.25, 0.3) * (1 - seg(t, 3.25, 0.35));
        const dim = 1 - 0.5 * seg(t, 2.0, 0.3) * (1 - seg(t, 3.0, 0.3));
        riseAll(you, t, -0.4, 0.02);
        you.forEach((b) => {
          if (t > 0) b.place(b.s.day, b.s.start, 0, 1, 1);
          b.dim(dim);
        });
        [
          [sam, 1.05, cSam],
          [pri, 2.1, cPri],
        ].forEach(([L, hgt, c]) => {
          L.lg.position.y = up * hgt;
          L.lg.visible = la > 0;
          L.plateMat.opacity = la;
          L.edge.material.opacity = la * 0.5;
          L.blocks.forEach((b) => {
            b.place(b.s.day, b.s.start, 0.005, 1, la);
            b.dim(dim);
          });
          c.at(P(LX, up * hgt + 0.02, LZ), la * seg(t, 0.6, 0.2));
        });
        cYou.at(P(LX, 0.02, LZ), win(t, 0.3, 3.3));
        const sp = seg(t, 1.0, 0.95);
        scanner.visible = sp > 0 && sp < 1;
        const sz = lerp(hourZ(8), hourZ(18), ease(sp));
        scanner.position.z = sz;
        scanner.scale.y = 2.1 * up + 0.2;
        scanner.position.y = (2.1 * up) / 2;
        scanner.material.opacity = Math.sin(Math.PI * sp) * 0.55;
        cScan.at(
          P(dayX(4) + CW / 2, 2.1 * up + 0.25, sz),
          Math.sin(Math.PI * sp) * 1.6,
        );
        const pa = seg(t, 1.95, 0.35) * (1 - seg(t, 3.4, 0.3));
        pg.visible = pa > 0;
        pillar.material.opacity = pa * 0.34;
        pillarEdge.material.opacity = pa;
        const ph = Math.max(0.3, 2.25 * up + 0.3);
        pg.scale.y = ph;
        cFree.at(P(dayX(3), ph + 0.05, hourZ(10.5)), win(t, 2.15, 3.2));
        drop(booked, seg(t, 3.1, 0.6), 2.8);
        pulses[0].at(3, 10, 1, booked.h + 0.02, seg(t, 3.55, 0.6));
        pulses[1].at(3, 10, 1, booked.h + 0.02, seg(t, 3.75, 0.6));
        cSent.at(booked.top(), seg(t, 3.5, 0.2));
      },
    });
  })();

  /* ---- C · reschedule ---- */
  (function () {
    const g = new THREE.Group(),
      chips = [];
    const base = meetsFrom(
      g,
      MEET_A.filter((m) => !(m[0] === 1 && m[1] >= 14)),
    );
    const call = Block(g, {
      day: 1,
      start: 14,
      dur: 1,
      label: "CLIENT CALL",
      kind: "move",
    });
    const cl = [
      {
        s: {
          day: 1,
          start: 15.75,
          dur: 0.5,
          label: "ADMIN BATCH",
          kind: "meet",
        },
        to: [1, 17.25],
        txt: "→ TUE 17:15",
      },
      {
        s: { day: 1, start: 16.25, dur: 0.5, label: "1:1 SAM", kind: "meet" },
        to: [2, 10],
        txt: "→ WED 10:00",
      },
      {
        s: {
          day: 1,
          start: 16.75,
          dur: 1.25,
          label: "FOCUS · BRIEF",
          kind: "focus",
        },
        to: [1, 12],
        txt: "→ TUE 12:00",
      },
    ].map((o) => ({
      b: Block(g, o.s),
      to: o.to,
      kind: o.s.kind,
      clash: chipOf(chips, "sig", "⚠ CLASH · " + o.s.label),
      moved: chipOf(chips, "paper", o.txt),
    }));
    const pulses = [Pulse(g), Pulse(g)];
    const cCall = chipOf(chips, "cob", "CLIENT CALL · 14:00 → 16:00");
    const cSlack = chipOf(chips, "lime", "✓ SAM TOLD ON SLACK");
    SCEN.push({
      key: "move",
      tab: "RESCHEDULE",
      group: g,
      chips,
      prompt: "My client call moved to 16:00. Sort out Tuesday.",
      uses: ["CALENDAR", "SLACK"],
      steps: [
        ["CALENDAR", "Moves the client call 14:00 → 16:00"],
        ["CALENDAR", "Finds three clashes it just created"],
        ["CALENDAR", "Replans the rest of the week in one pass"],
        ["SLACK", "Posts Sam the new time for your 1:1"],
      ],
      done: "REPLANNED · 3 MOVED · 0 CONFLICTS",
      cam: (t) =>
        kf(t, [
          [-1, OV],
          [-0.1, OV],
          [0.3, { x: dayX(1) + 0.4, y: 0.7, z: hourZ(15.8), zoom: 1.62 }],
          [1.95, { x: dayX(1) + 0.4, y: 0.8, z: hourZ(15.8), zoom: 1.62 }],
          [2.3, { x: dayX(1.5), y: 0.7, z: hourZ(13.5), zoom: 1.2 }],
          [2.95, { x: dayX(1.5), y: 0.7, z: hourZ(13.5), zoom: 1.2 }],
          [3.25, { x: dayX(2), y: 0.4, z: hourZ(10.5), zoom: 1.6 }],
          [3.95, { x: dayX(2), y: 0.4, z: hourZ(10.5), zoom: 1.6 }],
          [4, OV],
        ]),
      update(t) {
        riseAll(base, t, -0.45, 0.012);
        const dim = 1 - 0.45 * seg(t, 0.1, 0.3) * (1 - seg(t, 3.75, 0.25));
        base.forEach((b) => b.dim(dim));
        const rise = seg(t, -0.45, 0.35);
        const pm = ease(seg(t, 0.2, 0.65));
        call.place(
          1,
          lerp(14, 16, pm),
          Math.sin(Math.PI * pm) * 0.8,
          ease(rise),
          rise * 3,
        );
        cCall.at(call.top(), win(t, 0.15, 1.05));
        cl.forEach((c, i) => {
          const lift = ease(seg(t, 0.9 + i * 0.08, 0.3)),
            fe = 2.05 + i * 0.25,
            fly = ease(seg(t, fe, 0.55));
          c.b.kind(lift > 0.5 && fly < 0.5 ? "clash" : c.kind);
          c.b.dim(fly > 0.5 || lift < 0.5 ? dim + (1 - dim) * 0.6 : 1);
          const jit =
            lift > 0.9 && fly === 0 && !ENV.reduce
              ? Math.sin(clock.t * 22 + i * 2) * 0.03
              : 0;
          const y =
            lift * (1 - fly) * (0.55 + i * 0.5) + Math.sin(Math.PI * fly) * 1.1;
          c.b.place(
            lerp(1, c.to[0], fly) + jit,
            lerp(c.b.s.start, c.to[1], fly),
            y,
            ease(rise),
            rise * 3,
          );
          c.clash.at(c.b.top(), win(t, 1.1 + i * 0.1, fe + 0.05, 0.12));
          c.moved.at(c.b.top(), win(t, fe + 0.55, fe + 1.1, 0.12));
        });
        pulses[0].at(2, 10, 0.5, 0.3, seg(t, 3.15, 0.65));
        pulses[1].at(2, 10, 0.5, 0.3, seg(t, 3.45, 0.65));
        cSlack.at(cl[1].b.top(), seg(t, 3.25, 0.2));
      },
    });
  })();

  /* ---- D · inbox → calendar ---- */
  (function () {
    const g = new THREE.Group(),
      chips = [];
    const base = meetsFrom(g, MEET_A);
    const MAIL = [
      ["LINEAR", "Weekly digest"],
      ["NORA · VENDOR", "Quick call on the renewal?", 0],
      ["BILLING", "Your invoice is ready"],
      ["CI", "Build passed on main"],
      ["DESIGN", "Re: launch copy v3"],
      ["NEWSLETTER", "The week in product"],
      ["MAYA · PEOPLE", "Panel for the design hire?", 1],
      ["DRIVE", "Shared: Q3 board deck"],
      ["OPS", "Offsite — plan it Friday?", 2],
      ["SECURITY", "New sign-in on Mac"],
      ["SAM", "Notes from Tuesday"],
      ["TRAVEL", "Your trip receipt"],
    ];
    const TARGET = [
      { day: 1, start: 12, dur: 0.5, label: "VENDOR CALL" },
      { day: 3, start: 14, dur: 1, label: "HIRING PANEL" },
      { day: 4, start: 11, dur: 1, label: "OFFSITE PLAN" },
    ];
    const CWD = 1.25,
      CDD = 0.8;
    const mailTex = (from, subj, req) =>
      canvasTex(750, 480, (x, w, h) => {
        x.fillStyle = req ? "#CCFF00" : "#F2F2F2";
        x.fillRect(0, 0, w, h);
        x.strokeStyle = "rgba(18,18,18,.18)";
        x.lineWidth = 6;
        x.beginPath();
        x.moveTo(0, 0);
        x.lineTo(w / 2, h * 0.44);
        x.lineTo(w, 0);
        x.stroke();
        x.fillStyle = "#121212";
        x.textBaseline = "alphabetic";
        x.font = `800 54px ${FONT}`;
        x.fillText(fit(x, from, w - 70), 36, h - 150);
        x.font = `600 42px ${FONT}`;
        x.globalAlpha = 0.85;
        x.fillText(fit(x, subj, w - 70), 36, h - 80);
        x.globalAlpha = 1;
      });
    const cards = MAIL.map((m, i) => {
      const mats = [
        mailTex(m[0], m[1], false),
        m[2] !== undefined ? mailTex(m[0], m[1], true) : null,
      ];
      const mat = new THREE.MeshBasicMaterial({
        map: mats[0],
        transparent: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(CWD, CDD).rotateX(-Math.PI / 2),
        mat,
      );
      g.add(mesh);
      const c = i % 4,
        r = Math.floor(i / 4);
      return {
        mesh,
        mat,
        mats,
        req: m[2],
        home: new THREE.Vector3(
          (c - 1.5) * 1.42,
          2.45 + r * 0.18,
          (r - 1) * 0.98 - 0.3,
        ),
        i,
        ask:
          m[2] !== undefined ? chipOf(chips, "ghost", "ASKS FOR A TIME") : null,
      };
    });
    const blocks = TARGET.map((s) => Block(g, { ...s, kind: "book" }));
    const pulses = TARGET.map(() => Pulse(g));
    const cUnread = chipOf(chips, "ghost", "12 UNREAD THREADS");
    const cConf = blocks.map(() => chipOf(chips, "lime", "✓ CONFIRMED"));
    const tmp = new THREE.Vector3(),
      dst = new THREE.Vector3();
    SCEN.push({
      key: "inbox",
      tab: "INBOX → CALENDAR",
      group: g,
      chips,
      prompt: "Anything in my inbox that should be on my calendar?",
      uses: ["EMAIL", "CALENDAR"],
      steps: [
        ["EMAIL", "Reads this week’s unread threads"],
        ["EMAIL", "Picks out the three that ask for a time"],
        ["CALENDAR", "Turns each one into a booking"],
        ["EMAIL", "Replies to confirm, from your address"],
      ],
      done: "3 REQUESTS → 3 BOOKINGS · INBOX CLEARED",
      cam: (t) =>
        kf(t, [
          [-1, OV],
          [-0.2, { x: 0.1, y: 2.2, z: -0.3, zoom: 1.12 }],
          [1.9, { x: 0.1, y: 2.3, z: -0.3, zoom: 1.12 }],
          [2.3, { x: 0.3, y: 1.0, z: 0.2, zoom: 1.0 }],
          [2.95, { x: 0.3, y: 1.0, z: 0.2, zoom: 1.0 }],
          [3.2, { x: 0.6, y: 0.5, z: 0.2, zoom: 1.08 }],
          [3.95, { x: 0.6, y: 0.5, z: 0.2, zoom: 1.08 }],
          [4, OV],
        ]),
      update(t) {
        riseAll(base, t, -0.45, 0.012);
        const dim = 1 - 0.4 * seg(t, 1.9, 0.3) * (1 - seg(t, 3.75, 0.25));
        base.forEach((b) => b.dim(dim));
        cUnread.at(P(0.1, 3.1, -1.4), win(t, 0.55, 1.2));
        cards.forEach((c) => {
          const arr = ease(seg(t, 0.05 + c.i * 0.045, 0.55));
          let a = clamp(arr * 3);
          const pos = tmp.copy(c.home);
          pos.y = lerp(8, c.home.y, arr);
          pos.x = lerp(c.home.x - 3, c.home.x, arr);
          let rx = lerp(1.1, 0.55, arr),
            sc = 1;
          if (c.req === undefined) {
            const f = seg(t, 1.15 + c.i * 0.03, 0.5);
            pos.y += ease(f) * 1.8;
            a *= 1 - f;
          } else {
            const lit = seg(t, 1.1, 0.2);
            c.mat.map = lit > 0.5 ? c.mats[1] : c.mats[0];
            pos.y += Math.sin(Math.PI * clamp(lit)) * 0.25 + lit * 0.2;
            sc = 1 + lit * 0.1;
            const f = ease(seg(t, 2.05 + c.req * 0.3, 0.62));
            const b = blocks[c.req];
            pos.lerp(
              dst.set(dayX(b.s.day), 0.5, hourZ(b.s.start + b.s.dur / 2)),
              f,
            );
            pos.y += Math.sin(Math.PI * f) * 0.9;
            rx = lerp(rx, 0, f);
            sc = lerp(sc, 0.9, f);
            a *= 1 - seg(t, 2.05 + c.req * 0.3 + 0.55, 0.12);
            c.ask.at(
              P(pos.x, pos.y + 0.3, pos.z - 0.2),
              win(t, 1.25, 2.05 + c.req * 0.3, 0.12),
            );
          }
          c.mesh.visible = a > 0.01;
          c.mat.opacity = a;
          c.mesh.position.copy(pos);
          c.mesh.rotation.x = rx;
          c.mesh.scale.setScalar(sc);
        });
        blocks.forEach((b, k) => {
          const p = seg(t, 2.05 + k * 0.3 + 0.52, 0.25);
          b.place(b.s.day, b.s.start, 0, outBack(p), p * 4);
          pulses[k].at(
            b.s.day,
            b.s.start,
            b.s.dur,
            b.h + 0.02,
            seg(t, 3.1 + k * 0.22, 0.7),
          );
          cConf[k].at(b.top(), seg(t, 3.15 + k * 0.22, 0.2));
        });
      },
    });
  })();
  SCEN.forEach((s) => {
    s.group.visible = false;
    scene.add(s.group);
  });

  /* camera: director target + gentle pointer tilt */
  const camS = { ...OV },
    target = new THREE.Vector3();
  let tiltX = 0,
    tiltY = 0,
    tx = 0,
    ty = 0,
    aspect = 1,
    half = 4.15,
    need = true;
  function placeCam() {
    target.set(camS.x, camS.y, camS.z);
    const az = THREE.MathUtils.degToRad(-16 + tiltX * 5),
      pol = THREE.MathUtils.degToRad(40 + tiltY * 3),
      r = 30;
    camera.position.set(
      target.x + r * Math.sin(pol) * Math.sin(az),
      target.y + r * Math.cos(pol),
      target.z + r * Math.sin(pol) * Math.cos(az),
    );
    camera.lookAt(target);
    camera.zoom = camS.zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
  track(
    onResize(stage, (w, h) => {
      view.w = w;
      view.h = h;
      renderer.setSize(w, h, false);
      aspect = w / Math.max(h, 1);
      half = Math.max(h < 460 ? 4.6 : 4.15, 5.8 / aspect);
      camera.left = -half * aspect;
      camera.right = half * aspect;
      camera.top = half;
      camera.bottom = -half;
      camera.updateProjectionMatrix();
      need = true;
    }),
  );
  on(stage, "pointermove", (e) => {
    const r = stage.getBoundingClientRect();
    tx = ((e.clientX - r.left) / r.width - 0.5) * 2;
    ty = ((e.clientY - r.top) / r.height - 0.5) * 2;
  });
  on(stage, "pointerleave", () => {
    tx = 0;
    ty = 0;
  });

  /* UI */
  const modesEl = $("modes"),
    askEl = $("ask-text"),
    usesEl = $("uses"),
    resEl = $("result"),
    resTxt = $("result-text"),
    statusEl = $("status"),
    stepsEl = $("steps");
  SCEN.forEach((s, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "tab");
    b.textContent = s.tab;
    on(b, "click", () => {
      touched = true;
      setMode(i, true);
    });
    modesEl.appendChild(b);
  });
  const STEP = 2.6,
    PRE = -0.5,
    END = 4.8;
  // Plays once when first scrolled into view, then holds the finished plan.
  // No auto-advance between examples: the visitor picks the next one.
  let mode = 0,
    t = 4,
    playing = false,
    played = false,
    touched = false,
    visible = false,
    lastStep = -9,
    lastTyped = -1;
  function setMode(i, play) {
    SCEN[mode].group.visible = false;
    SCEN[mode].chips.forEach((c) => c.hide());
    mode = i;
    const s = SCEN[i];
    s.group.visible = true;
    [...modesEl.children].forEach((b, j) =>
      b.setAttribute("aria-selected", String(j === i)),
    );
    usesEl.innerHTML = s.uses.map((u) => `<span>${u}</span>`).join("");
    resTxt.textContent = s.done;
    stepsEl.replaceChildren(
      ...s.steps.map(([tool, text]) => {
        const li = document.createElement("li");
        const body = document.createElement("span");
        const tag = document.createElement("small");
        body.textContent = text;
        tag.textContent = tool;
        body.appendChild(tag);
        li.appendChild(body);
        return li;
      }),
    );
    lastStep = -9;
    lastTyped = -1;
    if (play && !ENV.reduce) {
      t = PRE;
      playing = true;
    } else {
      t = END;
      playing = false;
    }
    need = true;
  }
  on($("replay"), "click", () => {
    touched = true;
    if (ENV.reduce) {
      t = END;
    } else {
      t = PRE;
      playing = true;
    }
    need = true;
  });
  function syncUI() {
    const s = SCEN[mode];
    const chars =
      t >= PRE + 0.45
        ? s.prompt.length
        : Math.floor(s.prompt.length * seg(t, PRE, 0.45));
    if (chars !== lastTyped) {
      lastTyped = chars;
      askEl.innerHTML =
        s.prompt.slice(0, chars).replace(/</g, "&lt;") +
        (chars < s.prompt.length ? '<span class="caret"></span>' : "");
    }
    const step = t >= 4 ? 4 : Math.floor(Math.max(t, -1));
    if (step !== lastStep) {
      lastStep = step;
      const fin = t >= 4;
      resEl.classList.toggle("on", fin);
      statusEl.textContent = fin ? "PLANNED" : "PLANNING…";
      [...stepsEl.children].forEach((li, j) => {
        li.className = fin || j < step ? "done" : j === step ? "now" : "";
      });
    }
  }
  setMode(0, false);
  track(
    onVisible(stage, (v) => {
      visible = v;
      if (v && !ENV.reduce && !touched && t >= END && !played) {
        setMode(mode, true);
      }
    }),
  );

  let prev = performance.now();
  const perf = Perf(renderer);
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const ms = now - prev,
      dt = Math.min(0.1, ms / 1000);
    prev = now;
    if (!visible && !need) return;
    perf(ms);
    clock.t += dt;
    if (playing) {
      t += dt / STEP;
      if (t >= END) {
        t = END;
        playing = false;
        played = true;
      }
    }
    const want = SCEN[mode].cam(t),
      k = ENV.reduce || need ? 1 : 1 - Math.exp(-dt * 4.2);
    camS.x += (want.x - camS.x) * k;
    camS.y += (want.y - camS.y) * k;
    camS.z += (want.z - camS.z) * k;
    camS.zoom += (want.zoom - camS.zoom) * k;
    tiltX += (tx - tiltX) * 0.05;
    tiltY += (ty - tiltY) * 0.05;
    placeCam();
    SCEN[mode].update(t);
    syncUI();
    renderer.render(scene, camera);
    need = false;
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
    modesEl.replaceChildren();
    usesEl.replaceChildren();
    stepsEl.replaceChildren();
    askEl.textContent = "";
  };
}
