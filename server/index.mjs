/**
 * Production web entrypoint (Railway `startCommand`).
 *
 * `expo serve` is a plain static server: it sends no HSTS, no security headers,
 * and does not redirect HTTP→HTTPS. Railway terminates TLS at its edge, so this
 * thin front sits on $PORT, runs `expo serve` on an internal port, and:
 *
 *   1. 301s any request that reached us over plain HTTP (x-forwarded-proto)
 *   2. proxies everything else to `expo serve`
 *   3. stamps HSTS + the standard hardening headers on every response
 *
 * ponytail: proxies through a child `expo serve` rather than mounting
 * `@expo/server` directly — one extra local hop, but version-proof across SDK
 * bumps and it reuses Expo's own static + SSR handling untouched. Swap to a
 * direct `createRequestHandler` mount if the hop ever shows up in latency.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const PORT = Number(process.env.PORT) || 8081;
const INTERNAL = PORT + 1;

const SECURITY_HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
};

// ── run `expo serve` on the internal port ──────────────────────────────────────
const child = spawn(
  'npx',
  ['expo', 'serve', '--port', String(INTERNAL)],
  { stdio: 'inherit', env: process.env },
);
child.on('exit', (code) => {
  console.error(`[server] expo serve exited (${code}) — shutting down so Railway restarts`);
  process.exit(code ?? 1);
});
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    child.kill(sig);
    process.exit(0);
  });
}

function waitForInternal(retries = 60) {
  return new Promise((resolve, reject) => {
    const tryOnce = (left) => {
      const s = net.connect(INTERNAL, '127.0.0.1');
      s.once('connect', () => {
        s.destroy();
        resolve();
      });
      s.once('error', () => {
        s.destroy();
        if (left <= 0) reject(new Error('expo serve never came up'));
        else setTimeout(() => tryOnce(left - 1), 500);
      });
    };
    tryOnce(retries);
  });
}

// ── the front ─────────────────────────────────────────────────────────────────
const front = http.createServer((req, res) => {
  const setHeaders = () => {
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  };

  // Railway's edge forwards the original scheme. If it was plain HTTP, bounce.
  if ((req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'http') {
    const host = req.headers.host || '';
    setHeaders();
    res.writeHead(301, { Location: `https://${host}${req.url}` });
    res.end();
    return;
  }

  const proxied = http.request(
    { host: '127.0.0.1', port: INTERNAL, method: req.method, path: req.url, headers: req.headers },
    (upstream) => {
      setHeaders();
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxied.on('error', (err) => {
    console.error('[server] proxy error:', err.message);
    if (!res.headersSent) {
      setHeaders();
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end('Bad gateway');
  });
  req.pipe(proxied);
});

waitForInternal()
  .then(() => {
    front.listen(PORT, () => console.log(`[server] listening on :${PORT} → expo serve :${INTERNAL}`));
  })
  .catch((err) => {
    console.error('[server]', err.message);
    process.exit(1);
  });
