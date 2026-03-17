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
 *   by the Ed25519 signature. Consent has a 2s hard timeout within the
 *   30s ctx.waitUntil budget (NAV_TIMEOUT_MS=20s load + 3s settle(max) + 2s consent + 2s post ≈ 27s worst-case; in practice load fires in 2-5s).
 *   Partial captures skip consent entirely.
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

import { connect, acquire, sessions, limits } from '@cloudflare/playwright';
import { completeCapture, failCapture, archiveSigningKey } from './kv.js';
import { buildWacz } from './wacz.js';
import { log } from './log.js';
import { dismissCookieConsent, AUTOCONSENT_VERSION } from './consent.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_SUBRESOURCES = 200;
const MAX_PAGE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_PAGE_HEIGHT = 8000;
const NAV_TIMEOUT_MS = 20000;
const SETTLE_MAX_MS = 3000;
const SETTLE_QUIESCENCE_MS = 500;
const HEADER_FETCH_TIMEOUT_MS = 10000;
const KEEP_ALIVE_MS = 120000; // 2 minutes
const PARTIAL_SCREENSHOT_TIMEOUT_MS = 3000;
const PARTIAL_CONTENT_TIMEOUT_MS = 1000;

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
 * @param {string} tenantId Tenant identifier
 * @param {string} [cip] Hashed client IP (undefined when IP_HASH_SEED not configured)
 * @param {Function} [renderer] Injectable rendering function (defaults to defaultRenderer)
 */
