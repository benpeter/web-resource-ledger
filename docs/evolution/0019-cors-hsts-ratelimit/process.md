# Process: 0019-cors-hsts-ratelimit

## TL;DR

Five specialists planned three header-level security improvements (CORS, HSTS
preload, X-RateLimit-Limit) in parallel, resolved two design conflicts in
synthesis, passed architecture review with 3 approvals and 2 advisories, and
executed in three batches with 434 tests passing. Total: 4 tasks, 0 approval
gates, ~15 minutes of agent time across planning, review, and execution.

## Which specialists were consulted and why

**Planning team (5 agents):**

- **security-minion**: CORS is fundamentally a security mechanism. The interaction
  between wildcard GET CORS and restrictive POST CORS needed expert review. The
  env var design (how origins are specified) has security implications for
  injection and bypass.

- **edge-minion**: The rate limit ceilings in wrangler.toml `[[unsafe.bindings]]`
  are not available at runtime. Bridging binding config with runtime header values
  is a Cloudflare Workers-specific pattern that edge-minion owns.

- **test-minion**: CORS needs carefully specified test cases (allowed/disallowed/
  missing origin, preflight shape). Three features across multiple endpoints needed
  a coherent test organization strategy.

- **ux-strategy-minion**: The target user is a developer configuring CORS for their
  browser extension. Env var naming, documentation placement, and error response
  behavior directly affect developer experience.

- **software-docs-minion**: All three changes add or modify response headers that
  need OpenAPI spec updates. The spec has an established component/reference pattern
  that the new headers must follow.

**Not consulted (with rationale):**

- api-design-minion: These are implementation details of existing endpoints, not new
  API surface design.
- iac-minion: Adding an env var to wrangler.toml is standard configuration, not
  infrastructure work.
- observability-minion: No new runtime components; existing rate limit logging covers
  the new behaviors.

## What each specialist argued

### security-minion

