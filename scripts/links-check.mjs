/**
 * Dead-link check (issue #9). Crawls the public pages of a running server and
 * fails on any same-origin href that isn't 2xx/3xx, or a #fragment with no
 * matching id on its page.
 *
 *   npm run links:check                       # http://localhost:8081
 *   BASE=https://www.usefindtime.com npm run links:check
 *
 * ponytail: regex over server-rendered HTML, same-origin only — links that only
 * appear after hydration aren't seen. Swap for linkinator/lychee if that bites.
 */
const BASE = (process.env.BASE || 'http://localhost:8081').replace(/\/$/, '');
const START = ['/', '/privacy', '/terms', '/login'];

const pages = new Map(); // path → html | null (non-HTML) | number (bad status)
const bad = [];

async function load(path) {
  if (pages.has(path)) return pages.get(path);
  const res = await fetch(BASE + path, { redirect: 'follow' }).catch((e) => ({ ok: false, status: e.message }));
  const html = !res.ok ? res.status : (res.headers.get('content-type') || '').includes('html') ? await res.text() : null;
  pages.set(path, html);
  return html;
}

const queue = [...START];
while (queue.length) {
  const from = queue.shift();
  const html = await load(from);
  if (typeof html !== 'string') continue;
  for (const [, href] of html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g)) {
    if (!href.startsWith('/') && !href.startsWith('#')) continue; // external / mailto
    const url = new URL(href, BASE + from);
    const path = url.pathname;
    const target = await load(path);
    if (typeof target === 'number') {
      bad.push(`${from} → ${href} (${target})`);
      continue;
    }
    if (url.hash && typeof target === 'string' && !target.includes(`id="${decodeURIComponent(url.hash.slice(1))}"`)) {
      bad.push(`${from} → ${href} (no #${url.hash.slice(1)})`);
    }
    // crawl only the public pages we started from; /app etc. are behind sign-in
    if (START.includes(path) && !queue.includes(path) && !pages.has(path)) queue.push(path);
  }
}

console.log(`checked ${pages.size} urls on ${BASE}`);
if (bad.length) {
  console.error(`${bad.length} broken:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
