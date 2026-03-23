# IAC Minion Advisory: NAV_TIMEOUT_MS Constraints and Fallback Feasibility

## Question 1: Is the 30s ctx.waitUntil() Limit Truly Hard?

**Yes. The 30s wall-clock limit for `ctx.waitUntil()` is hard on all Workers
plans, including paid.** It is not configurable per-worker, per-account, or
per-plan. Cloudflare's documentation states it "delay[s] cancellation for
another 30 seconds or until the promise you pass to waitUntil() completes."
After 30 seconds, unsettled promises are cancelled.

### What About CPU Time?

Workers paid plans support up to **5 minutes of CPU time** per invocation
(configurable in wrangler.toml). This is distinct from wall-clock time and
does not help here -- the capture pipeline is I/O-bound (waiting on page
load, network requests), not CPU-bound. The 30s constraint is wall-clock,
not CPU.

### Can It Be Extended Via Request?

Cloudflare offers a "Limit Increase Request Form" for certain limits. The
documentation does not list `waitUntil` as a limit that can be raised. Based
on how Workers are architecturally designed (isolate model, co-tenancy on
edge nodes), this limit exists to protect the platform, not just the user.
It is unlikely to be raised for individual accounts.

### Bottom Line

The 30s wall clock is the hard ceiling for the current `ctx.waitUntil()`
architecture. The 25s `NAV_TIMEOUT_MS` leaves exactly 5s of headroom for
post-navigation work (screenshot, content extraction, R2 uploads, WACZ
bundling, KV update). This is the constraint that must be designed around.


## Question 2: Does Playwright's Page Survive a TimeoutError from page.goto()?

**Yes. The page object remains usable after a `TimeoutError` from
`page.goto()`.** This is the critical finding that makes the staged fallback
approach viable.

### How Playwright TimeoutError Works

When `page.goto(url, { timeout: 25000, waitUntil: 'networkidle' })` times
out, Playwright throws a `TimeoutError`. This error means "the *wait
condition* was not satisfied within the timeout" -- it does NOT mean "the
page is dead" or "the browser crashed." The page has been loading for the
full 25 seconds; it just did not reach the `networkidle` state (defined as
no more than 0 network connections for at least 500ms).

After catching the `TimeoutError`:

- **`page.screenshot()` works** -- captures whatever the page looks like at
  the moment of timeout. The page has been rendering for 25s; for most heavy
  sites, the visual content is substantially complete.
- **`page.content()` works** -- returns the current DOM serialization. Again,
  for a page that has been loading for 25s, this typically contains the
  meaningful content even if background analytics/tracking scripts are still
  firing.
- **`page.evaluate()` works** -- you can run arbitrary JS to check
  `document.readyState`, measure `document.body.scrollHeight`, etc.

### What Would Kill the Page

The page becomes unusable only if:
- The browser process crashes (`page crashed`, `Target closed`)
- The browser session is disconnected (`browser has been closed`)
- The context is explicitly closed

A `TimeoutError` from `page.goto()` is none of these. The current
`categorizeError()` function correctly distinguishes these cases (lines
364-396).

### Evidence From Playwright Community

The pattern of catching `TimeoutError` and then calling `page.screenshot()`
is well-established in the Playwright ecosystem. It is commonly used for
error-state screenshots in test frameworks. The Playwright documentation does
not explicitly state "the page survives a timeout" but the API design implies
it -- `TimeoutError` is a recoverable error, not a fatal one.

### Cloudflare-Specific Consideration

`@cloudflare/playwright` is a fork of upstream Playwright adapted for the
Workers Browser Rendering environment. The fork's modifications focus on
session management (`acquire`, `connect`, `sessions`, `limits`) and
transport -- not on error semantics. There is no evidence that the fork
changes `TimeoutError` behavior. The page lifecycle within a
`BrowserContext` follows standard Playwright semantics.

### Recommendation

Before committing to the staged fallback in production, **validate this
assumption with a targeted test**: deploy a Worker that navigates to a known
slow page, catches the `TimeoutError`, and then calls `page.screenshot()`
and `page.content()`. Verify that both succeed and produce meaningful
content. This costs minutes to build and eliminates the last remaining
uncertainty.


## Question 3: Realistic Time Budget Breakdown

The 30s `ctx.waitUntil()` budget breaks down as follows for the current
pipeline:

```
Phase                              Estimated Time
--------------------------------------------------
getOrCreateSession()               200-800ms (session list + connect/acquire)
browser.contexts() orphan cleanup  ~50ms
browser.newContext()                ~100ms
context.route() setup              ~50ms
context.newPage()                  ~100ms
page.goto() [NAV_TIMEOUT_MS]       UP TO 25,000ms
page.evaluate() (scrollHeight)     ~50ms
page.screenshot()                  200-2,000ms (depends on page size/height)
page.content()                     50-200ms
context.close()                    ~100ms
browser.close()                    ~50ms
--------------------------------------------------
Subtotal (browser phase)           ~26,000-28,500ms

captureHeaders() [concurrent]      UP TO 10,000ms (runs in parallel)

R2 puts (3x parallel)             100-500ms
WACZ bundling                     200-800ms (SHA-256 hashing, ZIP, signing)
R2 put (WACZ)                     100-300ms
KV update (completeCapture)       50-200ms
Coralogix log                     50-200ms
--------------------------------------------------
Post-browser total                 500-2,000ms
```

### The Headroom Problem

If `page.goto()` actually hits the full 25s timeout:

- Browser setup overhead before goto: ~500ms
- Navigation timeout: 25,000ms
- Screenshot + content + context close: ~500-2,500ms
- Post-browser work (R2 + WACZ + KV): ~500-2,000ms

**Worst case total: ~28,500ms.** That leaves only **1.5s of margin** before
the 30s wall clock kills everything.

If the screenshot is of a tall page (up to `MAX_PAGE_HEIGHT = 8000px`),
screenshot time could push to 2s+. If WACZ bundling runs and the WARC is
large (close to `MAX_PAGE_BYTES = 50MB`), SHA-256 hashing adds meaningful
time.

### Current Design's Hidden Safety

The current code does not attempt partial capture. When `page.goto()` throws
`TimeoutError`, the entire `renderResult` is rejected at line 102, and
`failCapture` is called. `failCapture` is a single KV write (~50-200ms).
So when the timeout fires at 25s, the total runtime is ~25.5-26s. That is
well within the 30s budget.

**The staged fallback changes this calculus.** If we catch the timeout and
proceed with screenshot + content + R2 + WACZ + KV, we are now using the
full 28-29s. The margin shrinks to <2s.

### Risk Mitigation for the Staged Fallback

If the staged fallback is implemented:

1. **Skip WACZ bundling on timeout captures.** WACZ is the most expensive
   post-capture step (WARC construction, multiple SHA-256 passes, ZIP
   assembly, Ed25519 signing, R2 upload). Skipping it saves 300-1,100ms.
   A degraded capture without WACZ is still useful evidence -- the
   screenshot and HTML are the primary artifacts for most use cases.

2. **Reduce NAV_TIMEOUT_MS for the fallback path.** If the page has already
   loaded (DOM complete, visible content rendered), 25s of network idle
   waiting is not needed. After catching the timeout, the remaining work
   should target completion in <3s.

3. **Set explicit timeouts on post-timeout operations.** Pass a short
   timeout to `page.screenshot()` (e.g., 3000ms) and `page.content()`
   (e.g., 1000ms). If these operations also timeout (which would indicate
   the page is truly broken), fail the capture rather than risking the
   30s wall clock.

4. **Track remaining budget explicitly.** Add a `const deadline = start +
   28000;` check after each post-timeout step. If `Date.now() > deadline`,
   abort and fail the capture. The 2s margin is for context cleanup and KV
   error reporting -- those must always succeed.


## Question 4: Should We Consider Cloudflare Queues?

**Yes, but as a separate architectural evolution (backlog item R16), not as
a replacement for the staged fallback.**

### Queues + Browser Rendering: Proven Pattern

Cloudflare has an official tutorial demonstrating Queues consumers that use
the Browser Rendering binding. The architecture is:

1. HTTP handler receives capture request, writes pending KV record, enqueues
   message to Queue, returns 202
2. Queue consumer receives message, acquires browser session, performs capture
3. Consumer has **15 minutes wall-clock time** and up to **5 minutes CPU time**

This is the same pattern WRL already uses (`ctx.waitUntil()`) but with 30x
more wall-clock budget. The `wrangler.toml` configuration is straightforward:

```toml
[[queues.producers]]
queue = "wrl-captures"
binding = "CAPTURE_QUEUE"

[[queues.consumers]]
queue = "wrl-captures"
max_batch_size = 1
max_batch_timeout = 30

[browser]
binding = "BROWSER"
```

### What Queues Would Solve

- **The 30s wall-clock constraint disappears.** With 15 minutes of wall time,
  `NAV_TIMEOUT_MS` could be set to 60s (Browser Rendering's maximum page
  load timeout) with abundant headroom for WACZ bundling and R2 uploads.
- **Heavy pages that genuinely need networkidle would succeed.** No fallback
  needed for most cases.
- **Retry semantics are built in.** Queues support automatic retries with
  configurable delays and dead-letter queues -- more robust than the current
  `retryable: true` flag that depends on the caller to retry.

### What Queues Would NOT Solve

- **Pages that truly never reach networkidle.** Some pages have perpetual
  network activity (WebSocket connections, polling, streaming analytics).
  The staged fallback is still needed for these, regardless of timeout
  budget.
