# Edge Minion -- Browser Session Reuse with Playwright Migration

## Executive Summary

The Cloudflare Browser Rendering platform provides a well-defined session reuse
API for `@cloudflare/playwright` that is architecturally different from the
Puppeteer pattern. Playwright introduces `acquire()` and `connect()` as
first-class primitives for session lifecycle management, with `browser.close()`
on a connected session acting as a disconnect (not a termination). The 30-session
paid-plan limit is the hard ceiling; the 30-new-instances-per-minute rate limit
is the throughput gate. Achieving ~300 captures/min requires keeping sessions
alive and routing captures through them serially or via browser context isolation,
not by launching new browsers.

---

## Question-by-Question Analysis

### (a) browser.disconnect() vs browser.close() in @cloudflare/playwright

**Key difference from Puppeteer:** In Playwright, the semantics depend on how the
browser was obtained:

- **`launch()` + `browser.close()`**: Terminates the browser session entirely.
  The session is destroyed and cannot be reconnected to. This is what the current
  `defaultRenderer` does via `@cloudflare/puppeteer`.

- **`connect()` + `browser.close()`**: Disconnects the Worker from the session
  but the session stays alive. The session becomes "free" (no `connectionId`) and
  is available for other Workers to connect to. This is the session reuse path.

There is **no separate `browser.disconnect()`** method in the Playwright API the
way there is in Puppeteer. Instead, `browser.close()` is overloaded based on the
connection type. This is a critical migration detail -- the code pattern changes
from Puppeteer's explicit `disconnect()` vs `close()` to Playwright's implicit
behavior based on `launch()` vs `connect()`.

**Implication for implementation:** The renderer must use `connect()` (not
`launch()`) for session reuse. When using `connect()`, calling `browser.close()`
in the `finally` block is correct and will disconnect without killing the session.

### (b) keep_alive semantics on browser launch/acquire

`keep_alive` is an **inactivity timeout** in milliseconds, not a maximum session
duration. Key facts:

| Parameter | Value |
|-----------|-------|
| Default inactivity timeout | 60 seconds |
| Maximum configurable via keep_alive | 600,000 ms (10 minutes) |
| Maximum session lifetime | Unbounded (as long as session stays active) |
| When it resets | Every command sent to the browser resets the idle timer |

`keep_alive` is set at session creation time:

```js
import { launch } from '@cloudflare/playwright';

// Creates a session that stays alive for 10 min of inactivity
const browser = await launch(env.BROWSER, { keep_alive: 600000 });
```

Or with `acquire()`:

```js
import { acquire, connect } from '@cloudflare/playwright';

const { sessionId } = await acquire(env.BROWSER, { keep_alive: 600000 });
const browser = await connect(env.BROWSER, sessionId);
```

**Critical insight for throughput target:** At ~300 captures/min (5 per second),
each session would handle a capture roughly every 1-6 seconds depending on how
many sessions are active. This is well within the default 60-second timeout. A
`keep_alive` of 60000-120000 ms (1-2 minutes) is sufficient and avoids holding
idle sessions unnecessarily. Use 600000 ms only if traffic is bursty with long
gaps.

**Session garbage collection:** Cloudflare automatically closes sessions that
exceed the inactivity timeout. Close reasons observable via `history()` include
`BrowserIdle` (idle timeout), `NormalClosure` (explicit close), `BrowserCrash`,
`ConnectionError`, and `Eviction` (platform resource pressure). Sessions are not
immune to eviction even within the keep_alive window.

### (c) Session discovery -- listing active/idle sessions and reconnecting

Playwright exposes three session management functions as top-level imports:

```js
import { sessions, history, limits } from '@cloudflare/playwright';
```

**`sessions(env.BROWSER)`** -- Returns array of currently running sessions:

```js
const active = await sessions(env.BROWSER);
// Each element: { sessionId: string, connectionId?: string, startTime: string }
```

- Sessions **with** a `connectionId` have an active Worker connected -- unavailable.
- Sessions **without** a `connectionId` are idle/free -- available for `connect()`.

**`history(env.BROWSER)`** -- Returns recent sessions (open and closed):

```js
const recent = await history(env.BROWSER);
// Includes: sessionId, startTime, endTime, closeReason, closeReasonText
```

Useful for diagnostics, not for session acquisition.

**`limits(env.BROWSER)`** -- Returns current account limits and usage:

```js
const info = await limits(env.BROWSER);
// { activeSessions, maxConcurrentSessions,
//   allowedBrowserAcquisitions, timeUntilNextAllowedBrowserAcquisition }
```

This is essential for the acquisition decision: check
`allowedBrowserAcquisitions > 0` before calling `acquire()` to avoid hitting the
30-per-minute rate limit.

**Recommended acquisition flow:**

