// tva
// The Worker evaluates every statically imported module on each cold start,
// also for /health, verify pages and API calls that never open a browser.
// @cloudflare/playwright 1.4.0 took about 26 ms of startup CPU there (local
// `wrangler check startup`; 1.1.2 took about 5 ms), so src/capture.js loads it
// with a dynamic import when a capture needs a browser session.
import { readFileSync, readdirSync } from 'fs';
import { join, relative } from 'path';
import { describe, it, expect } from 'vitest';

const root = join(import.meta.dirname, '..');
const srcDir = join(root, 'src');

function jsFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return jsFiles(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

describe('browser library import', () => {
  it('no file in src imports @cloudflare/playwright statically', () => {
    const files = jsFiles(srcDir)
      .filter((path) => /^import\s[^;]*?from\s+['"]@cloudflare\/playwright['"]/m.test(readFileSync(path, 'utf8')))
      .map((path) => relative(root, path));
    expect(files).toEqual([]);
  });

  it('src/capture.js loads it with a dynamic import', () => {
    const capture = readFileSync(join(srcDir, 'capture.js'), 'utf8');
    expect(capture).toMatch(/await import\('@cloudflare\/playwright'\)/);
  });
});