Strongest opinion on CORS implementation correctness:
- Comma-separated env var (`CORS_ORIGINS`), not JSON (simpler for `wrangler secret put`)
- Exact string match against parsed array -- never substring matching
- `Vary: Origin` is mandatory (CDN cache poisoning prevention)
- `Access-Control-Max-Age: 7200` (Chrome's effective cap)
- Empty allowlist = no CORS headers at all (fail closed)
- Existing GET wildcard CORS (`*`) is correct and safe to leave unchanged
- OPTIONS must be path-specific, not a global catch-all

### edge-minion

Focused on the rate limit config bridging problem:
- `src/rate-limits.js` config module over duplicating in `[vars]` (one sync point
  vs four: prod binding, staging binding, prod vars, staging vars)
- `X-RateLimit-Limit` should report per-IP ceiling, not global capacity
- Global capacity (200/min) must NOT be exposed (security concern)
- 503 from global limiter should carry no rate limit header
- OPTIONS preflight must intercept before auth/routing

### test-minion

Pragmatic test organization:
- New `cors.test.js` (not in `security-headers.test.js` -- CORS involves OPTIONS,
  env var config, and conditional behavior that doesn't fit the static-headers pattern)
- HSTS updates stay in `security-headers.test.js` (exact-value change to existing header)
- Rate limit assertions distributed across existing test files per endpoint
- Use miniflare bindings for CORS_ORIGINS (same pattern as CAPTURE_API_KEY)

### ux-strategy-minion

Developer experience perspective:
- `CORS_ORIGINS` over `CORS_ALLOWED_ORIGINS` ("allowed" is redundant)
- Documented example directly in wrangler.toml `[vars]` (the file operators edit)
- No Link header for rate limits -- bare integer is the convention (GitHub, Stripe)
- Critical insight: CORS headers must go in the global pipeline, not inside handlers,
  because error responses (401, 429) without CORS headers cause browsers to report
  CORS errors instead of the real status code

### software-docs-minion

Minimal spec changes:
- Per-operation CORS docs (not servers section -- OpenAPI has no standard mechanism)
- Update existing StrictTransportSecurity component (propagates via $ref)
- New XRateLimitLimit component header with references on 5 success responses + Problem429
- Skip documenting OPTIONS as a separate operation (browser mechanism, not API contract)
- Version bump to 0.3.0

## Where specialists disagreed

### Conflict 1: CORS header application scope

**security-minion** recommended a path-specific OPTIONS handler for `/v1/captures` only,
with CORS headers applied within the handler.

**ux-strategy-minion** recommended CORS headers in the global response pipeline so that
error responses (401, 400, 429) also carry CORS headers. Without this, a browser sending
a CORS request that gets 401 would see a CORS error, not the auth error.

**Resolution**: Both positions adopted as complementary. The OPTIONS handler IS
path-specific (only responds to `/v1/captures`), but the `Access-Control-Allow-Origin`
header is applied in the global response pipeline for all POST `/v1/captures` responses.
This ensures correct CORS on both success and error paths without a global OPTIONS
catch-all.

### Conflict 2: Rate limit config pattern

**edge-minion** recommended a `src/rate-limits.js` config module exporting ceiling
constants. One sync point with wrangler.toml bindings.

**ux-strategy-minion** recommended hardcoding ceiling values directly in the handler
response construction, co-located with the rate limit checks.

**Resolution**: edge-minion's approach adopted. The single-source-of-truth argument
(one module vs values scattered across handlers) won over co-location. The config
module is also importable by tests for assertion values, reducing magic numbers.

### Conflict 3: Access-Control-Max-Age value

**security-minion** recommended 7200 seconds (Chrome's effective cap).
**edge-minion** recommended 86400 seconds (24 hours, common default).

**Resolution**: 7200. Chrome silently caps at 7200 regardless of declared value.
Advertising 86400 is misleading. Using the effective maximum avoids discrepancy.

### Non-conflict: Env var name

Both security-minion and ux-strategy-minion independently recommended `CORS_ORIGINS`.
edge-minion used `CORS_ALLOWED_ORIGINS` in examples. Resolved to `CORS_ORIGINS` per
project naming convention (terse, no adjectives).

## How the human shaped the outcome

The human provided several directives that shaped the orchestration:

1. **Combined three issues in one PR**: Rather than three separate branches and PRs,
   the human recognized these are small, well-scoped, header-level changes that share
   the same files and benefit from atomic delivery.

2. **Skipped all approval gates**: Deferred decisions to gru and lucy instead of
   halting for human input. This accelerated the flow -- zero gates means no blocking
   waits during execution.

3. **Evolution slug provided**: `cors-hsts-ratelimit` provided up front, avoiding
   the slug generation step and ensuring consistency with the planned evolution
   sequence number (0019).

4. **Process.md requirement**: Explicitly called out as a project requirement, which
   lucy also caught during architecture review when it was missing from Task 4's
   deliverables.

**What the human chose NOT to intervene on**: All specialist conflict resolutions were
accepted as synthesized. The team composition (5 specialists) was not adjusted. No
additional scope or requirements were added beyond the three issues.

## Architecture review findings

5 mandatory reviewers, 0 discretionary. Results:

- **security-minion (APPROVE)**: Plan addresses all CORS concerns. Minor note: rename
  `getCorsHeaders` to `getAllowedOrigin` for clarity (adopted in implementation).

- **test-minion (APPROVE, advisory)**: Two notes -- make Vary: Origin assertion explicit
  in test list (adopted), and note the 503 rate-limit-absent test gap (miniflare can't
  trigger real global-limiter 503; gap documented).

- **ux-strategy-minion (APPROVE)**: Journey coherent, cognitive load reduced, no
  simplification opportunities remaining.

- **lucy (ADVISE)**: process.md missing from Task 4 deliverables. This is required by
  CLAUDE.md Process Documentation section AND the user's explicit prompt. Handled by
  orchestrator at wrap-up rather than adding to a task agent.

- **margo (APPROVE)**: Proportional complexity. Two minor notes -- `getRateLimitGroup`
  could use `startsWith` instead of regex (adopted), and `rate-limits.js` could
  theoretically be inlined but the test-import rationale justifies the separate file.

## Execution sequence

**Batch 1** (sequential): edge-minion implemented all three features:
- `src/index.js`: CORS preflight handler, CORS response headers in global pipeline,
  HSTS preload directive, X-RateLimit-Limit injection
- `src/rate-limits.js`: new config module
- `wrangler.toml`: CORS_ORIGINS commented example
- `vitest.config.js`: CORS_ORIGINS test binding

**Batch 2** (parallel after Batch 1):
- test-minion: 15 new CORS tests + HSTS assertion updates + rate limit assertions
  across 6 existing test files
- software-docs-minion: openapi.yaml updated to 0.3.0 with all three features

**Batch 3** (after all): software-docs-minion created evolution log 0019, updated
backlog (R3, R4, R5 marked done), updated evolution index.

## Where to read more

- Specialist contributions: `docs/history/nefario-reports/2026-03-16-122043-cors-hsts-ratelimit/phase2-*.md`
- Architecture review verdicts: `docs/history/nefario-reports/2026-03-16-122043-cors-hsts-ratelimit/phase3.5-*.md`
- Synthesis (delegation plan): `docs/history/nefario-reports/2026-03-16-122043-cors-hsts-ratelimit/phase3-synthesis.md`
- Decisions: `docs/evolution/0019-cors-hsts-ratelimit/decisions.md`
- Outcome: `docs/evolution/0019-cors-hsts-ratelimit/outcome.md`
