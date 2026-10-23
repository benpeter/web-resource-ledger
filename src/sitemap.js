/**
 * Sitemap reading for bulk capture (phase 0130).
 *
 * readSitemap() fetches a sitemap, or a sitemap index and up to
 * MAX_CHILD_SITEMAPS of its child sitemaps, and returns up to MAX_SITEMAP_URLS
 * page URLs. Every fetch, including each redirect hop, goes through the same
 * validateUrl() check as captures, so a sitemap can't point WRL at a private
 * address.
 */
import { validateUrl } from './url-validation.js';

export const MAX_SITEMAP_URLS = 200;
export const MAX_CHILD_SITEMAPS = 10;
export const MAX_SITEMAP_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = 'WebResourceLedger/1.0 (+https://webresourceledger.com)';

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|amp|lt|gt|quot|apos);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/**
 * Extract <loc> values. Namespaced locations such as <image:loc> don't match.
 * @returns {{ type: 'urlset'|'index'|'unknown', locs: string[] }}
 */
export function parseSitemap(xml) {
  const type = /<sitemapindex[\s>]/i.test(xml) ? 'index' : /<urlset[\s>]/i.test(xml) ? 'urlset' : 'unknown';
  const locs = [];
  const re = /<loc>\s*(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const value = m[1] !== undefined ? m[1] : decodeXml(m[2]);
    if (value.trim()) locs.push(value.trim());
  }
  return { type, locs };
}

function httpUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch {
    return null;
  }
}

/** Read a response body up to maxBytes; null when it is larger. */
async function readCapped(res, maxBytes) {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) { out.set(c, offset); offset += c.byteLength; }
  return out;
}

async function fetchChecked(rawUrl, { fetchImpl, resolvers }) {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = resolvers ? await validateUrl(current, resolvers) : await validateUrl(current);
    if (!check.ok) return { ok: false, status: 400, detail: `Sitemap URL refused: ${check.detail}` };

    let res;
    try {
      res = await fetchImpl(check.url, {
        redirect: 'manual',
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/xml, text/xml;q=0.9, */*;q=0.5' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (err) {
      return { ok: false, status: 502, detail: `Could not fetch the sitemap: ${String(err?.message ?? err).slice(0, 120)}` };
    }

    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      current = new URL(location, check.url).href;
      continue;
    }
    if (!res.ok) return { ok: false, status: 502, detail: `The sitemap answered with HTTP ${res.status}` };

    const bytes = await readCapped(res, MAX_SITEMAP_BYTES);
    if (bytes === null) return { ok: false, status: 422, detail: 'The sitemap is larger than 5 MB' };
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      return { ok: false, status: 422, detail: 'Compressed sitemaps (.xml.gz) are not supported; use the uncompressed sitemap' };
    }
    return { ok: true, url: check.url, text: new TextDecoder().decode(bytes) };
  }
  return { ok: false, status: 502, detail: 'The sitemap redirected too many times' };
}

/**
 * @param {string} rawUrl
 * @param {{ fetchImpl?: typeof fetch, resolvers?: { resolve4: Function, resolve6: Function } }} [opts]
 * @returns {Promise<
 *   { ok: true, urls: string[], total: number, truncated: boolean, sitemapsRead: number } |
 *   { ok: false, status: number, detail: string }
 * >}
 */
export async function readSitemap(rawUrl, { fetchImpl = fetch, resolvers } = {}) {
  const opts = { fetchImpl, resolvers };
  const first = await fetchChecked(rawUrl, opts);
  if (!first.ok) return first;

  const parsed = parseSitemap(first.text);
  if (parsed.type === 'unknown') {
    return { ok: false, status: 422, detail: 'That URL is not a sitemap (no <urlset> or <sitemapindex> found)' };
  }

  const urls = [];
  const seen = new Set();
  let total = 0;
  let sitemapsRead = 1;
  let unread = 0;

  const add = (loc) => {
    const u = httpUrl(loc);
    if (!u || seen.has(u)) return;
    seen.add(u);
    total++;
    if (urls.length < MAX_SITEMAP_URLS) urls.push(u);
  };

  if (parsed.type === 'index') {
    for (const child of parsed.locs) {
      if (sitemapsRead - 1 >= MAX_CHILD_SITEMAPS) { unread++; continue; }
      const res = await fetchChecked(child, opts);
      sitemapsRead++;
      if (!res.ok) { unread++; continue; }
      for (const loc of parseSitemap(res.text).locs) add(loc);
    }
  } else {
    for (const loc of parsed.locs) add(loc);
  }

  return { ok: true, urls, total, truncated: total > urls.length || unread > 0, sitemapsRead };
}
