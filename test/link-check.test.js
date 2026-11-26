// tva
// Free Link Rot Checker (phase 0211, backlog #56). checkLink follows a URL's
// redirects with the same URL safety checks as captures and sorts the answer
// into alive, redirected, dead, unclear, timeout or invalid. The page sends its
// list in batches of ten to POST /tools/link-check; each batch is kept in KV so
// GET /tools/link-check/{run} can show the whole run on a shareable link.

import { SELF, env } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import {
  checkLink,
  checkLinks,
  parseLinkCheckRequest,
  saveBatch,
  BATCH_SIZE,
  MAX_REDIRECTS,
  USER_AGENT,
} from '../src/link-check.js';

const PUBLIC = { resolve4: async () => ['93.184.216.34'], resolve6: async () => [] };
const PRIVATE_FOR = (host) => ({
  resolve4: async (h) => (h === host ? ['10.0.0.5'] : ['93.184.216.34']),
  resolve6: async () => [],
});
const NXDOMAIN = {
  resolve4: async () => { throw new Error('ENOTFOUND'); },
  resolve6: async () => { throw new Error('ENOTFOUND'); },
};

/** fetch stand-in: routes map "METHOD url" or "url" to { status, location }. */
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    const method = init.method ?? 'GET';
    calls.push({ method, url: String(url), headers: init.headers });
    const r = routes[`${method} ${url}`] ?? routes[String(url)];
    if (r instanceof Error) throw r;
    if (!r) return new Response('not found', { status: 404 });
    const headers = r.location ? { Location: r.location } : {};
    return new Response(method === 'HEAD' ? null : 'body', { status: r.status ?? 200, headers });
  };
  return { impl, calls };
}

describe('checkLink', () => {
  it('calls a page that answers 200 alive, with a HEAD request and its own user agent', async () => {
    const { impl, calls } = fakeFetch({ 'https://example.com/a': { status: 200 } });
    const r = await checkLink('https://example.com/a', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r).toMatchObject({ url: 'https://example.com/a', status: 'alive', code: 200 });
    expect(r.chain).toEqual([{ url: 'https://example.com/a', code: 200 }]);
    expect(typeof r.ms).toBe('number');
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('HEAD');
    expect(calls[0].headers['User-Agent']).toBe(USER_AGENT);
  });

  it('follows redirects and calls the page redirected, listing every hop', async () => {
    const { impl } = fakeFetch({
      'https://example.com/old': { status: 301, location: '/new' },
      'https://example.com/new': { status: 200 },
    });
    const r = await checkLink('https://example.com/old', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.status).toBe('redirected');
    expect(r.code).toBe(200);
    expect(r.chain).toEqual([
      { url: 'https://example.com/old', code: 301 },
      { url: 'https://example.com/new', code: 200 },
    ]);
  });

  it('calls 404 and 410 dead', async () => {
    const { impl } = fakeFetch({ 'https://example.com/gone': { status: 410 } });
    expect((await checkLink('https://example.com/missing', { fetchImpl: impl, resolvers: PUBLIC })).status).toBe('dead');
    const gone = await checkLink('https://example.com/gone', { fetchImpl: impl, resolvers: PUBLIC });
    expect(gone).toMatchObject({ status: 'dead', code: 410 });
  });

  it('retries with GET when HEAD fails, since some servers answer HEAD wrongly', async () => {
    const { impl, calls } = fakeFetch({
      'HEAD https://example.com/a': { status: 405 },
      'GET https://example.com/a': { status: 200 },
    });
    const r = await checkLink('https://example.com/a', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r).toMatchObject({ status: 'alive', code: 200 });
    expect(calls.map((c) => c.method)).toEqual(['HEAD', 'GET']);
  });

  it('calls 401, 403, 429 and 5xx unclear: the server answered but did not show the page', async () => {
    for (const status of [401, 403, 429, 503]) {
      const { impl } = fakeFetch({ 'https://example.com/a': { status } });
      const r = await checkLink('https://example.com/a', { fetchImpl: impl, resolvers: PUBLIC });
      expect(r).toMatchObject({ status: 'unclear', code: status });
    }
  });

  it('calls a domain that no longer resolves dead', async () => {
    const { impl, calls } = fakeFetch({});
    const r = await checkLink('https://gone.example/a', { fetchImpl: impl, resolvers: NXDOMAIN });
    expect(r.status).toBe('dead');
    expect(r.detail).toMatch(/domain/i);
    expect(calls).toHaveLength(0);
  });

  it('does not fetch a URL on a private address and calls it invalid', async () => {
    const { impl, calls } = fakeFetch({});
    const r = await checkLink('http://intranet.example/', { fetchImpl: impl, resolvers: PRIVATE_FOR('intranet.example') });
    expect(r.status).toBe('invalid');
    expect(calls).toHaveLength(0);
  });

  it('does not follow a redirect to a private address', async () => {
    const { impl, calls } = fakeFetch({ 'https://example.com/a': { status: 302, location: 'http://intranet.example/' } });
    const r = await checkLink('https://example.com/a', { fetchImpl: impl, resolvers: PRIVATE_FOR('intranet.example') });
    expect(r.status).toBe('invalid');
    expect(r.detail).toMatch(/redirect/i);
    expect(calls.every((c) => !c.url.includes('intranet'))).toBe(true);
  });

  it('calls a fetch that runs out of time timeout', async () => {
    const timeout = new DOMException('The operation timed out.', 'TimeoutError');
    const { impl } = fakeFetch({ 'https://example.com/slow': timeout });
    const r = await checkLink('https://example.com/slow', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.status).toBe('timeout');
  });

  it('calls a server that does not answer dead', async () => {
    const { impl } = fakeFetch({ 'https://example.com/a': new TypeError('Network connection lost.') });
    const r = await checkLink('https://example.com/a', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.status).toBe('dead');
    expect(r.code).toBe(null);
  });

  it('stops after MAX_REDIRECTS redirects and calls the page unclear', async () => {
    const routes = {};
    for (let i = 0; i <= MAX_REDIRECTS + 1; i++) routes[`https://example.com/${i}`] = { status: 302, location: `/${i + 1}` };
    const { impl } = fakeFetch(routes);
    const r = await checkLink('https://example.com/0', { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.status).toBe('unclear');
    expect(r.chain).toHaveLength(MAX_REDIRECTS + 1);
  });
});

describe('checkLinks', () => {
  it('keeps the order of the list', async () => {
    const { impl } = fakeFetch({ 'https://example.com/a': { status: 200 } });
    const r = await checkLinks(['https://example.com/missing', 'https://example.com/a'], { fetchImpl: impl, resolvers: PUBLIC });
    expect(r.map((x) => x.status)).toEqual(['dead', 'alive']);
  });
});

describe('parseLinkCheckRequest', () => {
  it('takes the first batch of a run with the size of the whole list', () => {
    const r = parseLinkCheckRequest({ urls: [' https://example.com/a '], total: 37 });
    expect(r).toEqual({ ok: true, urls: ['https://example.com/a'], seq: 0, run: null, total: 37 });
  });

  it('refuses more than BATCH_SIZE URLs, no URLs, and non-strings', () => {
    const many = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => `https://example.com/${i}`);
    expect(parseLinkCheckRequest({ urls: many }).ok).toBe(false);
    expect(parseLinkCheckRequest({ urls: [] }).ok).toBe(false);
    expect(parseLinkCheckRequest({ urls: [42] }).ok).toBe(false);
    expect(parseLinkCheckRequest(null).ok).toBe(false);
  });

  it('needs the run id for every batch after the first, and caps the number of batches', () => {
    expect(parseLinkCheckRequest({ urls: ['https://example.com/'], seq: 1 }).ok).toBe(false);
    expect(parseLinkCheckRequest({ urls: ['https://example.com/'], seq: 1, run: '0123456789abcdef' }).ok).toBe(true);
    expect(parseLinkCheckRequest({ urls: ['https://example.com/'], seq: 10, run: '0123456789abcdef' }).ok).toBe(false);
    expect(parseLinkCheckRequest({ urls: ['https://example.com/'], seq: 1, run: '../x' }).ok).toBe(false);
  });
});

