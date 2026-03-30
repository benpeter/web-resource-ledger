/*
 * consent.js -- Cookie consent dismissal via DuckDuckGo autoconsent
 *
 * Injects the vendored autoconsent script into all frames (main + child
 * iframes) after page navigation and before the after-consent screenshot.
 * Multi-frame injection is required because some CMPs (Sourcepoint, etc.)
 * run detection inside cross-origin iframes. Communicates via the
 * autoconsentSendMessage / autoconsentReceiveMessage channel.
 *
 * Returns a consistent result shape regardless of outcome:
 *   { status, cmp, durationMs }
 *
 * status values:
 *   'dismissed' -- consent popup detected and successfully opted out
 *   'none'      -- no CMP detected within timeout
 *   'timeout'   -- CMP detected but opt-out did not complete in time
 *   'failed'    -- opt-out attempted but reported failure
 *
 * Security notes:
 *   - Message types validated against an allowlist (unknown types silently dropped)
 *   - eval msg.code capped at 2048 bytes (vendored rules are the source, but
 *     page JS could call the binding -- length cap limits blast radius)
 *   - exposeBinding() is preferred; polling fallback used if unavailable
 *
 * Tests: test/consent.test.js
 */ // tva

import autoconsentScript from './vendor/autoconsent-script.js';

export const AUTOCONSENT_VERSION = '14.66.0';

const CONSENT_TIMEOUT_MS = 2000;
const MAX_INJECTED_FRAMES = 50;

const ALLOWED_MSG_TYPES = new Set([
  'init',
  'cmpDetected',
  'popupFound',
  'optOutResult',
  'autoconsentDone',
  'autoconsentError',
  'eval',
  'selfTestResult',
  'report',
]);

const AUTOCONSENT_CONFIG = {
  enabled: true,
  autoAction: 'optOut',
  disabledCmps: [],
  enablePrehide: false,
  detectRetries: 5,
  enableCosmeticRules: false,
};

/**
 * Attempts to dismiss cookie consent on the given Playwright page.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ status: 'dismissed'|'none'|'timeout'|'failed', cmp: string|null, durationMs: number }>}
 */
