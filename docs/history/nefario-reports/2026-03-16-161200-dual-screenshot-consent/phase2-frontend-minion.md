# Frontend Minion -- Autoconsent Integration Analysis

## Context Summary

Analyzed `src/capture.js` (the `defaultRenderer()` pipeline), `package.json`, the full `@duckduckgo/autoconsent` v14.59.0 package structure, and the `@cloudflare/playwright` type definitions to determine the optimal integration path.

---

## Recommendations

### 1. Bundle Path: `autoconsent.playwright.js` (168KB)

The `@duckduckgo/autoconsent` package ships several pre-built bundles:

| Bundle | Size | Purpose |
|--------|------|---------|
| `dist/autoconsent.playwright.js` | 168KB | Self-contained IIFE for `page.evaluate()` injection. Includes consentomatic rules, all CMP detectors, and the AutoConsent class. Expects `window.autoconsentSendMessage` binding. |
| `dist/autoconsent.esm.js` | 129KB | ESM import for extension/app embedding. Requires separate rule loading and message plumbing. |
| `dist/autoconsent.extra.esm.js` | 2.3MB | ESM with filterlist engine bundled. Way too large. |
| `rules/rules.json` | 2.9MB | Full rule definitions (verbose JSON). Not needed -- compact rules are embedded in the playwright bundle. |
| `rules/compact-rules.json` | 932KB | Compact encoded rules for the newer encoding format. Needed if using ESM bundle; already baked into playwright bundle. |

**The 27MB unpacked size comes from test fixtures, CI scripts, browser extension builds, rule source files, and the changelog. The `dist/autoconsent.playwright.js` file is the 168KB referenced in the issue.**

**Recommendation**: Use `dist/autoconsent.playwright.js`. It is a self-contained IIFE that:
- Declares a global `autoconsentReceiveMessage` function on `window`
- Expects a global `autoconsentSendMessage` binding (which we provide via `page.exposeBinding`)
- Includes all built-in CMP rules and consentomatic rules
- Has zero runtime dependencies (ghostery/adblocker is only used by the `extra` bundle)

**However, it does NOT include compact rules.** The playwright bundle only includes the consentomatic rules and dynamic (class-based) CMP detectors. For maximum CMP coverage, we need to also send the compact rules via the `initResp` message. The compact rules JSON is 932KB -- this is large but is sent once per page context via `page.evaluate()`, not over the network.

**Alternative approach (lighter)**: Read the `autoconsent.playwright.js` content at build/deploy time and embed it as a string constant. This avoids importing the full npm package into the worker bundle and keeps the transitive dependencies (`@ghostery/adblocker`, `tldts-experimental`) out of the dependency tree entirely. The 168KB script string becomes part of the worker code.

### 2. Integration Pattern: `exposeBinding()` + `page.evaluate()`

The autoconsent library uses a content-script / background-worker messaging pattern. In the Playwright test runner (`playwright/runner.ts`), DuckDuckGo's own integration uses exactly this approach:

1. **Before navigation**: Call `page.exposeBinding('autoconsentSendMessage', callback)` to create the message channel from content script to our handler
2. **After navigation starts**: Call `page.evaluate(contentScript)` to inject the autoconsent IIFE
3. **In the callback**: Handle messages and respond via `page.evaluate('autoconsentReceiveMessage(...)')`.

This is the proven pattern. Here is the concrete integration:

