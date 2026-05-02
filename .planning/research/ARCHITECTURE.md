# Architecture Research — Capture Quality Push

**Domain:** Evidence-grade web capture (subsequent milestone for WRL)
**Researched:** 2026-04-30

## Existing WRL Capture Architecture (recap)

### Entry point & queue consumer

The capture pipeline starts at `src/index.js:handleCaptureMessage()` (~line 166). Queue messages arrive via `wrl-captures` (max_batch_size=1, max_retries=3, exponential backoff). The handler validates the message, checks idempotency against D1, then calls `performCapture()`.

### `src/capture.js:performCapture()`

~886 lines. The public API function orchestrates:

1. **Browser render** via `defaultRenderer()` — races against a 10-minute hard deadline
2. **Header fetch** via `captureHeaders()` — a parallel `fetch()` with `redirect:'manual'` (10s timeout)
3. **R2 artifact storage** — screenshot(s), rendered HTML, headers JSON
4. **WACZ bundling** (`src/wacz.js`) — `buildWarc()` → `buildCdxj()` → `datapackage.json` → Ed25519 sign → RFC 3161 TSA → ZIP
5. **D1 completion** via `completeCapture()`

### `defaultRenderer()` internal flow (the part #257 touches)

```
getOrCreateSession(env.BROWSER)          # CF session pool (acquire/connect)
  → orphan context cleanup
  → browser.newContext({ viewport 1280×720, deviceScaleFactor 4, serviceWorkers: 'block' })
  → context.route('**/*', ...)           # subresource count/size limits + cross-domain nav block
  → page.goto(url, { timeout: 20s, waitUntil: 'load' })
  → [on timeout: partial capture path — screenshot + HTML, no consent, no WACZ]
  → waitForSettle(page)                  # network quiescence: 500ms quiet within 3s cap
  → detectRenderFailure(page)            # Chrome error pages, blank pages
  → triggerLazyLoading(page)             # scroll + force loading="eager" + settle
  → page.screenshot({ fullPage, png })   # BEFORE consent
  → dismissCookieConsent(page)           # autoconsent inject, 2s timeout
  → page.screenshot(...)                 # AFTER consent (only if CMP dismissed)
  → page.content()                       # rendered HTML
  → context.close() + browser.close()    # cleanup
```

### Current gaps relevant to this milestone

- **No subresource capture**: WARC contains only HTML + screenshots. CSS/JS/images/fonts are NOT persisted. Offline replay is impossible.
- **Settle heuristic is one-size-fits-all**: 500ms quiescence within 3s cap. No awareness of font loads, pending XHR, or framework-specific signals.
- **Screenshot timing**: No `document.fonts.ready` gate. FOIT/FOUT can appear in screenshots.
- **Partial capture is minimal**: 120s budget after nav timeout, but no WACZ, no consent, limited metadata.
- **Bot-detection annotation**: `detectRenderFailure()` catches Chrome error pages but not Cloudflare/Akamai challenge pages.
- **Renderer is injectable** (via `renderer` parameter) but the abstraction is ad-hoc — no shared interface contract, no lifecycle hooks, no pipeline selection mechanism.

## Patterns from Peers

### Browsertrix-crawler

**Architecture**: TypeScript, Puppeteer-based, runs inside Docker with Redis for crawl state. The `Crawler` class (src/crawler.ts, ~3300 lines) is the orchestrator; it delegates to specialized utilities:

- **`Recorder`** (src/util/recorder.ts, ~2300 lines): The core subresource capture engine. Uses CDP `Fetch.requestPaused` (response stage) to intercept every network response, capture its body via `Fetch.takeResponseBodyAsStream`, and serialize it to WARC in real-time. Falls back to async node-level fetch for bodies it can't grab via CDP.
- **`Screenshots`** (src/util/screenshots.ts): Separate class with typed screenshot modes: `view` (viewport), `thumbnail` (resized), `fullPage`, `fullPageFinal` (after behaviors). Each writes to a dedicated WARC writer.
- **Behaviors** (browsertrix-behaviors, separate repo): Injected JS module (`behaviors.js`) with a registerable behavior system. Built-in behaviors handle autoscroll, autoplay, social media sites. Custom behaviors are user-loadable JS files with a standard interface: `init()`, `run()`, `done()`.

