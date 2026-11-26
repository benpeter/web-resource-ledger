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
  const captureId = 'cap_0000000000000000000000000000e5a1';

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

  // A log line is a request to the log endpoint, about 200 ms in production.
  // The renderer writes ten of them per capture.
  it('does not hold the browser while its log lines are delivered', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/fast.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');
    const withoutLogs = (await getCapture(env.DB, captureId)).render.durationMs;
    await cleanupCapture(captureId);

    const slowLogEnv = { ...env, CORALOGIX_ENDPOINT: `http://127.0.0.1:${port}/log-sink?each=400`, CORALOGIX_SEND_KEY: 'test' };
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(slowLogEnv, url, '127.0.0.1', captureId, 'default');
    const record = await getCapture(env.DB, captureId);

    expect(record.status).toBe('complete');
    // Ten lines waited for one after the other would add 4 seconds
    expect(record.render.durationMs - withoutLogs).toBeLessThan(1500);
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
  const captureId = 'cap_0000000000000000000000000000e5a2';

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
  const captureId = 'cap_0000000000000000000000000000e5a3';

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
  const captureId = 'cap_0000000000000000000000000000e5a4';

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
// Banner that autoconsent only knows from its JSON rules
// ---------------------------------------------------------------------------

describe('integration: page with a banner from autoconsent\'s JSON rules', () => {
  const captureId = 'cap_0000000000000000000000000000e5ae';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('declines a CookieHub banner', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-cookiehub.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.captureSettings?.consent?.result).toBe('success');
    expect(record.captureSettings?.consent?.cmpDetected).toBe('cookiehub');
    expect(record.artifacts.screenshotBefore).toBeDefined();

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('content-marker');
    expect(html).not.toContain('About cookies on this site.');
  });

  it('declines a banner whose settings take three seconds to open', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-cookiehub.html?slow`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent?.result).toBe('success');
    expect(record.artifacts.screenshotBefore).toBeDefined();

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).not.toContain('About cookies on this site.');
  });

  it('reports no banner when the consent tool is on the page and shows none', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-cookiehub.html?nobanner`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent?.result).toBe('notDetected');
    expect(record.captureSettings?.consent?.cmpDetected).toBe('cookiehub');
    expect(record.artifacts.screenshotBefore).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Consent wall no consent library knows (backlog #104, #47)
// ---------------------------------------------------------------------------

describe('integration: consent wall autoconsent has no rule for', () => {
  const captureId = 'cap_0000000000000000000000000000e5af';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('declines when the wall has a decline button', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-wall.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent).toEqual({
      library: 'wrl-consent-wall', action: 'optOut', route: 'decline', result: 'success', button: 'Reject all',
    });
    expect(record.artifacts.screenshotBefore).toBeDefined();

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('<p id="outcome">wall-outcome:declined</p>');
    expect(html).not.toContain('<div id="wall">');
  });

  it('unticks every choice in the settings and saves, without taking the subscription', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-wall.html?settings`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent).toEqual({
      library: 'wrl-consent-wall', action: 'optOut', route: 'settings', result: 'success', button: 'Save choices',
    });

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('<p id="outcome">wall-outcome:saved:none</p>');
    expect(html).not.toContain('<p id="outcome">wall-outcome:subscribed</p>');
  });

  it('takes a link inside a sentence for text, and finds a save button below the screen', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-wall.html?sentence`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent).toEqual({
      library: 'wrl-consent-wall', action: 'optOut', route: 'settings', result: 'success', button: 'Save choices',
    });

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('<p id="outcome">wall-outcome:saved:none</p>');
  });

  it('declines on a settings page of its own and captures the page it came back to', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-wall.html?page`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent).toEqual({
      library: 'wrl-consent-wall', action: 'optOut', route: 'settings', result: 'success', button: 'Reject all and continue',
    });

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('<title>WRL Integration Test - Consent Wall</title>');
    expect(html).toContain('<p id="outcome">wall-outcome:declined-on-settings-page</p>');
  });

  it('accepts when a refusal only leads to a pay wall, and says so', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-wall.html?paywall`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent).toEqual({
      library: 'wrl-consent-wall', action: 'acceptAll', route: 'accept', result: 'accepted', button: 'Accept and continue',
    });

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('<p id="outcome">wall-outcome:accepted-after-refusal</p>');
    expect(html).not.toContain('<p id="outcome">wall-outcome:subscribed</p>');
  });

  it('accepts only when nothing else is left, and says so', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-wall.html?accept`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent).toEqual({
      library: 'wrl-consent-wall', action: 'acceptAll', route: 'accept', result: 'accepted', button: 'Accept and continue',
    });
    expect(record.artifacts.screenshotBefore).toBeDefined();

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('<p id="outcome">wall-outcome:accepted</p>');
    expect(html).not.toContain('<p id="outcome">wall-outcome:subscribed</p>');
  });
});

// ---------------------------------------------------------------------------
// Banner whose decline button reloads the page
// ---------------------------------------------------------------------------

describe('integration: page that reloads once its cookie banner is dismissed', () => {
  const captureId = 'cap_0000000000000000000000000000e5ad';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures the reloaded page with its content, not the page in the middle of reloading', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-reload.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.captureSettings?.consent?.result).toBe('success');
    expect(record.captureSettings?.consent?.cmpDetected).toBe('Cybotcookiebot');
    expect(record.artifacts.screenshotBefore).toBeDefined();

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('fragment-marker');
    expect(html).not.toContain('We use cookies.');
    expect(record.render?.stages?.postConsentMs).toEqual(expect.any(Number));
  });

  it('captures the reloaded page when the reload starts while the second screenshot is taken', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-reload.html?late`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent?.result).toBe('success');

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).toContain('fragment-marker');
    expect(html).not.toContain('We use cookies.');
  });

  it('gives the reloaded page its scroll when the reload starts while WRL waits for open requests', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-reload.html?busy`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent?.result).toBe('success');

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).not.toContain('We use cookies.');
    expect(html).toContain('fragment-marker');
    expect(html).not.toContain('loading="lazy"');
  });

  it('notices a reload that starts while WRL writes its log line after the wait', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/consent-reload.html?afterwait`;
    const slowLogEnv = { ...env, CORALOGIX_ENDPOINT: `http://127.0.0.1:${port}/log-sink`, CORALOGIX_SEND_KEY: 'test' };
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(slowLogEnv, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.captureSettings?.consent?.result).toBe('success');

    const html = await (await env.BUCKET.get(record.artifacts.html)).text();
    expect(html).not.toContain('We use cookies.');
    expect(html).toContain('fragment-marker');
    expect(html).not.toContain('loading="lazy"');
  });
});

