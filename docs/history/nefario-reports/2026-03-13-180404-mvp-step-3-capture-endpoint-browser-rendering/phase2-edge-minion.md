# Domain Plan Contribution: edge-minion

## Recommendations

### 1. Puppeteer API Sequence for Cloudflare Browser Rendering

The `@cloudflare/puppeteer` package is a fork of Puppeteer v22.13.1 patched to
connect to Cloudflare's Browser Rendering infrastructure via the `env.BROWSER`
binding. The API sequence differs from standard Puppeteer in how the browser is
launched, but the page-level APIs are standard Puppeteer.

**Correct launch sequence:**

```js
import puppeteer from '@cloudflare/puppeteer';

// Launch -- pass the env binding directly, not a config object
const browser = await puppeteer.launch(env.BROWSER);

// Create incognito context for isolation
const context = await browser.createBrowserContext();

try {
  const page = await context.newPage();

  // Set viewport explicitly (security-minion also flagged this)
  await page.setViewport({ width: 1280, height: 720 });

  // Enable request interception BEFORE navigation
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    // Enforcement logic here (see Recommendation 2)
    req.continue();
  });

  // Navigate with explicit timeout and wait condition
  await page.goto(url, {
    timeout: 30000,
    waitUntil: 'networkidle2',  // allows 2 lingering connections (analytics, websockets)
  });

  // Capture screenshot -- full-page PNG
  const screenshot = await page.screenshot({
    fullPage: true,
    type: 'png',
  });

  // Capture rendered HTML (post-JS execution DOM)
  const html = await page.content();

} finally {
  // ALWAYS destroy context, even on error
  await context.close();
  await browser.close();
}
```

**Cloudflare-specific constraints vs standard Puppeteer:**

- **Launch takes a binding, not options.** `puppeteer.launch(env.BROWSER)` --
  not `puppeteer.launch({ headless: true })`. The binding handles all browser
  instance management.
- **No filesystem access.** Screenshots return `Buffer`/`Uint8Array` only; the
  `path` option on `page.screenshot()` is not available.
- **XPath selectors are blocked** due to Workers runtime security constraints.
  Not relevant to our use case, but worth noting.
- **`nodejs_compat` compatibility flag required.** Already present in
  `wrangler.toml`.
- **Compatibility date must be >= 2025-09-15.** Current config has 2026-03-13,
  which satisfies this.
- **Session reuse is recommended by Cloudflare** (use `browser.disconnect()`
  instead of `browser.close()` to keep the session alive for reuse). However,
  for this use case we need strict per-capture isolation, so we should call
  `browser.close()` to terminate the session fully. Session reuse would share
  the same browser process across captures, which conflicts with the isolation
  requirement.

**Why `createBrowserContext()` instead of `browser.newPage()` directly:**

The default browser context shares cookies, localStorage, and cache across all
pages. An incognito `BrowserContext` isolates these per-context. Since we
process untrusted URLs, a malicious page could plant cookies or cache entries
that affect subsequent captures if we reuse the default context. Even though we
close the browser after each capture (no session reuse), using
`createBrowserContext()` is defense-in-depth: if the close fails or the code
is later refactored to reuse sessions, isolation is maintained.

### 2. Enforcing 50MB Page Limit and 200 Subresource Cap

Cloudflare Browser Rendering does **not** provide built-in configuration for
page size limits or subresource caps. These must be enforced via Puppeteer's
request interception API.

**Implementation approach -- request interception with counters:**

```js
let totalBytes = 0;
let subresourceCount = 0;
const MAX_PAGE_BYTES = 50 * 1024 * 1024;  // 50MB
const MAX_SUBRESOURCES = 200;
let limitExceeded = null;

await page.setRequestInterception(true);

page.on('request', (req) => {
  subresourceCount++;
  if (subresourceCount > MAX_SUBRESOURCES) {
    limitExceeded = `Subresource limit exceeded: ${subresourceCount} > ${MAX_SUBRESOURCES}`;
    req.abort('blockedbyclient');
    return;
  }
  req.continue();
});

page.on('response', (resp) => {
  const contentLength = resp.headers()['content-length'];
  if (contentLength) {
    totalBytes += parseInt(contentLength, 10);
  }
  if (totalBytes > MAX_PAGE_BYTES) {
    limitExceeded = `Page size limit exceeded: ${totalBytes} > ${MAX_PAGE_BYTES}`;
    // Cannot abort retroactively, but the request interception
    // handler will block subsequent requests
  }
});
```