export async function performCapture(env, url, ip, captureId, tenantId, cip, renderer = defaultRenderer) {
  const start = Date.now();
  await log(env, 3, 'capture', { event: 'capture.start', captureId, tenantId, url, cip });
  try {
    const RENDER_DEADLINE_MS = 27000; // Hard cap: leaves ~3s for KV/log in catch-all
    const renderWithDeadline = Promise.race([
      renderer(env.BROWSER, url),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Render deadline exceeded')), RENDER_DEADLINE_MS)),
    ]);
    const [renderResult, headerResult] = await Promise.allSettled([
      renderWithDeadline,
      captureHeaders(url),
    ]);

    if (renderResult.status === 'rejected') {
      const { message, retryable } = categorizeError(renderResult.reason);
      await log(env, 5, 'capture', { event: 'capture.stage.fail', captureId, tenantId, stage: 'browser_render', errorCategory: message, retryable, cip, errorName: renderResult.reason?.name, errorMessage: String(renderResult.reason?.message ?? '').slice(0, 256) });
      await failCapture(env.KV, captureId, message, retryable);
      return;
    }

    const { screenshot, html, partial, render, consent, screenshotBefore } = renderResult.value;
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

    // Build captureSettings for full (non-partial) captures
    const captureSettings = consent ? {
      version: 1,
      consent: {
        library: '@duckduckgo/autoconsent',
        libraryVersion: AUTOCONSENT_VERSION,
        action: 'optOut',
        result: consent.status === 'dismissed' ? 'success' : (consent.status === 'none' ? 'notDetected' : 'failed'),
        ...(consent.cmp ? { cmpDetected: consent.cmp } : {}),
      },
    } : null;

    // WACZ bundling (optional -- degrades gracefully if signing key is absent)
    // Skipped for partial captures: WACZ requires a complete page load
    let waczInfo = null;
    if (!partial) {
      try {
        const waczArtifacts = {
          screenshotBefore: screenshotBefore || screenshot,
          screenshotAfter: screenshotBefore ? screenshot : null,
          html,
          headers, // may be null if header fetch failed
          captureSettings,
        };
        const result = await buildWacz(url, new Date().toISOString(), waczArtifacts, env);
        if (result) {
          const { waczBytes, waczHash, bundleHash, publicKeyBase64, keyId, timestampStatus } = result;
          await env.BUCKET.put(`captures/${waczHash}.wacz`, waczBytes, {
            httpMetadata: {
              contentType: 'application/wacz+zip',
              contentDisposition: `attachment; filename="${waczHash}.wacz"`,
            },
          });
          // Archive signing key BEFORE completeCapture() -- no race window
          try {
            await archiveSigningKey(env.KV, keyId, publicKeyBase64);
          } catch (err) {
            // Non-fatal: key may already be archived from a prior capture
            await log(env, 4, 'capture', { event: 'capture.key_archive_fail', captureId, tenantId, cip });
          }
          waczInfo = {
            key: `captures/${waczHash}.wacz`,
            bundleHash,
            size: waczBytes.byteLength,
            keyId,
            timestampStatus,
          };
        }
      } catch (err) {
        // WACZ bundling failed unexpectedly -- capture still completes with individual artifacts
        // Distinguish from "no signing key" path (which returns null, no error)
        await log(env, 4, 'capture', { event: 'capture.wacz_fail', captureId, tenantId, cip });
      }
    }

    await completeCapture(env.KV, captureId, artifacts, waczInfo, renderQuality, render || null, captureSettings);

    if (partial) {
      await log(env, 3, 'capture', {
        event: 'capture.partial',
        captureId,
        tenantId,
        cip,
        renderQuality,
        durationMs: Date.now() - start,
        waczStatus: 'skipped',
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
        consentStatus: consent?.status ?? null,
        consentCmp: consent?.cmp ?? null,
        consentDurationMs: consent?.durationMs ?? null,
        settleMs: render?.settleMs ?? null,
        settleReason: render?.settleReason ?? null,
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
  } catch (err) {
    // Catch-all: ensure KV is updated even on unexpected errors
    await log(env, 5, 'capture', { event: 'capture.fail', captureId, tenantId, stage: 'catch_all', errorClass: err?.constructor?.name, errorMessage: String(err?.message ?? '').slice(0, 256), cip });
    try {
      await failCapture(env.KV, captureId, 'Capture could not be completed', true);
    } catch (err) {
      await log(env, 5, 'capture', { event: 'capture.kv_fail', captureId, tenantId, cip, errorMessage: String(err?.message ?? '').slice(0, 256) });
    }
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
 * Waits for in-flight network requests to drain, up to SETTLE_MAX_MS.
 * Ignores websocket and eventsource resource types (they stay open indefinitely).
 * Resolves when 0 non-ignored requests are in-flight for SETTLE_QUIESCENCE_MS,
 * or at SETTLE_MAX_MS regardless of activity.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ settleMs: number, settleReason: 'idle'|'cap', pendingAtCap: number }>}
 */
function waitForSettle(page) {
  const IGNORED_TYPES = new Set(['websocket', 'eventsource']);
  let inFlight = 0;
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

    const capTimer = setTimeout(() => finish('cap'), SETTLE_MAX_MS);

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
 * @param {unknown} browserBinding Cloudflare BROWSER binding
 * @param {string} url
 * @returns {Promise<{ screenshot: Uint8Array, screenshotBefore: Uint8Array|null,
 *   html: string, partial: boolean, render: object, consent: object|null }>}
 */
async function defaultRenderer(browserBinding, url) {
  const renderStart = Date.now();
  const browser = await getOrCreateSession(browserBinding);
  const tSession = Date.now();

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
          await route.abort('blockedbyclient');
          return;
        }
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

    page = await context.newPage();
    const tContext = Date.now();

    // Response monitoring for total page size
    page.on('response', (resp) => {
      const cl = resp.headers()['content-length'];
      if (cl) totalBytes += parseInt(cl, 10);
      if (totalBytes > MAX_PAGE_BYTES) {
        limitExceeded = 'Page exceeded 50MB size limit';
      }
    });

    // Navigate with 20s timeout using 'load' (not 'networkidle' -- ad trackers keep connections alive indefinitely)
    // Post-load: 3s settle(max) + 2s consent + 2s post-processing fits the 30s ctx.waitUntil budget
    try {
      await page.goto(url, { timeout: NAV_TIMEOUT_MS, waitUntil: 'load' });
    } catch (navError) {
      if (navError.name === 'TimeoutError') {
        const tNav = Date.now();
        // Check if DOM has at least loaded before attempting partial capture
        const readyState = await page.evaluate(() => document.readyState).catch(() => 'unknown');
        if (readyState !== 'interactive' && readyState !== 'complete') {
          // Distinguish "page is slow" from "site never sent bytes" (bot protection, geo-block)
          if (totalBytes === 0) {
            throw new Error('Target site did not respond (possible bot protection or geo-restriction)');
          }
          throw navError;
        }

        // 2000ms budget: renderer has been running ~20.5s (load timed out); leaves margin for KV/R2 post-work
        const deadline = Date.now() + 2000;
        const remainingMs = () => Math.max(0, deadline - Date.now());

        if (remainingMs() < 500) throw new Error('Deadline exceeded before partial capture could complete');

        try {
          // Cap viewport for tall pages
          const pageHeight = await page.evaluate(() => document.body.scrollHeight);
          if (pageHeight > MAX_PAGE_HEIGHT) {
            await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
          }

          const screenshot = await page.screenshot({ fullPage: true, type: 'png', timeout: Math.min(PARTIAL_SCREENSHOT_TIMEOUT_MS, remainingMs()) });
          const tScreenshot = Date.now();

          if (remainingMs() < 200) throw new Error('Deadline exceeded before partial capture could complete');

          const html = await Promise.race([
            page.content(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Content extraction timeout')), Math.min(PARTIAL_CONTENT_TIMEOUT_MS, remainingMs()))),
          ]);
          const tContent = Date.now();

          return {
            screenshot,
            html,
            partial: true,
            render: {
              waitUntilReached: readyState === 'complete' ? 'load' : 'domcontentloaded',
              timedOut: true,
              durationMs: tContent - renderStart,
              stages: {
                sessionAcquireMs: tSession - renderStart,
                contextSetupMs: tContext - tSession,
                navigationMs: tNav - tContext,
                settleMs: null,
                consentMs: null,
                screenshotMs: tScreenshot - tNav,
                contentMs: tContent - tScreenshot,
              },
            },
            consent: null,
            screenshotBefore: null,
          };
        } catch (err) {
          throw new Error(
            `Partial capture failed: ${err?.message ?? 'unknown'}`,
            { cause: err },
          );
        }
      }
      throw navError;
    }

    if (limitExceeded) throw new Error(limitExceeded);
    const tNav = Date.now();

    // Adaptive settle: wait for in-flight requests to drain (or hard cap).
    // Ignores websocket/eventsource (they stay open indefinitely).
    const settle = await waitForSettle(page);

    // SECURITY: async response events can push totalBytes past MAX_PAGE_BYTES
    // during the settle delay. Re-check after settling.
    if (limitExceeded) throw new Error(limitExceeded);
    const tSettle = Date.now();

    // Cap screenshot height to prevent memory exhaustion
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    if (pageHeight > MAX_PAGE_HEIGHT) {
      await page.setViewportSize({ width: 1280, height: MAX_PAGE_HEIGHT });
    }

    // Before-screenshot MUST be taken before injecting autoconsent
    const screenshotBefore = await page.screenshot({ fullPage: true, type: 'png' });
    const tPreConsent = Date.now();

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
        durationMs: 0,
        _error: { name: err?.constructor?.name ?? 'Unknown', message: String(err?.message ?? '').slice(0, 256) },
      };
    }
    const tConsent = Date.now();

    // After-screenshot only when consent was successfully dismissed
    let screenshot;
    if (consent.status === 'dismissed') {
      screenshot = await page.screenshot({ fullPage: true, type: 'png' });
    } else {
      screenshot = screenshotBefore;
    }
    const tScreenshot = Date.now();

    const html = await page.content();
    const tContent = Date.now();

    return {
      screenshot,
      html,
      partial: false,
      render: {
        waitUntilReached: 'load',
        timedOut: false,
        durationMs: tContent - renderStart,
        settleMs: settle.settleMs,
        settleReason: settle.settleReason,
        stages: {
          sessionAcquireMs: tSession - renderStart,
          contextSetupMs: tContext - tSession,
          navigationMs: tNav - tContext,
          settleMs: tSettle - tNav,
          consentMs: tConsent - tPreConsent,
          screenshotMs: (tPreConsent - tSettle) + (tScreenshot - tConsent),
          contentMs: tContent - tScreenshot,
        },
      },
      consent,
      screenshotBefore: consent.status === 'dismissed' ? screenshotBefore : null,
    };
  } finally {
    // MANDATORY: close context before disconnecting to clear all isolation state.
    // Timeout cleanup to prevent hanging on unresponsive browser sessions
    // (e.g., Akamai stalling with 0 bytes) from eating the ctx.waitUntil budget.
    await Promise.race([
      context.close().then(() => browser.close()),
      new Promise((r) => setTimeout(r, 3000)),
    ]).catch((err) => {
      console.warn('wrl:capture_cleanup_fail', err?.message);
    });
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

  if (msg.includes('did not respond')) {
    return { message: 'Target site did not respond (possible bot protection or geo-restriction)', retryable: false };
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
  // Session lifecycle errors (keep_alive expiry, CDP breakdown)
  if (msg.includes('Session expired') || msg.includes('session has been closed')) {
    return { message: 'Browser session expired', retryable: true };
  }
  if (msg.includes('Protocol error')) {
    return { message: 'Browser protocol error', retryable: true };
  }
  if (msg.includes('Connection refused') || msg.includes('ECONNREFUSED')) {
    return { message: 'Browser connection refused', retryable: true };
  }

  return { message: 'Capture could not be completed', retryable: true };
}
