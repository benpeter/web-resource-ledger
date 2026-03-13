/*
 * capture.js -- Browser rendering capture pipeline
 *
 * Orchestrates headless Chromium capture of a URL: screenshot, rendered HTML,
 * and HTTP headers. Stores artifacts in R2 and updates KV status.
 *
 * Called from ctx.waitUntil() -- must always update KV (never leave pending).
 *
 * Rendering is injectable via the `renderer` parameter on performCapture()
 * for unit testing -- no module-scoped mutable state.
 *
 * Security constraints:
 *   - Never expose stack traces, internal error messages, or KV keys
 *   - Browser context is always closed (try/finally)
 *   - Header fetch uses redirect:'manual' (no unvalidated redirects)
 *   - Set-Cookie values redacted in captured headers
 *   - Scheme guard on captureHeaders() (defence-in-depth)
 *
 * Tests: test/capture.test.js
 */ // tva

import puppeteer from '@cloudflare/puppeteer';
import { completeCapture, failCapture } from './kv.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUBRESOURCES = 200;
const MAX_PAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PAGE_HEIGHT = 8000;
const NAV_TIMEOUT_MS = 25000;
const HEADER_FETCH_TIMEOUT_MS = 10000;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full capture pipeline. Called from ctx.waitUntil().
 *
 * Runs browser rendering and header fetch concurrently. On success, stores
 * artifacts in R2 and updates KV to complete. On any failure, updates KV
 * to failed. Always updates KV -- never leaves a capture stuck in pending.
 *
 * @param {{ KV: KVNamespace, BUCKET: R2Bucket, BROWSER: unknown }} env
 * @param {string} url Validated URL string
 * @param {string} ip Resolved IP string (informational)
 * @param {string} captureId Capture ID (e.g. cap_abc123...)
 * @param {Function} [renderer] Injectable rendering function (defaults to defaultRenderer)
 */
export async function performCapture(env, url, ip, captureId, renderer = defaultRenderer) {
  try {
    const [renderResult, headerResult] = await Promise.allSettled([
      renderer(env.BROWSER, url),
      captureHeaders(url),
    ]);

    if (renderResult.status === 'rejected') {
      const { message, retryable } = categorizeError(renderResult.reason);
      await failCapture(env.KV, captureId, message, retryable);
      return;
    }

    const { screenshot, html } = renderResult.value;
    const headers = headerResult.status === 'fulfilled' ? headerResult.value : null;

    // Store artifacts in R2
    const prefix = `captures/${captureId}`;
    await Promise.all([
      env.BUCKET.put(`${prefix}/screenshot.png`, screenshot),
      env.BUCKET.put(`${prefix}/rendered.html`, html),
      headers ? env.BUCKET.put(`${prefix}/headers.json`, JSON.stringify(headers)) : Promise.resolve(),
    ]);

    const artifacts = {
      screenshot: `${prefix}/screenshot.png`,
      html: `${prefix}/rendered.html`,
      ...(headers ? { headers: `${prefix}/headers.json` } : {}),
    };

    await completeCapture(env.KV, captureId, artifacts);
  } catch (err) {
    // Catch-all: ensure KV is updated even on unexpected errors
    try {
      await failCapture(env.KV, captureId, 'Capture could not be completed', true);
    } catch { /* KV write failed -- nothing more we can do */ }
  }
}

/**
 * Fetches HTTP response headers for the given URL via Workers fetch.
 * Uses redirect:'manual' to avoid following redirects to unvalidated URLs.
 * Redacts Set-Cookie values for privacy.
 *
 * @param {string} url
 * @returns {Promise<{ status: number, statusText: string, headers: object }>}
 */
export async function captureHeaders(url) {
  // SECURITY: Scheme guard -- defence-in-depth, independent of validateUrl
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported');
  }

  const resp = await fetch(url, {
    method: 'GET',
    redirect: 'manual',
    signal: AbortSignal.timeout(HEADER_FETCH_TIMEOUT_MS),
    headers: {
      'User-Agent': 'WRL/0.1 (Web Resource Ledger)',
      'Cache-Control': 'no-cache',
    },
    cf: { cacheTtl: 0 },
  });

  const headers = {};
  for (const [key, value] of resp.headers.entries()) {
    // SECURITY: Strip Set-Cookie values (privacy)
    if (key.toLowerCase() === 'set-cookie') {
      headers[key] = '[redacted]';
    } else {
      headers[key] = value;
    }
  }

  return {
    status: resp.status,
    statusText: resp.statusText,
    headers,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Launches headless Chromium, navigates to url, takes a screenshot and
 * captures rendered HTML. Enforces subresource count and page size limits.
 *
 * NOT exported -- injected as default renderer via performCapture() parameter.
 *
 * @param {unknown} browserBinding Cloudflare BROWSER binding
 * @param {string} url
 * @returns {Promise<{ screenshot: Uint8Array, html: string }>}
 */
async function defaultRenderer(browserBinding, url) {
  const browser = await puppeteer.launch(browserBinding);
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    // Request interception for isolation and safety limits
    let subresourceCount = 0;
    let totalBytes = 0;
    let limitExceeded = null;

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (limitExceeded) { req.abort('blockedbyclient'); return; }
      subresourceCount++;
      if (subresourceCount > MAX_SUBRESOURCES) {
        limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
        req.abort('blockedbyclient');
        return;
      }
      req.continue();
    });

    page.on('response', (resp) => {
      const cl = resp.headers()['content-length'];
      if (cl) totalBytes += parseInt(cl, 10);
      if (totalBytes > MAX_PAGE_BYTES) {
        limitExceeded = 'Page exceeded 50MB size limit';
      }
    });

    // Navigate with 25s timeout (leaves 5s headroom in ctx.waitUntil 30s budget)
    await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle2' });

    if (limitExceeded) throw new Error(limitExceeded);

    // Cap screenshot height to prevent memory exhaustion
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    if (pageHeight > MAX_PAGE_HEIGHT) {
      await page.setViewport({ width: 1280, height: MAX_PAGE_HEIGHT });
    }

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    const html = await page.content();

    return { screenshot, html };
  } finally {
    await context.close();
    await browser.close();
  }
}

/**
 * Maps an error to a user-facing message and retryable flag.
 * SECURITY: Never expose stack traces or internal error details.
 *
 * @param {Error} error
 * @returns {{ message: string, retryable: boolean }}
 */
function categorizeError(error) {
  const msg = error?.message ?? '';

  if (msg.includes('timeout') || msg.includes('Timeout')) {
    return { message: 'Page did not finish loading within 25 seconds', retryable: true };
  }
  if (msg.includes(`${MAX_SUBRESOURCES} subresource limit`)) {
    return { message: `Page exceeded ${MAX_SUBRESOURCES} subresource limit`, retryable: false };
  }
  if (msg.includes('50MB size limit')) {
    return { message: 'Page exceeded 50MB size limit', retryable: false };
  }
  if (msg.includes('Could not navigate') || msg.includes('net::ERR') || msg.includes('Navigation')) {
    return { message: 'Could not navigate to the target URL', retryable: true };
  }

  return { message: 'Capture could not be completed', retryable: true };
}