```js
// AUTOCONSENT_SCRIPT is the contents of dist/autoconsent.playwright.js, read at build time
// COMPACT_RULES is the contents of rules/compact-rules.json, filtered for main frame

const CONSENT_TIMEOUT_MS = 8000; // hard cap for consent dismissal phase

async function dismissCookieConsent(page) {
  // State tracking
  let cmpDetected = false;
  let popupFound = false;
  let optOutDone = false;
  let consentResult = null;  // { cmp, result, isCosmetic, duration }
  let resolveConsent;
  let rejectConsent;

  const consentPromise = new Promise((resolve, reject) => {
    resolveConsent = resolve;
    rejectConsent = reject;
  });

  // Message handler -- mirrors playwright/runner.ts messageCallback
  await page.exposeBinding('autoconsentSendMessage', async ({ frame }, msg) => {
    switch (msg.type) {
      case 'init': {
        // Respond with config and rules
        const config = {
          enabled: true,
          autoAction: 'optOut',
          disabledCmps: [],
          enablePrehide: false,
          detectRetries: 5,        // reduced from default 20 for speed
          enableCosmeticRules: true,
          enableGeneratedRules: true,
        };
        await frame.evaluate(
          `autoconsentReceiveMessage(${JSON.stringify({
            type: 'initResp',
            config,
            rules: { compact: COMPACT_RULES },
          })})`
        );
        break;
      }
      case 'cmpDetected':
        cmpDetected = true;
        break;
      case 'popupFound':
        popupFound = true;
        break;
      case 'optOutResult':
        optOutDone = true;
        break;
      case 'autoconsentDone':
        consentResult = {
          cmp: msg.cmp,
          isCosmetic: msg.isCosmetic,
          duration: msg.duration,
        };
        resolveConsent(consentResult);
        break;
      case 'eval': {
        // Handle eval requests from rules that need main-world execution
        const result = await frame.evaluate(msg.code);
        await frame.evaluate(
          `autoconsentReceiveMessage(${JSON.stringify({
            type: 'evalResp',
            id: msg.id,
            result,
          })})`
        );
        break;
      }
      case 'autoconsentError':
        // Log but don't fail -- consent dismissal is best-effort
        break;
      case 'report':
        // Check for terminal states that mean "no CMP found"
        if (msg.state?.lifecycle === 'nothingDetected') {
          resolveConsent(null); // No CMP on this page
        }
        break;
    }
  });

  // Inject the autoconsent content script
  await page.evaluate(AUTOCONSENT_SCRIPT);

  // Race: consent resolution vs timeout
  const timeout = new Promise((resolve) =>
    setTimeout(() => resolve('timeout'), CONSENT_TIMEOUT_MS)
  );

  const result = await Promise.race([consentPromise, timeout]);

  if (result === 'timeout') {
    return { status: 'timeout', cmpDetected, popupFound };
  }
  if (result === null) {
    return { status: 'none' };
  }
  return { status: 'dismissed', ...result };
}
```

**Why not `addInitScript()`?**

`addInitScript()` runs the script before page scripts execute. This sounds ideal for CMP detection, but creates a problem: the autoconsent library waits for `DOMContentLoaded` to start detection, and the page's CMP scripts also fire on `DOMContentLoaded`. The library's detection uses retry loops (`detectRetries`) specifically because CMPs may render asynchronously after DOMContentLoaded. Using `addInitScript` would inject too early -- before `exposeBinding` can be called (timing race), and the script would start its detection retries from DOMContentLoaded, wasting cycles if the CMP loads lazily after `networkidle`.

**The correct flow**: Navigate to `networkidle` first (current behavior), take the "before" screenshot, then inject autoconsent and wait for it to finish (or time out), then take the "after" screenshot. This matches the issue's stated goal and also ensures the "before" screenshot captures the fully-loaded page with the cookie banner visible.

### 3. Detection Success/Failure/No-CMP Signals

The library communicates its state through the message channel. Key message types:

| Message | Meaning |
|---------|---------|
| `cmpDetected` | A CMP framework was found in the DOM (e.g., OneTrust, Cookiebot) |
| `popupFound` | The CMP's consent popup is visually present |
| `optOutResult` | The opt-out action completed (with `result: true/false`) |
| `autoconsentDone` | The entire flow finished successfully (with CMP name, duration, click count) |
| `autoconsentError` | Something went wrong (details in `msg.details`) |
| `report` with `state.lifecycle === 'nothingDetected'` | No CMP was found after all retries |

**Three outcome categories for the renderer**:

