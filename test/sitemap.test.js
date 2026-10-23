// Sitemap reading for bulk capture (phase 0130). readSitemap fetches a sitemap
// (or a sitemap index and its child sitemaps) with the same URL safety checks
// as captures, and returns up to MAX_SITEMAP_URLS page URLs.

import { SELF } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseSitemap,
  readSitemap,
  MAX_SITEMAP_URLS,
  MAX_CHILD_SITEMAPS,
} from '../src/sitemap.js';
import { seedApiKey, cleanDb, TEST_TENANT_KEY } from './fixtures.js';
import { env } from 'cloudflare:test';

const PUBLIC = { resolve4: async () => ['93.184.216.34'], resolve6: async () => [] };
const PRIVATE = { resolve4: async () => ['10.0.0.5'], resolve6: async () => [] };

function urlset(locs) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
${locs.map((l) => `  <url><loc>${l}</loc><image:image><image:loc>https://cdn.example.com/x.png</image:loc></image:image></url>`).join('\n')}
</urlset>`;
}

function sitemapIndex(locs) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${locs.map((l) => `  <sitemap><loc>${l}</loc></sitemap>`).join('\n')}
</sitemapindex>`;
}

/** fetch stand-in serving a map of URL -> Response init. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    const key = String(url?.url ?? url);
    calls.push(key);
    const r = routes[key];
    if (!r) return new Response('not found', { status: 404 });
    return new Response(r.body ?? '', { status: r.status ?? 200, headers: r.headers ?? { 'Content-Type': 'application/xml' } });
  };
  return { impl, calls };
}

describe('parseSitemap', () => {
  it('reads <loc> entries of a urlset and ignores image locations', () => {
    const r = parseSitemap(urlset(['https://example.com/a', 'https://example.com/b']));
    expect(r.type).toBe('urlset');
    expect(r.locs).toEqual(['https://example.com/a', 'https://example.com/b']);
  });

  it('recognises a sitemap index', () => {
    const r = parseSitemap(sitemapIndex(['https://example.com/s1.xml']));
    expect(r.type).toBe('index');
    expect(r.locs).toEqual(['https://example.com/s1.xml']);
  });

  it('decodes XML entities and CDATA', () => {
    const xml = '<urlset><url><loc>https://example.com/?a=1&amp;b=2</loc></url><url><loc><![CDATA[https://example.com/c?d=1&e=2]]></loc></url></urlset>';
    expect(parseSitemap(xml).locs).toEqual(['https://example.com/?a=1&b=2', 'https://example.com/c?d=1&e=2']);
  });
});

describe('readSitemap', () => {
  it('returns the page URLs of a urlset, without duplicates or non-http entries', async () => {
    const { impl } = fakeFetch({
      'https://example.com/sitemap.xml': { body: urlset(['https://example.com/a', 'https://example.com/a', 'ftp://example.com/x', 'https://example.com/b']) },
    });
    const r = await readSitemap('https://example.com/sitemap.xml', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.ok).toBe(true);
    expect(r.urls).toEqual(['https://example.com/a', 'https://example.com/b']);
    expect(r.total).toBe(2);
    expect(r.truncated).toBe(false);
    expect(r.sitemapsRead).toBe(1);
  });

  it('follows a sitemap index into its child sitemaps', async () => {
    const { impl } = fakeFetch({
      'https://example.com/index.xml': { body: sitemapIndex(['https://example.com/s1.xml', 'https://example.com/s2.xml']) },
      'https://example.com/s1.xml': { body: urlset(['https://example.com/1']) },
      'https://example.com/s2.xml': { body: urlset(['https://example.com/2']) },
    });
    const r = await readSitemap('https://example.com/index.xml', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.urls).toEqual(['https://example.com/1', 'https://example.com/2']);
    expect(r.sitemapsRead).toBe(3);
  });

  it(`returns at most ${MAX_SITEMAP_URLS} URLs and says the list was cut`, async () => {
    const many = Array.from({ length: MAX_SITEMAP_URLS + 50 }, (_, i) => `https://example.com/p${i}`);
    const { impl } = fakeFetch({ 'https://example.com/sitemap.xml': { body: urlset(many) } });
    const r = await readSitemap('https://example.com/sitemap.xml', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.urls).toHaveLength(MAX_SITEMAP_URLS);
    expect(r.total).toBe(MAX_SITEMAP_URLS + 50);
    expect(r.truncated).toBe(true);
  });

  it(`reads at most ${MAX_CHILD_SITEMAPS} child sitemaps`, async () => {
    const children = Array.from({ length: MAX_CHILD_SITEMAPS + 3 }, (_, i) => `https://example.com/s${i}.xml`);
    const routes = { 'https://example.com/index.xml': { body: sitemapIndex(children) } };
    children.forEach((c, i) => { routes[c] = { body: urlset([`https://example.com/page${i}`]) }; });
    const { impl, calls } = fakeFetch(routes);
    const r = await readSitemap('https://example.com/index.xml', { fetchImpl: impl, resolvers: PUBLIC });
    expect(calls).toHaveLength(1 + MAX_CHILD_SITEMAPS);
    expect(r.urls).toHaveLength(MAX_CHILD_SITEMAPS);
    expect(r.truncated).toBe(true);
  });

  it('refuses a sitemap on a private address', async () => {
    const { impl, calls } = fakeFetch({});
    const r = await readSitemap('https://intranet.example/sitemap.xml', { fetchImpl: impl, resolvers: PRIVATE });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it('checks every redirect target and refuses one that leads to a private address', async () => {
    const resolvers = {
      resolve4: async (host) => (host === 'internal.example' ? ['192.168.1.1'] : ['93.184.216.34']),
      resolve6: async () => [],
    };
    const { impl, calls } = fakeFetch({
      'https://example.com/sitemap.xml': { status: 301, headers: { Location: 'https://internal.example/sitemap.xml' } },
    });
    const r = await readSitemap('https://example.com/sitemap.xml', { fetchImpl: impl, resolvers });
    expect(r.ok).toBe(false);
    expect(calls).toEqual(['https://example.com/sitemap.xml']);
  });

  it('follows a redirect to a public address', async () => {
    const { impl } = fakeFetch({
      'https://example.com/sitemap.xml': { status: 301, headers: { Location: '/sitemap_index.xml' } },
      'https://example.com/sitemap_index.xml': { body: urlset(['https://example.com/a']) },
    });
    const r = await readSitemap('https://example.com/sitemap.xml', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.ok).toBe(true);
    expect(r.urls).toEqual(['https://example.com/a']);
  });

  it('says so when the URL is not a sitemap', async () => {
    const { impl } = fakeFetch({ 'https://example.com/': { body: '<html><body>Hello</body></html>', headers: { 'Content-Type': 'text/html' } } });
    const r = await readSitemap('https://example.com/', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.detail).toMatch(/not a sitemap/i);
  });

  it('reports the HTTP status when the sitemap cannot be fetched', async () => {
    const { impl } = fakeFetch({ 'https://example.com/sitemap.xml': { status: 404, body: 'nope' } });
    const r = await readSitemap('https://example.com/sitemap.xml', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(502);
    expect(r.detail).toMatch(/404/);
  });

  it('refuses compressed (.gz) sitemaps', async () => {
    const gz = new Uint8Array([0x1f, 0x8b, 0x08, 0x00, 0x00]);
    const { impl } = fakeFetch({ 'https://example.com/sitemap.xml.gz': { body: gz, headers: { 'Content-Type': 'application/gzip' } } });
    const r = await readSitemap('https://example.com/sitemap.xml.gz', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(422);
    expect(r.detail).toMatch(/compressed/i);
  });
});

describe('POST /v1/sitemap', () => {
  beforeEach(async () => {
    await cleanDb(env.DB);
    await seedApiKey(env.DB, TEST_TENANT_KEY, { tenantId: 'default', scopes: ['capture', 'read'] });
  });

  it('requires authentication', async () => {
    const res = await SELF.fetch('https://wrl.test/v1/sitemap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/sitemap.xml' }),
    });
    expect(res.status).toBe(401);
  });

  it('requires a url string', async () => {
    const res = await SELF.fetch('https://wrl.test/v1/sitemap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TEST_TENANT_KEY}` },
      body: JSON.stringify({ sitemap: 'https://example.com/sitemap.xml' }),
    });
    expect(res.status).toBe(400);
  });
});
