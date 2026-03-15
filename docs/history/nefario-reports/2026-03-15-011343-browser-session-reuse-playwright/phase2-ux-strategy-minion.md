# UX Strategy Assessment: Browser Session Reuse / Playwright Migration

## Summary

The 10x throughput improvement is a purely backend change with **minimal but non-trivial user-facing implications**. The API surface contract remains identical. However, the migration introduces new failure modes that need user-safe error messages, the `Retry-After` hint becomes overfit, and the global rate limit creates a friction mismatch that will confuse callers once the backend can clearly handle more.

---

## (a) New Failure Modes Requiring User-Safe Error Messages

### Session pool exhaustion is a new error category

The current `categorizeError()` handles five scenarios: timeout, subresource limit, page size limit, navigation error, and a generic fallback. Session pooling introduces a sixth: **no browser session available**.

When all pooled sessions are busy, the system must either queue the capture (and risk timeout) or reject it immediately. Either path produces an error the user has never seen before. The current generic fallback -- `"Capture could not be completed"` with `retryable: true` -- is adequate as a catch-all, but it's suboptimal because it doesn't distinguish "the service is temporarily saturated" from "something broke." Users who get this message don't know whether to retry in 2 seconds or 2 minutes.

**Recommendation**: Add a dedicated error category for pool exhaustion:
- Message: `"Service is temporarily at capacity. Try again shortly."`
- `retryable: true`
- This maps to the same family as the existing 503 at the rate-limit layer, but occurs deeper in the pipeline (after the request was accepted). Consistency principle (Nielsen #4): if the rate limiter says "Service is at capacity" pre-acceptance, the capture pipeline should echo similar language post-acceptance.

### Session crash / corruption during reuse

Reusing sessions means a crash in one capture could leave a session in a corrupted state. If the pool hands out a broken session, the resulting error won't match existing `categorizeError()` patterns (it won't be a timeout, subresource limit, or navigation error -- it'll be something like "Target closed" or "Session closed" from Playwright).

**Recommendation**: The existing generic fallback handles this correctly today (`"Capture could not be completed"`, `retryable: true`). However, if Playwright produces distinctive error signatures for stale/crashed sessions (e.g., `"Target closed"`, `"Browser has been closed"`), consider adding explicit pattern matching so the message is more informative: `"Browser session ended unexpectedly. Your capture will be retried."` This helps users understand the failure wasn't caused by their URL.

### Contention-induced timeouts

With session reuse, the 25-second `NAV_TIMEOUT_MS` now includes potential queueing time if a session isn't immediately available. A page that would complete in 20 seconds might timeout at 25 seconds if it waited 6 seconds for a session. The existing timeout message -- `"Page did not finish loading within 25 seconds"` -- becomes subtly misleading. The page didn't get 25 seconds; it got 19.

**Risk level**: Low for MVP. The message is still technically accurate (from the user's perspective, the capture did not complete within 25 seconds of their request). But if session contention becomes common, users may see timeout failures for pages that "should" work, creating a frustrating experience where the same URL succeeds on retry (satisficing behavior means they'll retry, but each unnecessary retry is friction).

**Recommendation**: Don't change the timeout message wording. Instead, ensure the pool implementation separates queueing time from render time. If a capture times out, the system should know whether it was waiting for a session or rendering. This is an implementation concern, but it has UX consequences: if the pool is consistently causing timeouts, the system should shed load at the rate limit layer (503) rather than letting captures enter the pipeline only to timeout.

---

## (b) Retry-After Header Adjustment

### Current state

Three places emit `Retry-After`:

| Location | Value | Context |
|---|---|---|
| POST /v1/captures 202 response | `5` | Initial acceptance -- tells caller when to first poll |
| GET .../status (pending) | `5` | Ongoing polling hint |
| POST /v1/captures 429 | `60` | Per-IP rate limit exceeded |
| POST /v1/captures 503 | `10` | Global capacity exceeded |

### Should the `Retry-After: 5` change?

**Yes, but modestly.** The `Retry-After: 5` on the 202 and pending-status responses is a polling interval hint. Currently, with ~30 captures/min throughput, a typical capture takes somewhere in the 5-15 second range (navigation + screenshot + upload). With 10x throughput, average capture latency doesn't necessarily decrease -- throughput and latency are independent. The browser still needs ~5-15 seconds per page. What changes is concurrency, not speed.

**Recommendation**: Keep `Retry-After: 5` for the initial 202 response. This is already a reasonable first-poll delay regardless of throughput. For the status endpoint's pending response, `Retry-After: 3` could be justified (checking slightly more frequently is now less likely to hit the system while it's still warming up), but the improvement is marginal and the cost of changing it is a documentation/spec update.