**Important caveats:**

- **Content-Length is not always present.** Chunked responses and streaming
  responses omit it. For more accurate byte tracking, use `response.buffer()`
  on each response, but this is expensive (buffers every response in Worker
  memory). For MVP, Content-Length-based tracking is a reasonable approximation.
  The 50MB limit is a safety rail, not a billing boundary -- approximate
  enforcement is acceptable.

- **The first request (the navigation itself) counts as subresource #1.** The
  200-subresource cap includes the main document. This is the correct behavior
  -- a page that triggers 200 additional requests beyond the document would be
  400+ total requests, which is excessive.

- **Aborting requests mid-page may produce incomplete screenshots.** If we hit
  the subresource cap at request #201, the page will render with missing images,
  CSS, or scripts. The screenshot will still be captured -- it will just reflect
  the partially-loaded state. This is acceptable for the safety limit use case.
  The alternative (navigate, check, abort entire capture) would require loading
  the full page first to know the count, defeating the purpose of the limit.

- **Combine with security-minion's request interception** (blocking navigation
  to non-original-domain URLs, re-checking `isPrivateIP`). The `request` event
  handler should chain both concerns: first check the safety limits, then check
  the security constraints. A single `page.on('request', ...)` handler handles
  both.

### 3. DNS-Pinned Fetch for HTTP Response Headers

**Workers cannot fetch bare IP addresses.** This is a hard platform constraint.
`fetch('https://1.2.3.4/path')` returns "Error 1003: Direct IP access not
allowed." This eliminates the DNS-pinning approach where you replace the
hostname with the resolved IP and set the `Host` header.

The `resolveOverride` cf option exists but requires both the URL host and the
override host to be within your Cloudflare zone -- it cannot point to an
arbitrary external IP.

**I agree with security-minion's revised recommendation (their Risk 6):**

Use the original validated URL as-is for the Workers `fetch` call. Accept the
TOCTOU gap on the header-fetch leg (it is identical to the Browser Rendering
TOCTOU gap). Address both gaps together when the backlog item is tackled.

**The fetch call should be:**

```js
const headerResponse = await fetch(validated.url, {
  method: 'GET',
  redirect: 'manual',    // capture redirects, don't follow
  signal: AbortSignal.timeout(10000),  // 10s timeout, separate from browser
  headers: {
    'User-Agent': 'WRL/0.1 (Web Resource Ledger; +https://wrl.example.com)',
  },
});
```

**Key decisions:**

- **`redirect: 'manual'`** -- captures the redirect response as-is, preventing
  the fetch from following to an unvalidated URL. The 3xx status code and
  `Location` header become part of the captured HTTP headers, which is exactly
  what we want to record.

- **`AbortSignal.timeout(10000)`** -- 10-second timeout for the header fetch.
  This is separate from the 30-second browser navigation timeout. The header
  fetch is a simple HTTP GET; it should not need 30 seconds. If it times out,
  the capture can still succeed with a note that header capture failed, or it
  can fail entirely (decision for the implementation).

- **Custom User-Agent** -- identifies the service. Some servers block requests
  with no User-Agent or with the default Workers User-Agent.

- **Do NOT set `cf.cacheTtl` or `cf.cacheEverything`** on this fetch. We want
  the live response headers, not a cached version. Workers subrequests go
  through the Cloudflare cache by default. Add `cf: { cacheTtl: 0 }` or a
  `Cache-Control: no-cache` request header to bypass the cache.

**Revised fetch with cache bypass:**