```
1. Call sessions(env.BROWSER)
2. Filter to free sessions (no connectionId)
3. If free sessions exist:
   a. Pick one (random or round-robin)
   b. Try connect(env.BROWSER, sessionId) in try/catch
   c. On failure (session died or was claimed by another worker), fall through
4. If no free sessions or connect failed:
   a. Check limits(env.BROWSER).allowedBrowserAcquisitions > 0
   b. If allowed: acquire(env.BROWSER, { keep_alive }) to create new session
   c. If not allowed: queue/retry after timeUntilNextAllowedBrowserAcquisition
5. connect(env.BROWSER, sessionId) with the acquired or found session
```

### (d) Contention -- multiple Workers racing for the same session

**Platform guarantee:** While a connection is active (session has a `connectionId`),
no other Worker can connect to that session. Cloudflare enforces this server-side.

**Race window:** Between calling `sessions()` (which shows a session as free) and
calling `connect()`, another Worker can claim the same session. The `connect()`
call will fail in this case.

**Cloudflare's documented pattern** (from the Puppeteer reuse-sessions docs)
explicitly acknowledges this:

> "another worker may have connected first"

The recommended mitigation is:

1. **Wrap `connect()` in try/catch.** If it throws, fall through to `acquire()`.
2. **Random session selection.** When multiple free sessions exist, pick randomly
   to distribute contention across the pool rather than everyone grabbing the
   first one.
3. **Retry with backoff.** If both `connect()` and `acquire()` fail (all sessions
   claimed, rate limit hit), wait `timeUntilNextAllowedBrowserAcquisition` ms.

**Risk assessment for this project:** The current architecture dispatches captures
via `ctx.waitUntil()`, which means multiple concurrent captures from different
requests can race for sessions. At 300 captures/min with 30 sessions, this is
roughly 10 captures per session per minute -- moderate contention. The
random-selection + retry pattern is sufficient. No external coordination (Durable
Objects, etc.) is needed at this scale.

### (e) Practical limits and their interaction

**Hard limits (paid plan):**

| Limit | Value | Impact |
|-------|-------|--------|
| Concurrent sessions | 30 per account | Maximum browser instances alive at once |
| New instances per minute | 30 per minute | Rate at which `acquire()`/`launch()` can create sessions |
| Default inactivity timeout | 60 seconds | Session dies if no commands for 60s |
| Max keep_alive | 600,000 ms (10 min) | Maximum configurable inactivity window |
| Max session lifetime | Unbounded | As long as session stays active |

**Throughput math for ~300 captures/min:**

- Each capture involves: `connect()`, `newContext()`, `newPage()`, navigate,
  screenshot, get HTML content, close context, `browser.close()` (disconnect).
- Estimated per-capture time with session reuse: ~5-8 seconds (navigation + render
  dominates; no browser launch overhead).
- With 30 concurrent sessions processing captures serially: 30 sessions x
  (60s / 6s per capture) = ~300 captures/min. This hits the target.
- With 20 concurrent sessions (leaving 10 as headroom): 20 x 10 = ~200/min.
  Tight, but achievable if capture time averages 5s.

**The 30 new-instances-per-minute limit is not the bottleneck** as long as
sessions are reused. You only hit this limit during cold start (warming up 30
sessions) or after mass session death. During steady state, `acquire()` is called
only to replace dead sessions, which should be rare.

**Session timeout interaction with keep_alive and garbage collection:**

1. Session created with `keep_alive: 120000` (2 min).
2. Worker connects, runs capture, calls `browser.close()` (disconnects).
3. Session is now free. Idle timer starts.
4. If no Worker connects within 120 seconds, Cloudflare closes the session
   (`BrowserIdle` close reason).
5. If traffic is steady (capture every few seconds), a new Worker connects before
   timeout, resetting the idle timer.

**Eviction risk:** Cloudflare can evict sessions due to platform resource pressure
even within the keep_alive window. This is rare but must be handled -- always
wrap `connect()` in try/catch and be prepared to `acquire()` a replacement.

---

## Recommendations

### 1. Use the acquire/connect pattern, not launch-per-capture

**Current pattern (WRONG for throughput):**
```js
const browser = await puppeteer.launch(browserBinding);
// ... work ...
await browser.close(); // kills session
```

**Target pattern:**
```js
import { acquire, connect, sessions, limits } from '@cloudflare/playwright';

// Get or create a session
const sessionId = await getAvailableSession(env.BROWSER);
const browser = await connect(env.BROWSER, sessionId);
const context = await browser.newContext(); // isolated context per capture
try {
  const page = await context.newPage();
  // ... capture work ...
} finally {
  await context.close();
  await browser.close(); // disconnects, keeps session alive
}
```

### 2. Use browser contexts for capture isolation

Each capture should create a fresh `browser.newContext()` (or incognito context)
rather than sharing a default context. This provides:

- Cookie/cache isolation between captures (critical for accuracy)
- Protection against state leakage from one captured site to another
- Clean resource accounting per capture

This is what `createBrowserContext()` does in the current Puppeteer code. The
Playwright equivalent is `browser.newContext()`.

### 3. Implement a session acquisition helper with retry

```
getOrCreateSession(browserBinding, options):
  1. sessions() -> filter free (no connectionId)
  2. If free session exists:
     - Random pick, try connect(), return on success
  3. limits() -> check allowedBrowserAcquisitions
  4. If allowed:
     - acquire({ keep_alive }), connect(), return
  5. If not allowed:
     - Wait timeUntilNextAllowedBrowserAcquisition
     - Retry from step 1 (max 2 retries)
  6. Throw if exhausted
```

### 4. Set keep_alive based on expected traffic pattern

- **Steady traffic (production):** `keep_alive: 120000` (2 min) -- generous
  enough to survive short gaps, not so long that idle sessions waste slots.
- **Bursty traffic (batch captures):** `keep_alive: 300000` (5 min) -- sessions
  survive between batches.
- Make this configurable via environment variable, not hardcoded.

### 5. Pre-warm sessions on Worker startup (optional optimization)

If cold-start latency matters, use a cron trigger or the first request to
pre-warm a pool of sessions:

```js
// Warm up N sessions in parallel (respects 30/min rate limit)
const warmCount = Math.min(desiredPoolSize, 30);
await Promise.all(
  Array.from({ length: warmCount }, () => acquire(env.BROWSER, { keep_alive }))
);
```

This burns through the 30/min new-instance budget but gives you 30 hot sessions
immediately. Only do this if the first-request latency matters.

### 6. Instrument with limits() and history() for observability

After each capture, periodically (not every time -- say 1 in 10) call
`limits(env.BROWSER)` and log `activeSessions` and
`allowedBrowserAcquisitions`. Call `history(env.BROWSER)` to track session
close reasons. This feeds into alerting for:

- Session pool exhaustion (activeSessions approaching maxConcurrentSessions)
- Excessive session churn (many `BrowserIdle` or `Eviction` close reasons)
- Rate limit pressure (allowedBrowserAcquisitions consistently near 0)

---

## Proposed Tasks

### Task 1: Migrate from @cloudflare/puppeteer to @cloudflare/playwright
- Replace `@cloudflare/puppeteer` dependency with `@cloudflare/playwright` (v1.1.0+)
- Update imports: `import { launch, acquire, connect, sessions, limits } from '@cloudflare/playwright'`
- Verify `compatibility_date >= 2025-09-15` in wrangler.toml (current is 2026-03-13, satisfies this)
- Verify `nodejs_compat` compatibility flag is present (current config has it)
- Port `defaultRenderer` Puppeteer API calls to Playwright equivalents:
  - `page.setViewport()` -> `page.setViewportSize()` or context viewport option
  - `page.setRequestInterception(true)` + `page.on('request')` -> `page.route()` API
  - `page.screenshot({ fullPage: true, type: 'png' })` -> same API, minor syntax differences
  - `page.content()` -> same API
  - `page.goto()` with `waitUntil: 'networkidle2'` -> Playwright uses `waitUntil: 'networkidle'` (no "2")
  - `page.evaluate()` -> same API

### Task 2: Implement session acquisition helper
- New module `src/browser-pool.js` with `getOrCreateSession(browserBinding, opts)`
- Implements the acquire/connect flow with retry logic (see Recommendation 3)
- Random session selection to distribute contention
- Configurable `keep_alive` via env var (default 120000 ms)
- All `connect()` and `acquire()` calls wrapped in try/catch
- Returns a connected browser instance ready for use

### Task 3: Refactor defaultRenderer to use session reuse
- Replace `puppeteer.launch()` with session acquisition via browser-pool helper
- Replace `browser.close()` (terminal) with `browser.close()` after `connect()`
  (which disconnects but keeps session alive)
- Maintain browser context isolation: `browser.newContext()` per capture
- Keep the existing subresource/size limit enforcement, adapted to Playwright's
  `page.route()` API
- Keep the try/finally pattern for cleanup

### Task 4: Adapt request interception to Playwright route() API
- Puppeteer uses `setRequestInterception(true)` + `page.on('request', req => req.continue()/req.abort())`
- Playwright uses `page.route('**/*', route => route.continue()/route.abort())`
- The response monitoring (`page.on('response')`) pattern is similar in both
- Port the subresource counting and byte size tracking logic

