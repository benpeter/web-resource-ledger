# Meta-Plan: MVP Step 6 -- Verification Endpoint

## Summary

Public `GET /v1/verify/{id}` endpoint that cryptographically verifies a stored
capture is authentic and unmodified. Recomputes SHA-256 hashes of R2 artifacts,
recomputes bundleHash from canonical JSON, verifies Ed25519 signature, and
returns a structured `{ verified, capture, artifacts }` response. Requires a
new rate limiter binding (~60/min), aggressive caching (`public, immutable`),
and end-to-end integration tests including a tamper-detection scenario.

## Planning Consultations

### Consultation 1: Verification Logic and Response Shape

- **Agent**: api-design-minion
- **Planning question**: What should the response shape of `GET /v1/verify/{id}`
  look like? The issue specifies `{ verified: true|false, capture: { ... },
  artifacts: { ... } }` but leaves details open. Specifically: (a) should
  `capture` mirror the existing `GET /v1/captures/{id}` shape or be a subset?
  (b) what should `artifacts` contain -- per-artifact hash verification results
  or just a summary? (c) when `verified: false`, should the response include
  which specific check failed (hash mismatch, signature invalid, missing
  artifact)? (d) should we use different HTTP status codes for verified vs
  not-verified, or always 200 with the boolean? (e) what about captures that
  don't exist or aren't complete -- 404 or 200 with verified:false?
- **Context to provide**: Current retrieval response shape from
  `handleGetCapture` in `src/index.js` (lines 121-162), KV record shape from
  `src/kv.js`, WACZ structure from `src/wacz.js` (datapackage.json and
  datapackage-digest.json), RFC 9457 error response pattern in `src/responses.js`.
- **Why this agent**: API response shape is a contract that downstream consumers
  (Step 7 and beyond) will depend on. Getting this right before implementation
  prevents rework. The verification endpoint has subtle design questions around
  failure granularity that affect both usability and security.

### Consultation 2: Verification Security Model

- **Agent**: security-minion
- **Planning question**: What security considerations apply to the verification
  endpoint? Specifically: (a) the verification endpoint exposes per-artifact
  hash results and signature validity -- does this leak information an attacker
  could use? (b) should the public key used for verification come from the WACZ
  `datapackage-digest.json` (embedded in the bundle) or from the server's
  current signing key? The WACZ comment says "Verifiers MUST pin against an
  operator-published key, not trust the embedded key blindly" -- how does this
  affect the endpoint? (c) does the `Cache-Control: public, immutable` header
  create any risk (e.g., caching a `verified: true` response after the signing
  key is rotated)? (d) rate limiting at ~60/min -- is this sufficient for a
  public, unauthenticated endpoint? (e) should the capture ID in the verify
  endpoint URL be the same format as captures, or should there be a separate
  verify-specific token?
- **Context to provide**: `src/signing.js` (verifySignature function, key
  management), `src/wacz.js` (signature embedding, bundleHash computation,
  public key embedding), WACZ security comments about key pinning, current rate
  limiter config in `wrangler.toml`, existing security patterns (SSRF
  prevention, timing-safe comparison, no-reflect policy).
- **Why this agent**: The verification endpoint is the trust anchor of the
  entire system. A flaw here undermines the product's core value proposition.
  Key pinning vs embedded key, information disclosure through failure details,
  and cache-correctness under key rotation are all security-critical decisions.

### Consultation 3: Test Strategy for Cryptographic Verification

- **Agent**: test-minion
- **Planning question**: What test strategy covers the verification endpoint
  adequately? The issue requires two specific integration tests (happy path
  and tamper detection), but what additional test scenarios should we plan for?
  Specifically: (a) how to structure the tamper test -- modify R2 artifact
  directly, then call verify? Which artifact to tamper with (screenshot, HTML,
  WACZ)? (b) should we test signature verification failure separately (e.g.,
  wrong public key)? (c) the end-to-end test requires POST -> poll -> verify --
  can this work within the vitest/miniflare test harness, or does the
  background capture (ctx.waitUntil) need special handling? (d) should we add
  unit tests for the verification logic itself, separate from the integration
  tests? (e) what about edge cases: capture exists but WACZ is absent (no
  signing key was configured), capture in pending/failed state, R2 artifact
  missing but KV record exists?
- **Context to provide**: Existing test patterns in
  `test/capture-integration.test.js` and `test/capture-retrieval.test.js`,
  vitest config in `vitest.config.js` (miniflare setup, test signing key
  generation), the `SELF.fetch` + `env` binding pattern, `fetchMock` usage.
- **Why this agent**: The integration tests are the acceptance criteria for
  this step. The tamper-detection test is particularly tricky -- it needs to
  create a real capture, then surgically modify an R2 object, then verify.
  Getting the test architecture right determines whether the tests are reliable
  and maintainable.

## Cross-Cutting Checklist

- **Testing**: INCLUDE -- test-minion consulted above (Consultation 3). Test
  strategy is critical because integration tests are the acceptance criteria.
