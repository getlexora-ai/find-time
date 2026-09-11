// Find Time landing — 3D engine (plain three.js, framework-agnostic)
// Ported 1:1 from the approved artifact. Written for current three.js (r15x+).
import * as THREE from "three";
import {
  ENV,
  HEX,
  LEGACY_LIGHT,
  clamp,
  makeRenderer,
  makeCanvas,
  disposeScene,
  onVisible,
  onResize,
  slabGeo,
  canvasTex,
  glowSprite,
  pointsMat,
  projectTo,
  Perf,
} from "./shared";

/* ================= PRIVACY — the dome =================
   Fresnel/grid shader dome with impact ripples (uHit uniforms),
   inside data flow, outside probes that bounce off. */
export function createPrivacyDome(root) {
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
  const stage = $("stage-dome"),
    tagsEl = $("tags-dome");
  const canvas = makeCanvas(
    stage,
    "3D shield dome: data circulates inside while outside requests bounce off",
  );
  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 2, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x202020, 0.7 * LEGACY_LIGHT));
  const dl = new THREE.DirectionalLight(0xffffff, 0.7 * LEGACY_LIGHT);
  dl.position.set(3, 8, 6);
  scene.add(dl);
  const R = 3.2;

  /* floor */
  const floorTex = canvasTex(2048, 2048, (x, w, h) => {
    const c = w / 2,
      px = (v) => (v / 7.4) * c;
    const g = x.createRadialGradient(c, c, px(R * 0.2), c, c, c);
    g.addColorStop(0, "rgba(204,255,0,.10)");
    g.addColorStop(px(R) / c, "rgba(204,255,0,.05)");
    g.addColorStop(px(R) / c + 0.002, "rgba(255,255,255,.03)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, w, h);
    for (let r = 0.8; r < 7.4; r += 0.8) {
      x.beginPath();
      x.arc(c, c, px(r), 0, Math.PI * 2);
      x.strokeStyle =
        r < R
          ? "rgba(204,255,0,.22)"
          : `rgba(255,255,255,${0.1 * (1 - r / 7.4)})`;
      x.lineWidth = 3;
      x.stroke();
    }
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * px(0.5), c + Math.sin(a) * px(0.5));
      x.lineTo(c + Math.cos(a) * px(7), c + Math.sin(a) * px(7));
      x.strokeStyle = "rgba(255,255,255,.05)";
      x.stroke();
    }
    x.beginPath();
    x.arc(c, c, px(R), 0, Math.PI * 2);
    x.strokeStyle = "rgba(204,255,0,.9)";
    x.lineWidth = 5;
    x.stroke();
  });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14.8, 14.8).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: floorTex,
      transparent: true,
      depthWrite: false,
    }),
  );
  scene.add(floor);

  /* dome shader */
  const hits = [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4(0, 10, 0, -99));
  const domeMat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uHit: { value: hits },
      uLime: { value: new THREE.Color(HEX.lime) },
      uSig: { value: new THREE.Color(HEX.signal) },
      uR: { value: R },
    },
    vertexShader: `varying vec3 vN;varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader: `uniform float uTime;uniform vec3 uCam;uniform vec4 uHit[6];uniform vec3 uLime;uniform vec3 uSig;uniform float uR;varying vec3 vN;varying vec3 vW;
      float ln(float v){float d=abs(fract(v+.5)-.5)/max(fwidth(v),1e-4);return 1.-min(d,1.);}
      void main(){
        vec3 V=normalize(uCam-vW);vec3 p=normalize(vW);
        float fr=pow(1.-abs(dot(normalize(vN),V)),2.4);
        float lon=atan(p.z,p.x)/6.28318*28.;float lat=asin(clamp(p.y,-1.,1.))/1.5708*7.;
        float grid=max(ln(lon),ln(lat))*smoothstep(1.,.7,p.y);
        vec3 col=uLime*(fr*.62+grid*.16+.02);float a=fr*.6+grid*.2+.035;
        for(int i=0;i<6;i++){
          float age=uTime-uHit[i].w;
          if(age>0.&&age<1.8){
            float d=acos(clamp(dot(p,normalize(uHit[i].xyz)),-1.,1.))*uR;
            float ring=smoothstep(.22,0.,abs(d-age*2.4))*(1.-age/1.8);
            float core=smoothstep(.9,0.,d)*max(0.,1.-age*2.2);
            col+=uSig*(ring*1.4+core*1.8)+uLime*ring*grid*1.5;a+=ring*.9+core;
          }
        }
        gl_FragColor=vec4(col,clamp(a,0.,1.));
      }`,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(R, 96, 48, 0, Math.PI * 2, 0, Math.PI / 2),
    domeMat,
  );
  scene.add(dome);

  /* inside: tools → Find Time → you */
  const coreG = new THREE.Group();
  coreG.position.set(0, 1.2, 0);
  scene.add(coreG);
  const coreM = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.42, 1),
    new THREE.MeshStandardMaterial({
      color: HEX.lime,
      emissive: HEX.lime,
      emissiveIntensity: 0.45,
      flatShading: true,
      roughness: 0.4,
    }),
  );
  coreG.add(coreM);
  const cage = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.68, 0)),
    new THREE.LineBasicMaterial({
      color: HEX.lime,
      transparent: true,
      opacity: 0.6,
    }),
  );
  coreG.add(cage);
  const cglow = glowSprite("rgba(204,255,0,1)", 3.2, 0.35);
  coreG.add(cglow);
  const youG = new THREE.Group();
  youG.position.set(0, 2.45, 0);
  scene.add(youG);
  youG.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
      }),
    ),
  );
  const youRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.015, 8, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
    }),
  );
  youRing.rotation.x = Math.PI / 2;
  youG.add(youRing);
  const TOOLN = [
    "CALENDAR",
    "EMAIL",
    "SLACK",
    "TASKS",
    "MEETINGS",
    "DOCS",
    "CLOUD",
    "BROWSER",
  ];
  const toolGeo = slabGeo(0.34, 0.34, 0.34, 0.07);
  const inside = TOOLN.map((n, i) => {
    const a = (i / TOOLN.length) * Math.PI * 2 + 0.2,
      m = new THREE.Mesh(toolGeo, [
        new THREE.MeshStandardMaterial({
          color: i === 0 ? HEX.lime : 0xf2f2f2,
          emissive: i === 0 ? HEX.lime : 0x000000,
          emissiveIntensity: 0.3,
        }),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? 0x8db000 : 0xaeb6ce,
        }),
      ]);
    m.position.set(Math.cos(a) * 2.05, 0.02, Math.sin(a) * 2.05);
    scene.add(m);
    return { m, tag: tag("in", n) };
  });
  function tag(cls, html) {
    const d = document.createElement("div");
    d.className = "dtag " + cls;
    d.innerHTML = html;
    tagsEl.appendChild(d);
    return d;
  }
  const coreTag = tag("core", "FIND TIME"),
    youTag = tag("you", "YOU");

  const PER = 9,
    NIN = TOOLN.length * PER,
    NUP = 14;
  const fpos = new Float32Array(NIN * 3),
    fal = new Float32Array(NIN);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute("position", new THREE.BufferAttribute(fpos, 3));
  fg.setAttribute("aA", new THREE.BufferAttribute(fal, 1));
  scene.add(new THREE.Points(fg, pointsMat(HEX.lime, 4.2)));
  const upos = new Float32Array(NUP * 3),
    ual = new Float32Array(NUP);
  const ug = new THREE.BufferGeometry();
  ug.setAttribute("position", new THREE.BufferAttribute(upos, 3));
  ug.setAttribute("aA", new THREE.BufferAttribute(ual, 1));
  scene.add(new THREE.Points(ug, pointsMat(0xffffff, 4.2)));
  inside.forEach((o) => {
    const l = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        o.m.position.clone().setY(0.2),
        new THREE.Vector3(0, 1.2, 0),
      ]),
      new THREE.LineBasicMaterial({
        color: HEX.lime,
        transparent: true,
        opacity: 0.12,
      }),
    );
    scene.add(l);
  });

  /* outside actors + probes */
  const ACT = [
    "AD NETWORKS",
    "DATA BROKERS",
    "MODEL TRAINING",
    "OTHER COMPANIES",
  ];
  const actors = ACT.map((n, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4,
      pos = new THREE.Vector3(
        Math.cos(a) * 6.1,
        1.05 + (i % 2) * 0.4,
        Math.sin(a) * 6.1,
      );
    const g = new THREE.Group();
    g.position.copy(pos);
    scene.add(g);
    g.add(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(0.3, 0),
        new THREE.MeshStandardMaterial({
          color: 0x2a1a14,
          roughness: 0.6,
          flatShading: true,
        }),
      ),
    );
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.42, 0)),
      new THREE.LineBasicMaterial({
        color: HEX.signal,
        transparent: true,
        opacity: 0.8,
      }),
    );
    g.add(wire);
    const probe = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 12, 8),
      new THREE.MeshBasicMaterial({ color: HEX.signal }),
    );
    scene.add(probe);
    probe.visible = false;
    const trailPts = new Float32Array(10 * 3);
    const tg = new THREE.BufferGeometry();
    tg.setAttribute("position", new THREE.BufferAttribute(trailPts, 3));
    const trail = new THREE.Line(
      tg,
      new THREE.LineBasicMaterial({
        color: HEX.signal,
        transparent: true,
        opacity: 0.55,
      }),
    );
    scene.add(trail);
    trail.visible = false;
    const lbl = tag("out", n);
    return {
      g,
      wire,
      pos,
      probe,
      trail,
      trailPts,
      lbl,
      wait: 0.6 + i * 0.75,
      state: 0,
      p: new THREE.Vector3(),
      v: new THREE.Vector3(),
      hist: [],
      hitT: -9,
    };
  });
  /* sealed items */
  const SEAL = ["WALLETS", "CONTACTS", "PASSWORDS", "PAYMENT CARDS"];
  const seals = SEAL.map((n, i) => {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 2 + 0.0,
      pos = new THREE.Vector3(Math.cos(a) * 4.95, 0.36, Math.sin(a) * 4.95);
    const g = new THREE.Group();
    g.position.copy(pos);
    scene.add(g);
    g.add(
      new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(0.72, 0.72, 0.72)),
        new THREE.LineDashedMaterial({
          color: HEX.signal,
          transparent: true,
          opacity: 0.7,
          dashSize: 0.06,
          gapSize: 0.05,
        }),
      ).computeLineDistances(),
    );
    const shapes = [
      new THREE.BoxGeometry(0.42, 0.28, 0.1),
      new THREE.BoxGeometry(0.3, 0.4, 0.06),
      new THREE.TorusGeometry(0.1, 0.035, 8, 20),
      new THREE.BoxGeometry(0.44, 0.28, 0.03),
    ];
    const inner = new THREE.Mesh(
      shapes[i],
      new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.8 }),
    );
    g.add(inner);
    const slash = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.03, 0.03),
      new THREE.MeshBasicMaterial({ color: HEX.signal }),
    );
    slash.rotation.z = Math.PI / 4;
    g.add(slash);
    return { g, inner, slash, lbl: tag("seal", `<s>${n}</s>`) };
  });

  /* sparks */
  const NS = 90,
    spos = new Float32Array(NS * 3),
    sal = new Float32Array(NS),
    svel = new Float32Array(NS * 3),
    slife = new Float32Array(NS);
  let sHead = 0;
  const sg = new THREE.BufferGeometry();
  sg.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  sg.setAttribute("aA", new THREE.BufferAttribute(sal, 1));
  scene.add(new THREE.Points(sg, pointsMat(HEX.signal, 5)));
  function burst(at, normal) {
    for (let k = 0; k < 12; k++) {
      const j = sHead++ % NS;
      spos.set([at.x, at.y, at.z], j * 3);
      const v = new THREE.Vector3(
        Math.random() - 0.5,
        Math.random() - 0.2,
        Math.random() - 0.5,
      )
        .multiplyScalar(2.2)
        .add(normal.clone().multiplyScalar(2.4));
      svel.set([v.x, v.y, v.z], j * 3);
      slife[j] = 1;
    }
  }
  let hitHead = 0;

  /* camera control */
  let az = 0.55,
    el = 0.34,
    dragging = false,
    lx = 0,
    ly = 0,
    idle = 0,
    W2 = 1,
    H2 = 1,
    visible = false,
    dist = 16;
  on(canvas, "pointerdown", (e) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  on(canvas, "pointermove", (e) => {
    if (!dragging) return;
    az -= (e.clientX - lx) * 0.006;
    el = clamp(el + (e.clientY - ly) * 0.004, 0.12, 0.72);
    lx = e.clientX;
    ly = e.clientY;
    idle = 0;
  });
  const end = () => {
    dragging = false;
  };
  on(canvas, "pointerup", end);
  on(canvas, "pointercancel", end);
  track(
    onResize(stage, (w, h) => {
      W2 = w;
      H2 = h;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
      const tn = Math.tan(THREE.MathUtils.degToRad(15));
      dist = Math.max(7.1 / (tn * camera.aspect), 4.35 / tn);
    }),
  );
  track(
    onVisible(stage, (v) => {
      visible = v;
    }),
  );

  const tmp = new THREE.Vector3(),
    tgt = new THREE.Vector3(0, 1.25, 0);
  let T = 0,
    prev = performance.now(),
    first = true;
  const perf = Perf(renderer);
  const place = (el_, v, dy = 0) => {
    tmp.copy(v).setY(v.y + dy);
    const near = camera.position.distanceTo(tmp) < dist - 0.4;
    const q = projectTo(tmp, camera, W2, H2);
    el_.style.transform = `translate(${q.x.toFixed(1)}px,${q.y.toFixed(1)}px) translate(-50%,-50%)`;
    el_.style.visibility = q.z < 1 ? "visible" : "hidden";
    el_.style.opacity = near ? "1" : ".5";
  };
  function frame(now) {
    if (dead) return;
    raf = requestAnimationFrame(frame);
    const ms = now - prev,
      dt = Math.min(0.1, ms / 1000);
    prev = now;
    if (!visible && !first) return;
    first = false;
    perf(ms);
    T += ENV.reduce ? 0 : dt;
    idle += dt;
    if (!dragging && idle > 2.5 && !ENV.reduce) az += dt * 0.06;
    camera.position.set(
      tgt.x + dist * Math.cos(el) * Math.sin(az),
      tgt.y + dist * Math.sin(el),
      tgt.z + dist * Math.cos(el) * Math.cos(az),
    );
    camera.lookAt(tgt);
    camera.updateMatrixWorld();
    domeMat.uniforms.uTime.value = T;
    domeMat.uniforms.uCam.value.copy(camera.position);
    coreM.rotation.y = T * 0.5;
    coreM.rotation.x = T * 0.23;
    cage.rotation.y = -T * 0.3;
    cage.rotation.z = T * 0.17;
    coreG.position.y = 1.2 + Math.sin(T * 1.2) * 0.05;
    youRing.scale.setScalar(1 + 0.12 * Math.sin(T * 2));
    // inside flow
    inside.forEach((o, i) => {
      const p = o.m.position;
      for (let j = 0; j < PER; j++) {
        const s = (T * 0.38 + j / PER + i * 0.07) % 1,
          u = 1 - s,
          k = i * PER + j;
        const cx = p.x * 0.45,
          cy = 1.6,
          cz = p.z * 0.45;
        fpos[k * 3] = u * u * p.x + 2 * u * s * cx + s * s * 0;
        fpos[k * 3 + 1] = u * u * (p.y + 0.2) + 2 * u * s * cy + s * s * 1.2;
        fpos[k * 3 + 2] = u * u * p.z + 2 * u * s * cz + s * s * 0;
        fal[k] = ENV.reduce ? 0.5 : Math.sin(Math.PI * s);
      }
      place(o.tag, p, -0.34);
    });
    for (let j = 0; j < NUP; j++) {
      const s = (T * 0.5 + j / NUP) % 1,
        sw = Math.sin(s * Math.PI * 2 + j) * 0.18 * (1 - s);
      upos[j * 3] = sw;
      upos[j * 3 + 1] = 1.2 + s * 1.25;
      upos[j * 3 + 2] = Math.cos(s * Math.PI * 2 + j) * 0.18 * (1 - s);
      ual[j] = ENV.reduce ? 0.5 : Math.sin(Math.PI * s);
    }
    fg.attributes.position.needsUpdate = true;
    fg.attributes.aA.needsUpdate = true;
    ug.attributes.position.needsUpdate = true;
    ug.attributes.aA.needsUpdate = true;
    place(coreTag, coreG.position, -0.95);
    place(youTag, youG.position, 0.42);
    // probes
    actors.forEach((A, i) => {
      A.g.rotation.y = T * 0.8 + i;
      A.wire.rotation.x = T * 0.6;
      A.g.position.y = A.pos.y + Math.sin(T + i) * 0.12;
      place(A.lbl, A.g.position, -0.7);
      A.lbl.classList.toggle("hit", T - A.hitT < 0.9);
      if (ENV.reduce) return;
      if (A.state === 0) {
        A.wait -= dt;
        if (A.wait <= 0) {
          A.state = 1;
          A.p.copy(A.g.position);
          const aim = new THREE.Vector3(
            (Math.random() - 0.5) * 1.8,
            0.8 + Math.random() * 1.6,
            (Math.random() - 0.5) * 1.8,
          );
          A.v.copy(aim).sub(A.p).normalize().multiplyScalar(5.2);
          A.hist.length = 0;
        }
      }
      if (A.state === 1) {
        A.p.addScaledVector(A.v, dt);
        A.hist.unshift(A.p.clone());
        if (A.hist.length > 10) A.hist.pop();
        if (A.p.length() <= R && A.p.y >= 0) {
          const n = A.p.clone().normalize(),
            hp = n.clone().multiplyScalar(R);
          hits[hitHead++ % hits.length].set(hp.x, hp.y, hp.z, T);
          burst(hp, n);
          A.hitT = T;
          A.state = 0;
          A.wait = 1.2 + Math.random() * 2.4;
        }
      }
      A.probe.visible = A.state === 1;
      A.probe.position.copy(A.p);
      A.trail.visible = A.state === 1 && A.hist.length > 1;
      for (let k = 0; k < 10; k++) {
        const h = A.hist[Math.min(k, A.hist.length - 1)] || A.p;
        A.trailPts[k * 3] = h.x;
        A.trailPts[k * 3 + 1] = h.y;
        A.trailPts[k * 3 + 2] = h.z;
      }
      A.trail.geometry.attributes.position.needsUpdate = true;
    });
    for (let j = 0; j < NS; j++) {
      if (slife[j] > 0) {
        slife[j] -= dt * 1.3;
        svel[j * 3 + 1] -= dt * 4;
        spos[j * 3] += svel[j * 3] * dt;
        spos[j * 3 + 1] += svel[j * 3 + 1] * dt;
        spos[j * 3 + 2] += svel[j * 3 + 2] * dt;
        sal[j] = Math.max(0, slife[j]);
      } else sal[j] = 0;
    }
    sg.attributes.position.needsUpdate = true;
    sg.attributes.aA.needsUpdate = true;
    seals.forEach((S, i) => {
      S.inner.rotation.y = T * 0.4 + i;
      place(S.lbl, S.g.position, -0.62);
    });
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
  };
}
