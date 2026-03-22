# Process: Per-Tenant Rate Limiting

## TL;DR

Five specialist agents planned per-tenant rate limiting across three parallel
tracks (infrastructure, handler logic, admin config). Five mandatory reviewers
approved the plan with 9 advisories incorporated during synthesis. Four
execution tasks ran sequentially -- wrangler.toml bindings, KV functions,
handler rewrites, and MCP integration. One test failure (batch tests hitting
the new 10/60s tenant limit) was caught and fixed during execution. 675 tests
pass, 2 skipped. The entire phase ran in autonomous mode with no human
intervention at gates.

## Team Composition

### Planning Specialists (Phase 2)

| Agent | Planning Question | Key Argument |
|-------|------------------|--------------|
| security-minion | How should the three-layer rate limit architecture be structured to prevent bypass? | CF binding as hard ceiling catches runaway usage even if KV is stale; IP guard prevents single-IP quota exhaustion |
| api-design-minion | How should rate limit headers and 429 responses communicate limits to API clients? | X-RateLimit-* headers (not IETF draft) for universal client compatibility; `limitType` field for machine-readable 429 discrimination |
| iac-minion | What wrangler.toml and binding changes are needed for the IP guard layer? | New CAPTURE_IP_GUARD binding at 50/60s; raise CAPTURE_RATE_LIMITER to 100/60s as ceiling; both prod and staging |
| test-minion | What test coverage is needed for dual-layer rate limiting? | Existing miniflare rate limit tests have known limitations (skipped tests); focus on KV counter logic and header assertions |
| margo | Is per-endpoint differentiation needed now? | Single rate limit group is correct -- no demonstrated need for separate limits; adding groups adds complexity to admin config schema |

### Architecture Reviewers (Phase 3.5)

All five mandatory reviewers (security-minion, test-minion, ux-strategy-minion,
lucy, margo) returned APPROVE or ADVISE. No BLOCKs. Nine advisories were
incorporated into the synthesis:

1. **[security]** Legacy auth must stay on IP-only limiting (shared `default`
   tenantId creates DoS vector if per-tenant limiting applied)
2. **[security]** IP guard 429s should stay opaque (don't leak tenant info)
3. **[api-design]** Batch endpoint should check entire batch upfront (prevents
   bypass via many small batches)
4. **[api-design]** X-RateLimit-Reset should be seconds-until-reset, not
   Unix timestamp (matches existing header convention)
5. **[testing]** Batch tests need tenant config seeding (default 10/60s limit
   is too low for 20-URL batch tests)
6. **[governance]** Response pipeline must not overwrite handler-set headers
   (avoid double X-RateLimit-Limit from both handler and pipeline)
7. **[governance]** Admin tenant config endpoints need ADMIN_KEY auth
   (consistent with existing admin API pattern)
8. **[simplicity]** setTenantConfig should be pure write, not PATCH (avoids
   read-modify-write races)
9. **[simplicity]** Single rate limit group for all authenticated endpoints
   (no per-endpoint differentiation until demonstrated need)

## Execution (Phase 4)

Four tasks executed sequentially:

### Task 1: Infrastructure (wrangler.toml + rate-limits.js)

Agent: iac-minion (sonnet)

Added CAPTURE_IP_GUARD binding (50 requests/60s) to both production and staging
in wrangler.toml. Raised CAPTURE_RATE_LIMITER from 10/60s to 100/60s to serve
as a ceiling rather than the primary limiter. Created `src/rate-limits.js` with
exported constants and `getEffectiveLimit()` helper that merges tenant overrides
with defaults, capped at the binding ceiling.

### Task 2: KV Functions (kv.js)

Agent: data-minion (sonnet)

Extended `rateLimitCounter()` with a `count` parameter for batch increment
support. The check `(current + count) > limit` generalizes correctly for both
single requests (count=1) and batches. Added `getTenantConfig()` and
`setTenantConfig()` for KV-based tenant configuration with `updatedBy` tracking.
`getEffectiveLimit()` reads tenant overrides and merges with defaults.

### Task 3: Handler Rewrites (index.js + responses.js)

Agent: api-design-minion (sonnet)

The largest change. Added `checkCaptureRateLimit()` helper that encapsulates the
three-layer logic with `authMethod` branching:
- Legacy auth: single CF binding check with IP key (unchanged behavior)
- KV auth: CF ceiling (tenantId key) -> KV counter -> IP guard

Updated three handlers (handleCreateCapture, handleBatchCapture,
handleListCaptures) to use the new helper. Each handler now sets
X-RateLimit-Limit/Remaining/Reset headers on success responses for KV-auth
tenants.

Key restructuring in handleBatchCapture: body parse moved before rate limit
check (need `urls.length` for count parameter). Per-URL rate limit loop gated
behind `usePerUrlRateLimits = auth.authMethod === 'legacy'` -- KV auth skips
the loop entirely since it checked upfront.

Extended `problemResponse()` with `extra` parameter. Tenant 429s include
`limitType: 'tenant'`; IP guard 429s stay opaque.

Added admin endpoints:
- `GET /v1/admin/tenants/{tenantId}/config`
- `PUT /v1/admin/tenants/{tenantId}/config`

Response pipeline updated: skips X-RateLimit-Limit header if handler already
set it (`!response.headers.has('X-RateLimit-Limit')` check).

### Task 4: MCP Integration (mcp.js)

Agent: api-design-minion (sonnet)

Added KV counter check in the capture_url tool after the CF binding ceiling.
Skips IP guard (no CF-Connecting-IP available in MCP requests). Returns dynamic
Retry-After based on window reset time.

## Test Fix

After Task 3, the batch test "batch at maximum size (20 items) works" failed
with 429 instead of 207. Root cause: the test uses KV auth, so it flows through
the new dual-layer path where the default per-tenant limit is 10/60s -- but the
test submits 20 URLs.

Fix: Added `rl:` prefix cleanup in `beforeEach` and seeded tenant config with
`rateLimit: { capture: { limit: 100, period: 60 } }` for the test tenant. This
ensures batch tests have sufficient headroom while exercising the real rate
limit path.

## Decisions

Eight decisions documented in `decisions.md`. The most consequential:

1. **Three-layer architecture** over single CF binding: CF bindings are
   compile-time (can't change limits per tenant), so KV counters enable
   per-tenant overrides while the CF binding serves as a hard ceiling.

2. **Single rate limit group** over per-endpoint groups: lucy and margo both
   argued against separate groups in Phase 3.5 review. No demonstrated need,
   and a tenant hitting their capture limit also getting list calls blocked is
   correct back-pressure.

3. **Legacy auth stays IP-only**: The shared `default` tenantId means all legacy
   users would share one bucket -- per-tenant limiting on a shared bucket
   creates a DoS vector where one user exhausts limits for all.

4. **Batch upfront check** over per-URL checks: Prevents bypass via many small
   batches. Also cheaper (1 KV read vs N).

## Human Interventions

This phase ran in fully autonomous mode. No human interventions at any gate.
All gates were auto-approved by lucy per the autonomous execution protocol.

## Where to Read More

- Full specialist contributions: `docs/history/nefario-reports/` (the nefario
  report for this phase contains specialist summaries)
- Decisions with alternatives: `docs/evolution/0045-per-tenant-rate-limiting/decisions.md`
- What was built: `docs/evolution/0045-per-tenant-rate-limiting/outcome.md`
- Issue context: GitHub Issue #94
