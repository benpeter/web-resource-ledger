# Security Minion -- Browser Session Reuse & Playwright Migration

## Summary Assessment

The shift from browser-per-capture to shared-browser-with-context-isolation is
**acceptable for WRL's threat model**, but introduces nuanced risks that must
be explicitly documented and mitigated. BrowserContext isolation covers
application-layer state (cookies, localStorage, sessionStorage, IndexedDB,
HTTP cache). However, browser-level shared state exists at the Chromium process
level (DNS cache, TLS session cache, HTTP/2 connection pools, GPU process
memory), and the Playwright migration changes the request interception model
in ways that both improve and slightly alter the TOCTOU defense posture.

---

## (a) BrowserContext Isolation: Sufficient or Not?

### What BrowserContext isolates (per-context, no cross-leakage)

- Cookies (cookie jar per context)
- localStorage and sessionStorage
- IndexedDB
- HTTP cache and cached resources
- Permission state (geolocation, notifications, etc.)
- Browsing history / visited links

This is equivalent to Chromium's incognito profile model. Each BrowserContext
is a clean, independent profile.

### What BrowserContext does NOT isolate (shared at browser process level)

- **Chromium's internal DNS cache** (HostResolverImpl, up to 1000 entries).
  DNS resolutions from Context A are cached and reused by Context B within the
  same browser process. This is a timing oracle risk in theory -- an attacker
  could observe whether a DNS entry was cached (fast resolution) to infer a
  previous capture target. However, WRL has no mechanism for an attacker to
  observe DNS resolution timing from the captured output.

- **TLS session cache**. TLS session tickets from Context A can be reused by
  Context B, enabling faster TLS handshakes. This is a weak fingerprinting
  signal but not an information disclosure path for WRL since TLS session
  state is not exposed in captured artifacts.

- **HTTP/2 and QUIC connection pools** (SpdySessionPool within
  HttpNetworkSession). Connections may be coalesced across contexts if they
  share the same IP and have valid certificates. This could theoretically
  allow a response from Context B's capture to be served over a connection
  established during Context A's capture. For WRL, this is a performance
  optimization, not a data leakage vector -- the connection carries different
  requests and responses.

- **GPU process memory**. The GPU process is shared across all contexts. No
  data leakage path exists through this for WRL's use case (screenshots are
  rendered per-page, not shared).

- **Browser-level settings** (default viewport, user agent if not overridden
  per context).

### Verdict

**BrowserContext isolation IS sufficient for WRL** because:

1. WRL captures are single-tenant (one API key, no multi-user data yet), so
   there is no cross-tenant secret to leak.
2. The shared browser-level state (DNS cache, TLS sessions, connection pools)
   is not observable by the capture requester through WRL's API. The attacker
   would need to be able to measure timing differences in capture duration and
   correlate them with DNS cache state -- a side channel so noisy as to be
   impractical.
3. Cloudflare's gVisor-based VM isolation provides a hardware-level boundary
   between different accounts' browser instances.
4. No capture artifact contains DNS resolution metadata, TLS session info, or
   connection pool state.

### Conditions that would change this verdict

If any of the following become true, BrowserContext isolation would be
**insufficient** and process-level isolation (separate browser per capture)
would be required:

- Multi-tenant deployment where different tenants share the same browser
  instance and an attacker tenant could time capture requests to exploit
  the DNS cache side channel.
- Capture artifacts begin including network timing data (connection time,
  DNS resolution time) -- this would expose the DNS cache oracle.
- Service Workers are present in captured pages (Playwright's `page.route()`
  does NOT intercept Service Worker requests, creating a potential bypass).

---

## (b) Session Contention Threat Model

### Cloudflare's concurrency guarantee

Cloudflare Browser Rendering enforces **mutual exclusion at the session
level**: while a connection is active, no other worker can connect to that
session. This is infrastructure-enforced, not application-enforced.

### Race condition: two workers, same session ID

The documented pattern has an inherent TOCTOU:

1. Worker A calls `playwright.sessions()` and sees Session X as available
   (no `connectionId`).
2. Worker B calls `playwright.sessions()` at the same moment and also sees
   Session X as available.
3. Both call `playwright.connect(env.BROWSER, sessionX)`.
4. One succeeds, the other fails with a connection error.