### Task 5: Update test infrastructure
- Update `stubRenderer` signature if needed (it receives `browserBinding` which
  is currently unused in stubs -- this doesn't change)
- Add unit tests for `browser-pool.js` session acquisition logic
- Mock `sessions()`, `limits()`, `acquire()`, `connect()` for testing
- Test contention scenarios: connect fails -> falls back to acquire
- Test rate limit scenarios: acquire rate-limited -> waits and retries

### Task 6: Update rate limiters for higher throughput
- Current `GLOBAL_CAPTURE_LIMITER` is `limit = 20, period = 60` -- this caps
  the system at 20 captures/min regardless of browser session capacity
- To achieve ~300 captures/min, this rate limit must be raised significantly
  or restructured (per-session limit instead of global)
- This is a deliberate product decision -- document the risk tradeoff

---

## Risks and Concerns

### Risk 1: Session contention at scale (Medium probability, Low impact)
Multiple concurrent `ctx.waitUntil()` captures will race for free sessions.
Mitigation: random selection + try/catch fallback to `acquire()`. At 30 sessions
and 300 captures/min, average contention is manageable. Monitor via `limits()`.

### Risk 2: Session eviction by platform (Low probability, Medium impact)
Cloudflare can evict sessions under resource pressure. The code must handle
`connect()` failures gracefully -- always fall back to `acquire()`. Set
`keep_alive` conservatively to avoid holding slots unnecessarily.

### Risk 3: 30 new-instances-per-minute rate limit during cold start (High probability, Medium impact)
On first deploy or after mass session death, warming 30 sessions takes exactly
1 minute (30/min limit). The first minute of traffic will have degraded
throughput. Mitigation: pre-warm sessions via cron trigger; or accept cold-start
degradation and let the pool build organically.

### Risk 4: Playwright API differences causing subtle bugs (Medium probability, Medium impact)
Key Playwright/Puppeteer differences that could introduce bugs:
- `waitUntil: 'networkidle2'` does not exist in Playwright (it's `'networkidle'`)
- `setRequestInterception()` does not exist; must use `page.route()`
- `page.setViewport()` is `page.setViewportSize()` in Playwright
- `req.abort('blockedbyclient')` reason string may differ
- Response `headers()` returns object in Puppeteer; Playwright uses
  `response.allHeaders()` (returns Promise)

Mitigation: thorough port with test coverage for each behavioral difference.

### Risk 5: GLOBAL_CAPTURE_LIMITER blocks throughput (Certain, High impact)
The current global rate limiter (`limit = 20, period = 60`) is a hard cap at
20 captures/min. Session reuse is irrelevant if the API layer rejects requests
before they reach the renderer. This must be addressed as part of the throughput
work -- it is not purely a browser concern.

### Risk 6: ctx.waitUntil() wall-clock budget (Medium probability, High impact)
`ctx.waitUntil()` has a maximum execution time (typically 30 seconds for paid
Workers). The current code budgets 25s for navigation. With session reuse,
connect time drops from ~2-5s (launch) to ~100-500ms (connect), freeing more
budget for the actual capture. But if session acquisition involves retries
(connect fail -> acquire -> connect), this could eat into the budget. The
acquisition helper should have tight timeouts.

---

## Additional Agents Needed

### test-minion
- Port existing capture tests to Playwright mocks
- Design integration test strategy for session pool logic
- Cover contention, timeout, and rate limit edge cases

### security-minion
- Review browser context isolation guarantees for session reuse
  (state leakage between captures sharing a browser process)
- Validate that `newContext()` provides sufficient isolation for
  cookie/cache/localStorage between captured sites
- Review whether session reuse changes the SSRF or resource exhaustion
  attack surface

### iac-minion (if pre-warming is pursued)
- Configure cron trigger for session pre-warming
- Update wrangler.toml with cron schedule
- Adjust deployment pipeline to handle session warm-up after deploys

---

## Sources

- [Cloudflare Browser Rendering -- Playwright docs](https://developers.cloudflare.com/browser-rendering/playwright/)
- [Cloudflare Browser Rendering -- Reuse Sessions](https://developers.cloudflare.com/browser-rendering/workers-bindings/reuse-sessions/)
- [Cloudflare Browser Rendering -- Limits](https://developers.cloudflare.com/browser-rendering/limits/)
- [Cloudflare Browser Rendering -- FAQ](https://developers.cloudflare.com/browser-rendering/faq/)
- [Cloudflare Browser Rendering -- Browser Close Reasons](https://developers.cloudflare.com/browser-rendering/reference/browser-close-reasons/)
- [Cloudflare Changelog -- Playwright GA (Sep 2025)](https://developers.cloudflare.com/changelog/post/2025-09-25-br-playwright-ga-stagehand-limits/)
- [Cloudflare Changelog -- Playwright Beta (Apr 2025)](https://developers.cloudflare.com/changelog/2025-04-04-playwright-beta/)
- [@cloudflare/playwright on npm](https://www.npmjs.com/package/@cloudflare/playwright)
