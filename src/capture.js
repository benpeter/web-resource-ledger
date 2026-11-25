/*
 * capture.js -- Browser rendering capture pipeline
 *
 * Orchestrates headless Chromium capture of a URL: dual screenshots (before
 * and after cookie consent dismissal), rendered HTML, and HTTP headers.
 * Stores artifacts in R2 and updates KV status.
 *
 * Cookie consent handling:
 *   After navigation and the before-screenshot, the renderer injects
 *   @duckduckgo/autoconsent (server-controlled, not caller-supplied) to
 *   detect and dismiss cookie consent banners. If a CMP is found and
 *   dismissed, a second screenshot is taken. Both screenshots and consent
 *   metadata (captureSettings) are included in the WACZ bundle and covered
 *   by the Ed25519 signature. The consent step takes 2s when no consent tool
 *   is detected (up to 6s on a page that keeps the browser busy) and at most
 *   10s when one is (see consent.js), within the
 *   15-minute queue consumer wall clock (NAV_TIMEOUT_MS=20s load + 3s settle + 2.5s scroll + 2-10s consent + 2s post ≈ 38s worst-case; in practice load fires in 2-5s).
 *   A page that hit the navigation timeout gets the same steps.
 *
 * Called from queue consumer. For retryable errors, does NOT write KV
 * (leaves pending for retry). For non-retryable errors and success, writes
 * terminal KV state. The queue consumer/DLQ handler owns the final
 * failCapture() call when retries exhaust.
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
 *   preserve the 15-minute queue consumer wall clock.
 *   The library is loaded with a dynamic import on the first session request,
 *   so cold starts that never capture (API, verify, /health) skip evaluating
 *   it (test/browser-import-sync.test.js).
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
 *   - Cross-domain main-frame navigation blocked via context.route() (closes TOCTOU gap)
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
 *   - Cross-origin iframe sub-navigation: iframes can navigate to cross-origin
 *     destinations (e.g. CMP consent frames); only main-frame cross-origin
 *     navigations are blocked. Bounded by same-origin policy and MAX_SUBRESOURCES.
 *   Revisit both if multi-tenant deployment is implemented.
 *
 * Tests: test/capture.test.js
 */ // tva

import { completeCapture, failCapture, recordAttemptError, archiveSigningKey } from './db.js';
import { buildWacz } from './wacz.js';
import { log } from './log.js';
import { dismissCookieConsent, consentResult, AUTOCONSENT_VERSION } from './consent.js';
import { softwareId } from './build-info.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// 500 until phase 0178 (2026-11-15). Measured on staging with the cap out of
// the way: Guardian 865 requests, Yahoo Finance 1193, NYT 1208,
// Merriam-Webster 1739 (docs/evolution/0178-subresource-cap-partial/outcome.md).
const MAX_SUBRESOURCES = 2000;
const MAX_PAGE_BYTES = 50 * 1024 * 1024; // 50 MB
// The rendered HTML is read into the Worker and packed into the WACZ, so it
// counts against Worker memory (128 MB, shared by the captures an isolate runs
// at once). The largest seen by 2026-11-25 was 8.9 MB (backlog #99).
export const MAX_HTML_CHARS = 15_000_000;
export const MAX_PAGE_HEIGHT = 8000;
// Screenshot resolution relative to CSS pixels. 4 until phase 0118 (2026-10-23);
// 2 keeps text sharp and makes screenshots, most of a capture's size, about 4x smaller.
export const DEVICE_SCALE_FACTOR = 2;
const NAV_TIMEOUT_MS = 20000;
const SETTLE_MAX_MS = 3000;
const SETTLE_QUIESCENCE_MS = 500;
const HEADER_FETCH_TIMEOUT_MS = 10000;
const KEEP_ALIVE_MS = 120000; // 2 minutes
const PARTIAL_BUDGET_MS = 120000;
const PARTIAL_CONTENT_TIMEOUT_MS = 1000;
// One delivery plus max_retries = 3 on the capture queue (wrangler.toml).
export const CAPTURE_MAX_ATTEMPTS = 4;
// How long a detected bot check gets to finish by itself before the capture fails.
const BOT_CHECK_WAIT_MS = 8000;
const BOT_CHECK_VENDOR_NAMES = { cloudflare: 'Cloudflare', datadome: 'DataDome' };

// How long one small call to the loaded page may take: the two checks before
// the scroll (browser error page, bot check) and the two calls after it. Each
// is answered in milliseconds unless the page keeps the browser busy.
const PAGE_CHECK_MAX_MS = 15000;
// How long the two small reads may take that a capture cannot go on without:
// the ready state after a navigation timeout and the page's height before a
// screenshot. On dictionary.com the ready state was answered after up to 15
// seconds, so these get twice that. An idle browser session is closed after
// KEEP_ALIVE_MS, which is what a read without a limit ran into.
const PAGE_READ_MAX_MS = 30000;

/**
 * Waits for a call to the browser, for a limited time. A page that keeps the
 * browser busy can leave a call unanswered for minutes (backlog #102, #105).
 *
 * @template T
 * @param {Promise<T>} call
 * @param {number} maxMs
 * @param {string} message  Error message when the time is up
 * @returns {Promise<T>}
 */
function answerWithin(call, maxMs, message) {
  let timer;
  return Promise.race([
    call,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), maxMs);
    }),
  ]).finally(() => clearTimeout(timer));
}
// How long to watch for a reload after a cookie banner was dismissed. Sites
// that reload themselves on the choice (theguardian.com) start within this.
const POST_CONSENT_NAV_WAIT_MS = 2000;

// Where a browser session goes out to the web (backlog #108). Cloudflare runs
// sessions in different places (seen: SJC, DFW, LAX), a session keeps its
// place, and the place changes what a site shows, e.g. consent banners in Los
// Angeles that Dallas doesn't get. Read once per session from Cloudflare's
// trace page, in a context of its own, and kept per session in this isolate.
const BROWSER_TRACE_URL = 'https://www.cloudflare.com/cdn-cgi/trace';
const BROWSER_LOCATION_MAX_MS = 6000;
const browserLocations = new Map();
const MAX_KNOWN_SESSIONS = 50;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Orchestrates the full capture pipeline. Called from queue consumer.
 *
 * Runs browser rendering and header fetch concurrently. On success, stores
 * artifacts in R2 and updates KV to complete. For non-retryable failures,
 * writes KV to failed. For retryable failures, leaves KV pending (caller
 * must ack/retry the queue message and eventually call failCapture on DLQ).
 *
 * @param {{ KV: KVNamespace, BUCKET: R2Bucket, BROWSER: unknown }} env
 * @param {string} url Validated URL string
 * @param {string} ip Resolved IP string (informational)
 * @param {string} captureId Capture ID (e.g. cap_abc123...)
 * @param {string} tenantId Tenant identifier
 * @param {string} [cip] Hashed client IP (undefined when IP_HASH_SEED not configured)
 * @param {Function} [renderer] Injectable rendering function (defaults to defaultRenderer)
 * @param {number} [attempt] Delivery attempt number (1-based, incremented by queue consumer)
 * @param {boolean} [qualifiedTimestamps] Whether to request a qualified (eIDAS) timestamp
 * @returns {Promise<{ ok: true }|{ ok: false, retryable: boolean, error?: string }>}
 */
