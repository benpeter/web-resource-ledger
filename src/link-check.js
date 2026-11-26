// tva
/**
 * link-check.js -- the free Link Rot Checker (phase 0211, backlog #56).
 *
 * checkLink follows a URL's redirects the way sitemap.js does: every hop goes
 * through validateUrl first, so the checker never asks a private address for
 * anything. It sends HEAD and falls back to GET when HEAD fails, since some
 * servers answer HEAD with 404 or 405 for pages that exist. The body is never
 * read.
 *
 * The page at /tools/link-rot-checker sends its list in batches of BATCH_SIZE.
 * Each batch is kept in KV under link-check:<run>:<seq>, so a run can be shown
 * again on a shareable link. Batches are not merged into one key: KV is
 * eventually consistent, and read-modify-write on one key could lose a batch.
 */
import { validateUrl } from './url-validation.js';

export const BATCH_SIZE = 10;
export const MAX_BATCHES = 10;
export const MAX_REDIRECTS = 5;
// One budget for a URL and all its redirects, so a batch answers within about
// this long even when every URL hangs.
const URL_BUDGET_MS = 10_000;
const MAX_URL_LENGTH = 2048;
export const USER_AGENT = 'WebResourceLedger-LinkRotChecker/1.0 (+https://webresourceledger.com/tools/link-rot-checker)';
const RUN_ID_RE = /^[a-f0-9]{16}$/;

// The server answered, but not with the page: it wants a login, refuses
// automated requests, or failed. The page may well be there in a browser.
const UNCLEAR_CODES = new Set([401, 403, 429]);

/**
 * @param {number} code final HTTP status
 * @param {boolean} redirected whether there was at least one redirect
 * @returns {'alive'|'redirected'|'dead'|'unclear'}
 */
export function statusFor(code, redirected) {
  if (code >= 200 && code < 300) return redirected ? 'redirected' : 'alive';
  if (UNCLEAR_CODES.has(code) || code >= 500 || (code >= 300 && code < 400)) return 'unclear';
  return 'dead';
}

function isTimeout(err, signal) {
  return err?.name === 'TimeoutError' || err?.name === 'AbortError' || signal.aborted;
}

async function send(url, method, fetchImpl, signal) {
  const res = await fetchImpl(url, {
    method,
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT, Accept: '*/*' },
    signal,
  });
  try { await res.body?.cancel(); } catch { /* already closed */ }
  return res;
}

/**
 * @param {string} rawUrl
 * @param {{ fetchImpl?: typeof fetch, resolvers?: { resolve4: Function, resolve6: Function } }} [opts]
 * @returns {Promise<{ url: string, status: string, code: number|null, chain: { url: string, code: number }[], ms: number, detail?: string }>}
 */
export async function checkLink(rawUrl, { fetchImpl = fetch, resolvers } = {}) {
  const started = Date.now();
  const signal = AbortSignal.timeout(URL_BUDGET_MS);
  const chain = [];
  const done = (status, detail) => ({
    url: rawUrl,
    status,
    code: chain.length ? chain[chain.length - 1].code : null,
    chain,
    ms: Date.now() - started,
    ...(detail ? { detail } : {}),
  });

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const check = resolvers ? await validateUrl(current, resolvers) : await validateUrl(current);
    if (!check.ok) {
      if (check.detail === 'Could not resolve hostname') {
        return done('dead', hop === 0 ? 'The domain does not resolve' : 'Redirects to a domain that does not resolve');
      }
      return done('invalid', hop === 0 ? check.detail : `Redirects to a URL the checker does not fetch: ${check.detail}`);
    }

    let res;
    try {
      res = await send(check.url, 'HEAD', fetchImpl, signal).catch((err) => {
        if (isTimeout(err, signal)) throw err;
        return null;
      });
      if (!res || res.status >= 400) res = await send(check.url, 'GET', fetchImpl, signal);
    } catch (err) {
      if (isTimeout(err, signal)) return done('timeout', `No answer within ${URL_BUDGET_MS / 1000} seconds`);
      return done('dead', 'The server did not answer');
    }

    chain.push({ url: check.url, code: res.status });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      try {
        current = new URL(location, check.url).href;
      } catch {
        return done('unclear', 'Redirects to an address that is not a URL');
      }
      continue;
    }
    return done(statusFor(res.status, chain.length > 1));
  }
  return done('unclear', `More than ${MAX_REDIRECTS} redirects`);
}

/**
 * Checks a batch at once; the runtime queues fetches beyond its connection limit.
 *
 * @param {string[]} urls
 * @param {object} [opts] as for checkLink
 */
export function checkLinks(urls, opts) {
  return Promise.all(urls.map((url) => checkLink(url, opts)));
}

/**
 * Validates the body of POST /tools/link-check.
 *
 * @param {unknown} body
 * @returns {{ ok: true, urls: string[], seq: number, run: string|null, total: number } | { ok: false, detail: string }}
 */
export function parseLinkCheckRequest(body) {
  if (!body || typeof body !== 'object') return { ok: false, detail: 'Send a JSON object with a urls list' };
  const { urls, seq = 0, run = null, total } = body;
  if (!Array.isArray(urls) || urls.length === 0 || urls.length > BATCH_SIZE) {
    return { ok: false, detail: `urls must list 1 to ${BATCH_SIZE} URLs` };
  }
  if (!urls.every((u) => typeof u === 'string' && u.trim() && u.length <= MAX_URL_LENGTH)) {
    return { ok: false, detail: `Each URL must be a string of at most ${MAX_URL_LENGTH} characters` };
  }
  if (!Number.isInteger(seq) || seq < 0 || seq >= MAX_BATCHES) {
    return { ok: false, detail: `seq must be a whole number from 0 to ${MAX_BATCHES - 1}` };
  }
  if (seq > 0 && (typeof run !== 'string' || !RUN_ID_RE.test(run))) {
    return { ok: false, detail: 'Batches after the first need the run id the first one returned' };
  }
  const max = BATCH_SIZE * MAX_BATCHES;
  const size = Number.isInteger(total) && total > 0 ? Math.min(total, max) : urls.length;
  return { ok: true, urls: urls.map((u) => u.trim()), seq, run: seq > 0 ? run : null, total: size };
}

/** @returns {string} 16 hex characters */
export function newRunId() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const batchKey = (run, seq) => `link-check:${run}:${seq}`;

export async function saveBatch(kv, run, seq, results) {
  await kv.put(batchKey(run, seq), JSON.stringify({ checkedAt: new Date().toISOString(), results }));
}

export async function batchExists(kv, run, seq) {
  return (await kv.get(batchKey(run, seq))) !== null;
}

/**
 * @returns {Promise<{ run: string, checkedAt: string, results: object[] } | null>}
 */
export async function readRun(kv, run) {
  const batches = await Promise.all(
    Array.from({ length: MAX_BATCHES }, (_, seq) => kv.get(batchKey(run, seq), 'json')),
  );
  if (!batches[0]) return null;
  const results = [];
  for (const batch of batches) {
    if (!batch) break;
    results.push(...batch.results);
  }
  return { run, checkedAt: batches[0].checkedAt, results };
}

export function countByStatus(results) {
  const counts = {};
  for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}
