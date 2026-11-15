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

    // A page over the 50 MB cap whose load event never fires: one async
    // script delivers 60 MB, another never answers past its headers
    if (url.pathname === '/huge-and-pending.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<!DOCTYPE html><html><head><title>Huge Test</title></head><body><h1>Huge</h1><script async src="/huge.js"></script><script async src="/stalled.js"></script></body></html>');
      return;
    }
    if (url.pathname === '/huge.js') {
      const body = Buffer.alloc(60 * 1024 * 1024, ' ');
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Length': body.length });
      res.end(body);
      return;
    }
    if (url.pathname === '/stalled.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Content-Length': 1024 });
      res.flushHeaders();
      return;
    }

    const fixtureMap = {
      '/fast.html': 'fast.html',
      '/never-settle.html': 'never-settle.html',
      '/cookie-banner.html': 'cookie-banner.html',
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
