/**
 * capture-pipeline.test.js -- Integration tests for the WRL capture pipeline
 *
 * These tests exercise the full pipeline end-to-end:
 *   browser rendering -> R2 artifact storage -> WACZ bundling -> KV status update
 *
 * Integration tests bypass URL validation by calling performCapture() directly
 * with 127.0.0.1 fixture URLs. The test server started by global-setup.js serves
 * controlled HTML fixtures that exercise specific capture behaviors.
 *
 * No fetchMock -- these tests need real network access to the local test server
 * and to the TSA endpoint for timestamp signing.
 *
 * Browser session setup: miniflare's browser binding doesn't implement limits(),
 * so getOrCreateSession() fails on the fallback path. We pre-acquire a session
 * in beforeEach so getOrCreateSession() finds it via sessions() and connects
 * directly, bypassing the limits() call.
 */ // tva

import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, inject } from 'vitest';
import { acquire, connect } from '@cloudflare/playwright';
import { performCapture } from '../../src/capture.js';
import { createCapture, getCapture } from '../../src/db.js';

// ---------------------------------------------------------------------------
// Browser session pre-acquisition
// ---------------------------------------------------------------------------

/**
 * Pre-acquires a browser session and warms it up with a connect/disconnect
 * cycle. This serves two purposes:
 *   1. Places a free session in the pool so defaultRenderer's
 *      getOrCreateSession() finds it via sessions() instead of calling
 *      limits() (which miniflare doesn't implement).
 *   2. Ensures the browser process is fully ready before the test runs.
 *      Without the warm-up, the first test can race against browser startup
 *      and fail with a 27s timeout.
 */
async function ensureBrowserSession() {
  const session = await acquire(env.BROWSER, { keep_alive: 120000 });
  // Warm-up: connect then disconnect to confirm the browser is ready.
  // After disconnect, the session remains free in the pool (keep_alive).
  const browser = await connect(env.BROWSER, session.sessionId);
  await browser.close();
}

// ---------------------------------------------------------------------------
// KV / R2 cleanup helper
// ---------------------------------------------------------------------------

async function cleanupCapture(captureId) {
  await env.DB.prepare('DELETE FROM captures WHERE id = ?').bind(captureId).run();
  const prefix = `captures/${captureId}`;
  await Promise.all([
    env.BUCKET.delete(`${prefix}/screenshot.png`),
    env.BUCKET.delete(`${prefix}/screenshot-before.png`),
    env.BUCKET.delete(`${prefix}/rendered.html`),
    env.BUCKET.delete(`${prefix}/headers.json`),
  ]);
  // Clean up any WACZ files (content-addressed, can't predict key)
}

// ---------------------------------------------------------------------------
// Baseline sanity: fast static page
// ---------------------------------------------------------------------------

describe('integration: fast page -- baseline sanity', () => {
  const captureId = 'cap_inttest00000000000000000000a1';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures a fast page with full quality', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('full');
  });

  it('writes screenshot and html artifacts to R2', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.artifacts.screenshot).toBeTruthy();
    expect(record.artifacts.html).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TSA validation: WACZ with timestamp (#66-class)
// ---------------------------------------------------------------------------

describe('integration: fast page -- WACZ and timestamp', () => {
  const captureId = 'cap_inttest00000000000000000000a2';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('produces a WACZ with valid timestamp when TSA_URL is configured', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    // WACZ is produced for full captures when SIGNING_KEY is configured
    expect(record.wacz).toBeTruthy();
    expect(record.wacz.timestampStatus).toBe('present');
    expect(record.wacz.bundleHash).toMatch(/^sha256:/);
  });
});

// ---------------------------------------------------------------------------
// Never-settle page: validates 'load' strategy (#67-class bug detection)
// ---------------------------------------------------------------------------

describe('integration: never-settle page -- load strategy validation', () => {
  const captureId = 'cap_inttest00000000000000000000a3';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures a page with persistent connections as full (not partial)', async () => {
    // This validates the 'load' strategy. With 'networkidle', this page would
    // timeout because the setInterval keeps firing fetch('/ping') every 200ms.
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/never-settle.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/never-settle.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('full');
    expect(record.render?.timedOut).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Cookie-banner page: consent injection validation
// ---------------------------------------------------------------------------

describe('integration: cookie-banner page -- consent injection', () => {
  const captureId = 'cap_inttest00000000000000000000a4';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('runs consent injection without errors on a clean page', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/cookie-banner.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/cookie-banner.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    // No CMP on test page -- captureSettings.consent.result should be notDetected
    if (record.captureSettings?.consent) {
      expect(record.captureSettings.consent.result).toBe('notDetected');
    }
  });
});

// ---------------------------------------------------------------------------
// Iframe page: multi-frame consent injection (PR #82 follow-up)
// ---------------------------------------------------------------------------

describe('integration: page with iframe -- multi-frame consent injection', () => {
  const captureId = 'cap_inttest00000000000000000000a6';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures a page containing an iframe with full quality', async () => {
    // Exercises the route handler's main-frame-only cross-domain blocking
    // and consent.js multi-frame autoconsent injection (PR #82 code paths).
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/with-iframe.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/with-iframe.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('full');
  });

  it('captures rendered HTML that includes iframe content', async () => {
    // Validates the iframe actually loaded (not blocked by route handler).
    // The rendered HTML should contain both the main page marker and the
    // iframe element. The iframe's inner content (fast.html) won't appear
    // in page.content() (same-origin iframes have separate DOMs), but the
    // iframe element itself proves the route handler didn't block it.
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/with-iframe.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/with-iframe.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    const htmlObj = await env.BUCKET.get(record.artifacts.html);
    const html = await htmlObj.text();
    expect(html).toContain('main-frame-loaded');
    expect(html).toContain('<iframe');
  });
});

// ---------------------------------------------------------------------------
// Timeout budget: stage timings present and within 30s budget
// ---------------------------------------------------------------------------

describe('integration: timeout budget and stage timings', () => {
  const captureId = 'cap_inttest00000000000000000000a5';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('completes within the 30s ctx.waitUntil budget', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.render?.durationMs).toBeLessThan(30000);
  });

  it('stores stage-level timing breakdown in KV record', async () => {
    const port = inject('testServerPort');
    await createCapture(env.DB, captureId, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', 'default');
    await performCapture(env, `http://127.0.0.1:${port}/fast.html`, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.render?.stages).toBeDefined();
    expect(record.render.stages.navigationMs).toBeDefined();
    expect(record.render.stages.settleMs).toBeDefined();
    expect(record.render.stages.consentMs).toBeDefined();
    expect(record.render.stages.screenshotMs).toBeDefined();
    expect(record.render.stages.contentMs).toBeDefined();
  });
});