```js
const headerResponse = await fetch(validated.url, {
  method: 'GET',
  redirect: 'manual',
  signal: AbortSignal.timeout(10000),
  headers: {
    'User-Agent': 'WRL/0.1 (Web Resource Ledger; +https://wrl.example.com)',
    'Cache-Control': 'no-cache',
  },
  cf: { cacheTtl: 0 },
});
```

### 4. Rate Limiting Configuration

Cloudflare Workers provides a Rate Limiting binding API configured in
`wrangler.toml`. This is the correct approach for the ~10/min per-IP limit.

**wrangler.toml addition:**

```toml
[[ratelimits]]
name = "CAPTURE_RATE_LIMITER"
namespace_id = "1001"

  [ratelimits.simple]
  limit = 10
  period = 60
```

**Usage in Worker code:**

```js
const { success } = await env.CAPTURE_RATE_LIMITER.limit({
  key: request.headers.get('CF-Connecting-IP') || 'unknown',
});

if (!success) {
  return problemResponse(429, 'Rate limit exceeded. Try again later.', {
    'Retry-After': '60',
  });
}
```

**Important constraints:**

- **`period` must be 10 or 60** -- these are the only allowed values. For ~10
  captures per minute, `period: 60` and `limit: 10` is the correct config.

- **Rate limiting is per Cloudflare location (colo), not global.** A user
  routed to the Frankfurt colo gets 10/min at Frankfurt. If they later hit the
  London colo (due to routing changes), they get a fresh 10/min quota there.
  This is fine for abuse prevention but does not provide exact global limiting.
  For MVP, per-colo limiting is sufficient.

- **Cloudflare recommends against IP-based keys** because IP addresses can be
  shared (NAT, mobile networks, privacy proxies). For MVP with a single API
  key, the API key itself is the natural rate limit key. However, the task spec
  says "per IP," so using `CF-Connecting-IP` is acceptable for now. When
  per-tenant API keys are added (backlog [must]), switch the rate limit key to
  the API key or tenant ID.

- **The `namespace_id` is an arbitrary positive integer** you choose -- it is
  not a Cloudflare account resource that needs to be created externally. Use
  `"1001"` or any unique string.

**Concurrency limiting (~3 concurrent per IP) is NOT available via the rate
limiting binding.** The binding tracks request counts over time, not concurrent
in-flight requests. To enforce concurrency:

**Option A: Skip concurrency limiting for MVP.** The rate limit of 10/min
combined with browser rendering's platform limits (30 concurrent sessions on
paid plan, 3 on free) effectively caps concurrency. If a user fires 10
requests in quick succession, they all pass the rate limiter, but browser
rendering's own limits will queue or reject excess sessions. This is the
pragmatic MVP approach.

**Option B: Track concurrency in KV.** Increment a per-IP counter in KV before
starting a capture, decrement after completion. Check the counter before
proceeding. Problems: KV is eventually consistent, so the counter races under
concurrent writes. A capture that crashes without decrementing leaks a
"slot" until TTL expiry. Adds complexity for marginal benefit.

**Option C: Use Durable Objects for concurrency tracking.** A Durable Object
per IP could track concurrent captures with strong consistency. But this
requires adding a DO binding and class for a single counter, which is
over-engineered for MVP.

**Recommendation: Option A.** Rely on the rate limiter (10/min) and browser
rendering's platform limits for concurrency. Document that the "~3 concurrent
per IP" requirement is approximated by platform constraints, not enforced
explicitly. Revisit when abuse patterns emerge.

### 5. ctx.waitUntil() Execution Time Limits -- CRITICAL FINDING

**`ctx.waitUntil()` has a hard 30-second limit after the response is sent.**

This is the most significant constraint for the proposed architecture. The
Worker's lifetime extends for up to 30 seconds after the response is returned
or the client disconnects. All `waitUntil()` promises share this 30-second
budget. If any promises have not settled within 30 seconds, they are cancelled
with a logged warning.

**Browser Rendering timing budget:**