// ---------------------------------------------------------------------------
// Iframe page: multi-frame consent injection (PR #82 follow-up)
// ---------------------------------------------------------------------------

describe('integration: page with iframe -- multi-frame consent injection', () => {
  const captureId = 'cap_0000000000000000000000000000e5a6';

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
  const captureId = 'cap_0000000000000000000000000000e5a5';

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
    expect(record.render.stages.scrollMs).toBeDefined();
    expect(record.render.stages.consentMs).toBeDefined();
    expect(record.render.stages.screenshotMs).toBeDefined();
    expect(record.render.stages.contentMs).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Error page detection: Chromium error page fixture
// ---------------------------------------------------------------------------

describe('integration: error page detection', () => {
  const captureId = 'cap_0000000000000000000000000000e5a7';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('fails capture when page contains Chromium error interstitial', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/error-page.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('failed');
    expect(record.error).toBe('The browser showed an error page instead of the site');
  });
});

// ---------------------------------------------------------------------------
// The status the site answered the browser with (backlog #101)
// ---------------------------------------------------------------------------

describe('integration: status of the page response', () => {
  const captureId = 'cap_0000000000000000000000000000e5ab';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('records 200 for a page that loaded normally', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/fast.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.render?.httpStatus).toBe(200);
  });

  it('captures an error page with content and records its status', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/gone.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('full');
    expect(record.render?.httpStatus).toBe(404);
  });

  it('names the status when the site answered with an error and an empty page', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/blocked-blank.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(false);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('failed');
    expect(record.error).toBe('The site answered HTTP 403 and the page showed nothing (blank page)');
  });
});

// ---------------------------------------------------------------------------
// Navigation timeout: the page gets the same steps as one that finished loading
// ---------------------------------------------------------------------------