1. **`status: 'dismissed'`** -- CMP found and consent popup handled. Includes `cmp` name (e.g., "OneTrust"), `isCosmetic` flag, and `duration` in ms. Second screenshot will show the page without the banner.

2. **`status: 'none'`** -- No CMP detected on the page. Library exhausted its retries and found nothing. The "after" screenshot would be identical to "before" -- **skip storing a duplicate**. The renderer should return only one screenshot.

3. **`status: 'timeout'`** -- The library found something but couldn't finish in time. Sub-states `cmpDetected` and `popupFound` indicate how far it got. Take the "after" screenshot anyway (it might be partially dismissed) and report the timeout.

### 4. Latency Overhead Estimate

**Current timing budget** (from `capture.js`):
- Total: 30s (`ctx.waitUntil`)
- Navigation: 25s (`NAV_TIMEOUT_MS`)
- Post-navigation work (screenshot, HTML capture, height check): ~0.5-1s
- Headroom for KV/R2 writes: ~4-5s

**Autoconsent timing characteristics** (from source analysis):
- Detection retries: default 20 at 500ms interval = up to 10s. We should reduce to 5 retries = 2.5s max.
- Popup wait: up to 10 retries at 500ms = 5s max. We should reduce this as well.
- Opt-out action: Typically 100-500ms (DOM clicks and waits). Some CMPs with multi-step flows: up to 2s.
- Total realistic range: 200ms (quick detect + click) to 5s (slow CMP with retries).

**Proposed timing allocation**:
- Reduce `NAV_TIMEOUT_MS` from 25000 to 20000 (still generous for navigation)
- Allocate 8s hard cap for autoconsent (`CONSENT_TIMEOUT_MS`)
- Use `detectRetries: 5` (2.5s max detection) instead of the default 20 (10s)
- This gives: 20s nav + 8s consent + 2s for screenshots/HTML = 30s total

**Typical case**: Navigation completes in 3-10s. CMP detection in 0.5-2s. Opt-out in 0.1-0.5s. Total overhead: **1-3s** for the consent phase. Well within budget.

**Worst case**: Navigation 20s + consent timeout 8s = 28s. Only 2s remain. This is tight but sufficient for two screenshots (~200ms each) and HTML capture (~100ms). KV/R2 writes happen outside the renderer.

### 5. Page Level, Not Context Level

**Use page-level** `exposeBinding` and `evaluate`, not context-level `addInitScript`.

Reasons:
- `exposeBinding` at the page level keeps the message handler scoped to the single page we're working with.
- Context-level `addInitScript` would affect any new pages created in the context (unlikely but defensive).
- The existing pipeline creates one page per context, so the distinction is academic, but page-level is the correct semantic scope.
- DuckDuckGo's own Playwright test runner uses page-level binding (`page.exposeBinding`), confirming this is the intended integration point.

---

## Proposed Tasks

### Task 1: Embed autoconsent script as a static string constant

Create a build/bundling step (or simpler: read the file at module scope) to make the `autoconsent.playwright.js` content available as a string. Since this is a Cloudflare Worker (no filesystem at runtime), the script must be embedded at build time.

**Approach A (simplest, YAGNI)**: Copy `autoconsent.playwright.js` into the repo as `src/vendor/autoconsent.playwright.js` and import it as a raw string. Wrangler supports importing text files via `import contentScript from './vendor/autoconsent.playwright.js?raw'` (or use the `rules` config in wrangler.toml for non-JS assets). Alternatively, export the string from a JS module.

**Approach B**: Import the npm package and reference the dist file. This pulls in the full 27MB package and its transitive dependencies (ghostery/adblocker, tldts-experimental) into `node_modules`, even though we only use the one 168KB file. Wasteful but functional.

**Recommendation**: Approach A. Vendor the single file. Add a comment with the version and instructions for updating. This aligns with the Helix Manifesto's "lean and mean" principle.