A typical capture involves:
- Browser launch: 1-5 seconds (cold start)
- Page navigation + load: 5-30 seconds (depending on page complexity)
- Screenshot capture: 1-5 seconds
- HTML extraction: <1 second
- Header fetch: 1-10 seconds (concurrent with browser)
- KV status writes: <1 second

**Total: 8-51 seconds in the worst case.**

This means **a complex page will exceed the 30-second `ctx.waitUntil()` budget.**
The browser might still be navigating when the Worker terminates the promise.

**Mitigation options, in order of preference:**

**Option 1: Process synchronously, not via `ctx.waitUntil()`.** Instead of
returning 202 immediately and processing in the background, process the capture
in the foreground. The Worker keeps the HTTP connection open until the capture
completes, then returns the result. This avoids the 30-second `waitUntil`
limit because the Worker stays alive as long as the client connection is open
(no enforced wall-clock limit while the client is connected).

**However, this changes the API contract** from async (202 + polling) to sync
(200 after completion). The task spec explicitly requires 202 + KV status
tracking. This option should only be considered if the architecture team
decides the async pattern is not feasible.

**Option 2: Use the synchronous processing internally but keep the async API
surface.** Return the 202 response body synchronously but delay actually
sending the response until the capture completes. This is a hack -- the
HTTP connection stays open for 30+ seconds, the client sees a slow 202, and
the "async" benefit (fast response, poll later) is lost.

**Option 3: Use a Queue consumer for capture processing.** This is Cloudflare's
recommended pattern for long-running background work that exceeds `waitUntil`.
The architecture becomes:

```
POST /v1/captures
  -> validate URL, write pending to KV
  -> enqueue capture job to Queue
  -> return 202

Queue consumer (separate or same Worker)
  -> dequeue job
  -> launch browser, capture screenshot + HTML + headers
  -> write complete/failed to KV
  -> store artifacts in R2
```

Queue consumers have a **15-minute wall-clock limit** per batch, which is more
than sufficient for browser rendering. The `max_batch_timeout` can be set to
60 seconds to respect browser rendering's rate limits.

**wrangler.toml additions for Queue:**

```toml
[[queues.producers]]
queue = "wrl-captures"
binding = "CAPTURE_QUEUE"

[[queues.consumers]]
queue = "wrl-captures"
max_batch_timeout = 30
max_retries = 1
dead_letter_queue = "wrl-captures-dlq"
```

**Option 4: Use a Durable Object for capture processing.** The DO receives the
capture request via its `fetch()` method, performs the browser rendering, and
updates KV. DOs have a 15-minute wall-clock limit per alarm and can maintain
browser sessions across requests.

**wrangler.toml additions for DO:**

```toml
[[durable_objects.bindings]]
name = "CAPTURE_WORKER"
class_name = "CaptureWorker"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["CaptureWorker"]
```

**Recommendation: Attempt `ctx.waitUntil()` first with the 30-second browser
timeout and tight page constraints. Fall back to Queue if captures reliably
time out.**

Here is the reasoning:

The 30-second browser navigation timeout (`page.goto({ timeout: 30000 })`)
means the browser leg alone can consume the entire `waitUntil` budget. But the
`waitUntil` timer starts when the response is sent, and the response is sent
very quickly (after URL validation and KV write). The actual sequence is:

1. Validate URL + write KV pending + return 202: ~100-200ms
2. `waitUntil` timer starts: 30 seconds available
3. Launch browser + navigate + capture: 8-35 seconds

If the navigation timeout is 30 seconds, and the browser launch takes 1-5
seconds, the total could be 31-35 seconds -- just over the budget. **Reduce
the browser navigation timeout to 25 seconds** to leave headroom for launch,
screenshot, and KV writes:

```js
await page.goto(url, { timeout: 25000, waitUntil: 'networkidle2' });
```

This gives 5 seconds for browser launch + screenshot + HTML + KV writes after
the 25-second navigation completes. Tight but feasible for most pages.