describe('integration: page whose load event comes after the navigation timeout', () => {
  const captureId = 'cap_0000000000000000000000000000e5ac';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures it as partial after settling, scrolling and the consent step', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/slow-load.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('partial');
    expect(record.render?.timedOut).toBe(true);
    expect(record.render?.httpStatus).toBe(200);
    expect(record.render?.stages?.settleMs).toEqual(expect.any(Number));
    expect(record.render?.stages?.scrollMs).toEqual(expect.any(Number));
    expect(record.render?.stages?.consentMs).toEqual(expect.any(Number));
    expect(record.captureSettings?.consent?.result).toBe('notDetected');
  });

  it('fails a blank page instead of storing it as a partial capture', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/slow-blank.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(false);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('failed');
    expect(record.error).toBe('The page loaded but showed nothing (blank page)');
  });
});

// ---------------------------------------------------------------------------
// Lazy-load triggering: below-fold images
// ---------------------------------------------------------------------------

describe('integration: lazy-load triggering', () => {
  const captureId = 'cap_0000000000000000000000000000e5a8';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures page with lazy images and includes scrollMs in stages', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/lazy-images.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('full');
    expect(record.render?.stages?.scrollMs).toBeDefined();
    expect(record.render.stages.scrollMs).toBeGreaterThanOrEqual(0);
  });

  it('rendered HTML contains below-fold content', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/lazy-images.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    const htmlObj = await env.BUCKET.get(record.artifacts.html);
    const html = await htmlObj.text();
    expect(html).toContain('below-fold-marker');
  });
});

// ---------------------------------------------------------------------------
// Caps: subresource count and page size (backlog #98)
// ---------------------------------------------------------------------------

describe('integration: page over the subresource cap', () => {
  const captureId = 'cap_0000000000000000000000000000e5a9';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('captures the page as partial instead of failing', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/many-resources.html?n=2020`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('partial');
    expect(record.render?.subresourceLimitReached).toBe(true);
    expect(record.render?.timedOut).toBe(false);
    expect(record.render?.waitUntilReached).toBe('load');
  });

  it('captures a page with 1200 requests whole', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/many-resources.html?n=1200`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('full');
    expect(record.render?.subresourceLimitReached).toBe(false);
  });

  it('records that a fast page stayed under the cap', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/fast.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.renderQuality).toBe('full');
    expect(record.render?.subresourceLimitReached).toBe(false);
  });
});

describe('integration: page over the size cap', () => {
  const captureId = 'cap_0000000000000000000000000000e5aa';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  // Backlog #99: the cap counts announced response sizes, which never reach
  // the Worker, so past it WRL blocks further requests and captures the page
  // as partial, like the request cap
  it('captures a page that loads more than 50 MB as partial', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/huge-loaded.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(true);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('complete');
    expect(record.renderQuality).toBe('partial');
    expect(record.render?.sizeLimitReached).toBe(true);
    expect(record.render?.timedOut).toBe(false);
  });

  it('records that a fast page stayed under the cap', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/fast.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    await performCapture(env, url, '127.0.0.1', captureId, 'default');

    const record = await getCapture(env.DB, captureId);
    expect(record.renderQuality).toBe('full');
    expect(record.render?.sizeLimitReached).toBe(false);
  });
});

// Backlog #99: the rendered HTML is what the Worker holds to build the WACZ
describe('integration: page whose HTML is too large', () => {
  const captureId = 'cap_0000000000000000000000000000e5ab';

  beforeEach(async () => {
    await ensureBrowserSession();
    await cleanupCapture(captureId);
  });
  afterEach(async () => { await cleanupCapture(captureId); });

  it('fails the capture before reading the HTML into the Worker', async () => {
    const port = inject('testServerPort');
    const url = `http://127.0.0.1:${port}/huge-html.html`;
    await createCapture(env.DB, captureId, url, '127.0.0.1', 'default');
    const result = await performCapture(env, url, '127.0.0.1', captureId, 'default');

    expect(result.ok).toBe(false);
    expect(result.retryable).toBe(false);
    const record = await getCapture(env.DB, captureId);
    expect(record.status).toBe('failed');
    expect(record.error).toBe('The page\'s HTML is larger than 15 MB, more than WRL can sign in one capture');
  });
});
