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

    const fixtureMap = {
      '/fast.html': 'fast.html',
      '/never-settle.html': 'never-settle.html',
      '/cookie-banner.html': 'cookie-banner.html',
      '/with-iframe.html': 'with-iframe.html',
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
