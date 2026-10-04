/**
 * Cookie scanner — what Cookiebot's monthly scan does, on demand.
 *
 *   cd e2e && npm run cookies:check                          # http://localhost:8081
 *   cd e2e && npm run cookies:check -- https://www.usefindtime.com
 *
 * Opens the public pages as a first-time visitor who has NOT chosen anything,
 * then lists every cookie, localStorage / sessionStorage key and third-party
 * host the browser touched, and checks each against src/consent/registry.ts.
 * Fails (exit 1) when something is:
 *   - any cookie on a public page (PUBLIC: landing + legal — auth isn't touched there),
 *   - not declared in the registry (it must be listed before it ships),
 *   - declared as optional but present before consent (it must be gated),
 *   - a third-party host not in THIRD_PARTY_HOSTS (it sees every visitor's IP).
 *
 * Run it before each release and after adding any SDK, embed or font.
 * Set PW_CHROMIUM to a Chromium binary if Playwright's own isn't installed.
 */
import { chromium } from '@playwright/test';

import { declared, knownHost } from '../src/consent/registry.ts';

const base = (process.argv[2] || 'http://localhost:8081').replace(/\/$/, '');
const PUBLIC = ['/', '/privacy', '/terms'];
const PAGES = [...PUBLIC, '/login', '/signup'];

const browser = await chromium.launch(
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
);
const ctx = await browser.newContext();
const page = await ctx.newPage();
const origin = new URL(base).host;
const hosts = new Set();
page.on('request', (r) => {
  const u = new URL(r.url());
  if (u.protocol.startsWith('http') && u.host !== origin) hosts.add(u.host);
});

const local = new Set();
const session = new Set();
const publicCookies = [];
for (const p of PAGES) {
  await page.goto(base + p, { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(4000);
  const keys = await page.evaluate(() => ({ l: Object.keys(localStorage), s: Object.keys(sessionStorage) }));
  keys.l.forEach((k) => local.add(k));
  keys.s.forEach((k) => session.add(k));
  if (PUBLIC.includes(p)) publicCookies.push(...(await ctx.cookies()).map((c) => `${c.name} (${p})`));
}
const cookies = await ctx.cookies();
await browser.close();

const problems = [];
for (const c of publicCookies) problems.push(`cookie ${c} on a public page — only sign-in pages and the app may set cookies`);
const rows = [];
function check(name, type, where) {
  const item = declared(name, type);
  rows.push([type, name, where, item ? item.category : 'UNDECLARED']);
  if (!item) problems.push(`undeclared ${type.toLowerCase()} "${name}" (${where}) — add it to src/consent/registry.ts`);
  else if (item.category !== 'necessary')
    problems.push(`${type.toLowerCase()} "${name}" is ${item.category} but was set before consent — gate it with loadScript()/hasConsent()`);
}
for (const c of cookies) check(c.name, 'Cookie', c.domain);
for (const k of local) check(k, 'Local storage', origin);
for (const k of session) check(k, 'Session storage', origin);
for (const h of hosts) {
  rows.push(['Host', h, '', knownHost(h) ? 'allowed' : 'UNKNOWN']);
  if (!knownHost(h)) problems.push(`third-party host "${h}" — self-host it, gate it, or add it to THIRD_PARTY_HOSTS and the privacy policy`);
}

console.log(`Scanned ${PAGES.length} pages on ${base} as a visitor with no consent.\n`);
console.table(rows.map(([type, name, where, status]) => ({ type, name, where, status })));
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('\nOK: everything stored is declared and necessary; no unknown third parties.');
