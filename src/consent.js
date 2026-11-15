/*
 * consent.js -- Cookie consent dismissal via DuckDuckGo autoconsent
 *
 * Injects the vendored autoconsent script into all frames (main + child
 * iframes) after page navigation and before the after-consent screenshot.
 * Multi-frame injection is required because some CMPs (Sourcepoint, etc.)
 * run detection inside cross-origin iframes. Communicates via the
 * autoconsentSendMessage / autoconsentReceiveMessage channel.
 *
 * The vendored script only carries autoconsent's detectors written in code
 * (Cookiebot, OneTrust, Sourcepoint and eight more). Every other banner it
 * knows from JSON rules, which come from the same package and are sent to
 * each frame with the 'initResp' message, filtered for that frame's URL.
 * The rules (570 KB) and the function that filters them are loaded on the
 * first capture, not when the Worker starts.
 *
 * Returns a consistent result shape regardless of outcome:
 *   { status, cmp, popupFound, durationMs }
 *
 * status values:
 *   'dismissed' -- consent popup detected and successfully opted out
 *   'none'      -- no CMP detected within CONSENT_DETECT_MS
 *   'timeout'   -- CMP detected, but its popup did not show within
 *                  CONSENT_POPUP_MS (popupFound false) or the opt-out did
 *                  not complete within CONSENT_OPTOUT_MS (popupFound true)
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

export const AUTOCONSENT_VERSION = '18.5.0';

// How long the consent step waits, counted from the injection. With no
// consent tool detected it ends after CONSENT_DETECT_MS, provided autoconsent
// has been through its rules in the main frame once; on a page that keeps
// the browser busy that can take longer, so the step waits for it until
// CONSENT_DETECT_MAX_MS. A detected tool gets until CONSENT_POPUP_MS to show
// its banner, and a banner that is showing gets until CONSENT_OPTOUT_MS to be
// declined (some need a settings dialog opened first).
const CONSENT_DETECT_MS = 2000;
const CONSENT_DETECT_MAX_MS = 6000;
const CONSENT_POPUP_MS = 5000;
const CONSENT_OPTOUT_MS = 10000;
// How often the step looks again once a limit has passed and a longer one applies
const CONSENT_RECHECK_MS = 250;
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
  // Cosmetic rules hide a banner with CSS and decide nothing.
  enableCosmeticRules: false,
  // Rules named auto_*, which autoconsent generates for one site each from a
  // crawl. The one for semrush.com clicks the button that opens the cookie
  // settings and leaves them open over the page.
  enableGeneratedRules: false,
};

/**
 * How long the consent step may take in all, given what autoconsent has
 * reported so far.
 *
 * @param {string|null} cmp Consent tool detected, if any
 * @param {boolean} popupFound Whether its banner is showing
 * @param {boolean} roundDone Whether autoconsent has finished a detection
 *   round in the main frame
 * @returns {number} Milliseconds from the injection
 */
function consentLimitMs(cmp, popupFound, roundDone) {
  if (popupFound) return CONSENT_OPTOUT_MS;
  if (cmp) return CONSENT_POPUP_MS;
  return roundDone ? CONSENT_DETECT_MS : CONSENT_DETECT_MAX_MS;
}

/**
 * Whether a 'report' message says that autoconsent has finished a detection
 * round: it counts the rounds it starts, so the second one starting means the
 * first one ended.
 *
 * @param {{ state?: { findCmpAttempts?: number, lifecycle?: string } }} msg
 * @returns {boolean}
 */
function detectionRoundDone(msg) {
  return msg.state?.findCmpAttempts >= 2 || msg.state?.lifecycle === 'nothingDetected';
}

let rulesModules = null;

/**
 * Loads autoconsent's JSON rules and its filter function, once per isolate.
 *
 * @returns {Promise<{ compactRules: object, filterCompactRules: Function }>}
 */
async function loadRules() {
  rulesModules ??= Promise.all([
    import('@duckduckgo/autoconsent'),
    import('@duckduckgo/autoconsent/rules/compact-rules.json'),
  ]).then(([lib, rules]) => ({ compactRules: rules.default, filterCompactRules: lib.filterCompactRules }));
  return rulesModules;
}

/**
 * The 'initResp' message for one frame: the config and the JSON rules that
 * can apply to the frame's URL. About 240 KB for a main frame, 9 KB for a
 * child frame.
 *
 * @param {{ compactRules: object, filterCompactRules: Function }} rules From loadRules()
 * @param {string} url
 * @param {boolean} mainFrame
 * @returns {{ type: 'initResp', config: object, rules: object }}
 */
function autoconsentInitMessage({ compactRules, filterCompactRules }, url, mainFrame) {
  return {
    type: 'initResp',
    config: AUTOCONSENT_CONFIG,
    rules: { autoconsent: [], compact: filterCompactRules(compactRules, { url, mainFrame }) },
  };
}

/**
 * What a capture's `captureSettings.consent.result` says for a result of
 * dismissCookieConsent().
 *
 * A consent tool that is on the page and showed no banner counts as no
 * banner: many tools only ask visitors from some countries, and there was
 * nothing to decline.
 *
 * @param {{ status: string, popupFound?: boolean }} consent
 * @returns {'success'|'notDetected'|'failed'}
 */
export function consentResult(consent) {
  if (consent.status === 'dismissed') return 'success';
  if (consent.status === 'none') return 'notDetected';
  if (consent.status === 'timeout' && !consent.popupFound) return 'notDetected';
  return 'failed';
}

