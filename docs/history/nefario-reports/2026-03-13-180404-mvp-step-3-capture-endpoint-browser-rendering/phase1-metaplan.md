# Meta-Plan: MVP Step 3 -- Capture Endpoint & Browser Rendering

## Task Summary

Build the capture lifecycle: a `POST /v1/captures` endpoint with API key auth,
headless browser rendering (screenshot + HTML + headers), KV-backed status
tracking, and a `GET /v1/captures/{id}/status` polling endpoint. This is the
core value-producing step of the MVP -- the first time WRL actually captures
a web resource.

## Planning Consultations

### Consultation 1: Security Architecture for Capture Pipeline

- **Agent**: security-minion
- **Planning question**: The capture pipeline chains several security-sensitive
  operations: API key auth (timing-safe comparison of `CAPTURE_API_KEY`),
  Browser Rendering with untrusted URLs (fresh incognito context, 30s timeout,
  50MB limit, 200 subresource cap), and a separate `fetch` call for HTTP headers
  using DNS-pinned IPs. What are the security boundaries we need to enforce
  between these stages? Specifically:
  1. For the `fetch` call to capture HTTP headers: should we re-validate the URL
     or trust the prior validation result? What headers should we strip/redact
     from the captured response?
  2. Browser isolation: are fresh incognito context + timeout + size limits
     sufficient, or do we need additional constraints (e.g., disabling JS,
     blocking specific content types)?
  3. API key comparison: confirm timing-safe comparison approach for the
     `Authorization: Bearer <key>` header against the `CAPTURE_API_KEY` env var.
  4. KV status writes: any risk of capture ID enumeration or status oracle
     attacks?
- **Context to provide**: `src/url-validation.js` (SSRF prevention module),
  `src/responses.js` (RFC 9457 helpers), `wrangler.toml` (bindings),
  `docs/backlog.md` security section, the issue's work items
- **Why this agent**: The capture pipeline is the primary attack surface of the
  entire application. Browser Rendering with untrusted URLs is inherently
  dangerous. Security boundaries between validation, rendering, header capture,
  and storage need expert review before code is written.

### Consultation 2: API Endpoint Design and Response Contracts

- **Agent**: api-design-minion
- **Planning question**: We're adding two endpoints (`POST /v1/captures` and
  `GET /v1/captures/{id}/status`) to the existing route table in `src/index.js`.
  The issue specifies precise response shapes. Planning questions:
  1. The 202 response must include capture ID and status URL, plus a note that
     the caller is responsible for preserving the capture ID. What's the exact
     response body shape? Should the status URL be absolute or relative?
  2. The status endpoint returns `{ "status": "pending"|"complete"|"failed" }`.
     Should we include additional metadata (capture ID, timestamps, error detail
     for failed captures)?
  3. The POST endpoint validates the URL via `validateUrl()` which returns
     discriminated results. How should validation failures map to HTTP responses?
     The existing `problemResponse()` helper uses RFC 9457 -- should we pass
     through `validateUrl`'s status codes directly?
  4. Rate limiting is platform-level (wrangler.toml or Cloudflare dashboard).
     Should the API responses include rate limit headers (the backlog has this
     as [should])?
- **Context to provide**: `src/index.js` (route table pattern), `src/responses.js`,
  the issue's acceptance criteria, `docs/evolution/0001-kickoff/decisions.md`
  (API design decisions)
- **Why this agent**: The response contracts defined here will be consumed by
  the OpenAPI spec (also committed to in kickoff decisions) and by downstream
  steps (Step 4: WACZ bundling). Getting the contracts right before
  implementation prevents rework.

### Consultation 3: Cloudflare Browser Rendering and Worker Architecture

- **Agent**: edge-minion
- **Planning question**: This step uses Cloudflare Browser Rendering (Puppeteer
  via `env.BROWSER`) for headless capture. Planning questions:
  1. The `BROWSER` binding is already in `wrangler.toml`. What's the correct
     Puppeteer API sequence for: launch browser -> new incognito context ->
     navigate to URL -> capture screenshot (full-page PNG) + rendered HTML ->
     destroy context? Are there Cloudflare-specific constraints vs standard
     Puppeteer?
  2. Browser isolation: the issue requires "fresh incognito context per capture,
     30s timeout, 50MB page limit, 200 subresource cap, context destroyed after
     completion." How do we enforce the 50MB page limit and 200 subresource cap
     in the Cloudflare Browser Rendering environment?
  3. The HTTP headers are captured via a separate Workers `fetch` call to the
     same DNS-pinned URL. How should we construct this fetch -- using the
     validated IP directly, or the original hostname with some pinning mechanism?
  4. Rate limiting: the issue says "~10 captures/min, ~3 concurrent per IP via
     wrangler.toml or Cloudflare dashboard." What's the correct wrangler.toml
     configuration for this? Is there a `[rules]` or `[rate_limiting]` section?
  5. The async pattern: POST accepts and returns 202, then does rendering in the
     background. On Cloudflare Workers, this means `ctx.waitUntil()` for the
     background work. Are there execution time limits we need to plan for?
