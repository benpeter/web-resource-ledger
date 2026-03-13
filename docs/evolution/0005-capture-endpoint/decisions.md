# 0005: Capture Endpoint Decisions

Key decisions made during this phase, with rationale and rejected alternatives.

## 1. DNS-pinned fetch abandoned; use redirect:'manual' instead

- **Decision**: The header capture step uses `fetch(url, { redirect: 'manual' })` against the
  original validated URL rather than a pre-resolved IP.
- **Why**: Cloudflare Workers prohibit bare-IP TCP connections to arbitrary addresses; connecting
  to a pre-resolved IP would either be blocked by the platform or require constructing a URL with
  the IP as hostname, which causes TLS SNI mismatch (the IP is presented as the SNI name, not the
  original hostname). `redirect: 'manual'` prevents the Workers fetch from following redirects to
  unvalidated destinations while still reaching the original host correctly.
- **Rejected**: DNS-pinned fetch (connect to IP, spoof Host header). Blocked by platform; SNI
  mismatch breaks TLS for HTTPS targets.

## 2. ctx.waitUntil() for background processing; Queue as documented fallback

- **Decision**: Browser rendering runs in `ctx.waitUntil()`, which gives the Worker up to 30
  seconds after the response is sent. Navigation timeout is set to 25 seconds, leaving a 5-second
  buffer for artifact storage and KV writes.
- **Why**: `ctx.waitUntil()` is zero-infrastructure -- no Queue binding, no consumer Worker, no
  retry configuration. For MVP, the simplicity benefit outweighs the constraint. The 25-second
  navigation budget covers the majority of real-world pages.
- **Rejected**: Cloudflare Queue with a dedicated consumer Worker. Correct long-term architecture
  (Queue gives 15-minute processing budget), but adds significant infrastructure complexity for
  MVP. Documented as the migration path when slow-page timeouts become a recurring problem.

## 3. R2 artifact storage in Step 3, not deferred to Step 4

- **Decision**: Screenshots, rendered HTML, and headers are stored in R2 within the same
  `ctx.waitUntil()` call that performs the capture.
- **Why**: Deferring storage to a later step would require either holding artifacts in memory
  across Worker invocations (not supported) or introducing a staging mechanism. Co-locating
  capture and storage in the same async task prevents data loss and keeps the state machine
  simple: KV transitions to `complete` only after R2 writes succeed.
- **Rejected**: Writing a temporary in-memory record and persisting to R2 in a subsequent step.
  No mechanism supports this without additional infrastructure.

## 4. Concurrency limiting skipped for MVP

- **Decision**: No explicit concurrency guard on simultaneous captures.
- **Why**: The Cloudflare Browser Rendering API enforces its own concurrency limit at the platform
  level. Workers that exceed the limit receive an error, which `performCapture()` catches and
  records as a failed capture. Adding an application-level semaphore would require KV-based
  distributed state, adding complexity without observable benefit over the platform constraint.
- **Rejected**: KV-based semaphore or Durable Object counter. Over-engineered for MVP given that
  the platform already caps concurrency implicitly.

## 5. Contract-first OpenAPI spec at Step 3, not deferred

- **Decision**: `openapi.yaml` was written before (or alongside) the handler implementation.
- **Why**: Writing the spec first forces explicit decisions about response shape, error codes,
  and field semantics before they are baked into code. It also provides a reviewable artifact for
  architecture review that is independent of implementation details. Deferring the spec to a
  documentation phase would likely result in a spec that describes what was built rather than what
  was intended.
- **Rejected**: Write spec after implementation. Leads to specs that rationalize decisions rather
  than drive them.

## 6. Status response shape: selective exposure with `error` (not `detail`) field

- **Decision**: The status response includes `id`, `status`, and state-conditional fields:
  `captureUrl` (complete), `error` and `retryable` (failed). The failure field is named `error`,
  not `detail`.
