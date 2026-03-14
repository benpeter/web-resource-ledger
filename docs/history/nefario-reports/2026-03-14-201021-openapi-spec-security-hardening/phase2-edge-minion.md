## Domain Plan Contribution: edge-minion

### Recommendations

**Recommendation: Option (c) -- accept platform-level behavior and add a thin global rate limiter for the capture endpoint only. Do not build a concurrency gauge.**

Here is the technical reality of this system:

1. **Cloudflare Workers do not expose a concurrency gauge.** There is no API, header, or binding that tells Worker code how many concurrent invocations are running. The platform handles overload internally -- it queues, retries, or drops requests at the infrastructure level. Worker code cannot observe or react to this.

2. **The real concurrency bottleneck is Browser Rendering, not Workers.** The paid plan allows 30 concurrent browser sessions per account. When this limit is exceeded, the `puppeteer.launch()` call in `capture.js` receives a 429 from the Browser Rendering API. This is the actual capacity constraint for this application -- Worker invocations for GET endpoints (status, retrieval, verification) are lightweight and effectively unlimited at any realistic traffic level.

3. **Per-IP rate limiting already exists** for the two expensive endpoints (`CAPTURE_RATE_LIMITER`: 10/60s, `VERIFY_RATE_LIMITER`: 60/60s). This handles abuse from individual actors.

4. **What's missing is global throughput protection for capture creation.** Ten different IPs each hitting 10 captures/minute = 100 concurrent browser sessions attempted, far exceeding the 30-session limit. The per-IP limiter doesn't protect against distributed legitimate load.

**The KISS solution is a global-key rate limiter for the capture endpoint.** This uses the existing rate limiting infrastructure (same `[[unsafe.bindings]]` pattern already in `wrangler.toml`) with a fixed string key instead of `CF-Connecting-IP`. It adds approximately 5 lines of code.

Important caveat: Cloudflare's Worker rate limiting is **per-location** (per data center), not globally distributed. A global key of `"global"` limits requests at each Cloudflare PoP independently. This is actually fine for this use case -- Browser Rendering sessions are also location-scoped, so per-location throttling aligns with the actual capacity constraint. A truly global counter (via Durable Objects) would be over-engineering with worse latency.

**For the non-capture endpoints** (health, status, retrieval, verification, signing-key), no backpressure mechanism is needed. These are lightweight KV/R2 reads. The platform will handle any overload scenario for these. Documenting this in the OpenAPI spec (the 503 response on all endpoints) is sufficient.

### Proposed Tasks

#### Task 1: Add global capture rate limiter

**What to do:**
- Add a new rate limiter binding in `wrangler.toml` (e.g., `GLOBAL_CAPTURE_LIMITER`) with a fixed period and limit tuned to Browser Rendering capacity. Suggested: `limit = 20, period = 60` -- leaves headroom below the 30-session ceiling to account for in-flight captures that haven't released their browser session yet.
- In `handleCreateCapture` in `src/index.js`, add a check using a fixed key (e.g., `"global"`) after the per-IP rate limit check. Return `problemResponse(503, 'Service is at capacity. Try again shortly.', { 'Retry-After': '10' })` when the global limit is hit.
- Use 503 (not 429) for the global limiter to distinguish "you personally are sending too many requests" (429) from "the service is temporarily at capacity" (503). This matches the issue's intent and HTTP semantics.

**Deliverables:**
- Updated `wrangler.toml` with new binding
- Updated `handleCreateCapture` with global rate limit check (~5 lines)
- Test covering the 503 response

**Dependencies:** None. This is additive and uses existing infrastructure patterns.

#### Task 2: Handle Browser Rendering 429 in capture pipeline

**What to do:**
- In `capture.js`, the `categorizeError` function should recognize Browser Rendering's 429/capacity error and map it to a retryable failure with a clear message. Currently it would fall through to the generic "Capture could not be completed" message.
- Check what error `puppeteer.launch()` throws when Browser Rendering returns 429 and add a specific case to `categorizeError`.

**Deliverables:**
- Updated `categorizeError` in `capture.js` with Browser Rendering capacity detection
- KV record for the failed capture should show `retryable: true` with a message like "Browser rendering capacity exceeded. Try again in a few seconds."

**Dependencies:** Needs investigation of the exact error message/type from `puppeteer.launch()` when Browser Rendering is at capacity.