Also vendor `compact-rules.json` (932KB) or a pre-filtered subset of it for main-frame-only rules. The `filterCompactRules` function from autoconsent can reduce this, but it requires importing the library. A simpler approach: pre-filter the JSON at build time and vendor the filtered result.

### Task 2: Implement `dismissCookieConsent(page)` helper

A new function in `capture.js` (or a new module `src/consent.js`) that:
1. Sets up `exposeBinding` for the message channel
2. Injects the autoconsent script via `page.evaluate()`
3. Handles the message protocol (init, eval, result messages)
4. Returns a structured result: `{ status, cmp?, isCosmetic?, duration? }`
5. Enforces a hard timeout (8s)

### Task 3: Modify `defaultRenderer()` to use dual-screenshot flow

Change the happy path (post-`networkidle`) from:

```
navigate -> screenshot -> html -> return
```

To:

```
navigate -> screenshot_before -> dismissCookieConsent() -> screenshot_after (if dismissed) -> html -> return
```

The return shape changes from `{ screenshot, html, ... }` to `{ screenshotBefore, screenshotAfter?, html, consent, ... }`. `screenshotAfter` is only present when consent was actually dismissed (status `'dismissed'` or `'timeout'` with `popupFound`).

### Task 4: Update `performCapture()` to store dual artifacts

Change artifact storage from:
```
captures/{captureId}/screenshot.png
```

To:
```
captures/{captureId}/screenshot.png          (always: the "before" screenshot)
captures/{captureId}/screenshot-consent.png  (optional: the "after" screenshot, post-dismissal)
```

Update the `artifacts` object in KV to include the new key. Add `consent` metadata to the KV record (CMP name, status, duration).

### Task 5: Update partial capture path

The partial capture path (navigation timeout with interactive/complete DOM) should skip consent dismissal entirely. Rationale: the page hasn't fully loaded, CMP detection would be unreliable, and we have no time budget left. Partial captures already skip WACZ -- same principle applies.

### Task 6: Reduce NAV_TIMEOUT_MS to accommodate consent phase

Lower `NAV_TIMEOUT_MS` from 25000 to 20000. This gives the consent phase its 8s budget while keeping the 30s total. The 20s navigation timeout is still generous -- most pages load within 5-10s. Sites that genuinely need 20-25s to reach `networkidle` are typically heavy with tracking scripts (exactly the sites likely to have CMPs).

---

## Risks and Concerns

### R1: Compact rules size (932KB evaluated in page context)

Sending 932KB of JSON via `page.evaluate()` is significant. The `autoconsentReceiveMessage(...)` call will parse this in the page's JS engine. This should be fast (< 100ms on modern V8) but is worth monitoring.

**Mitigation**: Pre-filter compact rules at build time to include only main-frame, non-cosmetic rules. This could reduce size significantly. Alternatively, skip compact rules entirely and rely only on the built-in dynamic CMP detectors -- they cover the major CMPs (OneTrust, Cookiebot, TrustArc, Sourcepoint, Klaro, etc.).

### R2: `exposeBinding` availability in Cloudflare Workers

The `@cloudflare/playwright` types include `exposeBinding` (inherited from upstream Playwright types), but Cloudflare's Browser Rendering is a subset of full Playwright. If `exposeBinding` is not supported, the fallback is a polling pattern using `page.evaluate()` to check a global variable periodically. This would be significantly less elegant.

**Verification needed**: Test `page.exposeBinding()` on a deployed Cloudflare Worker with Browser Rendering before committing to this design. If it works, great. If not, fall back to the polling approach (inject script, poll `window.__autoconsentResult` in a loop).

### R3: Some CMPs require cross-frame communication

Autoconsent's `intermediate` rules and frame-based CMPs (TrustArc, Sourcepoint) inject consent dialogs in iframes. The content script needs to be injected into subframes too. The Playwright runner does this with `page.frames().forEach(...)` and `page.on('framenavigated', ...)`.