**If this proves unreliable in practice** (captures of slow pages consistently
get cancelled), escalate to the Queue architecture (Option 3). The Queue
approach is strictly better for reliability but adds infrastructure complexity
(queue binding, consumer handler, dead-letter queue, error handling for
dequeue failures). For MVP ("add when it hurts"), starting with `waitUntil`
and a 25-second navigation timeout is the YAGNI-compliant path.

**Document this constraint explicitly** in the evolution log. The 30-second
`waitUntil` limit is a known platform constraint that may force an
architecture change.

### 6. Additional Edge-Specific Recommendations

#### @cloudflare/puppeteer dependency

The project needs to add `@cloudflare/puppeteer` as a dependency:

```
npm install @cloudflare/puppeteer
```

This is a runtime dependency (not devDependency) because it runs inside the
Worker. Check the current latest version -- as of the research, it is v1.0.4
based on Puppeteer v22.13.1.

#### Browser Rendering billing

Browser Rendering is usage-based on the paid plan. Each browser session
consumes "browser hours." The free plan has 10 minutes/day of browser time.
For development and testing, the free plan may be sufficient. For production,
the paid plan provides 30 concurrent sessions and 30 new instances per minute.
Ensure the project account is on the appropriate plan before deploying.

On the free plan, the limits are:
- 3 concurrent browsers
- 3 new instances per minute
- 60-second browser timeout
- 10 minutes of browser time per day

The 10-minute daily limit means roughly 20-40 captures per day on the free
plan (at 15-30 seconds per capture). This is sufficient for MVP development
but not for any real usage.

#### Screenshot size considerations

Full-page screenshots of long pages can produce very large PNGs. A page that
scrolls to 10,000px height at 1280px width produces a ~50MB+ PNG. This is
both a storage concern (R2 put size) and a memory concern (Worker memory
limit is 128MB).

**Recommendation:** Set a maximum viewport height for full-page screenshots:

```js
// After navigation, check page height
const pageHeight = await page.evaluate(() => document.body.scrollHeight);
const maxHeight = 8000; // cap at ~8000px
if (pageHeight > maxHeight) {
  await page.setViewport({ width: 1280, height: maxHeight });
}
const screenshot = await page.screenshot({ fullPage: true, type: 'png' });
```

Alternatively, use `clip` to capture only the first N pixels of height. This
prevents runaway memory usage from extremely long pages.

#### networkidle2 vs networkidle0

The navigation `waitUntil` option matters:

- **`networkidle0`**: waits until zero network connections for 500ms. Maximizes
  rendered content but waits longer. Pages with analytics pings or websockets
  may never reach idle0.
- **`networkidle2`**: waits until 2 or fewer connections for 500ms. Practical
  for most pages. Analytics connections and keep-alive websockets are tolerated.
- **`domcontentloaded`** (default): fires before JS rendering completes. Too
  early for SPA/CSR pages.

**Recommendation:** Use `networkidle2`. It balances completeness with
reliability. Pages that never reach idle (streaming, websocket-heavy) will
still complete within the timeout.


## Proposed Tasks

### Task E1: Add @cloudflare/puppeteer dependency

**What:** Install the Cloudflare Puppeteer fork and verify it works with the
existing vitest/miniflare setup.

**Deliverables:**
- `npm install @cloudflare/puppeteer`
- Verify `vitest.config.js` browser rendering mock binding still works
- Smoke test: import puppeteer, launch, close in a test

**Dependencies:** None. First task to execute.

### Task E2: Implement browser rendering capture module

**What:** Create `src/capture-browser.js` (or similar) that encapsulates the
full browser rendering lifecycle: launch, incognito context, request
interception (subresource cap + page size limit + security checks), navigation,
screenshot, HTML extraction, context/browser cleanup.

**Deliverables:**
- Export an async function like `capturePage(env, url, options)` that returns
  `{ screenshot: Uint8Array, html: string }` on success or throws on failure
- Incognito context per call with `try/finally` destruction
- Request interception combining:
  - Subresource count enforcement (200 max)
  - Page size tracking (50MB max, via Content-Length approximation)
  - Security checks (block non-original-domain navigations, re-check
    `isPrivateIP` on new hostnames -- from security-minion Task S3)
