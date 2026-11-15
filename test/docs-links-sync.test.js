// tva
// Links between docs pages. Data Retention linked to ../authentication/ and
// ../security/, which resolve under /security/ to pages that don't exist, and
// nothing noticed. Links inside site/content are absolute site paths, and each
// must name a page or asset that exists. Reads the sources as text, like
// llms-sync.test.js. Anchors into the API reference must name an id that page
// builds from openapi.yaml (an operationId, or tag-<name>); the webhooks guide
// linked #tag/captures/GET/v1/captures, which matched nothing. Other anchors
// and other sites aren't checked here.
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';

const root = join(import.meta.dirname, '..');
const siteDir = join(root, 'site');
const contentDir = join(siteDir, 'content');

function markdownFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return entry.name.endsWith('.md') ? [path] : [];
  });
}

function links() {
  return markdownFiles(contentDir).flatMap((path) => {
    const text = readFileSync(path, 'utf8');
    return [...text.matchAll(/\]\(([^)\s]+)\)/g)].map(([, target]) => ({ page: relative(root, path), target }));
  });
}

function sitePathExists(target) {
  const path = target.split('#')[0];
  if (path.startsWith('/assets/')) return existsSync(join(siteDir, path));
  const name = path.replace(/^\/|\/$/g, '') || 'index';
  return [`${name}.md`, `${name}/index.md`, `${name}.njk`].some((file) => existsSync(join(contentDir, file)));
}

// The ids site/content/api-reference.njk and partials/endpoint.njk put on the page.
function apiReferenceIds() {
  const spec = parse(readFileSync(join(root, 'openapi.yaml'), 'utf8'));
  const operations = [spec.paths, spec.webhooks ?? {}].flatMap((items) => Object.values(items).flatMap((item) => Object.values(item)));
  const tags = [...(spec.tags || []).map((tag) => tag.name), ...operations.flatMap((op) => op.tags || [])];
  return new Set([...operations.map((op) => op.operationId), ...tags.map((tag) => `tag-${tag}`)]);
}

describe('docs links', () => {
  it('links are absolute site paths, anchors or full URLs, never relative paths', () => {
    const relativeLinks = links().filter(({ target }) => !/^(\/|#|https?:\/\/|mailto:)/.test(target));
    expect(relativeLinks).toEqual([]);
  });

  it('every site path names a docs page or asset that exists', () => {
    const sitePaths = links().filter(({ target }) => target.startsWith('/'));
    expect(sitePaths.length).toBeGreaterThan(50);
    expect(sitePaths.filter(({ target }) => !sitePathExists(target))).toEqual([]);
  });

  it('every anchor into the API reference names an endpoint or tag on that page', () => {
    const ids = apiReferenceIds();
    const anchors = links().filter(({ target }) => target.startsWith('/api-reference/#'));
    expect(anchors.filter(({ target }) => !ids.has(target.split('#')[1]))).toEqual([]);
  });
});
