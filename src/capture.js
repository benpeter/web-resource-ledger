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
 * Session reuse model:
 *   Uses @cloudflare/playwright's acquire/connect pattern. sessions() lists
 *   active browser processes; free sessions (no connectionId) can be claimed
 *   by calling connect(). One free session is picked at random to distribute
 *   contention across concurrent workers. If all sessions are in use and the
 *   pool limit is reached, the capture fails immediately -- no wait loop, to
 *   preserve the 30s ctx.waitUntil budget.
 *
 * BrowserContext isolation guarantees:
 *   Each capture creates a fresh BrowserContext and closes it in try/finally.
 *   BrowserContext provides strong isolation: cookies, localStorage,
 *   sessionStorage, IndexedDB, Cache API, and service worker registrations
 *   are all scoped to the context and discarded on context.close().
 *   Service workers are blocked via serviceWorkers:'block' to prevent
 *   persistent registrations from bypassing route interception.
 *
 * Accepted risks (browser-level shared state):
 *   DNS cache, TLS session tickets, and HTTP/2 connection pools are shared
 *   across contexts within a browser process. These are not observable through
 *   capture artifacts (screenshot, rendered HTML, headers) and are not
 *   meaningful in a single-tenant deployment where every capture belongs to
 *   the same account. Cloudflare's gVisor sandbox provides account-level
 *   isolation at the infrastructure layer.
 *
 * Security constraints:
 *   - Never expose stack traces, internal error messages, or KV keys
 *   - context.close() in try/finally is MANDATORY (clears all context state)
 *   - browser.close() disconnects the session; it does NOT kill the process
 *     for connect()-obtained sessions (keep_alive keeps browser hot)
 *   - Cross-domain navigation blocked via context.route() (closes TOCTOU gap)
 *   - Service workers blocked to prevent route bypass
 *   - Header fetch uses redirect:'manual' (no unvalidated redirects)
 *   - Set-Cookie values redacted in captured headers
 *   - Scheme guard on captureHeaders() (defence-in-depth)
 *
 * Accepted gaps:
 *   - Same-domain DNS rebinding: a target page that changes its DNS record
 *     mid-session could redirect to an internal IP via same-origin navigation.
 *     Mitigated by NAV_TIMEOUT_MS and the fact that WRL only captures
 *     user-submitted public URLs.
 *   - Cross-origin iframe sub-navigation: iframes can navigate internally
 *     within their own origin; only top-level cross-origin navigations are
 *     blocked. Acceptable for the current single-tenant use case.
 *   Revisit both if multi-tenant deployment is implemented.
 *
 * Tests: test/capture.test.js
 */ // tva

import { connect, acquire, sessions, limits } from '@cloudflare/playwright';
import { completeCapture, failCapture } from './kv.js';
import { buildWacz } from './wacz.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUBRESOURCES = 200;
const MAX_PAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PAGE_HEIGHT = 8000;
const NAV_TIMEOUT_MS = 25000;
const HEADER_FETCH_TIMEOUT_MS = 10000;
const KEEP_ALIVE_MS = 120000; // 2 minutes

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
      env.BUCKET.put(`${prefix}/rendered.html`, html, {
        httpMetadata: {
          contentType: 'text/plain',
          contentDisposition: 'attachment; filename="rendered.html"',
        },
      }),
      headers ? env.BUCKET.put(`${prefix}/headers.json`, JSON.stringify(headers)) : Promise.resolve(),
    ]);

    const artifacts = {
      screenshot: `${prefix}/screenshot.png`,
      html: `${prefix}/rendered.html`,
      ...(headers ? { headers: `${prefix}/headers.json` } : {}),
    };

    // WACZ bundling (optional -- degrades gracefully if signing key is absent)
    let waczInfo = null;
    try {
      const waczArtifacts = {
        screenshot,
        html,
        headers, // may be null if header fetch failed
      };
      const result = await buildWacz(url, new Date().toISOString(), waczArtifacts, env);
      if (result) {
        const { waczBytes, waczHash, bundleHash } = result;
        await env.BUCKET.put(`captures/${waczHash}.wacz`, waczBytes, {
          httpMetadata: {
            contentType: 'application/wacz+zip',
            contentDisposition: `attachment; filename="${waczHash}.wacz"`,
          },
        });
        waczInfo = {
          key: `captures/${waczHash}.wacz`,
          bundleHash,
          size: waczBytes.byteLength,
        };
      }
    } catch (err) {
      // WACZ bundling failed unexpectedly -- capture still completes with individual artifacts
      // Distinguish from "no signing key" path (which returns null, no error)
      console.warn('WACZ bundling failed unexpectedly; capture completed without bundle');
    }

    await completeCapture(env.KV, captureId, artifacts, waczInfo);
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
 * Acquires a browser session from the Playwright session pool.
 *
 * Prefers reusing a free existing session (picked at random to distribute
 * contention). Falls back to acquiring a new session if the pool has capacity.
 * Throws immediately if no session is available -- no retry loop, to preserve
 * the 30s ctx.waitUntil budget.
 *
 * @param {unknown} browserBinding Cloudflare BROWSER binding
 * @returns {Promise<import('@cloudflare/playwright').Browser>}
 */