- **Why**: The `detail` naming comes from RFC 9457 (Problem Details), which applies to error
  responses (`application/problem+json`). Status responses are domain objects
  (`application/json`), not problem responses; reusing `detail` would blur this distinction.
  `error` is semantically clearer for a domain status field. Only fields relevant to the current
  state are included -- no `null`-valued placeholder fields.
- **Rejected**: Echoing the full KV record. Exposes internal fields (`ip`, `captureId` duplication,
  timestamps) that are not part of the public contract and could leak implementation details.

## 7. `note` field in 202 response with `Retry-After: 5` header

- **Decision**: The 202 response includes a `note` field reminding callers that no list endpoint
  exists, plus a `Retry-After: 5` header on both 202 and pending status responses.
- **Why**: The acceptance criteria explicitly required the note. Without a list endpoint, callers
  who lose the capture ID have no recovery path; the note at creation time is the only opportunity
  to surface this constraint. `Retry-After: 5` sets a concrete polling suggestion without encoding
  the interval only in documentation.
- **Rejected**: Omitting the note or using an X-custom header. Note is required by acceptance
  criteria. `Retry-After` is the standard header for this purpose (RFC 7231).

## 8. 24-hour TTL on pending KV records

- **Decision**: `createCapture()` writes the pending KV record with `expirationTtl: 86400`
  (24 hours). Completed and failed records have no TTL.
- **Why**: A capture stuck in `pending` (e.g., Worker crash after KV write, before
  `ctx.waitUntil()` completes) would otherwise persist indefinitely and appear to callers as
  permanently in-progress. The 24-hour TTL makes stuck records self-cleaning. Completed and failed
  records are retained without TTL for auditability.
- **Rejected**: No TTL on any records. Requires manual cleanup of stuck pending records.
  TTL on all records. Would delete successful capture records, making captures ephemeral
  without communicating this to callers.

## 9. Injectable renderer pattern for testability

- **Decision**: `performCapture(env, url, ip, captureId, renderer)` accepts an optional
  `renderer` parameter (defaults to `defaultRenderer`). Tests inject a stub renderer.
- **Why**: `defaultRenderer` is untestable at unit level because it requires a live Cloudflare
  Browser Rendering binding (Puppeteer). Following the precedent set by `validateUrl`'s injected
  DNS resolvers, parameter injection allows full pipeline coverage without a mocking framework
  or module-level stubs.
- **Rejected**: Module-scoped `setRenderer`/`getRenderer` functions. Three architecture reviewers
  independently flagged module-scoped mutable state as an anti-pattern in Workers' shared-isolate
  execution model: if a test sets the renderer and the isolate is reused, the mutation persists
  across test runs. This was the final design after that review.

## 10. Security response headers centralized in fetch handler

- **Decision**: `Referrer-Policy: no-referrer` and `X-Content-Type-Options: nosniff` are set on
  every response in the `fetch()` handler after route dispatch, not in individual route handlers.
  `Cache-Control: private, no-store` is set per-route for status responses.
- **Why**: Centralizing security headers eliminates the risk of a missing header on any response
  path (including 404s and future routes). `Cache-Control` is intentionally per-route because
  the appropriate caching behavior differs: health responses can be cached, status responses must
  not be.
- **Rejected**: Setting headers in each route handler. Requires remembering to add them to every
  future handler, including error paths.

## 11. setRenderer/getRenderer removed after architecture review

- **Decision**: The initial draft used module-scoped `setRenderer`/`getRenderer` functions.
  These were removed before merge; the final API uses a `renderer` parameter on `performCapture`.
- **Why**: Three independent reviewers flagged module-scoped mutable state as incorrect for
  Cloudflare Workers. Workers run in V8 isolates that may be shared across invocations within
  a deployment. A test that mutates the module-scoped renderer could leave the state modified
  for subsequent invocations in the same isolate. Parameter injection avoids this entirely.
- **Rejected**: Keeping module-scoped state with reset-in-teardown. The reset discipline is
  fragile and the underlying model is wrong for the platform; parameter injection is simpler
  and correct.
