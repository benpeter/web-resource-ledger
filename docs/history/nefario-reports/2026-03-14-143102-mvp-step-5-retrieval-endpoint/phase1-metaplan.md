## Meta-Plan: MVP Step 5 -- Retrieval Endpoint

### Planning Consultations

#### Consultation 1: Artifact URL strategy -- direct R2 vs pre-signed
- **Agent**: api-design-minion
- **Planning question**: The retrieval endpoint (`GET /v1/captures/{id}`) must
  return artifact URLs. The issue notes "direct R2 public URLs or pre-signed
  URLs depending on bucket access policy -- document the choice." What is the
  right URL strategy for R2 artifacts in this context, given that the capture
  ID already acts as the access secret, there is no authentication on this
  endpoint, and WACZ files are the primary artifact? The worker has full R2
  access but the bucket's public-access policy is not yet set. Recommend
  whether artifact URLs should be (a) direct R2 public URLs, (b) Cloudflare
  R2 public-access URLs, or (c) worker-proxied `/v1/captures/{id}/artifacts/{name}`
  paths, with rationale.

  Context to provide:
  - `wrangler.toml`: R2 binding is `BUCKET`, bucket name `wrl-captures`
  - `src/capture.js`: artifacts stored under `captures/{captureId}/{name}` (individual)
    and `captures/{waczHash}.wacz` (WACZ bundle)
  - `src/kv.js`: `completeCapture` stores `artifacts` object (R2 keys) and optional
    `wacz` object `{ key, bundleHash, size }` in KV
  - `openapi.yaml`: existing `CaptureStatus` schema has `captureUrl` pointing to
    `GET /v1/captures/{captureId}` -- this is the retrieval endpoint being added
  - Backlog `[should]`: "Captured HTML XSS prevention -- serving captured HTML as
    text/html enables stored XSS; must serve as text/plain or with
    Content-Disposition: attachment at retrieval endpoint"
  - The issue requires `Content-Type` and `Content-Length` headers on artifact
    serving (implying the worker, not a redirect, serves the bytes)
- **Why this agent**: API design owns the response schema, URL structure, and
  how artifacts are exposed to callers. The choice between proxy vs. redirect vs.
  direct URL shapes the entire handler and has long-term API contract implications.

#### Consultation 2: Response schema for `GET /v1/captures/{id}`
- **Agent**: api-spec-minion
- **Planning question**: Design the OpenAPI schema for `GET /v1/captures/{id}`
  and update `openapi.yaml`. The endpoint returns capture metadata plus artifact
  links. Key constraints: (1) no authentication required (ID is the secret),
  (2) WACZ bundle may or may not be present (graceful degradation from Step 4),
  (3) individual artifacts (screenshot, rendered HTML, headers) are always present
  for a complete capture, (4) the backlog has a [should] item about serving HTML
  with XSS-safe content disposition. Produce the schema for the `CaptureDetail`
  response object and the `GET /v1/captures/{captureId}` path entry.

  Context to provide:
  - `openapi.yaml` full file (existing schemas, error responses, patterns)
  - `src/kv.js` comment block showing the `complete` record shape:
    `{ status, url, ip, captureId, createdAt, completedAt, artifacts: { screenshot, html, headers? }, wacz?: { key, bundleHash, size } }`
  - Issue requirement: response must include capture metadata fields and artifact URLs
  - Issue requirement: RFC 9457 404 for unknown IDs
  - The existing `CaptureStatus` schema's `captureUrl` field already points here
- **Why this agent**: api-spec-minion owns OpenAPI spec authoring and contract-first
  design. The schema produced here gates implementation.

#### Consultation 3: Security constraints for the retrieval endpoint
- **Agent**: security-minion
- **Planning question**: The new `GET /v1/captures/{id}` endpoint has three
  distinct security concerns that need concrete implementation guidance:

  1. **XSS via served HTML** -- The backlog has a [should] item: "serving captured
     HTML as text/html enables stored XSS; must serve as text/plain or with
     Content-Disposition: attachment." How should the worker serve the
     `rendered.html` artifact to prevent stored XSS? (The issue says Content-Type
     must be correct -- clarify what "correct" means for HTML artifacts.)

  2. **Capture ID as access secret** -- There is no authentication on this
     endpoint; the capture ID (a 32-hex UUID variant) is the only access control.
     Is this pattern safe, or should any additional mitigations be added?

  3. **Information disclosure in the response** -- What fields from the KV
     record should be omitted from the API response? The KV record stores
     `ip` (resolved IP at submission time) and the raw R2 key path. Should
     either appear in the response, or should the response expose only
     public-facing fields?

  Context to provide:
  - `src/kv.js` complete record shape (the `ip` field, artifact keys)
  - `src/capture.js` storage pattern (R2 key = `captures/{captureId}/{name}`)
  - `src/index.js` existing security comment: "SECURITY: Static string -- do
    NOT echo captureId back in response body"
  - Backlog security items: XSS prevention, TOCTOU mitigation, CORS
  - Issue note: "capture ID acts as the access secret; document this in the
    response schema"
- **Why this agent**: This is the first GET endpoint serving stored content to
  unauthenticated callers. Security review before implementation prevents
  stored XSS and information leakage from being baked into the API contract.

