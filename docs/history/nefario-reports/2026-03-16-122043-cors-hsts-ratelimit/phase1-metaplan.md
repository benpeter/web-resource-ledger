## Meta-Plan

**Task**: Implement R3 (CORS for capture POST), R4 (HSTS preload), R5 (X-RateLimit-Limit header) as a combined PR.

### Codebase Context

This is a Cloudflare Worker (`src/index.js`) serving a web resource archival API. Key observations:

- **Routing**: Manual regex-based route table in `index.js`. Only matches specific `[method, pattern]` tuples -- no OPTIONS handler exists today. Unmatched requests fall through to a static 404.
- **Existing CORS**: GET endpoints already return `Access-Control-Allow-Origin: *` inline (hardcoded per-handler in `handleGetCapture`, `handleGetCaptureArtifact`, `handleVerifyCapture`, `handleGetSigningKey`, `handleGetSigningKeys`). The POST endpoints (`handleCreateCapture`, `handleListCaptures`) do NOT have CORS headers.
- **Existing HSTS**: `Strict-Transport-Security: max-age=31536000; includeSubDomains` is set globally in the fetch handler (line 55). Needs `preload` directive added + max-age bumped to 63072000 (2 years, required by hstspreload.org).
- **Rate limiting**: Three rate limiter bindings exist (`CAPTURE_RATE_LIMITER`, `VERIFY_RATE_LIMITER`, `GLOBAL_CAPTURE_LIMITER`). Rate limit logic is inline per handler. No `X-RateLimit-*` headers are returned today.
- **Responses**: Centralized `problemResponse()` and `jsonResponse()` in `responses.js`. Security headers applied globally after handler returns.
- **Tests**: Vitest with `@cloudflare/vitest-pool-workers`. Existing `security-headers.test.js` validates security headers across routes.
- **Config**: `wrangler.toml` has `[vars]` section for env vars. Rate limit values are in `simple = { limit: N, period: P }`.

### Planning Consultations

#### Consultation 1: CORS preflight design for configurable origin allowlist

- **Agent**: security-minion
- **Planning question**: Given the current architecture where GET endpoints use `Access-Control-Allow-Origin: *` and POST endpoints have no CORS, what is the correct CORS preflight implementation for the capture POST endpoint? Specifically: (1) Should the origin allowlist env var use comma-separated values or JSON? (2) What `Access-Control-Allow-Headers` and `Access-Control-Allow-Methods` should be included? (3) Should CORS headers be applied to the POST response as well as the OPTIONS preflight? (4) What is the correct behavior for an empty/missing allowlist (the issue says "default empty = no cross-origin access")? (5) Are there any CORS cache (`Access-Control-Max-Age`) recommendations? (6) Does the existing wildcard on GET endpoints create any security concern now that POST will have a restrictive allowlist?
- **Context to provide**: `src/index.js` (full file -- routing, handlers, existing `Access-Control-Allow-Origin: *` on GET endpoints), `src/auth.js` (auth flow -- CORS preflight must NOT require auth), `wrangler.toml` (env vars section)
- **Why this agent**: CORS misconfiguration is a common security vulnerability. The interaction between wildcard GET CORS and restrictive POST CORS needs expert review. The env var design (how origins are specified) has security implications.

#### Consultation 2: Rate limit header sourcing from config

- **Agent**: edge-minion
- **Planning question**: The issue requires `X-RateLimit-Limit` with the value "sourced from config, not hardcoded." The rate limit values are currently defined in `wrangler.toml` under `[[unsafe.bindings]]` as `simple = { limit: 10, period: 60 }` etc. These values are NOT available at runtime -- the rate limiter binding only exposes a `limit()` method. What is the best pattern for making the static ceiling available as a response header? Options include: (1) Duplicate values in `[vars]` section, (2) Define a single config object in source code that both documents and exports the values, (3) Something else. Also: the three rate-limited handler groups have different ceilings (capture=10/min, verify=60/min, global=200/min) -- should `X-RateLimit-Limit` reflect the per-IP limit or the global capacity limit?
- **Context to provide**: `wrangler.toml` (rate limiter bindings and their limits), `src/index.js` (rate limit check code in handlers)
- **Why this agent**: CDN/edge worker configuration patterns, specifically how to bridge wrangler binding config with runtime header values. The "config not hardcoded" requirement needs a practical pattern for Cloudflare Workers.

### Cross-Cutting Checklist