- **Context to provide**: `wrangler.toml`, `src/index.js`, the issue's work items
  and technical notes
- **Why this agent**: Cloudflare Browser Rendering has specific API constraints,
  execution limits, and billing implications that differ from standard Puppeteer.
  The edge-minion knows these platform specifics. The rate limiting configuration
  and `ctx.waitUntil()` patterns are also Cloudflare-specific.

### Consultation 4: KV Data Model for Capture Status

- **Agent**: data-minion
- **Planning question**: Capture status is stored in KV (already bound as `KV`
  in wrangler.toml). Planning questions:
  1. Key structure: the issue says capture IDs are `cap_` + UUID (hyphens
     stripped). Should the KV key be just the capture ID, or namespaced
     (e.g., `status:{captureId}`)?
  2. Value shape: the status endpoint returns
     `{ "status": "pending"|"complete"|"failed" }`. Should the KV value store
     additional metadata (URL, timestamps, error message for failures, IP used)?
     This metadata might be needed by Step 4 (WACZ bundling).
  3. TTL: should pending captures expire? If a capture gets stuck, how long
     should the status record live?
  4. Consistency: KV is eventually consistent. The acceptance criteria say
     "returns pending immediately after submission." Is there a race condition
     between the POST writing `pending` and the GET reading it?
- **Context to provide**: `wrangler.toml` (KV binding), the issue's work items,
  Step 4 context (WACZ bundling will need to read capture artifacts)
- **Why this agent**: KV data model decisions propagate to Steps 4 and 5. The
  key structure, value shape, and TTL policy affect how downstream steps find
  and process captures.

### Consultation 5: Test Strategy for Capture Pipeline

- **Agent**: test-minion
- **Planning question**: The existing test suite uses `@cloudflare/vitest-pool-workers`
  with `SELF.fetch()` for integration tests and direct imports for unit tests.
  The vitest config already has `browserRendering: { binding: 'BROWSER' }` in
  miniflare options. Planning questions:
  1. How do we test the Browser Rendering code path? Does
     `@cloudflare/vitest-pool-workers` provide a mock browser, or do we need to
     structure the code so browser interactions are injectable/mockable?
  2. The capture pipeline has several testable boundaries: auth check, URL
     validation (already tested), KV status writes, browser rendering, header
     capture via fetch. What's the right decomposition between unit tests
     (direct function imports) and integration tests (`SELF.fetch()`)?
  3. How do we test the async `ctx.waitUntil()` pattern? Can we verify that
     KV status transitions from `pending` to `complete`/`failed` in tests?
  4. Existing test patterns: `test/health.test.js` uses `SELF.fetch()`,
     `test/url-validation.test.js` uses direct imports with injected resolvers.
     Should we follow the same split for capture tests?
- **Context to provide**: `vitest.config.js`, existing test files, the issue's
  acceptance criteria
- **Why this agent**: The capture pipeline involves Cloudflare-specific APIs
  (Browser Rendering, KV, `ctx.waitUntil()`) that need specific testing
  strategies. Getting the test architecture right before implementation ensures
  testable code structure.

### Cross-Cutting Checklist

- **Testing**: INCLUDED (Consultation 5 above). The capture pipeline involves
  multiple Cloudflare-specific APIs that need careful test strategy.
- **Security**: INCLUDED (Consultation 1 above). This is the primary attack
  surface of the application -- browser rendering with untrusted URLs.
- **Usability -- Strategy**: INCLUDED below (Consultation 6). The 202 async
  pattern is the user's first interaction with capture, and the status polling
  UX matters.
- **Usability -- Design**: NOT INCLUDED for planning. No UI components are
  produced -- this is a JSON API. The API response design is covered by
  api-design-minion.
- **Documentation**: INCLUDED below (Consultation 7). The API surface is
  expanding from 1 endpoint to 3. OpenAPI spec was committed to in kickoff
  decisions.
- **Observability**: NOT INCLUDED for planning. The backlog has structured
  logging as [should] with "add when debugging becomes painful." This step
  doesn't add production monitoring -- the Worker has basic Cloudflare logging
  by default. Observability will be assessed during Phase 3.5 review.

### Consultation 6: Capture UX and Developer Experience