#### Consultation 4: Test strategy for lifecycle smoke test
- **Agent**: test-minion
- **Planning question**: The issue requires an integration smoke test:
  "POST capture -> poll status until complete -> GET capture -> assert metadata
  fields present and artifact URLs reachable." The existing test suite uses
  `@cloudflare/vitest-pool-workers` with `cloudflare:test` bindings (real KV
  in test environment) and `fetchMock` for outbound requests. The background
  capture (`performCapture`) runs via `ctx.waitUntil()`.

  Design the integration test(s) for:
  (a) `GET /v1/captures/{id}` happy path -- known complete capture ID returns
      metadata and artifact URLs
  (b) `GET /v1/captures/{id}` 404 path -- unknown ID returns RFC 9457 404
  (c) The end-to-end lifecycle smoke test -- POST -> poll -> GET -> assert

  Specific concern: in the test environment, `ctx.waitUntil()` tasks may run
  asynchronously. The existing status tests handle this by accepting
  `['pending', 'complete', 'failed']`. How should the lifecycle smoke test
  handle the background capture completion? What can be verified deterministically
  without timing assumptions?

  Also: the WACZ pipeline requires a `SIGNING_KEY` environment variable. The
  `vitest.config.js` generates an ephemeral signing key at test load time.

  Context to provide:
  - `test/capture-integration.test.js` (full file -- existing test patterns)
  - `vitest.config.js` for test environment bindings
  - `src/kv.js` for the ability to directly manipulate KV in tests
  - Issue acceptance criteria (the three bullet points)
- **Why this agent**: The lifecycle smoke test has non-trivial async complexity.
  Test-minion needs to design the strategy before implementation to avoid a
  brittle test that passes in dev but flakes in CI.

### Cross-Cutting Checklist

- **Testing**: INCLUDE test-minion -- this step introduces the first GET endpoint
  that serves stored content, plus a multi-step lifecycle smoke test. Test strategy
  needs specialist input before implementation.
- **Security**: INCLUDE security-minion -- first unauthenticated endpoint serving
  stored content. Stored XSS via HTML artifacts and information leakage from KV
  records are real, non-speculative risks. Security review before implementation.
- **Usability -- Strategy**: INCLUDE ux-strategy-minion -- planning question:
  The `GET /v1/captures/{id}` response closes the capture lifecycle. What fields
  should the response include for a developer using this API for the first time?
  Is the capture ID-as-secret pattern intuitive, or does the response need a
  note field (similar to the 202 `note` field) to remind callers? What is the
  minimum viable response shape that answers "did my capture succeed and where
  is the WACZ?"
- **Usability -- Design**: EXCLUDE -- no user-facing UI in this step. The
  response is a JSON API consumed by developers.
- **Documentation**: INCLUDE software-docs-minion -- the OpenAPI spec is a
  primary deliverable. The `GET /v1/captures/{id}` path and `CaptureDetail`
  schema must be added to `openapi.yaml`. No user-docs-minion needed (no
  end-user-facing changes).
- **Observability**: EXCLUDE for planning -- this is a KV read with <10ms
  latency. The 300ms target is structural (no computation on the hot path),
  not an observability problem. Monitoring/alerting remains in the backlog.

### Anticipated Approval Gates

1. **Response schema and artifact URL strategy** (api-spec-minion output) --
   Hard to reverse: the `CaptureDetail` schema and the artifact URL strategy
   (proxy vs. direct vs. pre-signed) are API contracts that callers build against.
   Multiple downstream tasks (handler implementation, test implementation, OpenAPI
   spec) depend on this decision. MUST gate.

2. **Security constraints** (security-minion output) -- Hard to reverse: the
   decision on how to serve the HTML artifact (Content-Type) and what fields to
   expose (IP address exclusion) affects the API contract and test assertions.
   Gate before handler implementation.

### Rationale

- **api-design-minion** is consulted for the artifact URL strategy because the
  choice (proxy vs. direct URL vs. pre-signed) is the central design decision
  and has implications for latency, security, and the response schema.
- **api-spec-minion** translates that decision into the OpenAPI contract. The
  spec is produced at planning time so implementation has a clear contract to
  follow.
- **security-minion** is consulted before implementation, not after, because the
  XSS risk in serving HTML and the IP field exposure are known issues from the
  backlog that must be resolved as design constraints, not retrofitted.
- **test-minion** is consulted because the lifecycle smoke test has non-trivial
  async complexity. Getting the test strategy wrong produces either a brittle
  test or a test that doesn't actually verify the acceptance criteria.

### Scope

**In scope (this step):**
- `GET /v1/captures/{id}` -- handler in `src/index.js`
- Artifact serving from R2 with correct headers
- RFC 9457 404 for unknown IDs
- OpenAPI spec update for the new endpoint
- Integration smoke test (POST -> poll -> GET)
- Evolution log entries (prompt.md, decisions.md, outcome.md per CLAUDE.md)

**Out of scope:**
- Individual artifact sub-resource endpoints (e.g., `/v1/captures/{id}/screenshot`)
  -- YAGNI until needed
- Pagination or listing of captures -- deferred post-MVP
- Authentication on the retrieval endpoint -- capture ID is the secret (MVP choice)
- Artifact deletion or TTL management
- CORS configuration -- deferred backlog item
- Queue migration for background capture processing

---

### External Skill Integration

No external skills detected in project. Neither `.claude/skills/` nor `.skills/`
exist in the working directory `/Users/ben/github/benpeter/web-resource-ledger`.