async function getOrCreateSession(browserBinding) {
  // Try to reuse a free existing session
  const activeSessions = await sessions(browserBinding);
  const freeSessions = activeSessions.filter((s) => !s.connectionId);

  if (freeSessions.length > 0) {
    // Pick at random to distribute contention across concurrent workers
    const pick = freeSessions[Math.floor(Math.random() * freeSessions.length)];
    try {
      return await connect(browserBinding, pick.sessionId);
    } catch {
      // Another worker claimed the session between list and connect -- fall through
    }
  }

  // No free session available; try acquiring a new one
  const poolLimits = await limits(browserBinding);
  if (poolLimits.allowedBrowserAcquisitions > 0) {
    const session = await acquire(browserBinding, { keep_alive: KEEP_ALIVE_MS });
    return await connect(browserBinding, session.sessionId);
  }

  throw new Error('No browser session available: session pool is at capacity');
}

/**
 * Connects to a browser session, navigates to url, takes a screenshot and
 * captures rendered HTML. Enforces subresource count and page size limits.
 * Uses BrowserContext for per-capture isolation.
 *
 * NOT exported -- injected as default renderer via performCapture() parameter.
 *
 * @param {unknown} browserBinding Cloudflare BROWSER binding
 * @param {string} url
 * @returns {Promise<{ screenshot: Uint8Array, html: string }>}
 */
async function defaultRenderer(browserBinding, url) {
  const browser = await getOrCreateSession(browserBinding);

  // Defensive orphan cleanup: close any contexts left by a prior session user
  for (const ctx of browser.contexts()) {
    await ctx.close();
  }

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    serviceWorkers: 'block',
  });

  try {
    // Request interception for isolation and safety limits (context level)
    const targetOrigin = new URL(url).origin;
    let subresourceCount = 0;
    let totalBytes = 0;
    let limitExceeded = null;

    await context.route('**/*', async (route) => {
      // SECURITY: Block cross-domain top-level navigation (closes TOCTOU gap)
      if (
        route.request().isNavigationRequest() &&
        new URL(route.request().url()).origin !== targetOrigin
      ) {
        await route.abort('blockedbyclient');
        return;
      }

      if (limitExceeded) {
        await route.abort('blockedbyclient');
        return;
      }

      subresourceCount++;
      if (subresourceCount > MAX_SUBRESOURCES) {
        limitExceeded = `Page exceeded ${MAX_SUBRESOURCES} subresource limit`;
        await route.abort('blockedbyclient');
        return;
      }

      await route.continue();
    });

    const page = await context.newPage();

    // Response monitoring for total page size
    page.on('response', (resp) => {
      const cl = resp.headers()['content-length'];
      if (cl) totalBytes += parseInt(cl, 10);
      if (totalBytes > MAX_PAGE_BYTES) {
        limitExceeded = 'Page exceeded 50MB size limit';
      }
    });

    // Navigate with 25s timeout (leaves 5s headroom in ctx.waitUntil 30s budget)
    // Playwright uses 'networkidle' (not 'networkidle2')
    await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'networkidle' });

    if (limitExceeded) throw new Error(limitExceeded);

    // Cap screenshot height to prevent memory exhaustion
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    if (pageHeight > MAX_PAGE_HEIGHT) {
      await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
    }

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    const html = await page.content();

    return { screenshot, html };
  } finally {
    // MANDATORY: close context before disconnecting to clear all isolation state
    await context.close();
    // Disconnects from the browser process; does NOT kill it (keep_alive keeps it hot)
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

  // Playwright throws TimeoutError (by name) for navigation and wait timeouts
  if (error?.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('Timeout')) {
    return { message: 'Page did not finish loading within 25 seconds', retryable: true };
  }
  if (msg.includes(`${MAX_SUBRESOURCES} subresource limit`)) {
    return { message: `Page exceeded ${MAX_SUBRESOURCES} subresource limit`, retryable: false };
  }
  if (msg.includes('50MB size limit')) {
    return { message: 'Page exceeded 50MB size limit', retryable: false };
  }
  // Playwright-specific: browser or page lifecycle errors (must precede generic
  // 'Navigation' check -- Playwright crash messages include the word "Navigation")
  if (
    msg.includes('page crashed') ||
    msg.includes('page was closed') ||
    msg.includes('browser has been closed') ||
    msg.includes('Target closed')
  ) {
    return { message: 'Browser session was unexpectedly closed', retryable: true };
  }
  if (msg.includes('Could not navigate') || msg.includes('net::ERR') || msg.includes('Navigation')) {
    return { message: 'Could not navigate to the target URL', retryable: true };
  }
  // Session pool exhaustion
  if (msg.includes('session pool')) {
    return { message: 'No browser session available; try again shortly', retryable: true };
  }

  return { message: 'Capture could not be completed', retryable: true };
}
