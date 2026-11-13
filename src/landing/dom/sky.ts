/**
 * The landing's sky — the app's own Prism scene (src/prism/scene.ts), rendered
 * straight into a full-width canvas at its on-screen size instead of sliced
 * from the 1600×1000 painting, so the hills stay crisp on a wide window.
 *
 * One page, one sky: the hero shows the top of it (blue, clouds), the last
 * section shows the bottom (sunset, hills), and the footer is the ground.
 *
 * `drift` lets the clouds move, slowly, while the canvas is on screen. It is
 * off under reduced motion, and the 2D painting stands in when WebGL is
 * missing. The section behind each canvas carries a CSS gradient of the same
 * colours, so the page reads before (or without) any of this.
 */
import { SCENE_FS, SCENE_VS, paint2D } from '@/prism/scene';

type Opts = {
  /** clouds drift while visible */
  drift?: boolean;
  /** 0–1: clear the clouds from the middle column, where the headline sits */
  clear?: number;
  /** render scale; soft sky can be drawn smaller and stretched */
  scale?: number;
};

export type Sky = { destroy: () => void };

export function mountSky(cv: HTMLCanvasElement, vy0: number, vy1: number, opts: Opts = {}): Sky {
  const { drift = false, clear = 0, scale = 1 } = opts;
  let raf = 0;
  let visible = true;
  let dead = false;
  const cleanups: (() => void)[] = [];

  const size = () => {
    const r = cv.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1) * scale;
    cv.width = Math.max(2, Math.round(r.width * dpr));
    cv.height = Math.max(2, Math.round(r.height * dpr));
    return true;
  };

  let g: WebGLRenderingContext | null = null;
  let u: Record<'res' | 't' | 'vp' | 'clearCol' | 'ax', WebGLUniformLocation | null> | null = null;
  try {
    g = cv.getContext('webgl', { premultipliedAlpha: false, antialias: false, powerPreference: 'low-power' });
    if (g) {
      const gl = g;
      const sh = (type: number, src: string) => {
        const o = gl.createShader(type)!;
        gl.shaderSource(o, src);
        gl.compileShader(o);
        if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error('shader');
        return o;
      };
      const pr = gl.createProgram()!;
      gl.attachShader(pr, sh(gl.VERTEX_SHADER, SCENE_VS));
      gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, SCENE_FS));
      gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error('link');
      gl.useProgram(pr);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(pr, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      u = {
        res: gl.getUniformLocation(pr, 'res'),
        t: gl.getUniformLocation(pr, 't'),
        vp: gl.getUniformLocation(pr, 'vp'),
        clearCol: gl.getUniformLocation(pr, 'clearCol'),
        ax: gl.getUniformLocation(pr, 'ax'),
      };
    }
  } catch {
    g = null;
  }

  // No WebGL: the 2D painting, once. (A canvas that already gave out a webgl
  // context can't give a 2d one, so a failed shader leaves the CSS gradient.)
  if (!g || !u) {
    if (!g && size()) paint2D(cv, vy0, vy1);
    cv.dataset.ready = '';
    return { destroy: () => {} };
  }

  const gl = g;
  const un = u;
  const draw = (t: number) => {
    gl.viewport(0, 0, cv.width, cv.height);
    gl.uniform2f(un.res, cv.width, cv.height);
    gl.uniform1f(un.t, t);
    gl.uniform2f(un.vp, vy0, vy1);
    gl.uniform1f(un.clearCol, clear);
    // true proportions: sky units across = (width / height) × the slice's height
    gl.uniform1f(un.ax, Math.max(0.55, (cv.width / cv.height) * (vy1 - vy0)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  };

  const T0 = 40;
  let t = T0;
  if (size()) draw(t);
  cv.dataset.ready = '';

  const ro = new ResizeObserver(() => {
    if (!dead && size()) draw(t);
  });
  ro.observe(cv);
  cleanups.push(() => ro.disconnect());

  if (drift) {
    let last = 0;
    const tick = (now: number) => {
      raf = 0;
      if (dead) return;
      // ~30 fps is plenty for clouds
      if (now - last >= 32) {
        t += last ? Math.min(0.1, (now - last) / 1000) * 3 : 0;
        last = now;
        draw(t);
      }
      if (visible && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const wake = () => {
      if (!raf && visible && !document.hidden && !dead) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      wake();
    });
    io.observe(cv);
    document.addEventListener('visibilitychange', wake);
    cleanups.push(() => {
      io.disconnect();
      document.removeEventListener('visibilitychange', wake);
    });
    wake();
  }

  const lost = (e: Event) => {
    e.preventDefault();
    dead = true;
    cancelAnimationFrame(raf);
    delete cv.dataset.ready; // back to the CSS gradient behind it
  };
  cv.addEventListener('webglcontextlost', lost);
  cleanups.push(() => cv.removeEventListener('webglcontextlost', lost));

  return {
    destroy: () => {
      dead = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
    },
  };
}