**Do not reduce below 3.** Polling at sub-3-second intervals creates unnecessary load and most captures still take 5+ seconds to render. The `Retry-After` serves as a politeness hint to prevent tight-loop polling, and its value should be driven by expected capture latency, not throughput capacity.

### The 503 `Retry-After: 10` is the interesting one

With 10x capacity, the global rate limiter (currently 20/min) becomes the binding constraint long before browser sessions are exhausted. If the global limit stays at 20/min but the backend can handle 300/min, users will hit 503s that are artificial -- the system has capacity but the rate limiter says no. This is a **reverse feature** in Kano terms: it actively frustrates users by denying service the backend could provide.

**Recommendation**: The global rate limit must be raised proportionally with throughput. If capacity goes from ~30/min to ~300/min, the global limiter should move from 20/min to something in the 150-200/min range (keep headroom). This is a configuration change in `wrangler.toml`, not a code change, but it directly affects user experience. Document the new limits.

---

## (c) Impact on Documented Limitations

### OpenAPI spec

The OpenAPI spec documents `Retry-After` as an integer header but doesn't hardcode specific values in the schema. The example values in the spec (e.g., the 429 example saying "Try again in 60 seconds") are accurate and don't need changing. The 202 example doesn't embed the `Retry-After` value in the response body. No OpenAPI changes required unless the values actually change.

### Backlog items affected

1. **"Queue migration for capture processing"** (backlog, `[should]`): Session pooling partially addresses the underlying concern. With reusable sessions, the 30-second `ctx.waitUntil()` budget goes further because session launch time is eliminated. If a session launch took 3-5 seconds, that time is now available for page rendering. This doesn't eliminate the 30-second hard limit, but it reduces the practical pressure. The backlog item remains valid but becomes lower priority.

2. **"Capture service container migration"** (backlog, `[consider]`): Same reasoning -- session pooling pushes this further out. Update the backlog item's context.

3. **"Per-tenant rate limiting"** (backlog, `[consider]`): With 10x capacity, the per-IP limit of 10/min becomes more visible as a constraint. If the system can handle 300/min total, a single user hitting a 10/min wall while there's 290/min of unused capacity feels arbitrary. This backlog item becomes more important post-migration.

### Error message accuracy