- **Cold start latency for the first capture.** Queue consumers have their
  own cold start overhead, and browser session acquisition time remains the
  same.

### Why Not Queues Now?

The backlog item R16 (Queue migration) has an activation trigger of "when
timeouts >5%." The staged fallback is the right immediate response because:

1. **It solves the symptom now** without architectural change.
2. **It produces data** (timeout rate, degraded capture rate, time budget
   distribution) that informs the Queue migration decision.
3. **Queue migration is a larger change** involving the entire request
   lifecycle, error handling, retry semantics, and observability pipeline.
   It deserves its own planning cycle.
4. **The staged fallback remains valuable even after Queue migration** -- it
   handles the "never reaches networkidle" class of pages that no amount of
   timeout budget fixes.

### Queues Constraints to Note

- **Message size: 128 KB.** The capture request payload (URL, captureId,
  tenantId) is tiny. No issue.
- **Consumer concurrency: 250 max (push-based).** WRL's current global
  capture limit is 200/minute. No issue.
- **Batching interaction with Browser Rendering.** Browser Rendering limits
  new browser instances to **30/minute on paid plan**. Queue consumer batch
  size and concurrency must be tuned to stay within this. The Cloudflare
  tutorial uses `max_batch_timeout: 60` specifically to respect the
  2/minute limit on free plans.


## Observability Recommendations

Regardless of which path is chosen, the following metrics should be tracked
to inform the R16 activation decision:

1. **Timeout rate**: percentage of captures that hit `NAV_TIMEOUT_MS`.
   Current categorization already identifies these (`error.name ===
   'TimeoutError'`). Track this as a Coralogix metric.

2. **Degraded capture rate** (if fallback is implemented): percentage of
   captures that succeed via the fallback path. Log as a distinct event
   (e.g., `capture.degraded`) with the `waitUntil` state at timeout.

3. **Time budget distribution**: log `Date.now() - start` at each phase
   boundary (browser acquisition, navigation, screenshot, R2 upload, WACZ
   bundling). This reveals where the 30s budget is actually spent.

4. **Post-timeout artifact quality**: for degraded captures, log
   `document.readyState` at the moment of timeout (via `page.evaluate()`).
   This indicates whether the page reached `interactive` or `complete`
   before the timeout fired.

5. **R16 activation metric**: track the 7-day rolling timeout rate. When it
   crosses 5%, alert that Queue migration should be evaluated.


## Summary of Findings

| Question | Answer |
|----------|--------|
| Is 30s ctx.waitUntil hard? | **Yes.** Not configurable, not extendable via plan upgrade. |
| Can Queues bypass it? | **Yes.** Queue consumers get 15 min wall clock. Proven with Browser Rendering. |
| Does Playwright page survive TimeoutError? | **Yes.** page.screenshot() and page.content() work after timeout. Validate with a targeted test before production. |
| Headroom after 25s timeout? | **~1.5-4.5s** depending on page complexity. Tight but workable if WACZ is skipped on timeout path. |
| Should we use Queues now? | **Not yet.** Staged fallback is the right immediate response. Queues are the right medium-term evolution (R16). |

## Recommended Approach

1. **Implement staged fallback now**: catch `TimeoutError`, capture screenshot
   + HTML from the partially-loaded page, skip WACZ bundling on timeout path,
   mark the capture with render quality metadata.

2. **Guard the time budget**: enforce an explicit deadline (28s from start)
   with short timeouts on post-navigation operations. If screenshot or
   content extraction fails within the budget, fail the capture cleanly.

3. **Instrument for R16**: add observability for timeout rate, degraded
   capture rate, and time budget distribution. When the 7-day timeout rate
   crosses 5%, activate Queue migration planning.

4. **Validate the critical assumption**: before production rollout, deploy a
   test Worker that navigates to a slow page, catches `TimeoutError`, and
   verifies that `page.screenshot()` and `page.content()` produce meaningful
   artifacts on `@cloudflare/playwright` specifically.

## Sources

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare Workers Context (ctx)](https://developers.cloudflare.com/workers/runtime-apis/context/)
- [Cloudflare Browser Rendering Limits](https://developers.cloudflare.com/browser-rendering/limits/)
- [Cloudflare Browser Rendering Timeouts](https://developers.cloudflare.com/browser-rendering/reference/timeouts/)
- [Cloudflare Queues Limits](https://developers.cloudflare.com/queues/platform/limits/)
- [Cloudflare Queues + Browser Rendering Tutorial](https://developers.cloudflare.com/queues/tutorials/web-crawler-with-browser-rendering/)
- [Playwright page.goto() API](https://playwright.dev/docs/api/class-page#page-goto)
- [Workers 5-minute CPU time changelog](https://developers.cloudflare.com/changelog/post/2025-03-25-higher-cpu-limits/)
