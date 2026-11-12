/**
 * The Prism scene: one painted dusk sky (blue → violet → pink → orange, hills),
 * rendered once into an offscreen 1600×1000 canvas and sliced into every
 * `<canvas>` that shows it (the header band, the popover strip). Ported as-is
 * from the Prism artifact; WebGL first, a 2D painting when WebGL is missing.
 *
 * Web only (DOM canvas). Static: the band never animates, so it reads at rest.
 */

const FS = `precision highp float;
uniform vec2 res; uniform float t; uniform vec2 vp; uniform float clearCol;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<6;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
vec3 skyc(float y){
  vec3 c=mix(vec3(.075,.21,.75),vec3(.17,.27,.85),smoothstep(0.,.3,y));
  c=mix(c,vec3(.42,.31,.94),smoothstep(.25,.52,y));
  c=mix(c,vec3(.72,.30,.77),smoothstep(.48,.68,y));
  c=mix(c,vec3(1.,.31,.53),smoothstep(.64,.76,y));
  c=mix(c,vec3(1.,.55,.32),smoothstep(.72,.79,y));
  return c;}
float ridge(float x,float base,float amp,float sc,float sd){return base+amp*(fbm(vec2(x*sc+sd,sd))-.5);}
void main(){
  vec2 fc=gl_FragCoord.xy;
  float x=fc.x/res.x;
  float y=vp.x+(1.-fc.y/res.y)*(vp.y-vp.x);
  float px=(vp.y-vp.x)/res.y;
  vec3 col=skyc(y);
  vec2 d=vec2((x-.74)*1.6,(y-.79));
  float glow=exp(-dot(d,d)*7.);
  col+=vec3(1.,.62,.45)*glow*.5+vec3(1.,.93,.8)*exp(-dot(d,d)*90.)*.55;
  vec2 q=vec2(x*1.6,y);
  float band=smoothstep(.02,.1,y)*smoothstep(.56,.34,y);
  float keep=1.-clearCol*.7*exp(-pow((x-.5)/.17,2.))*smoothstep(.46,.22,y);
  vec2 w=vec2(t*.006,0.);
  float n=fbm(q*vec2(1.7,3.8)+w);
  float nl=fbm(q*vec2(1.7,3.8)+w+vec2(0.,.07));
  float c1=smoothstep(.47,.6,n)*band*keep;
  vec3 up=mix(vec3(.6,.6,1.),vec3(1.,1.,1.),clamp((n-nl)*7.+.6,0.,1.));
  col=mix(col,up,c1);
  float band2=smoothstep(.46,.58,y)*smoothstep(.8,.7,y);
  vec2 w2=vec2(-t*.009,4.);
  float m=fbm(q*vec2(3.,7.5)+w2);
  float ml=fbm(q*vec2(3.,7.5)+w2-vec2(0.,.05));
  float c2=smoothstep(.45,.58,m)*band2;
  vec3 lo=mix(vec3(.86,.38,.62),vec3(1.,.86,.78),clamp((m-ml)*5.+.45+glow,0.,1.));
  col=mix(col,lo,c2*.95);
  float hx=x*1.6;
  float h1=ridge(hx,.786,.05,1.3,1.7), h2=ridge(hx,.83,.07,1.,5.3), h3=ridge(hx,.885,.07,.8,9.1);
  float e=px*1.5;
  vec3 far=mix(vec3(.62,.42,.93),col,.35);
  col=mix(col,far,smoothstep(h1-e,h1+e,y));
  col+=vec3(1.,.6,.5)*exp(-abs(y-h2)/(px*6.))*.18*smoothstep(h2+e,h2-e,y)*glow*2.;
  col=mix(col,mix(vec3(.35,.24,.76),vec3(.17,.14,.5),clamp((y-h2)*7.,0.,1.)),smoothstep(h2-e,h2+e,y));
  col=mix(col,mix(vec3(.15,.12,.45),vec3(.08,.1,.31),clamp((y-h3)*6.,0.,1.)),smoothstep(h3-e,h3+e,y));
  col+=(hash(fc+fract(t))-.5)/255.*2.5;
  gl_FragColor=vec4(col,1.);
}`;
const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