- **Security**: INCLUDE -- security-minion consulted above (Consultation 2).
  The verification endpoint IS the security feature; its design is
  security-critical.
- **Usability -- Strategy**: INCLUDE for planning. The verification endpoint
  is the public-facing trust interface. Planning question for ux-strategy-minion
  below.
- **Usability -- Design**: EXCLUDE -- no UI components. This is a JSON API
  endpoint.
- **Documentation**: INCLUDE for execution (not planning). software-docs-minion
  will document the new endpoint. No planning consultation needed -- the
  endpoint shape will be defined by api-design-minion.
- **Observability**: EXCLUDE -- single additional GET endpoint on an existing
  Worker. No new services, no distributed tracing needs. Logging follows
  existing patterns. Can revisit post-MVP when structured logging is added
  (backlog item).

### Consultation 4: Verification UX Strategy

- **Agent**: ux-strategy-minion
- **Planning question**: From a user journey perspective, how should the
  verification endpoint communicate trust? (a) When verification fails, what
  level of detail helps the user understand what went wrong without
  overwhelming them? Should the response distinguish between "artifact
  corrupted" vs "signature invalid" vs "capture incomplete"? (b) The
  verification endpoint is the primary trust signal for third parties -- should
  the response include enough context for a non-technical person to understand
  what "verified" means (e.g., a human-readable summary)? (c) Should the
  response include a `verifyUrl` that can be shared as a permalink for
  independent verification? (d) Is the `Cache-Control: immutable` behavior
  intuitive -- if a user bookmarks a verify URL, they'll always see the same
  result, which is correct for content-addressed captures but might confuse
  users if they expect "live" re-verification.
- **Context to provide**: Issue description, existing API response patterns,
  the content-addressed nature of capture IDs, the fact that verified captures
  can never change (immutability guarantee).
- **Why this agent**: The verification endpoint is the moment of truth in
  the user journey -- this is where WRL delivers its core value. The response
  shape and failure communication directly affect whether users trust the
  system. Journey coherence between capture, retrieval, and verification
  matters.

## Anticipated Approval Gates

1. **Response shape and verification algorithm** (MUST gate) -- The API contract
   for `/v1/verify/{id}` is hard to reverse once consumers depend on it, and it
   has high blast radius (Step 7 and future consumers). This gate consolidates
   api-design-minion's response shape recommendation with security-minion's
   key-pinning decision and ux-strategy-minion's failure communication guidance.
   Must be approved before implementation begins.

2. **Rate limiter configuration** (no gate) -- Low blast radius, easy to
   reverse. The ~60/min value from the issue is straightforward; just add the
   binding to wrangler.toml.

3. **Integration test approach** (no gate) -- Test architecture follows
   established patterns. Easy to revise after implementation.

## Rationale

This task is a focused, single-endpoint addition with well-understood inputs
(existing signing/hashing utilities, existing R2/KV data model) but important
design decisions around the API contract and security model. Four specialists
bring genuine planning value:

- **api-design-minion**: The response shape is a durable contract. Failure
  granularity, HTTP status semantics, and relationship to existing endpoints
  need deliberate design.
- **security-minion**: Key pinning vs embedded key, information disclosure in
  failure responses, and cache safety under key rotation are decisions that
  cannot be retrofitted cheaply.
- **test-minion**: The acceptance criteria ARE the integration tests. The
  tamper-detection test has non-obvious implementation challenges in the
  miniflare environment.
- **ux-strategy-minion**: Verification is the product's trust delivery moment.
  How failure is communicated and what "verified" means to the user are
  strategic UX decisions.

Agents NOT consulted for planning:
- **frontend-minion**: No UI.
- **iac-minion**: Only change is adding a rate limiter binding to wrangler.toml;
  trivial.
- **edge-minion**: Cache-Control header is specified in the issue; no CDN
  strategy decisions needed.
- **data-minion**: No schema changes; reads existing KV/R2 data.
- **observability-minion**: No new services; follows existing logging patterns.
- **mcp-minion, oauth-minion**: Not relevant.

## Scope

**In scope**:
- `GET /v1/verify/{id}` endpoint implementation in `src/index.js`
- Verification logic module (new `src/verify.js` or inline)
- VERIFY_RATE_LIMITER binding in `wrangler.toml`
- Route registration in the router
- End-to-end integration test (POST -> poll -> verify -> assert verified:true)
- Tamper detection test (modify R2 artifact -> verify -> assert verified:false)
- Unit tests for verification logic
- Cache-Control: public, immutable, max-age=31536000 on responses
- Evolution log entry (docs/evolution/0009-verification-endpoint/)

**Out of scope**:
- Web UI for verification
- Public key publishing endpoint (backlog item)
- RFC 3161 timestamps (backlog item)
- Key rotation handling beyond current single-key model
- Changes to existing endpoints
- Step 7 (public key endpoint) implementation

## External Skill Integration

No external skills detected in project.