/**
 * Attempts to dismiss cookie consent on the given Playwright page.
 *
 * @param {import('@cloudflare/playwright').Page} page
 * @returns {Promise<{ status: 'dismissed'|'none'|'timeout'|'failed', cmp: string|null, popupFound: boolean, durationMs: number }>}
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
      popupFound: false,
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
  const rules = await loadRules();
  let resolveConsent;
  const resultPromise = new Promise((resolve) => {
    resolveConsent = resolve;
  });

  let detectedCmp = null;
  let popupFound = false;
  let roundDone = false;

  const tRules = Date.now();
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
        frame.evaluate((initResp) => {
          if (window.autoconsentReceiveMessage) {
            window.autoconsentReceiveMessage(initResp);
          }
        }, autoconsentInitMessage(rules, frame.url(), frame === page.mainFrame())).catch(() => {});
        break;

      case 'cmpDetected':
        detectedCmp = msg.cmp ?? null;
        break;

      case 'popupFound':
        detectedCmp = detectedCmp ?? msg.cmp ?? null;
        popupFound = true;
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

      case 'report':
        if (frame === page.mainFrame() && detectionRoundDone(msg)) roundDone = true;
        break;

      case 'selfTestResult':
        break;
    }
  });

  const tBinding = Date.now();
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

  let timer;
  try {
    await page.evaluate(inject, [autoconsentScript]);
    const tMainInject = Date.now();
    for (const frame of page.frames()) {
      injectIntoFrame(frame);
    }

    // The limit depends on how far autoconsent has come, so each time it
    // runs out it is worked out again from what has been seen by then.
    const began = Date.now();
    const timeoutPromise = new Promise((resolve) => {
      const check = () => {
        const remaining = began + consentLimitMs(detectedCmp, popupFound, roundDone) - Date.now();
        if (remaining > 0) {
          timer = setTimeout(check, Math.min(remaining, CONSENT_RECHECK_MS));
        } else {
          resolve({ status: detectedCmp ? 'timeout' : 'none', cmp: detectedCmp });
        }
      };
      timer = setTimeout(check, CONSENT_DETECT_MS);
    });

    const outcome = await Promise.race([resultPromise, timeoutPromise]);
    return { ...outcome, popupFound, durationMs: Date.now() - start, setupMs: began - start, rulesMs: tRules - start, bindingMs: tBinding - tRules, mainInjectMs: tMainInject - tBinding, injected: injectedFrames.size };
  } finally {
    clearTimeout(timer);
    page.off('framenavigated', injectIntoFrame);
  }
}

// ---------------------------------------------------------------------------
// Implementation: polling fallback (no exposeBinding)
// ---------------------------------------------------------------------------

async function _dismissWithPolling(page, start) {
  const rules = await loadRules();
  const wrappedScript = (frame) => `
(function() {
  ${autoconsentScript}
  // Override autoconsentSendMessage to write results to window.__autoconsentResult
  window.__autoconsentResult = null;
  window.__autoconsentCmp = null;
  window.__autoconsentPopup = false;
  window.__autoconsentRoundDone = false;
  window.autoconsentSendMessage = function(msg) {
    if (!msg) return;
    if (msg.type === 'report' && (${detectionRoundDone.toString()})(msg)) {
      window.__autoconsentRoundDone = true;
    }
    if (msg.type === 'cmpDetected' || msg.type === 'popupFound') {
      window.__autoconsentCmp = msg.cmp || window.__autoconsentCmp;
    }
    if (msg.type === 'popupFound') {
      window.__autoconsentPopup = true;
    }
    if (msg.type === 'autoconsentDone') {
      window.__autoconsentResult = { status: 'dismissed', cmp: window.__autoconsentCmp };
    }
    if (msg.type === 'autoconsentError' || (msg.type === 'optOutResult' && msg.result === false)) {
      window.__autoconsentResult = { status: 'failed', cmp: window.__autoconsentCmp };
    }
    if (msg.type === 'init') {
      if (window.autoconsentReceiveMessage) {
        window.autoconsentReceiveMessage(${JSON.stringify(autoconsentInitMessage(rules, frame.url(), frame === page.mainFrame()))});
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
    frame.evaluate(wrappedScript(frame)).catch(() => {});
  }

  page.on('framenavigated', injectIntoFrame);

  try {
    await page.evaluate(wrappedScript(page.mainFrame()));
    for (const frame of page.frames()) {
      injectIntoFrame(frame);
    }

    const began = Date.now();
    const pollIntervalMs = 200;
    let cmp = null;
    let popupFound = false;
    let roundDone = false;

    while (Date.now() < began + consentLimitMs(cmp, popupFound, roundDone)) {
      // Poll all frames -- CMP result may come from an iframe
      for (const frame of page.frames()) {
        // Detached frames throw on evaluate -- treat as no result
        const state = await frame.evaluate(() => ({
          result: window.__autoconsentResult,
          cmp: window.__autoconsentCmp,
          popupFound: window.__autoconsentPopup === true,
          roundDone: window.__autoconsentRoundDone === true,
        })).catch(() => null);
        if (!state) continue;
        cmp = cmp ?? state.cmp ?? null;
        popupFound = popupFound || state.popupFound;
        roundDone = roundDone || (frame === page.mainFrame() && state.roundDone);
        if (state.result) {
          return { ...state.result, popupFound, durationMs: Date.now() - start };
        }
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    return { status: cmp ? 'timeout' : 'none', cmp, popupFound, durationMs: Date.now() - start };
  } finally {
    page.off('framenavigated', injectIntoFrame);
  }
}