let source: HTMLCanvasElement | null = null;
let tried = false;

/** Render the sky once (WebGL), or give up and let `paint` use the 2D version. */
function sky(): HTMLCanvasElement | null {
  if (tried) return source;
  tried = true;
  try {
    const cv = document.createElement('canvas');
    cv.width = 1600;
    cv.height = 1000;
    const g = cv.getContext('webgl', { premultipliedAlpha: false, preserveDrawingBuffer: true, antialias: false });
    if (!g) return null;
    const sh = (type: number, src: string) => {
      const o = g.createShader(type)!;
      g.shaderSource(o, src);
      g.compileShader(o);
      if (!g.getShaderParameter(o, g.COMPILE_STATUS)) throw new Error('shader');
      return o;
    };
    const pr = g.createProgram()!;
    g.attachShader(pr, sh(g.VERTEX_SHADER, VS));
    g.attachShader(pr, sh(g.FRAGMENT_SHADER, FS));
    g.linkProgram(pr);
    if (!g.getProgramParameter(pr, g.LINK_STATUS)) throw new Error('link');
    g.useProgram(pr);
    const b = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, b);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), g.STATIC_DRAW);
    const loc = g.getAttribLocation(pr, 'p');
    g.enableVertexAttribArray(loc);
    g.vertexAttribPointer(loc, 2, g.FLOAT, false, 0, 0);
    g.viewport(0, 0, 1600, 1000);
    g.uniform2f(g.getUniformLocation(pr, 'res'), 1600, 1000);
    g.uniform1f(g.getUniformLocation(pr, 't'), 40);
    g.uniform2f(g.getUniformLocation(pr, 'vp'), 0, 1);
    g.uniform1f(g.getUniformLocation(pr, 'clearCol'), 0);
    g.drawArrays(g.TRIANGLE_STRIP, 0, 4);
    source = cv;
  } catch {
    source = null;
  }
  return source;
}

/* ── 2D fallback, same composition ── */
function rng(seed: number) {
  let x = seed % 2147483647;
  if (x <= 0) x += 2147483646;
  return () => (x = (x * 16807) % 2147483647) / 2147483647;
}
const CLOUDS = (() => {
  const r = rng(42);
  const c: { x: number; y: number; s: number; lit: boolean; seed: number }[] = [];
  for (let i = 0; i < 11; i++) {
    let x = r();
    if (x > 0.16 && x < 0.84) x = x < 0.5 ? x * 0.3 : 1 - (1 - x) * 0.3;
    c.push({ x, y: 0.06 + r() * 0.4, s: 0.05 + r() * 0.07, lit: false, seed: i + 1 });
  }
  for (let i = 0; i < 10; i++) c.push({ x: r(), y: 0.52 + r() * 0.22, s: 0.04 + r() * 0.06, lit: true, seed: i + 50 });
  return c;
})();

