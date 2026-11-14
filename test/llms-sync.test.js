// tva
// The docs llms.txt (site/content/llms.njk) lists every docs page by hand, and
// pages added later (support, about, use cases) were missing from it. Every
// page under site/content is linked from it; reads the source as text, like
// mcp-sync.test.js.
import { readFileSync, readdirSync } from 'fs';
import { resolve, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const contentDir = resolve(dirname(fileURLToPath(import.meta.url)), '../site/content');
const NOT_PAGES = new Set(['llms', 'robots', 'sitemap']);

function pages(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'partials' ? [] : pages(path);
    return /\.(md|njk)$/.test(entry.name) ? [path] : [];
  });
}

describe('docs llms.txt', () => {
  it('links every docs page', () => {
    const llms = readFileSync(join(contentDir, 'llms.njk'), 'utf8');
    const urls = pages(contentDir)
      .map((file) => relative(contentDir, file).replace(/\.(md|njk)$/, '').replace(/(^|\/)index$/, ''))
      .filter((slug) => !NOT_PAGES.has(slug))
      .map((slug) => `https://docs.webresourceledger.com/${slug}${slug ? '/' : ''}`);
    expect(urls.length).toBeGreaterThan(20);
    expect(urls.filter((url) => !llms.includes(`](${url})`))).toEqual([]);
  });
});