- **Agent**: ux-strategy-minion
- **Planning question**: The capture flow is the core user journey: submit URL
  -> get capture ID -> poll status -> eventually retrieve result. Planning
  questions:
  1. The 202 response must tell the caller to preserve the capture ID (there's
     no list endpoint in MVP). Is the response body wording sufficient, or do we
     need additional UX signals (e.g., response headers, explicit documentation)?
  2. The status endpoint returns a minimal object. For failed captures, should
     the response include an actionable error message? What cognitive load does
     the polling pattern impose vs alternatives?
  3. The backlog notes "Capture ID recovery" as [consider] -- lost ID = lost
     capture. Should the 202 response design actively mitigate this risk?
- **Context to provide**: The issue's acceptance criteria, the backlog (capture
  ID recovery item), kickoff API design decisions
- **Why this agent**: ALWAYS included. The async capture flow is the primary
  user journey. Journey coherence and cognitive load of the polling pattern
  need review.

### Consultation 7: API Documentation Planning

- **Agent**: software-docs-minion
- **Planning question**: The kickoff decisions committed to maintaining
  `openapi.yaml` alongside implementation. This step adds 2 new endpoints
  (`POST /v1/captures`, `GET /v1/captures/{id}/status`) with specific request
  and response schemas. Planning questions:
  1. Should the OpenAPI spec be written before implementation (contract-first)
     or alongside it? The kickoff decision says "written alongside
     implementation."
  2. What documentation artifacts need to be produced or updated? OpenAPI spec,
     evolution log, README updates?
  3. The response shapes involve RFC 9457 problem details for errors and custom
     JSON for success. How should these be modeled in the OpenAPI spec?
- **Context to provide**: Kickoff decisions (OpenAPI commitment), existing
  `src/responses.js` (RFC 9457 pattern), the issue's response shapes
- **Why this agent**: ALWAYS included. The API surface is growing significantly
  and OpenAPI was committed to as a day-one artifact.

## Anticipated Approval Gates

1. **API Response Contracts** (MUST gate): The exact response body shapes for
   202 Accepted, status responses, and error responses. Hard to reverse once
   implementation and OpenAPI spec are built on them. High blast radius --
   downstream Steps 4 and 5 depend on these contracts.

2. **KV Data Model** (MUST gate): Key structure and value shape for capture
   status in KV. Affects how Steps 4 and 5 read and write capture data. Hard
   to change after data is written.

3. **Browser Rendering Approach** (OPTIONAL gate): The Puppeteer API sequence,
   isolation constraints, and error handling for the browser rendering step.
   Significant implementation complexity but contained within this step --
   can be revised without affecting the API contract.

## Rationale

This step is the most architecturally consequential in the MVP. It introduces:

- **The first mutable state** (KV status records) -- data model decisions
  propagate forward.
- **The primary attack surface** (browser rendering with untrusted URLs) --
  security boundaries must be right.
- **The core API contracts** (capture + status endpoints) -- consumed by
  downstream steps and external callers.
- **Platform-specific complexity** (Cloudflare Browser Rendering, Workers
  `ctx.waitUntil()`, KV eventual consistency, platform rate limiting) --
  edge-minion expertise is essential.

The seven consultations cover the four implementation domains (security, API
design, edge platform, data model) plus three cross-cutting concerns (testing,
UX, documentation). api-spec-minion is not included separately because the
OpenAPI spec authoring is straightforward once api-design-minion defines the
contracts -- it can be handled in execution.

Agents NOT consulted for planning and why:
- **iac-minion**: No new infrastructure. KV and Browser bindings already exist
  in wrangler.toml. Rate limiting is platform config, covered by edge-minion.
- **frontend-minion**: No frontend. JSON API only.
- **observability-minion**: Deferred per backlog ("add when debugging becomes
  painful"). Basic Cloudflare Worker logging is automatic.
- **oauth-minion**: Auth is a single static API key comparison, not an OAuth
  flow.
- **mcp-minion**: No MCP integration in this step.
- **ux-design-minion / accessibility-minion**: No visual UI.
- **sitespeed-minion**: No web-facing pages.

## Scope

**In scope**:
- `POST /v1/captures` endpoint with Bearer token auth
- Capture ID generation (`cap_` + UUID, hyphens stripped)
- Browser Rendering: full-page screenshot (PNG) + rendered HTML
- Browser isolation (incognito context, timeout, size limits, subresource cap)
- HTTP response header capture via separate `fetch` call
- KV-backed status tracking (pending -> complete/failed)
- `GET /v1/captures/{id}/status` endpoint
- RFC 9457 error responses (401, 404)
- Platform rate limiting configuration
- Tests for all new code
- OpenAPI spec update

**Out of scope** (deferred to later steps):
- WACZ bundling (Step 4)
- R2 storage of capture artifacts (Step 4)
- Ed25519 signing (Step 5)
- Verification endpoint (Step 5)
- List/search captures endpoint (post-MVP backlog)
- Structured logging (backlog [should])
- CORS configuration (backlog [should])

## External Skill Integration

No external skills detected in project. No `.claude/skills/` or `.skills/`
directories exist in the working directory.