**Settle / page-load state machine**: Explicit `LoadState` enum:
```
FAILED = 0 → CONTENT_LOADED = 1 → FULL_PAGE_LOADED = 2 → EXTRACTION_DONE = 3 → BEHAVIORS_DONE = 4
```
Page loading proceeds through these states with time-bounded transitions. If `FULL_PAGE_LOADED` isn't reached within `pageLoadTimeout`, the crawler can still proceed to extraction if `CONTENT_LOADED` was reached (with behaviors skipped).

**Subresource capture**: CDP Fetch domain pauses every response at the network layer. For each paused response:
1. Check against skip rules (ad blocking, size limits, deduplication)
2. Capture body via `Fetch.takeResponseBodyAsStream` (streaming, memory-efficient)
3. Serialize to WARC record immediately
4. Resume the request to the browser via `Fetch.continueResponse`

This is the gold standard for high-fidelity subresource capture — it gets the actual bytes the browser received, including dynamically-loaded resources.

**Relevance to WRL**: The CDP Fetch approach is the ideal model for subresource capture. Key question is whether `@cloudflare/playwright` exposes CDP session access via `page.context().newCDPSession(page)`. CF announced full CDP support in April 2026, which is promising.

### ArchiveBox extractor model

**Architecture**: Python/Django, plugin-based. Each "extractor" is a separate subprocess that produces output files.

**Plugin contract**: ArchiveBox uses a hook-based event system. Plugins are directories containing scripts named `on_{EventFamily}__{order}_{name}.{ext}` (e.g., `on_Snapshot__15_singlefile.py`). Each plugin:
- Receives inputs via CLI arguments (`--url=...`, `--key=value`)
- Outputs JSONL records to stdout and files to `$PWD`
- Has standardized enable/disable (`{PLUGIN}_ENABLED`), timeout (`{PLUGIN}_TIMEOUT`), and binary (`{PLUGIN}_BINARY`) config keys
- Runs in numeric order; background hooks (`.bg.` suffix) run concurrently

**Plugin discovery**: `discover_hooks(event_name)` scans plugin directories for scripts matching the event prefix. Plugins can be filtered via a `PLUGINS` whitelist or individual `{PLUGIN}_ENABLED` flags.

**Relevance to WRL**: The ArchiveBox model is **too heavyweight** for WRL's Cloudflare Workers context (no subprocess spawning, no filesystem). But the config pattern — environment variable per-plugin with a master selector — maps well to how WRL should wire pipeline selection via `wrangler.toml` vars. The concept of extractors-as-ordered-stages is also relevant to structuring the render pipeline phases.

### Conifer / pywb capture-vs-replay separation

**Architecture**: pywb 2.x has three componentized pieces:
1. **Warcserver** — serves archived content from WARC files, handles index lookups (CDX/CDXJ)
2. **Recorder** — intercepts live web traffic via HTTP/S proxy, writes WARC records
3. **Rewriter** — transforms archived content for replay (URL rewriting, JS patching)

Each component can run independently and scale separately. Recording uses a transparent proxy with custom certificate authority.

**Key insight**: Capture and replay are fundamentally different concerns with different scaling profiles. pywb's clean separation means the recorder doesn't need to know about replay rewriting, and the rewriter doesn't need to know how capture happened.

**Relevance to WRL**: WRL already has this separation implicitly (capture.js produces artifacts, verify.js/verify-page.js consumes them), but the pipeline interface for #206 should formalize it. The output contract (WACZ blob + metadata) should be replay-agnostic — any pipeline that produces a valid WACZ can be consumed by the existing verification and diff systems.

### Subresource capture patterns (chrome-har, puppeteer-har, pagesource)

Three approaches exist for capturing subresources through a browser:

1. **CDP Network domain events** (chrome-har pattern):
   - Enable `Network.enable` on a CDP session
   - Listen for `Network.requestWillBeSent`, `Network.responseReceived`, `Network.loadingFinished`
   - Call `Network.getResponseBody` per request ID to get the body
   - **Pros**: Lightweight, doesn't interfere with browser loading. **Cons**: Response bodies are base64-encoded in memory; must call `getResponseBody` before the request is garbage-collected.

2. **CDP Fetch domain** (Browsertrix pattern):
   - Enable `Fetch.enable` with response-stage patterns
   - Intercept via `Fetch.requestPaused`, capture body via `Fetch.takeResponseBodyAsStream`
   - Resume with `Fetch.continueResponse`
   - **Pros**: Streaming, memory-efficient, captures everything. **Cons**: Adds latency to every request; complex error handling.

3. **Playwright route handlers** (current WRL approach for limiting):
   - Use `context.route('**/*', handler)` or `page.route()`
   - Can `route.fulfill()` or `route.continue()` but body interception is limited
   - **Pros**: Playwright-native API, simple. **Cons**: Cannot reliably capture response bodies via route handlers alone — `route.fetch()` re-fetches rather than capturing the original response.

**Recommendation for WRL subresource capture**:
- Use **CDP Network domain** (approach 1) as the primary mechanism, via `page.context().newCDPSession(page)`. This is less invasive than the Fetch domain approach and doesn't add request latency.
- Keep the existing `context.route()` for safety limits (subresource count, page size, cross-domain navigation blocking).
- Capture response bodies opportunistically — if `Network.getResponseBody` fails for a request (browser GC'd it), log it and move on. The capture is still valid with partial subresource coverage.

## Internal Structure Recommendations (#257 work)

### Settle heuristic refactor

The current `waitForSettle()` is a simple network quiescence detector (500ms quiet within 3s cap). This should be refactored into a multi-signal settle strategy:

```js
async function waitForSettle(page, options = {}) {
  const {
    maxMs = SETTLE_MAX_MS,           // hard cap (current: 3s, should be tunable)
    quiescenceMs = SETTLE_QUIESCENCE_MS, // idle window
    waitForFonts = true,             // NEW: document.fonts.ready gate
    ignoreTypes = new Set(['websocket', 'eventsource']), // current behavior
  } = options;

  // Phase 1: Network quiescence (existing logic)
  // Phase 2: Font readiness (NEW — addresses FOIT/FOUT)
  // Phase 3: Optional framework-specific signals (future: React hydration, etc.)
  
  return { settleMs, settleReason, pendingAtCap, fontsReady };
}
```

Key insight from Browsertrix: their LoadState enum (CONTENT_LOADED → FULL_PAGE_LOADED → EXTRACTION_DONE → BEHAVIORS_DONE) provides a state machine that degrades gracefully. WRL should adopt a similar model internally — the settle function should return which phases completed, not just idle/cap.

### Screenshot orchestration (sequencing, fonts.ready gating)

Current flow: scroll → screenshot-before → consent → screenshot-after.

Recommended improvement:
1. After `waitForSettle()`, gate on `document.fonts.ready` before any screenshot
2. Add a short compositor stabilization pause after scroll-to-top (currently 500ms, may need to be adaptive based on page height × deviceScaleFactor)
3. Record `render.fontsReady: true/false` in capture metadata so Coralogix can track font-related screenshot quality

```js
// Gate screenshots on font readiness
const fontsReady = await Promise.race([
  page.evaluate(() => document.fonts.ready.then(() => true)),
  new Promise(resolve => setTimeout(() => resolve(false), 2000)),
]);
```

### Subresource collector

For #257 Area 4, the collector needs to work within Cloudflare Browser Rendering constraints:

**Approach: CDP Network.enable + response body capture**

```js
// After context + page creation, before navigation
const cdp = await page.context().newCDPSession(page);
await cdp.send('Network.enable');

const subresources = new Map(); // url → { headers, body, mimeType, status }

cdp.on('Network.responseReceived', (params) => {
  const { requestId, response } = params;
  subresources.set(requestId, {
    url: response.url,
    status: response.status,
    mimeType: response.mimeType,
    headers: response.headers,
    requestId,
    bodyCollected: false,
  });
});

cdp.on('Network.loadingFinished', async (params) => {
  const entry = subresources.get(params.requestId);
  if (!entry || entry.bodyCollected) return;
  if (subresources.size > MAX_SUBRESOURCES) return;
  
  try {
    const { body, base64Encoded } = await cdp.send('Network.getResponseBody', {
      requestId: params.requestId,
    });
    entry.body = base64Encoded ? Uint8Array.from(atob(body), c => c.charCodeAt(0)) : new TextEncoder().encode(body);
    entry.bodyCollected = true;
  } catch {
    // Browser already GC'd this response — non-fatal
  }
});
```

**CF-specific gotchas**:
- `@cloudflare/playwright` CDP support: confirmed available since April 2026 changelog. Need to verify `newCDPSession()` is exposed on the CF-specific build.
- Memory pressure: response bodies accumulate in Worker memory. Apply per-resource size cap (e.g., skip bodies > 5MB) and aggregate cap matching `MAX_PAGE_BYTES`.
- Worker CPU time: 60s CPU limit. CDP event processing is I/O-bound (waiting on browser), but body decoding is CPU. Use streaming where possible.

**Fallback if CDP is unavailable**: Use `page.on('response', ...)` + `response.body()` to capture response bodies. This is the Playwright-native approach but re-fetches from cache rather than intercepting the original stream.

### Partial-capture metadata model

Current partial captures set `partial: true` and `render.timedOut: true`. Extend with a richer model:

```js
// render object for partial captures
{
  quality: 'partial',      // 'full' | 'partial' | 'degraded'
  reason: 'nav_timeout',   // 'nav_timeout' | 'bot_protection' | 'site_error' | 'resource_limit'
  readyState: 'interactive', // document.readyState at capture time
  contentReceived: true,    // did we get any response bytes?
  domLoaded: true,          // DOMContentLoaded fired?
  loadFired: false,         // load event fired?
  timedOut: true,
  stages: { ... },          // timing breakdown
  signals: {                // NEW: bot-protection / degradation signals
    challengePageDetected: false,
    accessDeniedDetected: false,
    captchaDetected: false,
  },
}
```

This enables #257 Area 5 (bot-protection annotation) and Area 6 (render-failure resilience) to enrich the metadata without changing the capture flow.

## Pluggable Pipeline Interface (#206) — Concrete Proposal

### Interface definition

```js
/**
 * @typedef {Object} CaptureInput
 * @property {string} url - Validated URL to capture
 * @property {string} captureId - Capture ID (cap_...)
 * @property {string} tenantId - Tenant identifier
 * @property {string} [ip] - Resolved IP (informational)
 * @property {string} [cip] - Hashed client IP
 * @property {number} attempt - Delivery attempt (1-based)
 * @property {boolean} [qualifiedTimestamps] - Request eIDAS timestamp
 * @property {number} [deadlineMs] - Wall-clock deadline for this capture
 */

/**
 * @typedef {'complete'|'partial'|'failed'} CaptureStatus
 */

/**
 * @typedef {Object} CaptureOutput
 * @property {CaptureStatus} status
 * @property {boolean} retryable - If failed, is the error retryable?
 * @property {string} [error] - User-safe error message (if failed)
 * @property {Object} [artifacts] - R2 key map { screenshot, screenshotBefore, html, headers }
 * @property {Object} [waczInfo] - { key, bundleHash, size, keyId, timestampStatus, qualifiedTimestampStatus }
 * @property {string} [renderQuality] - 'full' | 'partial'
 * @property {Object} [render] - Render metadata (stages, settle info, etc.)
 * @property {Object} [captureSettings] - Consent metadata, pipeline-specific settings
 * @property {number} [storedBytes] - Total bytes stored to R2
 */

/**
 * @typedef {Object} CapturePipeline
 * @property {string} name - Pipeline identifier (e.g., 'browser', 'fetch', 'remote')
 * @property {function(Object): Promise<boolean>} canHandle - Can this pipeline handle the given env/request?
 * @property {function(Object, CaptureInput): Promise<CaptureOutput>} capture - Execute the capture
 * @property {function(Object): Promise<void>} [init] - One-time pipeline initialization (optional)
 * @property {function(Object): Promise<void>} [cleanup] - Per-capture cleanup (optional)
 */
```

### Lifecycle

```
                    ┌─────────────────────────────────────┐
                    │  handleCaptureMessage() in index.js │
                    └───────────────────┬─────────────────┘
                                        ▼
                              resolvePipeline(env)
                              ┌─────────────────┐
                              │ env.CAPTURE_PIPELINE │
                              │ = 'browser' (default) │
                              └────────┬────────┘
                                       ▼
                            pipeline.canHandle(env, input)?
                            ┌──── yes ─────┐──── no ────┐
                            ▼              ▼            │
                     pipeline.capture()  fallback?    fail
                            │
                     ┌──────┴──────────┐
                     │  Pipeline impl  │
                     │  (browser, etc) │
                     │                 │
                     │  1. render      │
                     │  2. artifacts→R2│
                     │  3. WACZ bundle │
                     │  4. sign + TSA  │
                     └──────┬──────────┘
                            ▼
                     CaptureOutput
                            │
                     ┌──────┴──────────┐
                     │ completeCapture  │  ← orchestrator handles DB writes
                     │ or failCapture   │     regardless of which pipeline ran
                     └─────────────────┘
```

### Error model

Two error categories, matching the existing pattern:

- **Pipeline-recoverable** (`retryable: true`): session pool exhaustion, browser crash, navigation timeout, CDP disconnection. Queue message will be retried.
- **Fatal** (`retryable: false`): SSRF guard failure, content not target (render check), page size limit exceeded, non-retryable site issues.

The orchestrator (not the pipeline) owns `failCapture()` calls. Pipelines return `CaptureOutput` with status/retryable flags; the orchestrator decides whether to ack, retry, or DLQ.

### Selection mechanism

**Per-environment only** (this milestone — NOT per-tenant):

```toml
# wrangler.toml
[vars]
CAPTURE_PIPELINE = "browser"   # 'browser' | 'fetch' | 'remote' (future)

[env.staging.vars]
CAPTURE_PIPELINE = "browser"
```

Resolution in code:

```js
// src/pipeline.js (new file)
import { BrowserPipeline } from './pipelines/browser.js';
// import { FetchPipeline } from './pipelines/fetch.js';  // future

const PIPELINES = {
  browser: BrowserPipeline,
  // fetch: FetchPipeline,  // #143, when activated
};

/**
 * Resolve the active capture pipeline from environment config.
 * @param {Object} env
 * @returns {CapturePipeline}
 */
export function resolvePipeline(env) {
  const name = env.CAPTURE_PIPELINE || 'browser';
  const Pipeline = PIPELINES[name];
  if (!Pipeline) {
    throw new Error(`Unknown capture pipeline: ${name}`);
  }
  return Pipeline;
}
```

### How the EXISTING browser pipeline maps onto the interface

```js
// src/pipelines/browser.js
export const BrowserPipeline = {
  name: 'browser',

  async canHandle(env) {
    // Browser pipeline requires the BROWSER binding
    return !!env.BROWSER;
  },

  async capture(env, input) {
    // This is essentially the current performCapture() logic:
    // 1. defaultRenderer(env, input.url, input.captureId)
    // 2. captureHeaders(input.url)
    // 3. R2 artifact storage
    // 4. buildWacz(...)
    // 5. Return CaptureOutput
    //
    // The existing code moves here almost verbatim.
    // performCapture() becomes a thin orchestrator that calls
    // resolvePipeline() then pipeline.capture().
  },
};
```

The refactored `performCapture()` becomes ~30 lines:

```js
export async function performCapture(env, url, ip, captureId, tenantId, cip, renderer, attempt, qualifiedTimestamps) {
  const pipeline = resolvePipeline(env);
  const input = { url, captureId, tenantId, ip, cip, attempt, qualifiedTimestamps };
  
  if (!(await pipeline.canHandle(env, input))) {
    await failCapture(env.DB, captureId, `Pipeline '${pipeline.name}' cannot handle this environment`, false);
    return { ok: false, retryable: false };
  }

  const result = await pipeline.capture(env, input);
  
  // Orchestrator owns DB state transitions
  if (result.status === 'complete') {
    await completeCapture(env.DB, captureId, result.artifacts, result.waczInfo, result.renderQuality, result.render, result.captureSettings);
    return { ok: true, storedBytes: result.storedBytes, qualifiedTimestampStatus: result.waczInfo?.qualifiedTimestampStatus ?? 'skipped' };
  } else if (result.status === 'failed' && !result.retryable) {
    await failCapture(env.DB, captureId, result.error, false);
    return { ok: false, retryable: false };
  } else {
    return { ok: false, retryable: true, error: result.error };
  }
}
```

## Build Order Implications

### Recommended order with rationale

```
Phase 1: Pre-flight cleanup (3 surgical bug fixes)
    ↓
Phase 2: Capture quality audit (#257 prerequisite)
    ↓
Phase 3: #257 Area 3 — Screenshot quality + settle heuristic
    ↓     (fonts.ready gating, settle refactor, deviceScaleFactor evaluation)
    ↓     RATIONALE: Settle heuristic is the foundation that other areas depend on.
    ↓     Improving it first makes Areas 1, 4, 6 more effective.
    ↓
Phase 4: #257 Area 1 — Dynamic content handling
    ↓     (SPA detection, enhanced lazy-load, infinite-scroll cap)
    ↓     RATIONALE: Depends on improved settle heuristic from Area 3.
    ↓
Phase 5: #257 Area 6 — Render-failure resilience
    ↓     (partial-capture strategy, metadata enrichment)
    ↓     RATIONALE: Better partial capture before subresource work
    ↓     prevents subresource collection from making partial captures worse.
    ↓
Phase 6: #257 Area 5 — Bot-protection annotation
    ↓     (detectRenderFailure extensions, metadata-only)
    ↓     RATIONALE: Low-risk metadata enrichment; can land independently.
    ↓
Phase 7: #257 Area 2 — Cookie consent and overlay dismissal
    ↓     (autoconsent edge cases, enriched metadata)
    ↓     RATIONALE: Independent of other areas; consent has its own timeout budget.
    ↓
Phase 8: #257 Area 4 — WACZ subresource capture completeness
    ↓     (CDP Network domain integration, WARC expansion)
    ↓     RATIONALE: Last because it's the riskiest #257 change (new CDP dependency,
    ↓     memory pressure, WARC format changes). All other fidelity improvements
    ↓     should be stable before adding this complexity.
    ↓
Phase 9: #206 — Pluggable pipeline refactor
          RATIONALE: AFTER all #257 work. The abstraction is now informed by the
          actual shape of the improved browser pipeline. Extracting the interface
          from working code is far safer than designing it speculatively.
```

### Why #257 before #206

The current `defaultRenderer()` function will be substantially reshaped by #257 work (new settle logic, CDP integration, enhanced partial capture). If #206 lands first, every #257 change would need to respect the pipeline interface boundary — adding friction to each improvement. By landing #257 first:

1. The browser pipeline reaches its final shape
2. The interface extracted in #206 is informed by real code, not speculation
3. No rework — the interface is extracted once from stable code

### Exception: If #206 is trivial

If #206 turns out to be a mechanical refactor (just moving existing code behind an object literal with `name` and `capture` properties), it could land earlier without risk. The key is that #206 must not constrain #257 changes. If the pipeline interface is thin enough that #257 areas can modify the browser pipeline's internals without touching the interface, then ordering doesn't matter.

## Cloudflare Workers Constraints

### No Node.js APIs

WRL runs on V8 isolates with `nodejs_compat`. Available: `node:crypto`, `node:url`, `node:path`. NOT available: `fs`, `child_process`, `net`, `stream` (most of it). This rules out:
- Filesystem-based WARC writing (Browsertrix approach)
- Subprocess-based plugins (ArchiveBox approach)
- Streaming file I/O for large captures

### No streaming-write to local disk

All artifacts must be assembled in-memory then written to R2 in a single `PUT`. For subresource capture, this means:
- Response bodies accumulate in a `Map` during page load
- WARC is built from the map after navigation completes
- Memory budget: Worker default is 128MB. With `MAX_PAGE_BYTES: 50MB` and `MAX_SUBRESOURCES: 500`, the theoretical max is ~50MB of response bodies + ~50MB of overhead. In practice, most pages are <10MB total.
- Consider a per-resource body cap (e.g., skip bodies > 2MB) to bound worst-case memory.

### KV for hot metadata, D1 for queryable state

`KV` is used for rate-limit counters and ephemeral state. `D1` owns all capture metadata via `src/db.js`. The pipeline interface should NOT touch KV or D1 directly — the orchestrator (`performCapture`) handles state transitions.

### Worker CPU limits

Queue consumers get 60s CPU time (`[limits] cpu_ms = 60000`) but 15 minutes wall-clock. Browser rendering is mostly wall-clock (waiting for network, rendering). CPU-intensive operations:
- WACZ ZIP assembly (fflate)
- SHA-256 hashing of artifacts
- Response body base64 decoding (if using CDP Network.getResponseBody)
- Ed25519 signing

With subresource capture, the CPU budget becomes tighter. Profile actual CPU usage during the audit phase.

### Browser Rendering binding quirks

- **Session pool**: Paid plan = 2 concurrent browsers per account, 1 new instance per 10 seconds. Session reuse via `acquire/connect` is essential.
- **keep_alive**: 120s default. Sessions expire after inactivity. The `getOrCreateSession()` function handles this.
- **CDP support**: Announced April 2026. `@cloudflare/playwright` version `^1.1.2` may or may not expose `newCDPSession()`. **Must verify during Area 4 implementation.**
- **Memory**: Browser processes run in gVisor sandboxes. Large pages (many images, heavy JS) can cause OOM in the browser, which manifests as "Target closed" errors.
- **No download directory**: Browser can't write files to disk. All data must come through CDP or Playwright APIs.

## Open Questions

### Phase-level research needed

1. **CDP availability on CF**: Does `@cloudflare/playwright` v1.1.2 expose `page.context().newCDPSession(page)`? Does `Network.getResponseBody` work? This gates the subresource capture approach for Area 4.

2. **Memory budget for subresource capture**: What's the actual peak memory usage of the Worker when capturing a subresource-heavy page (e.g., news site with 200+ images)? Need profiling data from the audit phase.

3. **WACZ format impact of subresources**: Adding subresource WARC records changes the WACZ structure. Does `packages/verify/` need updates? Does the CDXJ index format change? How does this affect the bundleHash and therefore the signature chain?

4. **Settle heuristic tuning**: What quiescence window and max time produce the best tradeoff between capture quality and duration across the URL battery? This is an empirical question for the audit phase.

5. **Pipeline interface granularity**: Should the pipeline interface include lifecycle hooks (`init`, `cleanup`) or just a flat `capture()` function? The simpler version is easier to implement and sufficient for this milestone. Lifecycle hooks can be added when a second pipeline actually needs them.

6. **Consent enrichment vs. pipeline interface**: The enriched consent metadata (Area 2) includes `'no reject option'` and `'opt-out failed'` status values. These are browser-pipeline-specific. Should the pipeline interface define consent as part of `captureSettings`, or leave it pipeline-specific?

7. **Per-resource body size cap**: For subresource capture, should there be a per-resource cap (e.g., 2MB) in addition to the aggregate `MAX_PAGE_BYTES`? Large images and video segments could blow the memory budget.

8. **Partial capture + subresources**: Should partial captures (nav timeout) attempt subresource collection? The current partial path skips WACZ entirely. If subresources are available (some loaded before timeout), including them would improve partial capture quality but adds complexity.

9. **WACZ backwards compatibility**: Adding subresources to WARC changes the archive structure. Existing captures have only HTML + screenshots. The verify CLI and dashboard must handle both old and new formats gracefully.