The timeout message `"Page did not finish loading within 25 seconds"` references the `NAV_TIMEOUT_MS` constant. If the Playwright migration changes this value (e.g., to accommodate different timing characteristics), the error message must be updated to match. This is a basic consistency requirement (Nielsen #4) but easy to miss.

---

## Recommendations

### Must-do (before or during implementation)

1. **Add pool-exhaustion error category to `categorizeError()`**: New pattern matching for session pool exhaustion errors. Message: `"Service is temporarily at capacity. Try again shortly."`, `retryable: true`. Prevents the generic fallback from absorbing a semantically distinct failure mode.

2. **Raise global rate limit proportionally**: Update `GLOBAL_CAPTURE_LIMITER` in `wrangler.toml` from 20/min to match actual new capacity (with headroom). Without this, users hit artificial 503s that the backend could serve. The 503 message and `Retry-After: 10` remain appropriate for the cases where it does fire.

3. **Keep `Retry-After: 5` on 202 and pending responses**: No change needed. Capture latency (time per capture) hasn't changed; only concurrency has. Polling at 5-second intervals remains appropriate.

### Should-do (implementation guidance)

4. **Separate queueing time from render time in timeout accounting**: If a capture waits 8 seconds for a session and then has only 17 seconds to render, the timeout message is misleading. The pool should deduct wait time from the render budget transparently, or reject the capture early with a capacity message rather than accepting it into a queue where it'll timeout.

5. **Add Playwright-specific error patterns to `categorizeError()`**: Playwright error messages differ from Puppeteer's. Patterns like `"Target closed"`, `"Browser has been closed"`, `"Execution context was destroyed"` should be caught and mapped to user-safe messages before the generic fallback absorbs them. Test with deliberate session crashes to discover the actual error signatures.

6. **Update backlog annotations**: Add context to the queue migration and container migration backlog items noting that session reuse partially addresses the underlying concerns.

### Consider (low priority)

7. **Reduce `Retry-After` on pending-status responses from 5 to 3**: Marginal improvement in perceived responsiveness. Only worth doing if average capture latency measurably decreases with session reuse (it might, since session launch overhead is eliminated).

8. **Add `X-RateLimit-Remaining` headers**: Already a `[should]` backlog item. With higher capacity and higher rate limits, these headers become more useful for programmatic callers to self-throttle. Still not blocking for this migration.

---

## Proposed Tasks

| # | Task | Owner | Dependency |
|---|------|-------|------------|
| 1 | Add pool-exhaustion and session-crash patterns to `categorizeError()` | Implementation agent | Needs Playwright error signature research |
| 2 | Raise `GLOBAL_CAPTURE_LIMITER` in `wrangler.toml` proportional to new capacity | Implementation agent | Needs measured throughput from session pool |
| 3 | Ensure timeout budget separates queue-wait from render time | Implementation agent | Core pool design |
| 4 | Verify Playwright error message patterns differ from Puppeteer and update `categorizeError()` matchers | Implementation agent | Playwright migration complete |
| 5 | Update backlog items with session-reuse context | Any agent | After implementation |

---

## Risks and Concerns

### Risk 1: Generic fallback absorbs new failure modes silently
**Severity**: Medium. The current generic fallback (`"Capture could not be completed"`) is safe but uninformative. If pool exhaustion or session crashes are common during the transition, users will see the same vague message for very different problems. This makes debugging impossible from the caller's side and increases support burden.
**Mitigation**: Task 1 and 4 above.

### Risk 2: Global rate limit becomes the bottleneck, not the browser
**Severity**: High. If the global limiter stays at 20/min while the backend can handle 300/min, users experience artificial scarcity. The 503 message "Service is at capacity" would be technically false -- the service has capacity, but the rate limiter disagrees. This violates Nielsen's heuristic #1 (visibility of system status) and creates a reverse feature.
**Mitigation**: Task 2 above.

### Risk 3: Timeout messages become misleading under contention
**Severity**: Low-medium. If session queueing eats into the 25-second render budget, users see timeout failures for pages that work fine on retry. The "same URL succeeds on retry" pattern is deeply frustrating -- it suggests unreliability rather than capacity management.
**Mitigation**: Task 3 above.

### Risk 4: Per-IP rate limit feels more constraining at higher capacity
**Severity**: Low (existing friction, newly visible). A user who knows the system can handle 300/min but is capped at 10/min per IP will feel throttled. This is an existing backlog item that becomes more salient.
**Mitigation**: No immediate action required. Note in backlog that per-tenant rate limiting becomes more important post-migration.

---

## Additional Agents Needed

- **Edge/Infrastructure minion**: Must determine actual Playwright error signatures for pool exhaustion and session crashes. These signatures drive the `categorizeError()` patterns. UX strategy cannot define the patterns without knowing what strings Playwright produces.
- **API design minion**: Should review whether the global rate limit increase changes any documented API contract (it's a configuration change, but if the OpenAPI spec or README documents "20 captures/min global limit", that text needs updating).
- **Security minion**: Should evaluate whether raising the global rate limit from 20/min to 150-200/min introduces any abuse vectors (e.g., resource exhaustion attacks at higher throughput).