- Explicit viewport (1280x720)
- Navigation timeout of 25 seconds (leaving 5s headroom in waitUntil budget)
- `waitUntil: 'networkidle2'`
- Full-page PNG screenshot with height cap (8000px)
- `page.content()` for rendered HTML
- Error categorization (timeout, size limit, subresource limit, navigation
  failure) with descriptive messages for KV status

**Dependencies:** Task E1 (puppeteer dependency), security-minion's
`isPrivateIP` export from `src/url-validation.js`

### Task E3: Implement HTTP header capture via Workers fetch

**What:** Create a function that fetches the target URL via Workers `fetch()`
to capture HTTP response headers. Uses the original validated URL (not
DNS-pinned IP -- see Recommendation 3).

**Deliverables:**
- Export an async function like `captureHeaders(url)` that returns an object
  with status code, status text, and response headers (as a plain object)
- `redirect: 'manual'` -- captures redirect responses as-is
- `AbortSignal.timeout(10000)` -- 10-second timeout
- Cache bypass (`cf: { cacheTtl: 0 }`)
- Custom User-Agent identifying WRL
- Error handling: timeout, network error, DNS failure all produce a
  descriptive error string
- Headers redacted: strip `Set-Cookie` values (privacy), keep header names

**Dependencies:** `validateUrl` result providing the URL

### Task E4: Wire capture processing into ctx.waitUntil()

**What:** In the POST handler, after returning 202, use `ctx.waitUntil()` to
run the browser rendering and header capture concurrently, then update KV
status to `complete` or `failed`.

**Deliverables:**
- `ctx.waitUntil(captureJob)` call in POST handler
- `captureJob` function that:
  1. Runs browser capture (Task E2) and header capture (Task E3) concurrently
     via `Promise.allSettled()`
  2. On success: writes `{ status: 'complete' }` to KV (and stores artifacts
     when R2 storage is wired in Step 4)
  3. On failure: writes `{ status: 'failed', detail: '<error message>' }` to KV
  4. Has a top-level try/catch that ensures KV is always updated (never leaves
     a capture stuck in `pending`)
- Temporary artifact storage: for this step (before Step 4 adds R2), captured
  data can be discarded after KV status is updated -- or stored in KV as a
  stopgap (KV value limit is 25MB, which may not fit large screenshots)

**Dependencies:** Tasks E2, E3, KV data model from data-minion

### Task E5: Configure rate limiting binding

**What:** Add the rate limiting binding to `wrangler.toml` and implement the
rate check in the capture endpoint handler.

**Deliverables:**
- `wrangler.toml` addition: `[[ratelimits]]` section with 10/min limit
- Rate check at the top of the POST handler (after auth, before URL validation)
- 429 response with `Retry-After: 60` header via `problemResponse()`
- Add `429` to the titles map in `responses.js`
- Test: verify rate limit key, verify 429 response shape

**Dependencies:** None (parallel with other tasks). Requires wrangler >= 4.36.0
(currently 4.73.0, so satisfied).

### Task E6: Document ctx.waitUntil constraint in evolution log

**What:** Write a decisions.md entry documenting the 30-second `waitUntil`
limit, the 25-second navigation timeout trade-off, and the Queue fallback
path if captures prove unreliable.

**Deliverables:**
- Entry in `docs/evolution/NNNN-capture-endpoint/decisions.md`
- Cover: the constraint, why `waitUntil` was chosen over Queue for MVP,
  the reduced 25s navigation timeout, what signals would trigger escalation
  to Queue architecture, and the alternative architectures evaluated

**Dependencies:** None.


## Risks and Concerns

### RISK 1: 30-second ctx.waitUntil() limit (HIGH -- architectural constraint)

The 30-second background processing limit is tight for browser rendering.
A slow page that takes 25 seconds to load leaves only 5 seconds for browser
launch, screenshot, HTML extraction, header fetch, and KV writes. If browser
cold-start takes 3-5 seconds, the budget is blown.

