# Stack Research — Capture Quality Push

**Domain:** Evidence-grade web capture (subsequent milestone for WRL)
**Researched:** 2026-04-30
**Overall confidence:** MEDIUM — most recommendations are pattern-level (proven in Playwright/web-archiving ecosystems) but CF Browser Rendering imposes unique constraints that need integration testing.

## What's Locked (do not change)

| Component | Version | Notes |
|---|---|---|
| Cloudflare Workers runtime | compat date `2026-03-13`, `nodejs_compat` | Platform lock |
| `@cloudflare/playwright` | `^1.1.2` (latest: `1.3.0`, upstream PW `1.58.2`) | Consider upgrading to `1.3.0` but not re-evaluating |
| WACZ format | v1.1.1 | Spec lock (v1.2.0 exists but out of scope) |
| Ed25519 signing + RFC 3161 (Sectigo TSA) | — | Signing pipeline lock |
| `@duckduckgo/autoconsent` | `^14.75.0` (origin/main, PR #276) | Library lock (this milestone may bump further if upstream releases land) |
| `fflate` | `^0.8.2` | ZIP/WACZ bundling lock |
| Cloudflare Queues, R2, D1, KV | — | Infrastructure lock |
| `vitest` + `@cloudflare/vitest-pool-workers` | `3.2.4` / `0.12.21` | Test stack lock |
| Hand-rolled routing (no Hono) | — | Architecture lock |
| Custom WARC builder (`src/warc.js`) | — | Existing implementation lock |

## Recommendations by Improvement Area

### Area 1 — Dynamic content handling

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| `document.fonts.ready` gating before screenshot | Playwright built-in (PW 1.58.2) | Prevent FOIT/FOUT in screenshots | **HIGH** | ✅ Yes (page.evaluate) | PW already waits for fonts on `page.screenshot()` since PR #28226, but can hang on cross-frame fonts (PR #31295). Add explicit `page.evaluate(() => document.fonts.ready)` with a 3s timeout in `defaultRenderer()` before screenshot as defense-in-depth. |
| Custom SPA hydration detection via `page.waitForFunction` | Playwright API | Detect when client-rendered apps finish hydrating | **MEDIUM** | ✅ Yes | Check for framework markers (`__NEXT_DATA__`, `__NUXT__`, `window.__REMIX_CONTEXT`) + `document.readyState === 'complete'`. More reliable than `networkidle` for SPAs. Add as optional step after settle. |
| Enhanced `triggerLazyLoading`: `data-src` / `data-lazy` attribute triggers | Custom JS | Handle non-standard lazy-load patterns (lozad.js, lazysizes, custom IntersectionObserver) | **HIGH** | ✅ Yes | Current code only handles `loading="lazy"` → `"eager"` and `data-src`. Extend to common attrs: `data-lazy-src`, `data-original`, `data-bg`, `srcset` placeholders. |
| `waitForSettle` improvement: ignore `beacon`, `ping` resource types | Playwright API | Prevent analytics beacons from blocking settle | **HIGH** | ✅ Yes | Current code ignores `websocket` and `eventsource`. Add `beacon` and `ping` — these are fire-and-forget analytics that never resolve meaningfully. |
| Configurable settle quiescence window | Custom | Allow per-site tuning for known-slow sites | **LOW** | ✅ Yes | Current 500ms quiescence is good for most sites. Could expose as capture option but YAGNI for now. |
| Infinite scroll cap metric in render metadata | Custom | Report how many scroll iterations occurred and whether cap was hit | **HIGH** | ✅ Yes | Already partially implemented — `MAX_SCROLL_HEIGHT: 12000` exists. Add `scrollIterations` and `scrollCapHit` to render metadata for observability. |

**Anti-recommendations:**
- **`networkidle` / `networkidle2`**: Do NOT use. Playwright explicitly discourages it. Hangs on sites with persistent connections (analytics, WebSockets, SSE). WRL's custom `waitForSettle` is the right approach. PW issue #37080 requested `networkidle2` but was not implemented upstream.
- **`page.waitForTimeout(N)`**: Never use arbitrary sleeps. They're unreliable and add latency. Use condition-based waits.
- **MutationObserver-based DOM stability**: Over-engineered for this use case. The combination of `load` event + `waitForSettle` + `document.fonts.ready` covers the practical cases.

---

### Area 2 — Cookie consent / overlays

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| `@duckduckgo/autoconsent` upgrade | **already at `14.75.0` on origin/main**; npm latest verified 2026-04-30 = `14.75.0` | WRL has an automated update pipeline (Phase 0088, PR #229) that auto-bumps via PR. No manual upgrade needed for this milestone unless a specific newer release ships during the work. | **HIGH** | ✅ Yes (vendored) | Only viable library. Regular automated releases add 1-3 sites per release. **Original research draft incorrectly claimed `14.72.0` was latest based on training data despite an explicit instruction to verify live — patched 2026-04-30 after user catch.** |
| Enriched consent metadata schema | Custom | Distinguish `notDetected` / `noRejectOption` / `optOutFailed` / `timeout` / `dismissed` in captureSettings | **HIGH** | ✅ Yes | Current schema has `result: 'success'|'notDetected'|'failed'`. Extend with `noRejectOption` (CMP detected but no opt-out button — accept-only CMPs per #156). |
| Generic overlay dismissal heuristic | Custom JS | Dismiss non-CMP overlays: newsletter popups, age gates, notification prompts, login walls | **MEDIUM** | ✅ Yes | CSS heuristic: find elements with `position:fixed`, `z-index > 999`, covering >30% viewport. Look for close/dismiss buttons. Run AFTER autoconsent. Risk: false positives on sticky navbars — needs careful threshold tuning. |
| Paywall detection annotation | Custom JS | Detect (NOT bypass) soft/hard paywalls for metadata enrichment | **MEDIUM** | ✅ Yes | Check for common paywall indicators: `<meta name="robots" content="noindex">` + truncated content, `.paywall-overlay`, `data-paywall`, Piano/Tinypass/Zuora DOM elements. Annotate in `captureSettings.paywall` — no bypass. |
| `CONSENT_TIMEOUT_MS` increase | Config change | Current 2s timeout may be too short for heavy CMP frameworks (Sourcepoint, OneTrust with A/B testing) | **MEDIUM** | ✅ Yes | Increase to 3s. Sourcepoint's multi-iframe flow regularly exceeds 2s on first load. Budget allows it (current worst-case is ~30s, queue wall clock is 15 min). |

**Anti-recommendations:**
- **Consent-O-Matic** (browser extension): Only works as Chrome extension, not injectable. Not an alternative to autoconsent for server-side use.
- **Custom CMP rule engine**: Autoconsent's CSS selector + JS eval approach is battle-tested across 300+ CMPs. Building a parallel system would be pure duplication.
- **Bypassing accept-only CMPs**: Out of scope. If a CMP has no reject option, annotate it as `noRejectOption` and take the screenshot with the banner visible. Honesty over convenience.

---

### Area 3 — Screenshot quality / timing

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| Explicit `document.fonts.ready` with timeout before screenshot | Playwright API | Prevent FOUT in screenshots. PW auto-waits on `page.screenshot()` but can hang (issue #28995, #35972). | **HIGH** | ✅ Yes | Wrap in `Promise.race([page.evaluate(() => document.fonts.ready), timeout(3000)])`. If fonts don't load in 3s, proceed — better a FOUT screenshot than a hung capture. |
| Double-rAF after lazy image decode | Custom JS | Ensure lazy-loaded images are fully painted before screenshot | **MEDIUM** | ✅ Yes | After `triggerLazyLoading`, run `await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))`. Ensures layout reflow + paint for decoded images (per PW issue #19861). |
| Evaluate `deviceScaleFactor: 2` vs current `4` | Config analysis | `4x` produces 16x pixel count (5120×2880 for 1280×720 viewport). Massive memory and bandwidth cost. | **HIGH** | ✅ Yes | `2x` is standard retina. `4x` is print-quality — unlikely needed for evidence screenshots viewed on screen. Test: a 8000px tall page at 4x = 160M pixels = ~640MB uncompressed PNG working memory. Recommend defaulting to `2` with option to override. |
| `MAX_PAGE_HEIGHT` render metadata | Custom | Report when screenshot was capped and original page height | **HIGH** | ✅ Yes | Already capped at 8000px. Add `screenshotCapped: true, originalHeight: N` to render metadata so consumers know the screenshot is truncated. |
| Post-scroll compositor settle (current 500ms) | Custom | Allow GPU compositor to re-rasterize tiles after scroll-to-top | **MEDIUM** | ✅ Yes | Already implemented. 500ms is reasonable. Could be reduced to 300ms if testing shows tiles are ready sooner — monitor via Coralogix for blank-bottom-tile reports. |
| `PW_TEST_SCREENSHOT_NO_FONTS_READY` awareness | Playwright env | Emergency escape hatch if font-loading hangs | **MEDIUM** | ✅ Yes (env var) | Document as operational runbook item. If a specific URL consistently hangs on fonts, this env var disables the built-in font wait. |

**Anti-recommendations:**
- **`deviceScaleFactor: 1`**: Too low — evidence screenshots should be clearly readable. `2x` is the sweet spot.
- **JPEG screenshots**: PNG is correct for evidence capture — lossless, no compression artifacts. JPEG would save bandwidth but introduce artifacts that could be questioned in legal proceedings.
- **WebP/AVIF**: Broader compatibility concerns for evidence display. PNG is universally supported and lossless.

---

### Area 4 — WACZ subresource capture completeness

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| CDP `Network.getResponseBody` via Playwright route interception | Playwright API | Capture CSS, JS, images, fonts as WARC response records for offline replay | **MEDIUM** | ⚠️ Partially — `route.fulfill()` works but capturing response bodies requires `route.fetch()` + buffering, which increases memory | WRL already intercepts all requests via `context.route('**/*')`. Currently only counts them. Extend to buffer response bodies for key types (CSS, images, fonts). Main concern: memory budget within 50MB cap. |
| `warcio.js` (browser/lib bundle) | `2.4.10` (Feb 2026) | WARC record creation with proper headers, digest computation, gzip support | **MEDIUM** | ⚠️ Core lib (`src/lib/`) is Workers-compatible (uses Web Streams, TextEncoder, hash-wasm). Node-specific code (`src/node/`) uses `fs`/`tempy` — must import from `warcio/dist/index.all.js` or cherry-pick `src/lib/`. | Dependencies: `pako` (pure JS), `hash-wasm` (WASM — Workers supports WASM), `base32-encode` (pure JS), `uuid-random` (pure JS). No `node:fs` in core. But WRL already has a custom `src/warc.js` that works — extending it is simpler than importing warcio.js. |
| Extend existing `src/warc.js` with response records | Custom | Add WARC `response` records for intercepted subresources | **HIGH** | ✅ Yes | WRL's `buildWarc()` already constructs WARC records manually. Adding response records for CSS/images/fonts follows the same pattern. No new dependency needed. |
| Selective subresource capture (CSS + fonts + images only) | Custom | Capture resources needed for visual replay without bloating WACZ | **HIGH** | ✅ Yes | Don't capture all 500 subresources — filter by content-type: `text/css`, `font/*`, `image/*`. JS is optional (replay doesn't need it for visual fidelity). Dramatically reduces bundle size. |
| CDX index enhancement | Custom (`src/cdxj.js`) | Index subresource records in CDXJ for ReplayWeb.page compatibility | **HIGH** | ✅ Yes | Current CDXJ indexes only the HTML resource record. Extend to index all captured subresources. |

**Anti-recommendations:**
- **`@harvard-lil/js-wacz`** (`0.1.6`): Node-only. Uses Node.js `workers` (worker_threads) for parallel processing, requires Node 18+. NOT Workers-compatible. Last updated Mar 2025, limited maintenance.
- **`py-wacz`**: Python. Not applicable.
- **`warcio.js` as full replacement for `src/warc.js`**: Over-engineered. WRL's custom WARC builder is 200 lines, handles the exact records needed, and has no dependencies. `warcio.js` adds 1MB of bundle size for features WRL doesn't need (parsing, indexing, streaming replay). Keep the custom builder and extend it.
- **Full-page MHTML/SingleFile capture**: Different format, not WACZ-compatible. Would require a parallel output format.
- **Service Worker-based capture**: CF Browser Rendering blocks service workers via `serviceWorkers: 'block'` for isolation. Can't use this approach.

---

### Area 5 — Bot-protection annotation (NOT bypass)

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| Cloudflare challenge page detection | Custom JS (page.evaluate) | Detect `<div id="challenge-running">`, `<div id="challenge-form">`, `cf-mitigated` response header, `cf-chl-bypass` meta | **HIGH** | ✅ Yes | Most common bot protection. Distinctive DOM markers. Check in `detectRenderFailure()` — currently NOT detected (comment says "heuristics false-positive too easily"). Low false-positive risk with these specific selectors. |
| Akamai Bot Manager detection | Custom JS | Detect `_abck` cookie presence, "Access Denied" title + Akamai reference ID pattern, `akamai-grn` header | **MEDIUM** | ✅ Yes | Second most common. The "Reference #" error page is distinctive. Risk: "Access Denied" title can be legitimate site content — combine with header checks. |
| DataDome detection | Custom JS + headers | Detect `datadome` cookie, `x-datadome-cid` header, interstitial page with DataDome branding | **MEDIUM** | ✅ Yes | DataDome sets distinctive cookies and headers. Interstitial page has `geo.captcha-delivery.com` iframe. |
| PerimeterX/HUMAN detection | Custom JS + headers | Detect `_px*` cookies, `x-px-*` response headers, HUMAN interstitial page patterns | **MEDIUM** | ✅ Yes | `_pxhd`, `_pxvid` cookies are distinctive. Interstitial has PerimeterX/HUMAN branding in page source. |
| Generic CAPTCHA element detection | Custom JS | Detect reCAPTCHA (`g-recaptcha`), hCaptcha (`h-captcha`), Turnstile (`cf-turnstile`) iframes/divs | **HIGH** | ✅ Yes | Low false-positive — these are distinctive class names/IDs. Presence of CAPTCHA strongly suggests bot detection is active. |
| `render.botProtection` metadata field | Custom schema | Add structured annotation: `{ detected: boolean, signals: string[], provider: string|null }` | **HIGH** | ✅ Yes | Fits naturally in the existing `render` object returned by `defaultRenderer()`. Consumed by `completeCapture()` for DB storage. |

**Anti-recommendations:**
- **Bypass/stealth plugins** (`playwright-stealth`, `puppeteer-extra-plugin-stealth`): NEVER use. Violates ethical line. Also, CF Browser Rendering controls the browser fingerprint — can't modify navigator.webdriver, WebGL vendor, etc. from within the session.
- **User-Agent rotation**: WRL uses a fixed honest UA (`WRL/0.1`). Rotating UAs would be deceptive and undermine evidence-grade positioning.
- **Residential proxy routing**: Completely out of scope. CF Browser Rendering controls network egress.
- **TLS fingerprint modification**: Not possible within CF Browser Rendering's gVisor sandbox. JA3 fingerprint is controlled by CF infrastructure.

**Ethical boundary (restated for clarity):** The system MUST annotate what it observed, never attempt to circumvent protections. If bot protection is detected, the capture proceeds with whatever content was served (which may be a challenge page). The metadata records that fact. This preserves the evidentiary value — the record honestly shows what the bot saw.

---

### Area 6 — Render-failure resilience

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| Tri-state failure classification | Custom | Distinguish `slow` (timeout, some bytes received) / `blocked` (0 bytes, possible bot protection) / `broken` (Chromium error page, DNS failure) | **HIGH** | ✅ Yes | Currently partially implemented: `totalBytes === 0` check exists in nav timeout handler. Formalize into a `failureClass` field on render metadata. |
| `render.failureClass` + `render.failureSignals` metadata | Custom schema | Structured partial-capture metadata: `{ failureClass: 'slow'|'blocked'|'broken'|'limit_exceeded', signals: [...], partialReason: string }` | **HIGH** | ✅ Yes | No community standard exists (IIPC WARC rendered-targets spec only covers screenshots, not failure metadata). WRL should define its own schema. |
| Enhanced `waitForSettle` with XHR/fetch polling detection | Custom | Detect long-polling XHR/fetch requests that never complete (chat widgets, live data feeds) | **MEDIUM** | ✅ Yes | Currently ignores only `websocket` and `eventsource`. Some sites use XHR long-polling (request stays open 30s+). Add: if a request has been in-flight for >10s, reclassify it as "long-lived" and stop counting it toward settle. |
| `PARTIAL_BUDGET_MS` increase to 120s (already done) | Config | Current value already `120000` | **HIGH** | ✅ Yes | Already set. Verify that the 10-min RENDER_DEADLINE_MS provides adequate headroom. ✅ It does: 20s nav + 120s partial = 140s, well within 600s. |
| Partial capture WACZ bundling | Custom | Currently WACZ is skipped for partial captures. Consider bundling partial WACZs with `renderQuality: 'partial'` in datapackage.json | **MEDIUM** | ✅ Yes | A signed partial capture is more valuable than an unsigned one. Mark clearly in metadata. Requires extending `buildWacz()` to accept a `partial: true` flag. |
| Response body sampling for failure diagnosis | Custom | On timeout/failure, capture the first 1KB of response body as diagnostic artifact | **LOW** | ✅ Yes | Could help distinguish between "slow but loading" and "served error page". Privacy concern: first 1KB could contain PII. Consider only for non-HTML responses or only capturing response headers. |
| Browser crash detection + recovery | Playwright API | Detect `page crashed` / `Target closed` errors and annotate accordingly | **HIGH** | ✅ Yes | Already handled in `categorizeError()` — these are retryable. But metadata should distinguish browser crash from site-caused failure for Coralogix analysis. |

**Anti-recommendations:**
- **Retry with different browser settings on failure**: Adds complexity, doubles browser-hour costs. If the site blocks headless browsers, a second attempt with slightly different settings won't help.
- **External render failure databases**: No community-maintained database of sites that block headless browsers exists. Site-specific workarounds would be a maintenance burden.
- **WebDriver BiDi protocol**: Not supported by CF Browser Rendering. Stick with CDP via Playwright.

---

### #206 — Pluggable pipeline patterns

| Technology / Pattern | Version | Purpose | Confidence | CF-Workers compatible? | Why over alternatives |
|---|---|---|---|---|---|
| **Strategy pattern with interface contract** | Custom | `Pipeline = { name, capture(url, options) → { wacz, metadata, status } }` | **HIGH** | ✅ Yes | Simplest pattern that satisfies the requirement. No framework needed. |
| Environment-based pipeline selection | `wrangler.toml` vars | `CAPTURE_PIPELINE = 'browser'` (default). Future: `'fetch'` for #143 when activated. | **HIGH** | ✅ Yes | Config-driven, no code changes to add a pipeline. `wrangler.toml` already has per-env vars. |
| Pipeline registry (object map) | Custom | `{ browser: BrowserPipeline, fetch: FetchPipeline }` — lookup by name at capture time | **HIGH** | ✅ Yes | Browsertrix-crawler uses a similar pattern: crawl config → page worker selection. Simple, no dynamic imports needed. |

**Reference architectures studied:**

1. **Browsertrix-crawler** (webrecorder, TypeScript, AGPL-3.0, 1004★): Docker-based. Uses Puppeteer + CDP for WARC capture. Architecture: `Crawler` → `PageWorker` (per-tab) → `Recorder` (CDP-based WARC writer) → WACZ assembly. The `Recorder` intercepts all network via CDP `Fetch.requestPaused` + `Network.responseReceived`, writes WARC records streaming. **Key insight:** capture and WARC writing are tightly coupled via CDP events. WRL's route-interception approach is analogous. **Not directly portable** (Docker, Puppeteer, Node.js).

2. **ArchiveBox** (Python/Django, MIT, 23K★): Plugin/hook architecture. Extractors run as separate processes with priority ordering (00-99). Each extractor produces specific artifacts (screenshot, PDF, HTML, WARC). Hooks communicate via JSONL stdout. **Key insight:** language-agnostic hook interface — any executable can be an extractor. **Not applicable to Workers** (process-based), but the interface contract idea is sound: `{ input: URL+options, output: artifacts+metadata }`.

3. **Conifer/pywb** (Python, AGPL, 2.1K★): Clean separation between capture (man-in-the-middle recording proxy) and replay (URL rewriting engine). Capture produces WARC files; replay is a separate system that reads them. **Key insight:** capture and replay are independent subsystems with WARC as the interchange format. WRL already follows this pattern (capture → WACZ → verify/replay).

**Recommended interface contract:**

```javascript
/**
 * @typedef {Object} PipelineResult
 * @property {Uint8Array|null} waczBytes - Signed WACZ bundle (null if signing unavailable)
 * @property {string} waczHash - SHA-256 of WACZ
 * @property {Object} metadata - Pipeline-specific metadata (render timings, consent, etc.)
 * @property {'complete'|'partial'|'failed'} status
 * @property {string} renderQuality - 'full' | 'partial'
 * @property {Object} artifacts - R2 keys for individual artifacts
 * @property {Object|null} captureSettings - Consent/capture configuration metadata
 */

/**
 * @typedef {Object} Pipeline
 * @property {string} name - Pipeline identifier
 * @property {function(env, url, captureId, tenantId, options): Promise<PipelineResult>} capture
 */
```

**Anti-recommendations:**
- **Dynamic `import()` for pipeline loading**: Workers bundle at deploy time. Dynamic imports from R2 or KV would add latency and complexity. Use static registration.
- **RPC-based pipeline delegation** (calling another Worker): Adds latency, error surface, and deployment complexity. Pipelines should be functions within the same Worker.
- **Plugin marketplace / user-uploaded pipelines**: Security nightmare in an evidence-grade product. Pipelines are operator-configured, not tenant-configured.
- **Per-tenant pipeline selection** (this milestone): Explicitly out of scope per PROJECT.md. Environment-level only.

---

## Cross-Cutting Notes

### CF Browser Rendering quirks worth knowing

- **Session pool: 120 concurrent browsers (paid plan), 1 new instance/second.** WRL's `getOrCreateSession()` with `keep_alive: 120000` (2 min) is well-optimized. The random free-session selection distributes load.
- **No max session duration** as long as activity continues — sessions stay open indefinitely if commands are sent within the keep_alive window.
- **60s inactivity timeout by default**, extendable to 10 min via `keep_alive`. WRL uses 2 min, which is generous for single-page captures.
- **Browser close reasons**: `NormalClosure` (explicit `browser.close()`) vs `BrowserIdle` (timeout). WRL should log which reason applies for cost optimization.
- **`@cloudflare/playwright` v1.3.0** (2026-04-15) replaced chunked CDP protocol with plain CDP, added `lab` option for `WorkersLaunchOptions`. WRL is on `^1.1.2` — update to `^1.3.0` is low-risk (semver minor) and may fix edge-case CDP chunking issues.
- **Renamed to "Browser Run"** in docs (April 2026) but the binding name is still `BROWSER` and `@cloudflare/playwright` package name unchanged. No code changes needed.
- **gVisor sandbox**: Fingerprint (navigator.webdriver, WebGL, Canvas) is controlled by CF infrastructure. Cannot be modified to evade bot detection — which aligns with WRL's ethical stance.

### Playwright API gotchas

- **`page.screenshot()` font hang**: Since PW 1.42+, screenshots auto-wait for `document.fonts.ready`. This can hang indefinitely on sites that load fonts from unreachable CDNs or cross-origin iframes (issues #28995, #35972). The `PW_TEST_SCREENSHOT_NO_FONTS_READY=1` env var is an escape hatch, but better to explicitly gate with a timeout.
- **`waitUntil: 'networkidle'`**: Officially discouraged by Playwright team. Hangs on sites with persistent connections. WRL's decision to use `'load'` + custom settle is correct.
- **`route.continue()` doesn't expose response body**: To capture subresource bodies, need `route.fetch()` (makes a real request and returns the response for inspection), then `route.fulfill()` with the response. This doubles the work but is the only Playwright-native way.
- **`deviceScaleFactor` can't be changed mid-context**: Must be set at `browser.newContext()` time. To test different scales, need different contexts (and therefore different captures).
- **`page.screenshot({ fullPage: true })` at high `deviceScaleFactor`**: A 8000px page at 4x = 32000px rendered height. Chromium's max texture size is typically 16384px on most GPUs — but CF Browser Rendering runs headless with software rendering, so the limit may be different. Test empirically.

### Affecting multiple areas

- **Memory budget**: Areas 3 (screenshot quality) and 4 (subresource capture) both increase memory usage. `deviceScaleFactor: 4` with subresource buffering could exceed Worker memory limits (128MB). Reducing to `2x` and selective subresource capture helps.
- **Capture duration**: Areas 1 (dynamic content), 2 (consent), and 4 (subresources) all add time. Current worst-case is ~30s. With subresource capture + SPA detection, could reach 45-60s. Well within 10-min render deadline and 15-min queue wall clock.
- **WACZ bundle size**: Area 4 (subresources) directly increases bundle size. Current `MAX_PAGE_BYTES: 50MB` is the safety valve. With selective capture (CSS + fonts + images), typical bundles should stay under 10MB.
- **Coralogix observability**: All areas produce new metadata fields. Ensure Coralogix alerts are updated to monitor new signals (`botProtection.detected`, `failureClass`, `screenshotCapped`, etc.).

## Open Questions

1. **warcio.js in Workers**: Core library appears Workers-compatible (no `node:fs` in `src/lib/`), but `hash-wasm` uses WASM. Workers support WASM, but has anyone actually tested `warcio.js` in a CF Worker? No public evidence found. **Likely moot** — extending WRL's existing `src/warc.js` is the recommended path anyway.

2. **`deviceScaleFactor: 4` memory ceiling**: What is the actual memory usage of a full-page screenshot at 4x for a typical 4000px page in CF Browser Rendering? Need empirical data from Coralogix to decide between 2x and 4x default. If browser crashes correlate with tall pages, 2x is the answer.

3. **Subresource capture via `route.fetch()`**: Does `route.fetch()` work correctly in `@cloudflare/playwright` (CF's Playwright fork)? It's a standard Playwright API, but CF's fork modifies the CDP transport. Needs integration test.

4. **`@cloudflare/playwright` v1.3.0 `lab` option**: What does the new `lab` option do? The release note mentions it but no docs found. May be relevant for testing new Browser Run features.

5. **Partial WACZ signing**: If we sign partial captures as WACZ, do we need to clearly mark them in `datapackage.json` to prevent a partial capture from being presented as a full one in court? Likely yes — add `renderQuality: 'partial'` and `partialReason` to the datapackage metadata.

6. **Autoconsent upgrades**: WRL already runs the auto-update pipeline. The risk is upstream rule-format changes during the milestone window — the existing `vendor-autoconsent.js` + CI workflow handles regeneration, so this is monitor-not-block.

7. **Generic overlay dismissal false positives**: The CSS heuristic for non-CMP overlays (`position:fixed, z-index > 999, >30% viewport`) will false-positive on sticky navigation bars, floating chat widgets, and cookie banners that autoconsent already handles. Needs careful sequencing: autoconsent first, then generic overlay check only if autoconsent found nothing.

8. **Bot-protection detection accuracy**: How reliably can we detect Akamai Bot Manager vs. a legitimate "Access Denied" page? Need a test battery of known-protected sites to measure false positive/negative rates.
