/**
 * The landing's motion system — GSAP + ScrollTrigger, Lenis as the one
 * smooth-scroll engine (skills: cinematic-gsap-lenis-motion-system,
 * cinematic-scroll-storytelling, scroll-scrubbed-word-reveal).
 *
 * Rules the page keeps:
 * - Every piece of copy is in the server-rendered markup and readable with JS
 *   off. Hiding-before-reveal only happens under `html.lp-motion`, which this
 *   module adds, so nothing can get stuck invisible.
 * - Motion settles. Nothing loops, nothing auto-advances; the story canvas
 *   moves only when the reader scrolls to the next chapter.
 * - `prefers-reduced-motion: reduce`: no Lenis, no reveals, no scrub. The story
 *   still follows the chapters (that is state, not decoration), with CSS
 *   transitions off.
 *
 * Loaded with dynamic import from LandingPage so none of it runs on the server.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';

type Opts = {
  /** story chapter in view → canvas stage */
  onStage: (stage: number) => void;
};

export type Motion = {
  scrollTo: (target: Element) => void;
  destroy: () => void;
};

export function initMotion(root: HTMLElement, { onStage }: Opts): Motion {
  gsap.registerPlugin(ScrollTrigger);
  const html = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = window.matchMedia('(pointer: fine)').matches;
  const cleanups: (() => void)[] = [];
  // tells the +html.tsx pre-paint guard that motion took over (no fallback reveal)
  (window as unknown as { __lpMotion?: boolean }).__lpMotion = true;

  /* ── smooth scroll ─────────────────────────────────────────── */
  let lenis: Lenis | null = null;
  if (!reduce) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.9 });
    lenis.on('scroll', ScrollTrigger.update);
    const raf = (time: number) => lenis?.raf(time * 1000);
    gsap.ticker.add(raf);
    gsap.ticker.lagSmoothing(0);
    cleanups.push(() => {
      gsap.ticker.remove(raf);
      lenis?.destroy();
    });
  }

  /* ── header: hairline + glass once the page has moved ─────── */
  const header = root.querySelector<HTMLElement>('[data-header]');
  const onScroll = () => header?.classList.toggle('is-scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
  cleanups.push(() => window.removeEventListener('scroll', onScroll));

  const ctx = gsap.context(() => {
    /* ── the board follows the reader (always on: state, not decoration) ──
       hero in view → the visitor's week; a chapter in view → that stage */
    const hero = root.querySelector<HTMLElement>('[data-hero]');
    const chapters = root.querySelectorAll<HTMLElement>('[data-chapter]');
    const activate = (el: Element | null, stage: number) => {
      onStage(stage);
      chapters.forEach((c) => c.classList.toggle('is-active', c === el));
    };
    if (hero) {
      ScrollTrigger.create({
        trigger: hero,
        start: 'top top',
        end: 'bottom 45%',
        onToggle: (self) => self.isActive && activate(null, -1),
      });
    }
    chapters.forEach((el) => {
      const stage = Number(el.dataset.chapter);
      ScrollTrigger.create({
        trigger: el,
        start: 'top 62%',
        end: 'bottom 62%',
        onToggle: (self) => self.isActive && activate(el, stage),
      });
    });

    if (reduce) {
      html.classList.remove('lp-motion');
      return;
    }
    html.classList.add('lp-motion');

    gsap.defaults({ ease: 'power4.out', duration: 1 });

    /* ── hero intro: words rise, then the copy, then the board ─── */
    if (hero) {
      gsap
        .timeline({ delay: 0.15 })
        .fromTo(
          hero.querySelectorAll('h1 .wi'),
          { y: 0, yPercent: 108 },
          { y: 0, yPercent: 0, duration: 1.15, stagger: 0.06 },
        )
        .fromTo(
          hero.querySelectorAll('[data-hero-in]'),
          { y: 22, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.08 },
          '-=0.75',
        )
        .fromTo(
          root.querySelector('[data-stage-wrap]'),
          { autoAlpha: 0, y: 40 },
          { autoAlpha: 1, y: 0, duration: 1.4, ease: 'expo.out' },
          '-=1.1',
        );
    }

    /* ── headings: masked word rise ───────────────────────────── */
    root.querySelectorAll('[data-split]:not(h1)').forEach((el) => {
      gsap.fromTo(
        el.querySelectorAll('.wi'),
        { y: 0, yPercent: 108 },
        {
          y: 0,
          yPercent: 0,
          duration: 1.05,
          stagger: 0.05,
          scrollTrigger: { trigger: el, start: 'top 85%', once: true },
        },
      );
    });

    /* ── manifesto: scroll-scrubbed word reveal ───────────────── */
    const manifesto = root.querySelector('[data-manifesto]');
    if (manifesto) {
      gsap.fromTo(
        manifesto.querySelectorAll('.mw'),
        { opacity: 0.14, filter: 'blur(6px)', yPercent: 14 },
        {
          opacity: 1,
          filter: 'blur(0px)',
          yPercent: 0,
          ease: 'none',
          stagger: 0.12,
          scrollTrigger: { trigger: manifesto, start: 'top 78%', end: 'bottom 42%', scrub: 1.1 },
        },
      );
    }

    /* ── fade-up reveals, grouped ─────────────────────────────── */
    root.querySelectorAll('[data-rv-group]').forEach((group) => {
      gsap.fromTo(
        group.querySelectorAll('[data-rv]'),
        { y: 32, autoAlpha: 0 },
        {
          y: 0,
          autoAlpha: 1,
          duration: 0.95,
          stagger: 0.08,
          scrollTrigger: { trigger: group, start: 'top 82%', once: true },
        },
      );
    });

    /* ── index rows: rule draws, then the row rises ───────────── */
    root.querySelectorAll('[data-row]').forEach((row) => {
      const tl = gsap.timeline({ scrollTrigger: { trigger: row, start: 'top 88%', once: true } });
      tl.fromTo(row.querySelector('.row-rule'), { scaleX: 0 }, { scaleX: 1, duration: 1.1, ease: 'expo.out' })
        .fromTo(
          row.querySelectorAll('.row-in'),
          { y: 26, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.9, stagger: 0.07 },
          0.15,
        );
    });

    /* ── insights: numbers count, bars grow ───────────────────── */
    const insights = root.querySelector('[data-insights]');
    if (insights) {
      const nums = insights.querySelectorAll<HTMLElement>('[data-count]');
      const bars = insights.querySelectorAll('.bar-seg');
      const st = { trigger: insights, start: 'top 72%', once: true };
      nums.forEach((el) => {
        const to = Number(el.dataset.count);
        const dec = Number.isInteger(to) ? 0 : 1;
        const o = { v: 0 };
        el.textContent = (0).toFixed(dec);
        gsap.to(o, {
          v: to,
          duration: 1.6,
          ease: 'power3.out',
          scrollTrigger: st,
          onUpdate: () => {
            el.textContent = o.v.toFixed(dec);
          },
        });
      });
      gsap.fromTo(
        bars,
        { scaleY: 0 },
        { scaleY: 1, duration: 1.2, ease: 'expo.out', stagger: 0.04, scrollTrigger: st },
      );
    }

    /* ── footer wordmark rises out of the floor ───────────────── */
    const mark = root.querySelector('[data-wordmark]');
    if (mark) {
      gsap.fromTo(
        mark,
        { yPercent: 55 },
        {
          yPercent: 0,
          ease: 'none',
          scrollTrigger: { trigger: mark, start: 'top bottom', end: 'bottom bottom', scrub: 1 },
        },
      );
    }
  }, root);
  cleanups.push(() => ctx.revert());

  /* ── magnetic buttons (fine pointers only) ──────────────────── */
  if (!reduce && fine) {
    root.querySelectorAll<HTMLElement>('[data-magnetic]').forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.45, ease: 'power3.out' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.45, ease: 'power3.out' });
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - r.left - r.width / 2) * 0.18);
        yTo((e.clientY - r.top - r.height / 2) * 0.3);
      };
      const leave = () => {
        xTo(0);
        yTo(0);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      cleanups.push(() => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
        gsap.set(el, { clearProps: 'transform' });
      });
    });
  }

  // fonts change text geometry, which moves every trigger
  document.fonts?.ready.then(() => ScrollTrigger.refresh());

  return {
    scrollTo: (target) => {
      if (lenis) lenis.scrollTo(target as HTMLElement, { offset: -72, duration: 1.4 });
      else target.scrollIntoView({ block: 'start' });
    },
    destroy: () => {
      cleanups.reverse().forEach((fn) => fn());
      html.classList.remove('lp-motion');
    },
  };
}