**Mitigation:** 25-second navigation timeout + concurrent header fetch.
**Escalation:** Queue architecture (adds `[[queues.producers]]` and
`[[queues.consumers]]` to wrangler.toml, a queue handler export, and
dead-letter queue for failed captures). The code structure should be modular
enough that switching from `ctx.waitUntil(captureJob())` to
`env.CAPTURE_QUEUE.send(captureJob)` is a minimal change.

### RISK 2: Workers cannot fetch bare IP addresses (MEDIUM -- affects DNS pinning)

Cloudflare Workers block `fetch()` to bare IP addresses ("Error 1003: Direct
IP access not allowed"). The `resolveOverride` cf option only works for
hostnames within your Cloudflare zone. This means the DNS-pinned fetch
approach described in the original task spec **cannot work as written**.

**Mitigation:** Use the original validated URL for the header fetch. Accept the
TOCTOU gap (identical to the Browser Rendering gap). security-minion concurs
with this approach (their Risk 6, revised recommendation).

### RISK 3: Free plan browser rendering limits (MEDIUM -- development constraint)

The free plan allows only 10 minutes of browser time per day, 3 concurrent
sessions, and 3 new instances per minute. During active development with
integration tests, this budget can be consumed quickly.

**Mitigation:** Structure tests so browser rendering is mockable. Unit tests
should not launch real browsers. Integration tests that need browsers should
be run sparingly or on the paid plan. The existing `miniflare.browserRendering`
config in vitest.config.js provides a mock binding for tests.

### RISK 4: Large screenshot memory pressure (LOW-MEDIUM)

Full-page screenshots of long pages can exceed Worker memory limits (128MB).
A 1280x10000px PNG at 32-bit color is ~50MB uncompressed before PNG
compression.

**Mitigation:** Cap page height at 8000px for screenshots. Monitor memory
usage in testing with representative pages.

### RISK 5: Browser launch cold start variability (LOW)

Browser launch time on Cloudflare's infrastructure varies. Cold starts can
take 1-5 seconds. This eats into the 30-second `waitUntil` budget.

**Mitigation:** The 25-second navigation timeout accounts for up to 5 seconds
of overhead. If cold starts prove consistently long, consider Durable Objects
for session reuse (at the cost of per-capture isolation).

### RISK 6: Rate limiting is per-colo, not global (LOW)

The rate limiting binding enforces limits per Cloudflare location. A
distributed attacker hitting multiple colos could exceed the intended global
rate. For MVP with a single API key, this is low risk -- the attacker would
need the API key first.

**Mitigation:** Accept per-colo limiting for MVP. The API key is the primary
abuse gate, not the rate limiter. When per-tenant keys are added, rate limit
by tenant ID (globally unique) instead of IP.

### RISK 7: Request interception overhead (LOW)

Adding a `page.on('request', ...)` handler to every request adds per-request
JavaScript overhead inside the browser context. For a page with 200
subresources, this is 200 synchronous handler invocations. The overhead is
negligible compared to network I/O but should be kept minimal (no async
operations in the handler, no complex string manipulation).

**Mitigation:** Keep the handler lightweight. Simple counter increment, IP
check only on cross-origin requests.


## Additional Agents Needed

None. The current team covers the necessary domains:

- **security-minion** already addressed browser isolation, DNS pinning, and
  auth concerns. Their revised DNS pinning recommendation (Risk 6: use original
  URL, accept TOCTOU gap) aligns with the Workers platform constraint I
  identified.
- **data-minion** is handling KV data model decisions.
- **api-design-minion** has defined the response contracts.
- **test-minion** is handling test strategy.

One note for **test-minion**: the browser rendering capture module (Task E2)
should be structured with dependency injection so that `puppeteer.launch` can
be replaced with a mock in unit tests. The `miniflare.browserRendering` mock
in vitest.config.js may not provide a full Puppeteer-compatible mock -- verify
this during test planning. If it does not, the capture module should accept a
`launchBrowser` function parameter that defaults to
`(binding) => puppeteer.launch(binding)` in production and is replaced with a
stub in tests.