- **Testing** (test-minion): Include for planning. The CORS implementation needs carefully specified test cases (allowed origin, disallowed origin, missing origin, preflight with various request headers). The HSTS change requires updating `security-headers.test.js` assertions. The rate limit header needs tests across all three rate-limited endpoint groups. **Planning question**: Given the existing test patterns in `test/security-headers.test.js` and `test/capture.test.js`, what test file organization is best for CORS tests? Should they go in `security-headers.test.js` (since CORS is a security concern) or a new `cors.test.js`? How should the configurable origin allowlist be tested (env var injection in vitest config)?

- **Security** (security-minion): Include -- covered in Consultation 1 above. CORS is fundamentally a security mechanism.

- **Usability -- Strategy** (ux-strategy-minion): Include. **Planning question**: From a developer experience perspective, how should the CORS origin allowlist be documented for operators deploying WRL? The target user is a developer setting up WRL who wants browser extensions to call the API. Is `CORS_ALLOWED_ORIGINS` the right env var name? Should the rate limit header include documentation references (e.g., a Link header to API docs)?

- **Usability -- Design** (ux-design-minion, accessibility-minion): Exclude. No user-facing UI changes. These are HTTP header changes only.

- **Documentation** (software-docs-minion): Include. **Planning question**: The project has an OpenAPI spec (`openapi.yaml`). All three changes add or modify response headers that should be reflected in the spec. What is the minimal documentation update needed? Should CORS behavior be documented in the OpenAPI spec's `servers` section or per-operation?

- **Observability** (observability-minion): Exclude. No new runtime services or significant logging changes. The existing rate limit logging already captures rate limit events. CORS preflight failures are observable through the existing 404 (no OPTIONS handler) path.

### Anticipated Approval Gates

Given the scope of these three issues (one small CORS feature, one header change, one header addition), I anticipate **zero or one** approval gates:

1. **Possible gate: CORS origin allowlist design** -- If the security-minion and edge-minion disagree on the env var format or the interaction between wildcard GET CORS and restrictive POST CORS, this may need user input. However, the issues are well-specified enough that this is likely LOW blast radius and EASY to reverse (env var config), so it would be a no-gate per the classification matrix.

Most likely outcome: **no gates**. All three issues are well-specified with clear success criteria, the changes are additive (new headers, new OPTIONS handler), and everything is easily reversible.

### Rationale

This is a focused, well-scoped batch of security/API header improvements. The three issues are independent in functionality but share the same file (`src/index.js`) and test infrastructure. They should be planned together to ensure:

1. **File ownership**: A single execution agent handles all `src/index.js` changes to avoid merge conflicts.
2. **CORS design**: security-minion expertise ensures the CORS implementation is correct, especially the interaction between wildcard GET and restrictive POST CORS.
3. **Config pattern**: edge-minion knows how to bridge wrangler.toml binding config with runtime values.
4. **Test organization**: test-minion ensures the test approach is consistent with existing patterns.

Agents NOT consulted for planning:
- **api-design-minion**: These are implementation details of existing endpoints, not new API design.
- **iac-minion**: No infrastructure changes needed; env var is a standard wrangler.toml addition.
- **observability-minion**: No new logging needs beyond existing rate limit logging.
- **mcp-minion, data-minion, frontend-minion**: Not relevant to HTTP header changes.

### Scope

**In scope**:
- OPTIONS preflight handler for `POST /v1/captures` with configurable origin allowlist
- CORS headers on `POST /v1/captures` responses (not just preflight)
- HSTS header updated to include `preload` directive with 2-year max-age
- `X-RateLimit-Limit` header on all rate-limited endpoints
- Tests for all three features
- OpenAPI spec updates for new/changed headers
- Evolution log entry (0019-cors-hsts-ratelimit)

**Out of scope**:
- CORS on other endpoints (GET endpoints already have wildcard CORS)
- `X-RateLimit-Remaining` or `X-RateLimit-Reset` headers (explicitly excluded in issue #35)
- OAuth/cookie-based auth
- Browser UI
- CSP changes
- Other security headers
- hstspreload.org submission (manual step, documented in outcome.md)

### External Skill Integration

No external skills detected in project. Scanned `.claude/skills/` and `.skills/` in the working directory -- no SKILL.md files found. User-global skills at `~/.claude/skills/` are all despicable-agents agents or unrelated personal skills (transcribe, obsidian-tasks, etc.).