export async function dismissCookieConsent(page) {
  const start = Date.now();

  try {
    if (typeof page.exposeBinding === 'function') {
      return await _dismissWithBinding(page, start);
    } else {
      return await _dismissWithPolling(page, start);
    }
  } catch (err) {
    return {
      status: 'failed',
      cmp: null,
      durationMs: Date.now() - start,
      _error: {
        name: err?.constructor?.name ?? 'Unknown',
        message: String(err?.message ?? '').slice(0, 256),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Implementation: exposeBinding path
// ---------------------------------------------------------------------------

async function _dismissWithBinding(page, start) {
  let resolveConsent;
  const resultPromise = new Promise((resolve) => {
    resolveConsent = resolve;
  });

  let detectedCmp = null;

  await page.exposeBinding('autoconsentSendMessage', (source, msg) => {
    if (!msg || !ALLOWED_MSG_TYPES.has(msg.type)) {
      return;
    }

    // Route responses back to the frame that sent the message (may be an
    // iframe for CMP providers like Sourcepoint that run inside iframes).
    const frame = source.frame;

    switch (msg.type) {
      case 'init':
        // Cross-origin or detached frames may reject evaluate -- non-fatal
        frame.evaluate((cfg) => {
          if (window.autoconsentReceiveMessage) {
            window.autoconsentReceiveMessage({ type: 'initResp', config: cfg });
          }
        }, AUTOCONSENT_CONFIG).catch(() => {});
        break;

      case 'cmpDetected':
        detectedCmp = msg.cmp ?? null;
        break;

      case 'popupFound':
        detectedCmp = detectedCmp ?? msg.cmp ?? null;
        break;

      case 'optOutResult':
        if (msg.result === false) {
          resolveConsent({ status: 'failed', cmp: detectedCmp });
        }
        break;

      case 'autoconsentDone':
        resolveConsent({ status: 'dismissed', cmp: detectedCmp });
        break;

      case 'autoconsentError':
        resolveConsent({ status: 'failed', cmp: detectedCmp });
        break;

      case 'eval': {
        const code = typeof msg.code === 'string' ? msg.code.slice(0, 2048) : '';
        frame.evaluate((c) => {
          try {
            // eslint-disable-next-line no-eval
            const result = eval(c);
            return Promise.resolve(result);
          } catch {
            // eval of autoconsent rule code may throw -- non-fatal, result stays null
            return Promise.resolve(null);
          }
        }, code).then((result) => {
          frame.evaluate(({ id, res }) => {
            if (window.autoconsentReceiveMessage) {
              window.autoconsentReceiveMessage({ type: 'evalResp', id, result: res });
            }
          // Cross-origin or detached frames may reject evaluate -- non-fatal
          }, { id: msg.id, res: result }).catch(() => {});
        // Cross-origin or detached frames may reject evaluate -- non-fatal
        }).catch(() => {});
        break;
      }

      case 'selfTestResult':
      case 'report':
        break;
    }
  });

  // Inject autoconsent into main frame and all child frames (CMP iframes).
  // Late-loading iframes (e.g. OneTrust) are caught by the framenavigated listener.
  const inject = ([script]) => { const fn = new Function(script); fn(); };
  const injectedFrames = new Set();

  function injectIntoFrame(frame) {
    if (frame === page.mainFrame()) return;
    if (injectedFrames.has(frame)) return;
    if (injectedFrames.size >= MAX_INJECTED_FRAMES) return;
    const url = frame.url();
    if (!url || url === 'about:blank' || url.startsWith('javascript:')) return;
    injectedFrames.add(frame);
    // Cross-origin or detached frames may reject evaluate -- non-fatal
    frame.evaluate(inject, [autoconsentScript]).catch(() => {});
  }

  // Register listener for late-loading CMP iframes before the initial loop
  page.on('framenavigated', injectIntoFrame);

  try {
    await page.evaluate(inject, [autoconsentScript]);
    for (const frame of page.frames()) {
      injectIntoFrame(frame);
    }

    const timeoutPromise = new Promise((resolve) =>
      setTimeout(() => resolve({ status: detectedCmp ? 'timeout' : 'none', cmp: detectedCmp }), CONSENT_TIMEOUT_MS)
    );

    const outcome = await Promise.race([resultPromise, timeoutPromise]);
    return { ...outcome, durationMs: Date.now() - start };
  } finally {
    page.off('framenavigated', injectIntoFrame);
  }
}

// ---------------------------------------------------------------------------
// Implementation: polling fallback (no exposeBinding)
// ---------------------------------------------------------------------------

async function _dismissWithPolling(page, start) {
  const wrappedScript = `
(function() {
  ${autoconsentScript}
  // Override autoconsentSendMessage to write results to window.__autoconsentResult
  window.__autoconsentResult = null;
  window.__autoconsentCmp = null;
  window.autoconsentSendMessage = function(msg) {
    if (!msg) return;
    if (msg.type === 'cmpDetected' || msg.type === 'popupFound') {
      window.__autoconsentCmp = msg.cmp || window.__autoconsentCmp;
    }
    if (msg.type === 'autoconsentDone') {
      window.__autoconsentResult = { status: 'dismissed', cmp: window.__autoconsentCmp };
    }
    if (msg.type === 'autoconsentError' || (msg.type === 'optOutResult' && msg.result === false)) {
      window.__autoconsentResult = { status: 'failed', cmp: window.__autoconsentCmp };
    }
    if (msg.type === 'init') {
      if (window.autoconsentReceiveMessage) {
        window.autoconsentReceiveMessage({ type: 'initResp', config: ${JSON.stringify(AUTOCONSENT_CONFIG)} });
      }
    }
    if (msg.type === 'eval') {
      const code = typeof msg.code === 'string' ? msg.code.slice(0, 2048) : '';
      try {
        const result = eval(code);
        if (window.autoconsentReceiveMessage) {
          window.autoconsentReceiveMessage({ type: 'evalResp', id: msg.id, result });
        }
      } catch(e) { /* eval of autoconsent rule code in page context -- non-fatal */ }
    }
  };
})();
`;

  // Inject into main frame and all child frames (CMP iframes).
  // Late-loading iframes caught by the framenavigated listener.
  const injectedFrames = new Set();

  function injectIntoFrame(frame) {
    if (frame === page.mainFrame()) return;
    if (injectedFrames.has(frame)) return;
    if (injectedFrames.size >= MAX_INJECTED_FRAMES) return;
    const url = frame.url();
    if (!url || url === 'about:blank' || url.startsWith('javascript:')) return;
    injectedFrames.add(frame);
    // Cross-origin or detached frames may reject evaluate -- non-fatal
    frame.evaluate(wrappedScript).catch(() => {});
  }

  page.on('framenavigated', injectIntoFrame);

  try {
    await page.evaluate(wrappedScript);
    for (const frame of page.frames()) {
      injectIntoFrame(frame);
    }

    const deadline = Date.now() + CONSENT_TIMEOUT_MS;
    const pollIntervalMs = 200;

    while (Date.now() < deadline) {
      // Poll all frames -- CMP result may come from an iframe
      for (const frame of page.frames()) {
        // Detached frames throw on evaluate -- treat as no result
        const result = await frame.evaluate(() => window.__autoconsentResult).catch(() => null);
        if (result) {
          return { ...result, durationMs: Date.now() - start };
        }
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    // Timed out -- check if a CMP was ever detected in any frame
    let cmp = null;
    for (const frame of page.frames()) {
      // Detached frames throw on evaluate -- treat as no CMP
      const frameCmp = await frame.evaluate(() => window.__autoconsentCmp).catch(() => null);
      if (frameCmp) { cmp = frameCmp; break; }
    }
    return { status: cmp ? 'timeout' : 'none', cmp, durationMs: Date.now() - start };
  } finally {
    page.off('framenavigated', injectIntoFrame);
  }
}