In our pipeline, we block cross-domain navigations. Consent iframes are typically same-origin or use a consent-specific domain. Our route handler only blocks **top-level** cross-domain navigation -- iframe subresources are allowed through (the route handler checks `route.request().isNavigationRequest()` only for cross-origin). So consent iframes should work. However, injecting the content script into iframes adds complexity. For v1, inject only into the top frame and accept that some iframe-based CMPs won't be dismissed.

### R4: CSP blocking script injection

Some sites have strict Content-Security-Policy headers that block `page.evaluate()`. Playwright typically bypasses CSP for injected scripts (it uses CDP's `Runtime.evaluate`, which runs outside the page's CSP sandbox). This should not be an issue, but is worth noting.

### R5: NAV_TIMEOUT_MS reduction to 20s

Reducing the navigation timeout from 25s to 20s means some slow-loading pages that previously succeeded will now trigger partial capture. The 5s reduction should be acceptable -- the lost 5s now enables consent dismissal, which is strictly more useful for archival purposes. Sites that take 20-25s to reach `networkidle` are heavy enough that partial capture already provides good results.

### R6: License compatibility

`@duckduckgo/autoconsent` is MPL-2.0. The WRL project is Apache-2.0. MPL-2.0 is file-level copyleft -- it allows combining with Apache-2.0 code as long as MPL-licensed files retain their license. Vendoring `autoconsent.playwright.js` (a pre-built bundle) means including one MPL-2.0 file alongside Apache-2.0 code. This is compatible. Add an MPL-2.0 license notice to the vendored file and a NOTICE or attribution in the repo.

### R7: Second screenshot may be identical

If the consent popup was an overlay (most common), dismissing it reveals the underlying page -- the second screenshot is meaningfully different. But if the CMP uses a full-page interstitial, the second screenshot after dismissal may cause a page reload or redirect. The current cross-domain navigation guard would block such redirects. Monitor for this pattern.

---

## Additional Agents Needed

### Security Minion

Review needed for:
- The `eval` message handler: autoconsent rules can request arbitrary JS evaluation in the page's main world via `msg.code`. In the Playwright runner, this is handled by `frame.evaluate(msg.code)`. The code is not caller-supplied -- it comes from the autoconsent rule definitions which we vendor. But the security minion should verify that vendored rules cannot be tampered with, and that the `eval` handler doesn't create an injection vector if a malicious page somehow triggers a crafted message.
- The `exposeBinding` surface: this creates a callable from the page's JS context into our Worker handler. Verify that a malicious page cannot exploit this binding.

### Test Minion

- Needs to design tests for the three consent outcomes (dismissed, none, timeout).
- Needs to verify the message protocol handling with mock CMP pages.
- Needs to test the timing budget with a slow-loading page + slow CMP to verify the 30s budget holds.

### Data Minion

- The KV record schema changes (new `consent` field, new artifact key `screenshot-consent.png`).
- The API response shape changes to expose consent metadata to callers.
- Consider whether the consent metadata should be included in the WACZ bundle.

---

## Open Questions

1. **Should the "before" screenshot delay for CMP animation?** Some CMPs animate in with a fade/slide after page load. The current flow takes the screenshot immediately after `networkidle`. If the CMP hasn't animated in yet, the "before" screenshot won't show the banner. A small delay (500ms) after networkidle before the first screenshot could help, but adds latency.

2. **Should we store both screenshots when no CMP is detected?** The issue says "two screenshots per capture." If no CMP is present, the before/after are identical. Storing only one saves R2 space and keeps the API response clean. Recommendation: store only `screenshot.png` when no CMP is detected; store both `screenshot.png` + `screenshot-consent.png` when a CMP was found.

3. **Compact rules: include or skip?** The playwright bundle includes dynamic CMP detectors for the major providers (OneTrust, Cookiebot, TrustArc, Sourcepoint, Klaro, Admiral, etc. -- 15+ class-based detectors). The compact rules add hundreds more JSON-defined CMPs. For v1, the dynamic detectors alone may provide sufficient coverage. Adding compact rules is a latency/size trade-off that can be deferred.