function paint2D(cv: HTMLCanvasElement, vy0: number, vy1: number) {
  const w = cv.width;
  const h = cv.height;
  const x = cv.getContext('2d');
  if (!x) return;
  const Y = (y: number) => ((y - vy0) / (vy1 - vy0)) * h;
  const X = (v: number) => v * w;
  const HZ = 0.79;
  const g = x.createLinearGradient(0, Y(0), 0, Y(HZ));
  (
    [
      [0, '#1336c0'],
      [0.3, '#2c45d8'],
      [0.52, '#6a4ff0'],
      [0.7, '#b84cc4'],
      [0.82, '#ff4f86'],
      [0.92, '#ff7a45'],
      [1, '#ffb36b'],
    ] as const
  ).forEach(([o, c]) => g.addColorStop(o, c));
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);
  const sx = X(0.74);
  const sy = Y(HZ);
  const sg = x.createRadialGradient(sx, sy, 0, sx, sy, w * 0.42);
  sg.addColorStop(0, 'rgba(255,240,210,.95)');
  sg.addColorStop(0.12, 'rgba(255,200,150,.75)');
  sg.addColorStop(0.45, 'rgba(255,110,140,.25)');
  sg.addColorStop(1, 'rgba(255,110,140,0)');
  x.fillStyle = sg;
  x.fillRect(0, 0, w, h);
  CLOUDS.forEach((c) => {
    const r = rng(c.seed * 977);
    const cx = X(c.x);
    const cy = Y(c.y);
    const s = c.s * w;
    for (let i = 0; i < 15; i++) {
      const px = cx + (r() - 0.5) * s * 2;
      const py = cy + (r() - 0.5) * s * 0.5;
      const rad = s * (0.22 + r() * 0.32);
      const gg = x.createRadialGradient(px, py - rad * 0.2, 0, px, py, rad);
      if (c.lit) {
        gg.addColorStop(0, 'rgba(255,240,236,.9)');
        gg.addColorStop(0.5, 'rgba(255,170,190,.55)');
        gg.addColorStop(1, 'rgba(255,140,170,0)');
      } else {
        gg.addColorStop(0, 'rgba(246,244,255,.78)');
        gg.addColorStop(0.55, 'rgba(225,220,255,.45)');
        gg.addColorStop(1, 'rgba(180,170,255,0)');
      }
      x.fillStyle = gg;
      x.beginPath();
      x.arc(px, py, rad, 0, 7);
      x.fill();
    }
  });
  const hill = (pts: number[], fill: string | CanvasGradient) => {
    x.beginPath();
    x.moveTo(0, h + 2);
    x.lineTo(0, Y(pts[0]));
    for (let i = 1; i < pts.length; i++) {
      const x0 = X((i - 1) / (pts.length - 1));
      const x1 = X(i / (pts.length - 1));
      const m = (x0 + x1) / 2;
      x.bezierCurveTo(m, Y(pts[i - 1]), m, Y(pts[i]), x1, Y(pts[i]));
    }
    x.lineTo(w, h + 2);
    x.closePath();
    x.fillStyle = fill;
    x.fill();
  };
  hill([0.8, 0.775, 0.79, 0.765, 0.78, 0.772], 'rgba(150,100,235,.75)');
  const mg = x.createLinearGradient(0, Y(0.8), 0, Y(1));
  mg.addColorStop(0, '#5a3fc4');
  mg.addColorStop(1, '#2a2580');
  hill([0.84, 0.81, 0.83, 0.8, 0.82, 0.805, 0.83], mg);
  const ng = x.createLinearGradient(0, Y(0.86), 0, Y(1));
  ng.addColorStop(0, '#241f72');
  ng.addColorStop(1, '#141a4f');
  hill([0.9, 0.87, 0.885, 0.86, 0.875, 0.89], ng);
}

/**
 * Paint the slice of sky between heights `vy0`..`vy1` (0 = top of the sky,
 * 1 = bottom of the hills) into `cv`, at the canvas's on-screen size.
 */
export function paintScene(cv: HTMLCanvasElement, vy0: number, vy1: number): void {
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  const src = sky();
  if (!src) return paint2D(cv, vy0, vy1);
  const x = cv.getContext('2d');
  if (!x) return;
  const sh = (vy1 - vy0) * 1000;
  const sy = vy0 * 1000;
  const sw = Math.min(1600, sh * (cv.width / cv.height));
  const sx = (1600 - sw) / 2;
  x.drawImage(src, sx, sy, sw, Math.min(sh, 1000 - sy), 0, 0, cv.width, cv.height * Math.min(1, (1000 - sy) / sh));
}
