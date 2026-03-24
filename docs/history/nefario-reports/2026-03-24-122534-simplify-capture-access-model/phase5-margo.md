# Margo Review -- Simplify Capture Access Model (#169)

## Verdict: APPROVE

This is a textbook simplification. The change removes an entire subsystem (share tokens: ~110 lines of runtime code, ~373 lines of tests, a D1 table with 3 indexes, a cron cleanup job, an API endpoint, and auth-branching logic) and replaces it with nothing. The access model collapses from three paths (tenant auth, share token, public verify) to two (tenant auth for list/create, public for individual captures). Net code is negative. Net complexity is negative. Net abstractions: minus one.

## Complexity Assessment

### Essential complexity preserved
- Tenant isolation on the list endpoint (prevents catalog enumeration)
- Authenticated cross-tenant access returns 404 identical to non-existent capture (no enumeration signal)
- IP field scrubbed from public responses
- `Cache-Control: no-store` (correctly dropped `private` since responses are no longer per-tenant)

### Accidental complexity removed
- Share token generation, hashing, storage, lookup, expiry, and cleanup
- `env._captureAuth.scopedCaptureId` (share-token scoping)
- `?token=` query param propagation through artifact and status URLs
- `isWaczArtifactRequest` special-case for public WACZ access
- `POST /v1/captures/{id}/share` endpoint and route
- `shareToken` security scheme and related OpenAPI parameters/responses (401, 410)
- `seedShareToken` test fixture and 38 share-token-specific tests

### What was NOT added (correctly)
- No new abstraction layers
- No new dependencies
- No synthetic "public auth context" object -- handlers use a null-check on `env._captureAuth`
- No new configuration options
- No new tables or schemas

## Findings

### 1. Rate limiter on artifact endpoint (minor scope addition)

**File**: `src/index.js` lines 1566-1576

The plan explicitly said "Do NOT add rate limiting to the newly-public endpoints." The implementation added a 9-line guard to `handleGetCaptureArtifact` that reuses the existing `VERIFY_RATE_LIMITER` binding for unauthenticated artifact requests. This is a minor deviation from the plan.

**Assessment**: Not blocking. The guard reuses an existing binding (zero new infrastructure), is conditional on the binding existing (`if (!captureAuth && env.VERIFY_RATE_LIMITER)`), and protects against abuse of a now-public endpoint that serves potentially large binaries (WACZ files up to 100MB). The scope addition is small and defensible. However, it should be noted in the evolution log as a deviation from the plan.

### 2. Handler pattern is clean and minimal

The `if (captureAuth && record.tenantId !== captureAuth.tenantId)` pattern across the three handlers (`handleGetCapture`, `handleCaptureStatus`, `handleGetCaptureArtifact`) is the simplest possible approach. No synthetic auth objects, no boolean flags, no abstraction. The null-check communicates the intent clearly: if credentials were presented, enforce isolation; otherwise, serve publicly. This is the right decision (documented in the synthesis as "chosen over always setting a public auth context object").

### 3. Auth gate credential detection is appropriately strict

`src/index.js` lines 487-498: The gate distinguishes between "no credentials" (public access) and "bad credentials" (401). This is correct -- presenting invalid credentials should not silently fall through to public access. The implementation checks for `Authorization` header and session cookie presence before attempting auth. This prevents the pattern where a revoked API key silently degrades to public access.

### 4. Test coverage matches the new model

Tests correctly verify:
- Unauthenticated access returns 200 (not 401)
- Authenticated cross-tenant access returns 404 (isolation preserved)
- Non-existent captures return 404 unauthenticated (no information leak)
- IP field absent from responses (privacy)
- Artifact URLs contain no `?token=` suffix
- `Cache-Control: no-store` without `private`

### 5. D1 migration is correct

`migrations/0013_drop_share_tokens.sql` drops indexes before the table. `DROP IF EXISTS` prevents failures on clean databases. Code change and migration deploy together -- correct since the table is completely unused after the code change and old `?token=` URLs work because the endpoint is now public.

### 6. Documentation is consistent

SECURITY.md, README.md, OpenAPI spec, site content, and verify package README all consistently describe the two-path model. Zero share token references remain in any deliverable. The OpenAPI spec correctly uses `security: []` on the three capture GET endpoints.

## Complexity Budget

| Change | Cost |
|--------|------|
| Code removed (share-tokens.js, handler branches, route, cron job) | -5 |
| Tests removed (share-token.test.js, cross-tenant/share tests) | -2 |
| Rate limiter on artifact endpoint (reuses existing binding) | +0.5 |
| **Net** | **-6.5** |

This PR reduces the complexity budget. That is rare and correct.
