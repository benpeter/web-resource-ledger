/**
 * global-setup.js -- Vitest globalSetup for integration tests
 *
 * Runs in Node.js (not the Workers runtime). Starts a local HTTP server
 * that serves fixture HTML pages from test/integration/fixtures/.
 * The server port is published via provide() so tests can inject it.
 *
 * Integration tests point the real defaultRenderer at 127.0.0.1 to avoid
 * hitting the public internet, while still exercising the full capture
 * pipeline (browser, WACZ bundling, KV/R2 writes).
 */

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures');

export async function setup({ provide }) {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');

    if (url.pathname === '/ping') {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('pong');
      return;
    }

    // 1x1 transparent PNG for lazy-image tests
    if (url.pathname === '/lazy-pixel.png') {
      const pixel = Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64',
      );
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': pixel.length });
      res.end(pixel);
      return;
    }

    // A page with ?n= images, for either side of the 2000-request cap (backlog #98)
    if (url.pathname === '/many-resources.html') {
      const count = Number(url.searchParams.get('n'));
      const imgs = Array.from({ length: count }, (_, i) => `<img src="/lazy-pixel.png?n=${i}" width="1" height="1" alt="">`).join('\n');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html><html><head><title>Many Resources Test</title></head><body><h1 id="many-resources-marker">Many resources</h1>\n${imgs}\n</body></html>`);
      return;
    }

    // A page that loads 60 MB and finishes loading (backlog #99)
    if (url.pathname === '/huge-loaded.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Huge Loaded Test</title><script src="/huge.js"></script></head><body><h1 id="huge-loaded-marker">Huge but loaded</h1></body></html>');
      return;
    }
    // A small page whose script writes 16 million characters into the
    // document, hidden so the browser doesn't lay them out: the rendered HTML
    // is too large to hold in the Worker (backlog #99)
    if (url.pathname === '/huge-html.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Huge HTML Test</title></head><body><h1>Huge HTML</h1><div id="filler" hidden></div><script>document.getElementById("filler").textContent = "x".repeat(16000000);</script></body></html>');
      return;
    }
    if (url.pathname === '/huge.js') {
      const body = Buffer.alloc(60 * 1024 * 1024, ' ');
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Length': body.length });
      res.end(body);
      return;
    }

    // Pages whose load event comes after the 20 s navigation timeout: a script
    // that answers after 22 s holds it back. One has content, one is blank.
    if (url.pathname === '/slow-load.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Slow Load Test</title></head><body><h1 id="slow-load-marker">Slow load</h1><div style="height:3000px"></div><img loading="lazy" src="/lazy-pixel.png?slow=1" width="1" height="1" alt=""><script async src="/slow.js"></script></body></html>');
      return;
    }
    if (url.pathname === '/slow-blank.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title></title></head><body><script async src="/slow.js"></script></body></html>');
      return;
    }
    if (url.pathname === '/slow.js') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/javascript' });
        res.end('// slow');
      }, 22000);
      return;
    }

    // Content of /consent-reload.html, which asks for it on every load
    // Stands in for the log endpoint. In production a log call is a request
    // that takes a while; this one takes 1.5 seconds for the event WRL logs
    // between the wait after a declined banner and the second screenshot, and
    // with ?each=N it takes N ms for every other event.
    if (url.pathname === '/log-sink') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end('{}');
        }, body.includes('render.default.post_consent') ? 1500 : Number(url.searchParams.get('each') ?? 0));
      });
      return;
    }
    if (url.pathname === '/slow-fragment') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<p id="fragment-marker">Content that came with the request</p>');
      }, 2000);
      return;
    }

    // An error page with content, and an error answer with an empty page (backlog #101)
    if (url.pathname === '/gone.html') {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Not found</title></head><body><h1 id="gone-marker">This page is gone</h1></body></html>');
      return;
    }
    if (url.pathname === '/blocked-blank.html') {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title></title></head><body></body></html>');
      return;
    }

    const fixtureMap = {
      '/fast.html': 'fast.html',
      '/never-settle.html': 'never-settle.html',
      '/cookie-banner.html': 'cookie-banner.html',
      '/consent-reload.html': 'consent-reload.html',
      '/consent-cookiehub.html': 'consent-cookiehub.html',
      '/with-iframe.html': 'with-iframe.html',
      '/error-page.html': 'error-page.html',
      '/lazy-images.html': 'lazy-images.html',
    };

    const filename = fixtureMap[url.pathname];
    if (!filename) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    try {
      const content = readFileSync(join(FIXTURES_DIR, filename), 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(content);
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
  });

  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  const { port } = server.address();
  provide('testServerPort', port);

  return () => {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };
}
