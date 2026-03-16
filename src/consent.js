/*
 * consent.js -- Cookie consent dismissal via DuckDuckGo autoconsent
 *
 * Injects the vendored autoconsent script after page navigation and
 * before the after-consent screenshot. Communicates via the
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

export const AUTOCONSENT_VERSION = '14.59.0';

const CONSENT_TIMEOUT_MS = 2000;

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
  } catch {
    return { status: 'failed', cmp: null, durationMs: Date.now() - start };
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

  await page.exposeBinding('autoconsentSendMessage', (_source, msg) => {
    if (!msg || !ALLOWED_MSG_TYPES.has(msg.type)) {
      return;
    }

    switch (msg.type) {
      case 'init':
        page.evaluate((cfg) => {
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
        page.evaluate((c) => {
          try {
            // eslint-disable-next-line no-eval
            const result = eval(c);
            return Promise.resolve(result);
          } catch {
            return Promise.resolve(null);
          }
        }, code).then((result) => {
          page.evaluate(({ id, res }) => {
            if (window.autoconsentReceiveMessage) {
              window.autoconsentReceiveMessage({ type: 'evalResp', id, result: res });
            }
          }, { id: msg.id, res: result }).catch(() => {});
        }).catch(() => {});
        break;
      }

      case 'selfTestResult':
      case 'report':
        break;
    }
  });

  await page.evaluate(
    ([script]) => {
      const fn = new Function(script);
      fn();
    },
    [autoconsentScript],
  );

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve({ status: detectedCmp ? 'timeout' : 'none', cmp: detectedCmp }), CONSENT_TIMEOUT_MS)
  );

  const outcome = await Promise.race([resultPromise, timeoutPromise]);
  return { ...outcome, durationMs: Date.now() - start };
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
      } catch(e) {}
    }
  };
})();
`;

  await page.evaluate(wrappedScript);

  const deadline = Date.now() + CONSENT_TIMEOUT_MS;
  const pollIntervalMs = 200;

  while (Date.now() < deadline) {
    const result = await page.evaluate(() => window.__autoconsentResult).catch(() => null);
    if (result) {
      return { ...result, durationMs: Date.now() - start };
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  // Timed out -- check if a CMP was ever detected
  const cmp = await page.evaluate(() => window.__autoconsentCmp).catch(() => null);
  return { status: cmp ? 'timeout' : 'none', cmp, durationMs: Date.now() - start };
}