**This is a benign race**. The Cloudflare infrastructure guarantees that only
one worker gets the session. The loser falls back to `playwright.launch()`.
No data is leaked, no state is corrupted.

### Threats that ARE relevant

| Threat | Risk | Mitigation |
|--------|------|------------|
| **Starvation under load** -- if concurrent captures exceed the session pool, some will need to launch new browsers, hitting the "new browser instances per minute" rate limit (30/min paid plan). | Medium | Implement retry-with-backoff on launch failures. Monitor session utilization. Consider queue-based serialization if starvation is observed. |
| **Session exhaustion DoS** -- an attacker floods the capture endpoint, exhausting all 30 concurrent browser sessions. This is already partially mitigated by the existing rate limiter (10 req/60s per IP, 20 req/60s global). | Low | Existing rate limiters are sufficient. Global limiter at 20/min << 30 concurrent sessions. |
| **Orphaned sessions** -- if a worker crashes between `connect()` and `disconnect()`, the session remains reserved until Cloudflare's idle timeout (60s default, up to 10min with keep_alive). | Low | Cloudflare's idle timeout is the cleanup mechanism. Ensure context.close() is in try/finally. Consider keeping keep_alive short (2-3 min) to bound orphan duration. |
| **Session state from previous capture** -- a reused browser session may contain browser-level state from a previous capture (DNS cache, TLS sessions). See section (a). | Low | Acceptable for current single-tenant model. Document as known state sharing. |

---

## (c) browser.disconnect() vs browser.close() -- State Leakage Risk

### What browser.disconnect() preserves

When `browser.disconnect()` is called (keeping the browser alive for reuse),
the following state persists in the browser process:

- **Browser-level DNS cache** -- entries from previous captures remain cached
- **TLS session cache** -- TLS session tickets from previous captures
- **HTTP/2 / QUIC session pools** -- connections may be reused
- **GPU process state** -- rendering state (no data leakage concern)
- **Any BrowserContexts not explicitly closed** -- if a context is not closed
  before disconnect, its full state (cookies, localStorage, etc.) persists

### What browser.close() destroys

`browser.close()` terminates the Chromium process entirely. All state --
browser-level and context-level -- is destroyed. This is a clean-room
guarantee.

### Risk assessment for WRL

**Critical requirement**: The renderer MUST call `context.close()` in a
try/finally block before calling `browser.disconnect()`. The current code
already does this (`finally { await context.close(); await browser.close(); }`).
The migration must preserve this pattern, changing only `browser.close()` to
`browser.disconnect()`.

If `context.close()` is missed (bug, exception before finally block), the
next worker to connect to that session inherits an open context with full
application-layer state from the previous capture:

- Cookies set by the captured page
- localStorage/sessionStorage data
- Any service worker registrations
- IndexedDB data

**This is the highest-severity risk in the entire migration.** The mitigation
is straightforward but must be verified:

```javascript
// CORRECT -- context.close() in finally, then disconnect
const context = await browser.newContext();
try {
  const page = await context.newPage();
  // ... capture logic ...
  return { screenshot, html };
} finally {
  await context.close();       // MUST happen before disconnect
  browser.disconnect();        // keep browser alive for reuse
}
```

### Additional safeguard: defensive context cleanup on connect

When connecting to a reused session, defensively close any orphaned contexts:

```javascript
const browser = await playwright.connect(env.BROWSER, sessionId);
// Defensive: close any contexts left open by a crashed previous worker
for (const ctx of browser.contexts()) {
  await ctx.close();
}
// Now create a fresh context
const context = await browser.newContext();
```

This adds ~5ms but eliminates the tail risk of an orphaned context.

### Residual browser-level state

After `context.close()` + `browser.disconnect()`, the browser-level shared
state (DNS cache, TLS sessions) persists. For WRL's current threat model,
this is acceptable (see section (a)). The residual risk is:

- A capture of `evil.com` poisons the DNS cache, so a subsequent capture
  of `target.com` (which evil.com's DNS was crafted to collide with) uses
  the poisoned entry. This requires the attacker to control DNS for a domain
  that resolves to the same IP as the target -- at which point they already
  control the server and the attack provides no additional advantage.

**Verdict**: `browser.disconnect()` is acceptable with the context.close()
guarantee, but represents a meaningful security-convenience tradeoff vs
`browser.close()`. Document it.

---

## (d) Threat Model for "Why BrowserContext Isolation Is Sufficient"

The documentation should address these specific threats:

### Threats that BrowserContext isolation defeats

| # | Threat | STRIDE | How BrowserContext mitigates |
|---|--------|--------|-----------------------------|
| 1 | **Cross-capture cookie theft** -- Capture B reads cookies set during Capture A | Information Disclosure | Each context has an independent cookie jar. context.close() destroys it. |
| 2 | **Cross-capture localStorage/sessionStorage access** -- page JS in Capture B reads storage from Capture A | Information Disclosure | Storage is per-context. No cross-context DOM storage access. |
| 3 | **Cross-capture cache poisoning** -- Capture A poisons HTTP cache with malicious resource, Capture B loads it | Tampering | HTTP cache is per-context. Contexts do not share cached HTTP responses. |
| 4 | **Cross-capture session riding** -- Capture B inherits an authenticated session from Capture A | Elevation of Privilege | Session tokens (cookies, auth headers) are per-context. |
| 5 | **Cross-capture IndexedDB access** | Information Disclosure | IndexedDB is per-context origin-scoped storage, destroyed with context. |

### Threats that BrowserContext isolation does NOT defeat (accepted risks)

| # | Threat | STRIDE | Why accepted for WRL |
|---|--------|--------|-----------------------|
| 6 | **DNS cache timing oracle** -- attacker infers previous capture targets via DNS resolution speed | Information Disclosure | DNS timing is not exposed in capture artifacts. No observation path. |
| 7 | **TLS session reuse across captures** -- TLS tickets from Capture A used by Capture B | Information Disclosure | TLS session state not in artifacts. Performance benefit, no data leak. |
| 8 | **HTTP/2 connection coalescing** -- connections from Capture A reused by Capture B for same-IP hosts | Tampering (theoretical) | Connections carry new requests/responses. No stale data leakage. |
| 9 | **Browser fingerprinting consistency** -- all captures from same browser share fingerprint (user agent, screen size, WebGL renderer, etc.) | Information Disclosure | WRL is a capture service, not an anonymity tool. Fingerprint consistency is expected and documented. |

### Threats specific to the disconnect/reuse model

| # | Threat | STRIDE | Mitigation |
|---|--------|--------|------------|
| 10 | **Orphaned context state leakage** -- context not closed before disconnect | Information Disclosure | try/finally guarantee + defensive cleanup on connect (see section c) |
| 11 | **Session hijack via guessable session ID** -- attacker connects to someone else's session | Spoofing | Cloudflare manages session IDs; not exposed externally. Only workers with the BROWSER binding can enumerate sessions. |
| 12 | **Session starvation** -- attacker exhausts browser pool | Denial of Service | Rate limiters bound capture rate well below session pool capacity. |

---

## (e) TOCTOU Landscape Change with Playwright's page.route()

### Current state (Puppeteer, `setRequestInterception`)

The current implementation uses `page.setRequestInterception(true)` with a
`page.on('request')` handler. This intercepts ALL requests (including
navigations) as a flat event stream. The handler currently only counts
subresources and enforces size limits -- it does NOT block cross-domain
navigations. The backlog items are:

1. TOCTOU gap mitigation (DNS re-resolution between validation and rendering)
2. Cross-domain navigation blocking (defense-in-depth against TOCTOU)

### What changes with Playwright's page.route()

**Improvements:**

- `page.route()` supports URL pattern matching (glob, regex, or predicate
  function), making it trivial to implement a domain allowlist. Example:

  ```javascript
  // Block all navigations to domains other than the target
  const targetDomain = new URL(url).hostname;
  await page.route('**/*', (route) => {
    const reqUrl = new URL(route.request().url());
    if (route.request().isNavigationRequest() && reqUrl.hostname !== targetDomain) {
      route.abort('blockedbyclient');
    } else {
      route.continue();
    }
  });
  ```

- `request.isNavigationRequest()` provides explicit identification of
  navigation requests (not available in Puppeteer's request interception API
  in the same clean way).

- `route.abort()` with specific error codes provides cleaner request
  termination.

**Differences and caveats:**

- **Service Workers**: `page.route()` does NOT intercept requests handled by
  Service Workers. If a captured page registers a Service Worker, the SW could
  make cross-origin requests that bypass route interception. Mitigation:
  disable Service Workers on the context (`await context.addInitScript(() => { ... })`
  or use `--disable-service-worker` launch flag if available in CF Browser
  Rendering). Alternatively, use `browserContext.route()` which also does not
  intercept SW requests per Playwright docs.

- **Popup first request**: `page.route()` does not intercept the first request
  of a popup page. `browserContext.route()` does. For WRL, this matters if a
  captured page opens a popup. Recommend using `browserContext.route()` instead
  of `page.route()` for the navigation blocker to cover this edge case.

- **Redirect chains**: Playwright's route interception fires for each
  redirect hop. This is better than the current behavior for TOCTOU because
  each redirect can be independently checked against the domain allowlist.

### Does page.route() close the TOCTOU gap?

**Partially.** Here is what changes:

| TOCTOU vector | Before (Puppeteer) | After (Playwright) | Gap closed? |
|---------------|--------------------|--------------------|-------------|
| DNS rebinding between validateUrl() and browser navigation | Interception available but not used for domain blocking | page.route() can block cross-domain navigations | YES -- can block navigations to unexpected domains |
| Cross-domain redirect in browser (server returns 302 to internal IP) | Interception available but not used for domain blocking | page.route() fires per redirect hop; each can be domain-checked | YES -- each hop can be validated |
| Cross-domain JS navigation (window.location = 'http://internal/') | Interception available but not used | isNavigationRequest() + domain check blocks this | YES |
| DNS rebinding on original domain (same hostname, different IP on re-resolution) | Cannot detect -- hostname matches the original | Cannot detect -- hostname still matches | NO -- this is inherent to DNS rebinding and cannot be solved at the request interception layer |
| Service Worker cross-origin fetch | Not intercepted by Puppeteer request interception either | Not intercepted by page.route() | NO -- same gap |

**Conclusion**: Implementing domain-scoped navigation blocking via
`page.route()` or `browserContext.route()` closes the cross-domain navigation
TOCTOU vectors. The same-domain DNS rebinding TOCTOU remains (attacker
controls DNS for the target domain and changes the A record between
validateUrl() and browser navigation). This residual risk is already
documented and accepted in `url-validation.js`.

The two TOCTOU backlog items can be marked DONE when:

1. Cross-domain navigation blocking is implemented via route interception
   (blocks navigations where `hostname !== targetHostname`)
2. Redirect chain validation is implemented (each hop checked)

The remaining residual risk (same-domain DNS rebinding) should stay in the
backlog as a documented accepted risk, not marked DONE.

---

## Recommendations

Priority-ordered by risk.

### P0 -- Must do in this phase

1. **Guarantee context.close() in try/finally before disconnect**.
   The renderer function must call `context.close()` before
   `browser.disconnect()`, wrapped in try/finally. This is the single most
   important security invariant in the migration. Add a code comment
   explaining why.

2. **Defensive orphan cleanup on connect**. When connecting to a reused
   session, close all existing contexts before creating a new one. This is
   defense-in-depth against a crashed previous worker that left a context
   open.

3. **Implement cross-domain navigation blocking**. Use
   `browserContext.route('**/*', handler)` (not `page.route()`) to block
   navigations to hostnames other than the validated target. This closes the
   TOCTOU gap for cross-domain navigations and redirects.

4. **Disable Service Workers on the context**. Prevents captured pages from
   registering SWs that could bypass route interception or persist state
   across the context lifecycle.

### P1 -- Should do in this phase

5. **Document the BrowserContext isolation threat model**. Create a
   security-constraints section (in capture.js header comments or a separate
   doc) enumerating what is isolated, what is shared, and why sharing is
   acceptable. Use the tables from section (d).

6. **Keep keep_alive short** (2-3 minutes). Bounds the window during which
   an orphaned session with a crashed context remains available.

7. **Add a security comment explaining browser.disconnect() tradeoff**.
   Future maintainers must understand that disconnect preserves browser-level
   state and why context.close() is mandatory.

### P2 -- Consider / document for future

8. **Monitor for Service Worker registration in captures**. If SWs become
   common in captured pages, evaluate whether the `--disable-service-worker`
   flag is available in CF Browser Rendering.

9. **Revisit isolation model for multi-tenant**. When per-tenant API keys
   are implemented, reassess whether browser-level shared state (DNS cache)
   creates a cross-tenant information disclosure risk. If tenants are
   security-sensitive, consider tenant-scoped browser pools.

---

## Proposed Tasks

| Task | Priority | Dependencies | Notes |
|------|----------|-------------|-------|
| Implement try/finally context.close() + browser.disconnect() pattern | P0 | Playwright migration scaffold | Preserves existing security invariant |
| Add defensive orphan context cleanup on session connect | P0 | Session reuse implementation | ~5ms overhead, eliminates tail risk |
| Implement browserContext.route() cross-domain navigation blocker | P0 | Playwright migration complete | Closes TOCTOU backlog items |
| Disable Service Workers on browser context | P0 | Playwright migration complete | Prevents SW-based route bypass |
| Write BrowserContext isolation threat model doc | P1 | None | Tables from section (d) ready to use |
| Configure keep_alive to 120000-180000ms | P1 | Session reuse implementation | Bounds orphan window |
| Add security comments to new renderer code | P1 | Playwright migration complete | Explain disconnect tradeoff |
| Update backlog: mark TOCTOU cross-domain items DONE, keep DNS rebinding | P1 | Navigation blocker implemented | Two items resolved, one remains |

---

## Risks / Concerns

1. **Context close failure is catastrophic for isolation**. If any code path
   reaches `browser.disconnect()` without calling `context.close()`, the next
   capture on that session inherits full application-layer state. This must be
   the primary focus of code review. The defensive orphan cleanup is a safety
   net, not a substitute.

2. **Service Worker gap**. Playwright's `page.route()` and
   `browserContext.route()` do not intercept SW-handled requests. If a
   captured page registers a Service Worker, it could make unmonitored
   cross-origin requests during the capture. This is the same gap that
   exists today with Puppeteer, but worth noting as the route-based
   navigation blocker does not cover it.

3. **popup first-request gap**. `page.route()` misses the first navigation
   of popup windows. Using `browserContext.route()` instead of `page.route()`
   eliminates this. Ensure the implementation uses context-level routing.

4. **No Playwright disconnect() method**. Playwright's `browser.close()`
   on a `connect`-obtained browser disconnects (does not kill the browser).
   The Cloudflare fork may provide `browser.disconnect()` or rely on
   `browser.close()` behaving as disconnect for connected sessions. Verify
   the exact API surface in `@cloudflare/playwright` before implementing --
   the semantics must match the session reuse pattern.

---

## Additional Agents Needed

- **edge-minion**: To confirm the exact `@cloudflare/playwright` API for
  session reuse (whether `browser.close()` acts as disconnect for connected
  sessions, or if there's an explicit `disconnect()` method). Also to
  validate that `browserContext.route()` works as expected in the Cloudflare
  Browser Rendering environment, and whether `--disable-service-worker` is
  a supported launch flag.

- **test-minion**: To design tests that verify: (1) context isolation between
  sequential captures on the same browser session, (2) cross-domain
  navigation blocking via route interception, (3) orphan context cleanup on
  reconnect, (4) Service Worker registration is blocked or handled.

---

## Sources

- [Playwright BrowserContext isolation docs](https://playwright.dev/docs/browser-contexts)
- [Playwright page.route() API](https://playwright.dev/docs/api/class-page#page-route)
- [Playwright Request class (isNavigationRequest)](https://playwright.dev/docs/api/class-request)
- [Playwright Route class](https://playwright.dev/docs/api/class-route)
- [Cloudflare Browser Rendering session reuse](https://developers.cloudflare.com/browser-rendering/workers-bindings/reuse-sessions/)
- [Cloudflare Browser Rendering limits](https://developers.cloudflare.com/browser-rendering/limits/)
- [Cloudflare Browser Rendering Playwright docs](https://developers.cloudflare.com/browser-rendering/playwright/)
- [Chromium Process Model and Site Isolation](https://chromium.googlesource.com/chromium/src/+/main/docs/process_model_and_site_isolation.md)
- [Chromium Network Stack (DNS cache, HTTP cache, connection pools)](https://www.chromium.org/developers/design-documents/network-stack/)
- [Chromium DNS Cache internals](https://textslashplain.com/2022/03/31/chromiums-dns-cache/)
- [Chromium client identification mechanisms (shared state)](https://www.chromium.org/Home/chromium-security/client-identification-mechanisms/)