#### Task 3: Document platform-level 503 in OpenAPI spec

**What to do:**
- Add a `503` response schema to all endpoints in `openapi.yaml`. For the capture endpoint, document both the application-level 503 (global rate limit) and the possibility of platform-level 503. For other endpoints, document only the platform-level case.
- The 503 response should reference the RFC 9457 problem+json schema already defined and include the `Retry-After` header.

**Deliverables:**
- Updated `openapi.yaml` with 503 responses on all endpoints
- Description text distinguishing application-level vs. platform-level 503

**Dependencies:** Should coordinate with api-spec-minion who is handling the overall OpenAPI spec completion.

#### Task 4: Caching for the signing-key and verification endpoints (advisory)

This is advisory input for the api-design-minion and security-minion consultations:

- **`/.well-known/signing-key`**: Should have aggressive caching. The key changes only on rotation (manual operator action). Recommend `Cache-Control: public, max-age=86400, stale-while-revalidate=604800` -- 1 day fresh, 7 day SWR. This means after rotation, the old key serves for up to 24 hours at the edge, which is acceptable because captures signed with the old key are still valid (they were signed at creation time). The SWR window ensures the endpoint never blocks on revalidation.
- **Verification endpoint caching is already well-designed** (line 287-288 in index.js): verified results cache publicly for 24h with 7d SWR, non-verified results are `no-store`. The `Vary: Accept` on line 300 is correct for content negotiation caching. No changes needed.
- **Security headers**: For `Strict-Transport-Security`, recommend `max-age=31536000; includeSubDomains` but NOT `preload` at this stage. Preload list submission is effectively permanent and should only happen when the domain is stable and confirmed HTTPS-only long-term. This is a Cloudflare Worker running on `workers.dev` or a custom domain -- either way, start without preload.

### Risks and Concerns

1. **Per-location rate limiting is not truly global.** The global capture rate limiter counts independently at each Cloudflare data center. If traffic is concentrated at one PoP, the limit works as intended. If traffic is evenly distributed across 300+ PoPs, the effective global limit is much higher than the configured value. For this application's scale, this is acceptable -- Browser Rendering sessions are also location-aware, so per-PoP throttling is actually the right granularity. But the team should understand this is not a precise global counter.

2. **Rate limiter is "permissive and eventually consistent."** Cloudflare's own documentation states the rate limiting API is "intentionally designed to not be used as an accurate accounting system." Near the boundary, some requests will slip through. This is fine for backpressure (we want approximate protection, not exact counting) but the limit value should have headroom -- hence recommending 20/min vs. the 30-session ceiling.

3. **Browser Rendering limit changes over time.** Cloudflare raised the limit from 2 to 10 in January 2025 and now shows 30 on paid plans. The global rate limit value should be documented as derived from the Browser Rendering limit and should be easy to adjust (it is -- it's a single number in `wrangler.toml`).

4. **Durable Object approach is over-engineering.** A Durable Object counter would provide a truly global, strongly consistent concurrency gauge, but it adds: a new binding, a new class, latency on every request (round-trip to the DO), and a single point of failure. For a service with 30 concurrent browser sessions as its ceiling, this precision is unnecessary. The rate limiter binding is zero-additional-infrastructure.

5. **No backpressure needed for read endpoints.** GET endpoints for status, retrieval, artifacts, verification, and signing-key are KV/R2 lookups. They complete in single-digit milliseconds. Cloudflare Workers can handle thousands of concurrent lightweight requests without issue. Adding backpressure to these would be pure YAGNI.

### Additional Agents Needed

None. The current team (api-spec-minion, security-minion, edge-minion, api-design-minion, test-minion, user-docs-minion, ux-strategy-minion) covers all aspects. The edge-minion contribution here is narrowly scoped to the backpressure question and caching advisory -- the security-minion should own the HSTS decision and the api-design-minion should own the signing-key endpoint format.

### Sources

- [Cloudflare Workers Rate Limiting API](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) -- per-location scoping, key flexibility, eventual consistency
- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/) -- no concurrency gauge exposed
- [Cloudflare Browser Rendering Limits](https://developers.cloudflare.com/browser-rendering/limits/) -- 30 concurrent sessions on paid plan, 429 on exceeded
- [Browser Rendering Limits Increase Changelog](https://developers.cloudflare.com/changelog/2025-01-30-browser-rendering-more-instances/) -- historical limit changes