export async function performCapture(env, url, ip, captureId, tenantId, cip, renderer = defaultRenderer, attempt = 1, qualifiedTimestamps = false) {
  const start = Date.now();
  await log(env, 3, 'capture', { event: 'capture.start', captureId, tenantId, url, cip, attempt });
  try {
    const RENDER_DEADLINE_MS = 600000; // 10 min hard cap within 15-min queue consumer budget
    const renderWithDeadline = Promise.race([
      renderer(env, url, captureId),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Render deadline exceeded')), RENDER_DEADLINE_MS)),
    ]);
    const [renderResult, headerResult] = await Promise.allSettled([
      renderWithDeadline,
      captureHeaders(url),
    ]);

    if (renderResult.status === 'rejected') {
      const { message, retryable } = categorizeError(renderResult.reason);
      await log(env, 5, 'capture', { event: 'capture.stage.fail', captureId, tenantId, stage: 'browser_render', errorCategory: message, retryable, cip, attempt, errorName: renderResult.reason?.name, errorMessage: String(renderResult.reason?.message ?? '').slice(0, 256) });
      if (retryable) {
        // Keep the reason: if every attempt fails, the final failure names it.
        await recordAttemptError(env.DB, captureId, message);
        return { ok: false, retryable: true, error: message };
      }
      await failCapture(env.DB, captureId, message, retryable);
      return { ok: false, retryable: false };
    }

    const { screenshot, html, partial, render, consent, screenshotBefore, browserLocation } = renderResult.value;
    const renderQuality = partial ? 'partial' : 'full';
    const headers = headerResult.status === 'fulfilled' ? headerResult.value : null;
    if (!headers) {
      await log(env, 4, 'capture', { event: 'capture.header_fail', captureId, tenantId, cip });
    }

    // Store artifacts in R2
    const prefix = `captures/${captureId}`;
    await Promise.all([
      env.BUCKET.put(`${prefix}/screenshot.png`, screenshot),
      screenshotBefore ? env.BUCKET.put(`${prefix}/screenshot-before.png`, screenshotBefore) : Promise.resolve(),
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
      ...(screenshotBefore ? { screenshotBefore: `${prefix}/screenshot-before.png` } : {}),
      html: `${prefix}/rendered.html`,
      ...(headers ? { headers: `${prefix}/headers.json` } : {}),
    };

    // Build captureSettings (null only for a renderer that reports neither a
    // consent step nor where its browser went out to the web). Signed into the
    // bundle, so a verifier can see where the page was loaded from (backlog #108).
    const captureSettings = consent || browserLocation ? {
      version: 1,
      ...(consent ? {
        consent: {
          library: '@duckduckgo/autoconsent',
          libraryVersion: AUTOCONSENT_VERSION,
          action: 'optOut',
          result: consentResult(consent),
          ...(consent.cmp ? { cmpDetected: consent.cmp } : {}),
        },
      } : {}),
      ...(browserLocation ? { browserLocation } : {}),
    } : null;

    // Signed into the bundle, so a verifier can tell a partial render from a full one
    const captureQuality = {
      renderQuality,
      ...(render?.waitUntilReached !== undefined ? { waitUntilReached: render.waitUntilReached } : {}),
      ...(render?.timedOut !== undefined ? { timedOut: render.timedOut } : {}),
      ...(render?.subresourceLimitReached !== undefined ? { subresourceLimitReached: render.subresourceLimitReached } : {}),
      ...(render?.sizeLimitReached !== undefined ? { sizeLimitReached: render.sizeLimitReached } : {}),
      ...(render?.requestsHeldBack !== undefined ? { requestsHeldBack: render.requestsHeldBack } : {}),
      ...(render?.httpStatus !== undefined ? { httpStatus: render.httpStatus } : {}),
      ...(render?.screenshotClipped !== undefined ? {
        pageHeight: render.pageHeight,
        screenshotHeight: render.screenshotHeight,
        screenshotClipped: render.screenshotClipped,
      } : {}),
    };

    // WACZ bundling (optional -- degrades gracefully if signing key is absent)
    let waczInfo = null;
    try {
      const waczArtifacts = {
        screenshotBefore: screenshotBefore || screenshot,
        screenshotAfter: screenshotBefore ? screenshot : null,
        html,
        headers, // may be null if header fetch failed
        captureSettings,
        captureQuality,
      };
      const result = await buildWacz(url, new Date().toISOString(), waczArtifacts, env, { qualifiedTimestamps });
      if (result) {
        const { waczBytes, waczHash, bundleHash, publicKeyBase64, keyId, timestampStatus, qualifiedTimestampStatus } = result;
        await env.BUCKET.put(`captures/${waczHash}.wacz`, waczBytes, {
          httpMetadata: {
            contentType: 'application/wacz+zip',
            contentDisposition: `attachment; filename="${waczHash}.wacz"`,
          },
        });
        // Archive signing key BEFORE completeCapture() -- no race window
        try {
          await archiveSigningKey(env.DB, keyId, publicKeyBase64);
        } catch (err) {
          // Non-fatal: key may already be archived from a prior capture
          await log(env, 4, 'capture', { event: 'capture.key_archive_fail', captureId, tenantId, cip, errorMessage: String(err?.message ?? '').slice(0, 256) });
        }
        waczInfo = {
          key: `captures/${waczHash}.wacz`,
          bundleHash,
          size: waczBytes.byteLength,
          keyId,
          timestampStatus,
          qualifiedTimestampStatus,
        };
      }
    } catch (err) {
      // WACZ bundling failed unexpectedly -- capture still completes with individual artifacts
      // Distinguish from "no signing key" path (which returns null, no error)
      await log(env, 4, 'capture', { event: 'capture.wacz_fail', captureId, tenantId, cip, errorMessage: String(err?.message ?? '').slice(0, 256) });
    }

    await completeCapture(env.DB, captureId, artifacts, waczInfo, renderQuality, render || null, captureSettings);

    if (partial) {
      await log(env, 3, 'capture', {
        event: 'capture.partial',
        captureId,
        tenantId,
        cip,
        renderQuality,
        durationMs: Date.now() - start,
        waczStatus: waczInfo ? 'ok' : 'skipped',
        timestampStatus: waczInfo?.timestampStatus ?? 'skipped',
        render,
        ...(render?.stages ?? {}),
      });
    } else {
      await log(env, 3, 'capture', {
        event: 'capture.success',
        captureId,
        tenantId,
        durationMs: Date.now() - start,
        waczStatus: waczInfo ? 'ok' : 'skipped',
        bundleSize: waczInfo?.size ?? 0,
        renderQuality: 'full',
        cip,
        timestampStatus: waczInfo?.timestampStatus ?? 'skipped',
        qualifiedTimestampStatus: waczInfo?.qualifiedTimestampStatus ?? 'skipped',
        consentStatus: consent?.status ?? null,
        consentCmp: consent?.cmp ?? null,
        consentDurationMs: consent?.durationMs ?? null,
        settleMs: render?.settleMs ?? null,
        settleReason: render?.settleReason ?? null,
        screenshotBytes: screenshot.byteLength,
        screenshotBeforeBytes: screenshotBefore?.byteLength ?? null,
        ...(render?.stages ?? {}),
      });
      if (consent?._error) {
        await log(env, 4, 'capture', {
          event: 'capture.consent_error',
          captureId, tenantId, cip,
          errorClass: consent._error.name,
          errorMessage: consent._error.message,
        });
      }
    }
    const storedBytes = screenshot.byteLength
      + (screenshotBefore ? screenshotBefore.byteLength : 0)
      + new TextEncoder().encode(html).byteLength
      + (headers ? new TextEncoder().encode(JSON.stringify(headers)).byteLength : 0)
      + (waczInfo?.size ?? 0);
    return { ok: true, storedBytes, qualifiedTimestampStatus: waczInfo?.qualifiedTimestampStatus ?? 'skipped' };
  } catch (err) {
    // Catch-all: retryable -- leave KV pending, let queue consumer retry
    await log(env, 5, 'capture', { event: 'capture.fail', captureId, tenantId, stage: 'catch_all', errorClass: err?.constructor?.name, errorMessage: String(err?.message ?? '').slice(0, 256), cip, attempt });
    return { ok: false, retryable: true, error: 'Capture could not be completed' };
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
      'User-Agent': `${softwareId()} (Web Resource Ledger)`,
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

/**
 * The data center and country in the text of https://www.cloudflare.com/cdn-cgi/trace.
 *
 * @param {string | null | undefined} text
 * @returns {{ colo: string, country: string } | null} null unless both are there
 *   as a three-letter data center code and a two-letter country code
 */
export function parseCloudflareTrace(text) {
  if (typeof text !== 'string') return null;
  const field = (name) => text.match(new RegExp(`^${name}=(.*)$`, 'm'))?.[1]?.trim();
  const colo = field('colo');
  const country = field('loc');
  if (!/^[A-Z]{3}$/.test(colo ?? '') || !/^[A-Z]{2}$/.test(country ?? '')) return null;
  return { colo, country };
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
 * the 15-minute queue consumer wall clock.
 *
 * @param {unknown} browserBinding Cloudflare BROWSER binding
 * @returns {Promise<import('@cloudflare/playwright').Browser>}
 */
async function getOrCreateSession(browserBinding) {
  const { connect, acquire, sessions, limits } = await import('@cloudflare/playwright');
  // Try to reuse a free existing session
  const activeSessions = await sessions(browserBinding);
  const freeSessions = activeSessions.filter((s) => !s.connectionId);

  if (freeSessions.length > 0) {
    // Pick at random to distribute contention across concurrent workers
    const pick = freeSessions[Math.floor(Math.random() * freeSessions.length)];
    try {
      return await connect(browserBinding, pick.sessionId);
    } catch (err) {
      // Expected: another worker claimed session between list and connect -- fall through
      console.warn('wrl:session_connect_fail', err?.message);
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
 * Where the browser session goes out to the web, read from Cloudflare's trace
 * page in a context of its own (no route handler, nothing of the capture).
 * Known sessions are answered from memory. Never throws.
 *
 * @param {import('@cloudflare/playwright').Browser} browser
 * @returns {Promise<{ location: { colo: string, country: string } | null, cached: boolean, error?: string }>}
 */
async function readBrowserLocation(browser) {
  let sessionId = null;
  try { sessionId = browser.sessionId?.() ?? null; } catch { /* sessionless browser */ }
  if (sessionId && browserLocations.has(sessionId)) {
    return { location: browserLocations.get(sessionId), cached: true };
  }
  let context = null;
  let timer;
  let done = false;
  try {
    const read = (async () => {
      context = await browser.newContext();
      // A context that opens after the time is up is closed here; the finally
      // below has already run.
      if (done) { await context.close().catch(() => {}); return null; }
      const page = await context.newPage();
      const resp = await page.goto(BROWSER_TRACE_URL, { timeout: BROWSER_LOCATION_MAX_MS });
      return parseCloudflareTrace(resp ? await resp.text() : null);
    })();
    read.catch(() => {}); // after a timeout nobody awaits it
    const location = await Promise.race([
      read,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('browser location read timed out')), BROWSER_LOCATION_MAX_MS); }),
    ]);
    if (sessionId && location) {
      if (browserLocations.size >= MAX_KNOWN_SESSIONS) browserLocations.delete(browserLocations.keys().next().value);
      browserLocations.set(sessionId, location);
    }
    return { location, cached: false };
  } catch (err) {
    return { location: null, cached: false, error: String(err?.message ?? err).slice(0, 120) };
  } finally {
    done = true;
    clearTimeout(timer);
    if (context) await context.close().catch(() => {});
  }
}

/**
 * Waits for in-flight network requests to drain, up to SETTLE_MAX_MS.
 * Ignores websocket and eventsource resource types (they stay open indefinitely).
 * Resolves when 0 non-ignored requests are in-flight for SETTLE_QUIESCENCE_MS,
 * or at SETTLE_MAX_MS regardless of activity.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @param {number} [maxMs] Hard cap in ms (defaults to SETTLE_MAX_MS)
 * @param {Iterable<object>} [pending] Requests already under way that count
 *   as in-flight too. Without it only requests that start from now on count.
 * @returns {Promise<{ settleMs: number, settleReason: 'idle'|'cap', pendingAtCap: number }>}
 */
function waitForSettle(page, maxMs = SETTLE_MAX_MS, pending = []) {
  const IGNORED_TYPES = new Set(['websocket', 'eventsource']);
  let inFlight = [...pending].filter((req) => !IGNORED_TYPES.has(req.resourceType())).length;
  let quiescenceTimer = null;
  let resolved = false;

  return new Promise((resolve) => {
    const startMs = Date.now();

    const finish = (reason) => {
      if (resolved) return;
      resolved = true;
      if (quiescenceTimer !== null) {
        clearTimeout(quiescenceTimer);
        quiescenceTimer = null;
      }
      resolve({ settleMs: Date.now() - startMs, settleReason: reason, pendingAtCap: inFlight });
    };

    const capTimer = setTimeout(() => finish('cap'), maxMs);

    const checkQuiescence = () => {
      if (inFlight === 0 && quiescenceTimer === null) {
        quiescenceTimer = setTimeout(() => {
          clearTimeout(capTimer);
          finish('idle');
        }, SETTLE_QUIESCENCE_MS);
      }
    };

    const onRequest = (req) => {
      if (IGNORED_TYPES.has(req.resourceType())) return;
      inFlight++;
      if (quiescenceTimer !== null) {
        clearTimeout(quiescenceTimer);
        quiescenceTimer = null;
      }
    };

    const onDone = (req) => {
      if (IGNORED_TYPES.has(req.resourceType())) return;
      inFlight = Math.max(0, inFlight - 1);
      checkQuiescence();
    };

    page.on('request', onRequest);
    page.on('requestfinished', onDone);
    page.on('requestfailed', onDone);

    // Check immediately in case there are already 0 in-flight requests
    checkQuiescence();
  });
}

/**
 * Connects to a browser session, navigates to url, takes before-screenshot,
 * attempts cookie consent dismissal via autoconsent, takes after-screenshot
 * if a CMP was dismissed, and captures rendered HTML. Enforces subresource
 * count and page size limits. Uses BrowserContext for per-capture isolation.
 *
 * NOT exported -- injected as default renderer via performCapture() parameter.
 *
 * @param {object} env Worker environment bindings (uses env.BROWSER + log())
 * @param {string} url
 * @param {string} [captureId] Capture ID for log correlation
 * @returns {Promise<{ screenshot: Uint8Array, screenshotBefore: Uint8Array|null,
 *   html: string, partial: boolean, render: object, consent: object|null }>}
 */
async function defaultRenderer(env, url, captureId) {
  const renderStart = Date.now();
  // A log line is a request to the log endpoint, about 200 ms. Waiting for
  // each one cost a capture two seconds with the browser session held, and
  // page events that arrived during such a wait were easy to miss. The lines
  // are sent as they happen and waited for once, after the browser is released.
  const logLines = [];
  const logLine = (severity, data) => {
    logLines.push(log(env, severity, 'capture', data));
  };
  const browser = await getOrCreateSession(env.BROWSER);
  const tSession = Date.now();

  // Defensive orphan cleanup: close any contexts left by a prior session user
  let orphanContextsClosed = 0;
  for (const ctx of browser.contexts()) {
    await ctx.close();
    orphanContextsClosed++;
  }
  const tLocation = Date.now();
  const located = await readBrowserLocation(browser);
  const browserLocation = located.location;
  logLine(3, {
    event: 'render.default.session_acquired', url, captureId, sessionAcquireMs: tSession - renderStart, orphanContextsClosed, browserVersion: browser.version(),
    colo: browserLocation?.colo ?? null, country: browserLocation?.country ?? null, locationMs: Date.now() - tLocation, locationCached: located.cached,
    ...(located.error ? { locationError: located.error } : {}),
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    serviceWorkers: 'block',
  });

  let timedOut = false;
  let readyState = 'complete';
  try {
    // Request interception for isolation and safety limits (context level)
    const targetOrigin = new URL(url).origin;
    let subresourceCount = 0;
    let totalBytes = 0;
    // Past either cap the page stops loading more and is captured as partial
    // (backlog #98, #99). The responses never reach the Worker; what does is
    // the rendered HTML, which readHtml() checks before reading it.
    let subresourceLimitReached = false;
    let sizeLimitReached = false;
    let blockedRequests = 0;
    // On while WRL takes the screenshots (backlog #105): see holdsBackRequest()
    let networkFrozen = false;
    let requestsHeldBack = 0;
    // Status of the page's own response as the browser got it (backlog #101).
    // The headers artifact comes from a separate request by the Worker and can
    // differ: a site may redirect one and block the other.
    let httpStatus = null;
    let page = null;

    await context.route('**/*', async (route) => {
      // SECURITY: Block cross-domain main-frame navigation (closes TOCTOU gap).
      // Iframe navigations allowed -- needed for CMP consent iframes and bounded
      // by same-origin policy + subresource limits (MAX_SUBRESOURCES).
      if (
        route.request().isNavigationRequest() &&
        new URL(route.request().url()).origin !== targetOrigin
      ) {
        // Only block main-frame navigations. page is null before newPage()
        // resolves; Playwright cannot fire navigation requests on a context
        // with no pages, so the null window is provably safe.
        let isMainFrame = false;
        if (page) {
          try {
            isMainFrame = route.request().frame() === page.mainFrame();
          } catch (err) {
            // frame() throws for detached frames during lifecycle transitions
          }
        }
        if (isMainFrame) {
          logLine(3, { event: 'render.default.cross_domain_blocked', url, captureId, blockedUrl: route.request().url() });
          await route.abort('blockedbyclient');
          return;
        }
      }

      if (sizeLimitReached || subresourceLimitReached) {
        blockedRequests++;
        await route.abort('blockedbyclient');
        return;
      }

      if (networkFrozen) {
        let isMainFrameNavigation = false;
        try {
          isMainFrameNavigation = route.request().isNavigationRequest() && route.request().frame() === page?.mainFrame();
        } catch (err) {
          // frame() throws for detached frames; such a request is not the page's own navigation
        }
        if (holdsBackRequest({ frozen: networkFrozen, isMainFrameNavigation })) {
          requestsHeldBack++;
          await route.abort('blockedbyclient');
          return;
        }
        networkFrozen = frozenAfterRequest({ frozen: networkFrozen, isMainFrameNavigation });
      }

      if (subresourceCount >= MAX_SUBRESOURCES) {
        subresourceLimitReached = true;
        blockedRequests++;
        logLine(3, { event: 'render.default.subresource_limit', url, captureId, subresourceCount, totalBytes });
        await route.abort('blockedbyclient');
        return;
      }
      subresourceCount++;

      await route.continue();
    });

    page = await context.newPage();
    const tContext = Date.now();
    logLine(3, { event: 'render.default.context_ready', url, captureId, contextSetupMs: tContext - tSession });

    // What the page is still waiting on, for the nav_timeout log
    const openRequests = new Set();
    page.on('request', (req) => openRequests.add(req));
    page.on('requestfinished', (req) => openRequests.delete(req));
    page.on('requestfailed', (req) => openRequests.delete(req));

    // Response monitoring for total page size
    page.on('response', (resp) => {
      const cl = resp.headers()['content-length'];
      if (cl) totalBytes += parseInt(cl, 10);
      if (totalBytes > MAX_PAGE_BYTES && !sizeLimitReached) {
        sizeLimitReached = true;
        logLine(3, { event: 'render.default.size_limit', url, captureId, subresourceCount, totalBytes });
      }
      // A later navigation of the main frame (a redirect target, a bot check
      // that reloads the page) replaces the earlier status.
      if (resp.request().isNavigationRequest()) {
        try {
          if (resp.frame() === page.mainFrame()) httpStatus = resp.status();
        } catch (err) {
          // frame() throws for detached frames during lifecycle transitions
        }
      }
    });

    // Navigate with 20s timeout using 'load' (not 'networkidle' -- ad trackers keep connections alive indefinitely)
    // A page whose HTML is there when the timeout hits goes on through the same
    // steps as a loaded page and ends as a partial capture.
    try {
      await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
      logLine(3, { event: 'render.default.nav_success', url, captureId, navigationMs: Date.now() - tContext, httpStatus, subresourceCount, totalBytes });
    } catch (navError) {
      if (navError.name !== 'TimeoutError') throw navError;
      // Check if DOM has at least loaded before attempting partial capture
      readyState = await readReadyState(page);
      logLine(3, { event: 'render.default.nav_timeout', url, captureId, navigationMs: Date.now() - tContext, readyState, totalBytes, subresourceCount, openRequestCount: openRequests.size, openRequests: summarizeOpenRequests(openRequests) });
      if (readyState !== 'interactive' && readyState !== 'complete') {
        // Distinguish "page is slow" from "site never sent bytes" (bot protection, geo-block)
        if (totalBytes === 0) {
          logLine(3, { event: 'render.default.nav_no_response', url, captureId, navigationMs: Date.now() - tContext, totalBytes });
          throw new Error('Target site did not respond (possible bot protection or geo-restriction)');
        }
        throw navError;
      }
      timedOut = true;
      logLine(3, { event: 'render.default.partial_start', url, captureId, readyState, budgetMs: PARTIAL_BUDGET_MS });
    }

    const tNav = Date.now();
    // A page that timed out gets 120s for the steps below (two screenshots of
    // up to 90s each are the long ones). RENDER_DEADLINE_MS covers the rest.
    const partialDeadline = tNav + PARTIAL_BUDGET_MS;

    // Adaptive settle: wait for in-flight requests to drain (or hard cap).
    // Ignores websocket/eventsource (they stay open indefinitely).
    const settle = await waitForSettle(page);

    const tSettle = Date.now();
    logLine(3, { event: 'render.default.settle_complete', url, captureId, settleMs: settle.settleMs, settleReason: settle.settleReason, pendingAtCap: settle.pendingAtCap });

    // Validate rendered page is actual content (not Chromium error / blank)
    const renderCheck = await detectRenderFailure(page);
    if (renderCheck.failed) {
      logLine(3, { event: 'render.default.render_check_fail', url, captureId, reason: renderCheck.reason, httpStatus });
      // A bot check whose captcha is an iframe looks blank to the check above
      // (DataDome on nytimes.com and etsy.com): name it instead.
      if (renderCheck.reason === 'blank-page') {
        const blankBotCheck = classifyBotCheck(await readBotCheckSignals(page));
        if (blankBotCheck.detected) {
          logLine(4, { event: 'render.default.bot_check', url, captureId, vendor: blankBotCheck.vendor, signals: blankBotCheck.signals, httpStatus });
          throw new Error(`Bot check: ${BOT_CHECK_VENDOR_NAMES[blankBotCheck.vendor]} challenge (${blankBotCheck.signals.join(', ')})`);
        }
      }
      const answeredError = renderCheck.reason === 'blank-page' && httpStatus >= 400;
      throw new Error(`Captured page is not target content (${renderCheck.reason}${answeredError ? `, http ${httpStatus}` : ''})`);
    }

    // A bot check (Cloudflare challenge) instead of the page: give a JavaScript
    // challenge one chance to finish by itself, as it would for any visitor, and
    // fail the capture if it is still there. Never interact with the check.
    let botCheck = classifyBotCheck(await readBotCheckSignals(page));
    if (botCheck.detected) {
      logLine(3, { event: 'render.default.bot_check_wait', url, captureId, vendor: botCheck.vendor, signals: botCheck.signals });
      await page.waitForFunction(
        () => !/^just a moment/i.test(document.title) && !/attention required/i.test(document.title),
        null,
        { timeout: BOT_CHECK_WAIT_MS },
      ).catch(() => {});
      await page.waitForLoadState('load', { timeout: 5000 }).catch(() => {});
      botCheck = classifyBotCheck(await readBotCheckSignals(page));
    }
    if (botCheck.detected) {
      logLine(4, { event: 'render.default.bot_check', url, captureId, vendor: botCheck.vendor, signals: botCheck.signals });
      throw new Error(`Bot check: ${BOT_CHECK_VENDOR_NAMES[botCheck.vendor]} challenge (${botCheck.signals.join(', ')})`);
    }

    // Trigger lazy-loaded images by scrolling the viewport
    const { scrollMs, steps: scrollSteps, budgetUsedUp: scrollCutShort } = await triggerLazyLoading(page);
    const tScroll = Date.now();
    logLine(3, { event: 'render.default.lazy_load_complete', url, captureId, scrollMs, scrollSteps, scrollCutShort });

    // Before-screenshot MUST be taken before injecting autoconsent
    networkFrozen = true;
    const shotBefore = await takeCappedScreenshot(page);
    // The consent step may load what it needs, and a site may reload
    networkFrozen = false;
    const screenshotBefore = shotBefore.screenshot;
    if (shotBefore.capped) {
      logLine(3, { event: 'render.default.screenshot_capped', url, captureId, originalHeight: shotBefore.pageHeight, cappedHeight: MAX_PAGE_HEIGHT });
    }
    const tPreConsent = Date.now();
    logLine(3, { event: 'render.default.screenshot_before', url, captureId, screenshotMs: tPreConsent - tScroll, screenshotBytes: screenshotBefore.byteLength });

    // A site may reload itself once the visitor has chosen
    let mainFrameNavigations = 0;
    const countNavigation = (frame) => {
      if (frame === page.mainFrame()) mainFrameNavigations++;
    };
    page.on('framenavigated', countNavigation);

    let consent;
    try {
      consent = await dismissCookieConsent(page);
    } catch (err) {
      // Re-throw browser death errors -- subsequent page calls will also fail
      const msg = String(err?.message ?? err ?? '');
      if (
        msg.includes('Target closed') ||
        msg.includes('page was closed') ||
        msg.includes('browser has been closed') ||
        msg.includes('Session expired') ||
        msg.includes('session has been closed') ||
        msg.includes('Protocol error')
      ) {
        throw err;
      }
      // Consent-specific errors degrade gracefully
      consent = {
        status: 'failed',
        cmp: null,
        popupFound: false,
        durationMs: 0,
        _error: { name: err?.constructor?.name ?? 'Unknown', message: String(err?.message ?? '').slice(0, 256) },
      };
    }
    const tConsent = Date.now();
    logLine(3, { event: 'render.default.consent_result', url, captureId, colo: browserLocation?.colo ?? null, status: consent.status, cmp: consent.cmp, popupFound: consent.popupFound ?? false, consentMs: tConsent - tPreConsent, errorName: consent._error?.name || null });

    // A page that is still loading can hold page.content() back, so the
    // timed-out path gives it one second. The length is read in the page
    // first, so HTML too large for the Worker never gets there.
    const checkedContent = async () => {
      const htmlChars = await page.evaluate(() => document.documentElement?.outerHTML.length ?? 0);
      if (htmlChars > MAX_HTML_CHARS) {
        logLine(3, { event: 'render.default.html_limit', url, captureId, htmlChars });
        throw new Error('Page HTML exceeded 15 MB size limit');
      }
      return page.content();
    };
    const readHtml = () => {
      if (!timedOut) return checkedContent();
      const remainingMs = partialDeadline - Date.now();
      if (remainingMs < 200) throw new Error('Deadline exceeded before partial capture could complete');
      return Promise.race([
        checkedContent(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Content extraction timeout')), Math.min(PARTIAL_CONTENT_TIMEOUT_MS, remainingMs))),
      ]);
    };

    // After-screenshot only when consent was successfully dismissed
    let screenshot = screenshotBefore;
    let shot = shotBefore;
    let html;
    const tookAfterScreenshot = consent.status === 'dismissed';
    let postConsentMs = 0;
    let afterScreenshotMs = 0;
    let contentMs = 0;
    if (!tookAfterScreenshot) {
      const tRead = Date.now();
      html = await readHtml();
      contentMs = Date.now() - tRead;
    }
    // The page changes once the banner is gone, and some sites reload. Let it
    // come to rest first, so the screenshot doesn't show it halfway there. A
    // reload that starts later, while the screenshot is taken or the HTML is
    // read, gets a second pass on the new document.
    for (let pass = 1; tookAfterScreenshot; pass++) {
      const tPass = Date.now();
      networkFrozen = false;
      // Navigations from here on are the ones the screenshot and the HTML
      // read have to be done over for. The count is taken as soon as the wait
      // is over, before anything else is awaited: a reload that commits
      // between the wait and the count would belong to neither.
      let navigationsBefore = mainFrameNavigations;
      try {
        const reloaded = await settleAfterConsent(page, () => pass > 1 || mainFrameNavigations > 0, openRequests);
        navigationsBefore = mainFrameNavigations;
        logLine(3, { event: 'render.default.post_consent', url, captureId, postConsentMs: Date.now() - tPass, reloaded, pass });
      } catch (err) {
        // Not worth losing the capture over: the screenshot below still shows the page
        logLine(4, { event: 'render.default.post_consent_fail', url, captureId, errorMessage: String(err?.message ?? '').slice(0, 256) });
      }
      const tSettled = Date.now();
      postConsentMs += tSettled - tPass;
      networkFrozen = true;

      let tShot = tSettled;
      let failure = null;
      try {
        shot = await takeCappedScreenshot(page);
        ({ screenshot } = shot);
        tShot = Date.now();
        html = await readHtml();
      } catch (err) {
        failure = err;
      }
      afterScreenshotMs += tShot - tSettled;
      contentMs += Date.now() - tShot;

      const navigated = mainFrameNavigations > navigationsBefore
        || String(failure?.message ?? '').includes('page is navigating');
      if (pass === 1 && navigated) continue;
      if (failure) throw failure;
      break;
    }
    page.off('framenavigated', countNavigation);
    logLine(3, { event: 'render.default.screenshot_after', url, captureId, screenshotMs: afterScreenshotMs, tookAfterScreenshot, screenshotBytes: screenshot.byteLength });
    const tContent = Date.now();
    logLine(3, { event: 'render.default.content_extracted', url, captureId, contentMs, htmlLength: html.length });

    logLine(3, { event: timedOut ? 'render.default.partial_complete' : 'render.default.complete', url, captureId, durationMs: tContent - renderStart, partial: timedOut || subresourceLimitReached || sizeLimitReached, httpStatus, subresourceCount, blockedRequests, requestsHeldBack, totalBytes });
    return {
      screenshot,
      html,
      partial: timedOut || subresourceLimitReached || sizeLimitReached,
      render: {
        waitUntilReached: readyState === 'complete' ? 'load' : 'domcontentloaded',
        timedOut,
        subresourceLimitReached,
        sizeLimitReached,
        requestsHeldBack,
        ...(httpStatus !== null ? { httpStatus } : {}),
        durationMs: tContent - renderStart,
        ...screenshotCoverage(shot),
        settleMs: settle.settleMs,
        settleReason: settle.settleReason,
        stages: {
          sessionAcquireMs: tSession - renderStart,
          contextSetupMs: tContext - tSession,
          navigationMs: tNav - tContext,
          settleMs: tSettle - tNav,
          scrollMs: tScroll - tSettle,
          consentMs: tConsent - tPreConsent,
          ...(tookAfterScreenshot ? { postConsentMs } : {}),
          screenshotMs: (tPreConsent - tScroll) + afterScreenshotMs,
          contentMs,
        },
      },
      consent,
      screenshotBefore: consent.status === 'dismissed' ? screenshotBefore : null,
      ...(browserLocation ? { browserLocation } : {}),
    };
  } catch (err) {
    if (timedOut) {
      logLine(3, { event: 'render.default.partial_fail', url, captureId, errorMessage: String(err?.message ?? '').slice(0, 256) });
    }
    throw err;
  } finally {
    // MANDATORY: close context before disconnecting to clear all isolation state.
    // Timeout cleanup to prevent hanging on unresponsive browser sessions
    // (e.g., Akamai stalling with 0 bytes) from eating into the queue consumer budget.
    await Promise.race([
      context.close().then(() => browser.close()),
      new Promise((r) => setTimeout(r, 3000)),
    ]).catch((err) => {
      logLine(4, { event: 'render.default.cleanup_fail', url, captureId, errorMessage: String(err?.message ?? '').slice(0, 256) });
    });
    await Promise.all(logLines);
  }
}

/**
 * Lets a page come to rest after its cookie banner was dismissed, before the
 * second screenshot. A site that reloads itself on the choice gets the steps of
 * a fresh load again: wait for the load event, for its requests, and scroll
 * for lazy images. Any other page gets the short wait for new requests.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @param {() => boolean} navigated Whether the main frame has navigated since
 *   the consent step began
 * @param {Iterable<object>} openRequests Requests of the page still under way
 * @returns {Promise<boolean>} true when the page reloaded
 */
async function settleAfterConsent(page, navigated, openRequests) {
  const deadline = Date.now() + POST_CONSENT_NAV_WAIT_MS;
  while (!navigated() && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!navigated()) {
    await waitForSettle(page);
    // The reload can start during this wait as well (theguardian.com)
    if (!navigated()) return false;
  }
  // A reloaded page that doesn't reach its load event is captured as it stands
  await page.waitForLoadState('load', { timeout: NAV_TIMEOUT_MS }).catch(() => {});
  await waitForSettle(page, SETTLE_MAX_MS, openRequests);
  await triggerLazyLoading(page);
  return true;
}

/**
 * Names the requests a page is still waiting on as "resource type host", each
 * pair once and at most `max` of them. Logged when the load event doesn't come
 * within the navigation timeout, to show which host kept the page from
 * finishing.
 *
 * @param {Iterable<{ url: () => string, resourceType: () => string }>} requests
 * @param {number} [max]
 * @returns {string[]}
 */
export function summarizeOpenRequests(requests, max = 8) {
  const seen = new Set();
  for (const req of requests) {
    seen.add(`${req.resourceType()} ${new URL(req.url()).host}`);
    if (seen.size >= max) break;
  }
  return [...seen];
}

/**
 * What a screenshot from takeCappedScreenshot covers, recorded in the capture's
 * render info and signed into its WACZ (backlog #32). screenshotHeight is
 * stored rather than derived from MAX_PAGE_HEIGHT, so a later change of the cap
 * doesn't misstate older captures.
 *
 * @param {{ pageHeight: number, capped: boolean }} shot
 */
function screenshotCoverage({ pageHeight, capped }) {
  return { pageHeight, screenshotHeight: Math.min(pageHeight, MAX_PAGE_HEIGHT), screenshotClipped: capped };
}

/**
 * Full-page PNG screenshot limited to the top MAX_PAGE_HEIGHT pixels of the
 * document. A fullPage screenshot ignores the viewport height, so resizing the
 * viewport (the earlier approach) did not limit it, and pages taller than about
 * 11,000 px failed with "Unable to capture screenshot". A clip measured against
 * the document does limit it. The rendered HTML still holds the whole page.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @param {number} [timeout] - screenshot timeout in ms
 * @returns {Promise<{ screenshot: Uint8Array, pageHeight: number, capped: boolean }>}
 * @throws {Error} When the page does not answer the height measurement within PAGE_READ_MAX_MS
 */
export async function takeCappedScreenshot(page, timeout = 90000) {
  const pageHeight = await answerWithin(page.evaluate(() => Math.max(
    document.body?.scrollHeight ?? 0,
    document.documentElement?.scrollHeight ?? 0,
  )), PAGE_READ_MAX_MS, 'The page stopped answering before the screenshot');
  const capped = pageHeight > MAX_PAGE_HEIGHT;
  const options = { fullPage: true, type: 'png', timeout };
  if (capped) {
    options.clip = { x: 0, y: 0, width: page.viewportSize()?.width ?? 1280, height: MAX_PAGE_HEIGHT };
  }
  const screenshot = await page.screenshot(options);
  return { screenshot, pageHeight, capped };
}

/**
 * Reads document.readyState after a navigation timeout, to decide whether
 * there is a page to capture. 'unknown' when the read fails or the page does
 * not answer within PAGE_READ_MAX_MS.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<string>}
 */
export async function readReadyState(page) {
  return answerWithin(
    page.evaluate(() => document.readyState),
    PAGE_READ_MAX_MS,
    'The page stopped answering while it was checked',
  ).catch(() => 'unknown');
}

/**
 * Checks whether the rendered page is actual content or a browser error /
 * blank page. Called after navigation + settle, before screenshots.
 *
 * Returns { failed: false } for normal pages, or { failed: true, reason }
 * for error pages that should abort the capture as non-retryable.
 *
 * Bot-protection pages (Cloudflare challenge, generic "Access Denied") are
 * NOT detected here — heuristics false-positive too easily. Those are logged
 * as warnings by the caller if needed.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ failed: boolean, reason?: string }>}
 * @throws {Error} When the page does not answer within PAGE_CHECK_MAX_MS
 */
export async function detectRenderFailure(page) {
  return answerWithin(page.evaluate(() => {
    // Chromium error interstitial (dino game page)
    if (document.querySelector('.interstitial-wrapper')) {
      return { failed: true, reason: 'chromium-error-page' };
    }
    // Chromium network error (ERR_* pages)
    const mainMsg = document.querySelector('#main-message h1');
    if (mainMsg) {
      return { failed: true, reason: `chromium-error: ${mainMsg.textContent.trim().slice(0, 100)}` };
    }
    // about: or chrome-error: URL (shouldn't happen but defensive)
    if (location.protocol === 'about:' || location.protocol === 'chrome-error:') {
      return { failed: true, reason: 'browser-error-url' };
    }
    // Blank page (no meaningful content)
    const text = document.body?.innerText?.trim() || '';
    if (text.length === 0 && document.querySelectorAll('img, video, canvas, svg').length === 0) {
      return { failed: true, reason: 'blank-page' };
    }
    return { failed: false };
  }), PAGE_CHECK_MAX_MS, 'The page stopped answering while it was checked');
}

/**
 * Whether WRL holds back a request the page starts while WRL takes its
 * screenshots (backlog #105, phase 0201). A full-page screenshot lays out the
 * whole page at once, and on ad-heavy pages that set off hundreds of new
 * requests the screenshot then waited for: 674 during one screenshot of a
 * merriam-webster.com page, which took 28 seconds. The page's own navigation
 * still goes through, so a reload isn't broken.
 *
 * @param {{ frozen: boolean, isMainFrameNavigation: boolean }} request
 * @returns {boolean}
 */
export function holdsBackRequest({ frozen, isMainFrameNavigation }) {
  return frozen && !isMainFrameNavigation;
}

/**
 * Whether the freeze still holds after a request. A navigation of the page
 * itself lifts it: the new document loads its scripts, styles and fetches
 * after the navigation request, and holding those back left a page that
 * reloaded during the second screenshot without its content. The loop after
 * the consent step then takes the screenshot again on the new document.
 *
 * @param {{ frozen: boolean, isMainFrameNavigation: boolean }} request
 * @returns {boolean}
 */
export function frozenAfterRequest({ frozen, isMainFrameNavigation }) {
  return frozen && !isMainFrameNavigation;
}

/**
 * Reads the page features classifyBotCheck looks at.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ title: string, hasChallengeOptions: boolean, hasChallengeScript: boolean, hasChallengeMarkup: boolean, hasDataDomeConfig: boolean, hasDataDomeCaptcha: boolean }>}
 * @throws {Error} When the page does not answer within PAGE_CHECK_MAX_MS
 */
export async function readBotCheckSignals(page) {
  return answerWithin(page.evaluate(() => ({
    title: (document.title || '').trim(),
    hasChallengeOptions: typeof window._cf_chl_opt !== 'undefined',
    hasChallengeScript: Boolean(document.querySelector(
      'script[src*="/cdn-cgi/challenge-platform/"], iframe[src*="challenges.cloudflare.com"]',
    )),
    hasChallengeMarkup: Boolean(document.querySelector(
      '#challenge-form, #challenge-running, #challenge-stage, #cf-challenge-running',
    )),
    // DataDome's block page: `var dd={'rt':'c','cid':...}` and a script from
    // ct.captcha-delivery.com that puts the captcha in an iframe.
    hasDataDomeConfig: typeof window.dd === 'object' && window.dd !== null && 'cid' in window.dd,
    hasDataDomeCaptcha: Boolean(document.querySelector(
      'script[src*="captcha-delivery.com"], iframe[src*="captcha-delivery.com"]',
    )),
  })), PAGE_CHECK_MAX_MS, 'The page stopped answering while it was checked');
}

/**
 * Decides whether a rendered page is a Cloudflare or DataDome bot check rather
 * than the page itself. Needs two signals, so a page that merely mentions
 * Cloudflare or is titled "Just a moment..." does not count (GH #317, phase
 * 0121). DataDome was added in phase 0199 (backlog #100): nytimes.com and
 * etsy.com answer WRL's browser with its captcha page.
 *
 * @param {{ title: string, hasChallengeOptions: boolean, hasChallengeScript: boolean, hasChallengeMarkup: boolean, hasDataDomeConfig?: boolean, hasDataDomeCaptcha?: boolean }} s
 * @returns {{ detected: boolean, vendor: 'cloudflare' | 'datadome', signals: string[] }}
 */
export function classifyBotCheck(s) {
  if (s.hasDataDomeConfig && s.hasDataDomeCaptcha) {
    return { detected: true, vendor: 'datadome', signals: ['datadome-config', 'captcha-delivery'] };
  }
  const signals = [];
  if (/^just a moment\.{3}$/i.test(s.title) || /^attention required! \| cloudflare$/i.test(s.title)) signals.push('title');
  if (s.hasChallengeOptions) signals.push('cf_chl_opt');
  if (s.hasChallengeScript) signals.push('challenge-platform');
  if (s.hasChallengeMarkup) signals.push('challenge-markup');
  return { detected: signals.length >= 2, vendor: 'cloudflare', signals };
}

// The scroll that loads lazy content: one viewport height per step, a short
// pause for the page's observers, down to MAX_SCROLL_HEIGHT at most and for
// SCROLL_BUDGET_MS at most. SCROLL_ANSWER_TIMEOUT_MS is how long WRL waits for
// the page to say that it is done.
const SCROLL_STEP_PX = 720;
const SCROLL_STEP_PAUSE_MS = 150;
const MAX_SCROLL_HEIGHT = 12000;
const SCROLL_BUDGET_MS = 10000;
const SCROLL_ANSWER_TIMEOUT_MS = 30000;

/**
 * Scrolls the document down step by step. Runs inside the page, through
 * page.evaluate(), so it can use nothing but its argument and the page's
 * globals.
 *
 * It is one call to the browser for the whole scroll. Two calls per step, as
 * it was, each waited behind the page's own traffic: on a page that makes
 * 1,400 ad requests while it is scrolled the step took a minute (backlog #102).
 *
 * @param {{ stepPx: number, pauseMs: number, maxHeight: number, budgetMs: number }} options
 * @returns {Promise<{ initialHeight: number, steps: number, budgetUsedUp: boolean }>}
 *   budgetUsedUp is true when the time ran out before the bottom was reached
 */
export async function scrollStepwise({ stepPx, pauseMs, maxHeight, budgetMs }) {
  const start = Date.now();
  const initialHeight = document.body.scrollHeight;
  // A page that fits the viewport has nothing to scroll
  if (initialHeight <= stepPx) return { initialHeight, steps: 0, budgetUsedUp: false };

  const scrollLimit = Math.min(initialHeight, maxHeight);
  let scrollY = 0;
  let steps = 0;
  while (scrollY < scrollLimit) {
    if (Date.now() - start >= budgetMs) return { initialHeight, steps, budgetUsedUp: true };
    scrollY += stepPx;
    window.scrollTo(0, scrollY);
    steps++;
    await new Promise((r) => setTimeout(r, pauseMs));

    // Infinite scroll protection: if document grew beyond threshold, stop
    if (document.body.scrollHeight - initialHeight > maxHeight) break;
  }
  return { initialHeight, steps, budgetUsedUp: false };
}

/**
 * Scrolls the page in viewport-height increments to trigger lazy-loaded images
 * (loading="lazy" and IntersectionObserver-based). Called after settle + error
 * detection, before the before-screenshot.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ scrollMs: number, steps: number, budgetUsedUp: boolean }>}
 *   scrollMs is the time the whole step took
 * @throws {Error} When the page does not answer one of the step's three calls in time
 */
export async function triggerLazyLoading(page) {
  const start = Date.now();
  const { steps, budgetUsedUp } = await answerWithin(
    page.evaluate(scrollStepwise, {
      stepPx: SCROLL_STEP_PX,
      pauseMs: SCROLL_STEP_PAUSE_MS,
      maxHeight: MAX_SCROLL_HEIGHT,
      budgetMs: SCROLL_BUDGET_MS,
    }),
    SCROLL_ANSWER_TIMEOUT_MS,
    'The page stopped answering while it was scrolled',
  );

  // Skip if page is already short enough to fit in viewport
  if (steps === 0) return { scrollMs: Date.now() - start, steps, budgetUsedUp };

  // Force-load all lazy images: switch loading="lazy" to "eager" so the
  // browser fetches them immediately regardless of viewport position.
  // Scrolling alone doesn't reliably trigger lazy images -- the browser
  // cancels fetches for elements that leave the viewport too quickly.
  // The two small calls below get a limit like the scroll call: on a page
  // that keeps the browser busy one of them stayed unanswered until the
  // browser session was gone (backlog #105).
  await answerWithin(page.evaluate(() => {
    document.querySelectorAll('img[loading="lazy"]').forEach(img => {
      img.loading = 'eager';
      if (img.dataset.src && !img.src) img.src = img.dataset.src;
    });
  }), PAGE_CHECK_MAX_MS, 'The page stopped answering while it was scrolled');

  // Settle: wait for the force-loaded image requests to complete
  await waitForSettle(page, 3000);

  // Scroll back to top before screenshots.
  // Allow compositor to re-rasterize off-screen tiles -- at 4x scale the
  // bottom of an 8000px page is ~32k pixels that need repainting after
  // scroll position changes.  Without this pause, page.screenshot()
  // captures stale/blank tiles at the bottom.
  await answerWithin(page.evaluate(() => window.scrollTo(0, 0)), PAGE_CHECK_MAX_MS, 'The page stopped answering while it was scrolled');
  await new Promise((r) => setTimeout(r, 500));

  return { scrollMs: Date.now() - start, steps, budgetUsedUp };
}

/**
 * Maps an error to a user-facing message and retryable flag.
 * SECURITY: Never expose stack traces or internal error details.
 *
 * @param {Error} error
 * @returns {{ message: string, retryable: boolean }}
 */
export function categorizeError(error) {
  const msg = error?.message ?? '';

  if (msg.startsWith('Bot check')) {
    const vendor = msg.startsWith('Bot check: DataDome') ? 'DataDome' : 'Cloudflare';
    return {
      message: `The site showed a ${vendor} bot check instead of the page, so WRL did not capture it. Failed captures are not counted or billed.`,
      retryable: false,
    };
  }
  if (
    msg.includes('Unable to capture screenshot') ||
    msg.startsWith('page.screenshot: Timeout') ||
    msg.includes('stopped answering before the screenshot')
  ) {
    return { message: 'The browser could not take a screenshot of this page', retryable: true };
  }
  if (msg.includes('net::ERR_NAME_NOT_RESOLVED')) {
    return { message: "The site's address could not be found (DNS)", retryable: true };
  }
  if (msg.includes('net::ERR_CONNECTION_REFUSED')) {
    return { message: 'The site refused the connection', retryable: true };
  }
  if (msg.includes('net::ERR_CERT_')) {
    return { message: "The site's TLS certificate is not valid", retryable: false };
  }

  if (msg.includes('not target content')) {
    if (msg.includes('(blank-page)')) {
      return { message: 'The page loaded but showed nothing (blank page)', retryable: false };
    }
    const answeredError = msg.match(/\(blank-page, http (\d{3})\)/);
    if (answeredError) {
      return { message: `The site answered HTTP ${answeredError[1]} and the page showed nothing (blank page)`, retryable: false };
    }
    return { message: 'The browser showed an error page instead of the site', retryable: false };
  }
  if (msg.includes('stopped answering while it was scrolled')) {
    return { message: 'The page stopped answering while WRL scrolled it', retryable: true };
  }
  if (msg.includes('stopped answering while it was checked')) {
    return { message: 'The page stopped answering while WRL checked it', retryable: true };
  }
  if (msg.includes('did not respond')) {
    return { message: 'The site did not respond, possibly because it blocks automated visits or this region', retryable: false };
  }
  if (msg.includes('Render deadline exceeded')) {
    return { message: 'Capture timed out', retryable: true };
  }
  if (msg.includes('Deadline exceeded')) {
    return { message: `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds`, retryable: true };
  }
  // Playwright throws TimeoutError (by name) for navigation and wait timeouts
  if (error?.name === 'TimeoutError' || msg.includes('timeout') || msg.includes('Timeout')) {
    return { message: `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds`, retryable: true };
  }
  if (msg.includes('HTML exceeded 15 MB')) {
    return { message: 'The page\'s HTML is larger than 15 MB, more than WRL can sign in one capture', retryable: false };
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
  // Session lifecycle errors (keep_alive expiry, CDP breakdown)
  if (msg.includes('Session expired') || msg.includes('session has been closed')) {
    return { message: 'Browser session expired', retryable: true };
  }
  if (msg.includes('Protocol error')) {
    return { message: 'The browser hit an internal error', retryable: true };
  }
  if (msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) {
    return { message: 'Browser connection refused', retryable: true };
  }

  return { message: 'Capture could not be completed', retryable: true };
}