describe('POST /tools/link-check', () => {
  const post = (body) => SELF.fetch('https://example.com/tools/link-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

  it('checks a batch without an API key, keeps it, and returns a run id', async () => {
    const res = await post({ urls: ['http://10.0.0.1/'], total: 1 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run).toMatch(/^[a-f0-9]{16}$/);
    expect(body.seq).toBe(0);
    expect(body.results).toHaveLength(1);
    expect(body.results[0]).toMatchObject({ url: 'http://10.0.0.1/', status: 'invalid' });
    expect(await env.KV.get(`link-check:${body.run}:0`)).not.toBe(null);
  });

  it('adds later batches to the run, and refuses a batch for an unknown run or one already checked', async () => {
    const first = await (await post({ urls: ['http://10.0.0.1/'], total: 2 })).json();
    const second = await post({ urls: ['http://10.0.0.2/'], seq: 1, run: first.run });
    expect(second.status).toBe(200);
    expect((await post({ urls: ['http://10.0.0.2/'], seq: 1, run: first.run })).status).toBe(409);
    expect((await post({ urls: ['http://10.0.0.2/'], seq: 1, run: 'ffffffffffffffff' })).status).toBe(404);
  });

  it('answers 400 for a body that is not JSON or has too many URLs', async () => {
    expect((await post('urls=1')).status).toBe(400);
    const many = Array.from({ length: BATCH_SIZE + 1 }, (_, i) => `https://example.com/${i}`);
    expect((await post({ urls: many })).status).toBe(400);
  });
});

describe('GET /tools/link-check/{run}', () => {
  it('returns every batch of a run in order', async () => {
    const run = 'abcdefabcdef0001';
    await saveBatch(env.KV, run, 0, [{ url: 'https://a.example/', status: 'alive' }]);
    await saveBatch(env.KV, run, 1, [{ url: 'https://b.example/', status: 'dead' }]);
    const res = await SELF.fetch(`https://example.com/tools/link-check/${run}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.run).toBe(run);
    expect(body.results.map((r) => r.url)).toEqual(['https://a.example/', 'https://b.example/']);
  });

  it('answers 404 for a run that does not exist', async () => {
    const res = await SELF.fetch('https://example.com/tools/link-check/abcdefabcdef9999');
    expect(res.status).toBe(404);
  });
});

describe('GET /tools/link-rot-checker', () => {
  it('serves the page, which talks only to its own origin', async () => {
    const res = await SELF.fetch('https://example.com/tools/link-rot-checker');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toMatch(/^text\/html/);
    expect(res.headers.get('Content-Security-Policy')).toContain("connect-src 'self'");
    const html = await res.text();
    expect(html).toContain('<textarea');
    expect(html).toContain('rel="canonical" href="https://webresourceledger.com/tools/link-rot-checker"');
  });

  it('answers HEAD, as link checkers send it', async () => {
    const res = await SELF.fetch('https://example.com/tools/link-rot-checker', { method: 'HEAD' });
    expect(res.status).toBe(200);
  });
});
