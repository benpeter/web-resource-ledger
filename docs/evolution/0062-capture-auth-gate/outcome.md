# Phase 0062: Outcome

## What Was Built

Capture retrieval endpoints now require tenant authentication. The "capture ID as access secret" model is replaced by proper auth gates with share tokens for delegated access.

### Core Implementation (Task 1 — security-minion)

- **D1 migration** (`migrations/0010_share_tokens.sql`): share_tokens table with token_hash PK, capture_id/tenant_id FKs, expires_at, and 3 indexes including partial index on expires_at.
- **Share token module** (`src/share-tokens.js`): generateShareToken (256-bit, wrl_share_ prefix), hashShareToken (SHA-256), createShareToken, getShareTokenByHash, deleteExpiredShareTokens.
- **Auth gate in fetch()** (`src/index.js`): Route-level gate for all GET /v1/captures/* routes. Share token and API key auth are mutually exclusive. Verify endpoint (/v1/verify/) excluded by pathname prefix.
- **Tenant isolation**: All capture-read handlers (get, artifacts, status) enforce ownership check. Cross-tenant returns 404 (identical to non-existent).
- **Share endpoint**: POST /v1/captures/{id}/share creates tokens with optional expiresIn (300-31536000 seconds).
- **Token propagation**: When accessed via share token, artifact URLs in responses include `?token=` parameter.
- **Cron cleanup**: deleteExpiredShareTokens wired into scheduled handler.
- **Tests**: 49 test files, 1174 tests pass. Rewritten capture-retrieval.test.js (auth + isolation), new share-token.test.js (creation, usage, scoping, expiry).

### CLI Update (Task 2 — devx-minion)

- **Token propagation**: fetchWaczFromCaptureUrl detects ?token= in input URL and forwards to artifact download.
- **Error message**: 401 responses now explain share tokens and suggest alternatives.
- **Version bump**: 0.1.0 → 0.2.0.
- **README**: Updated with share URL and verify URL examples.

### Documentation (Task 3 — software-docs-minion)

- **SECURITY.md**: Removed known-gap paragraph. Added Access Model, Share Token Design, Threat Analysis sections.
- **README.md**: Removed all "ID as secret" references. Added auth headers to curl examples. New "Sharing captures" section.
- **openapi.yaml**: Added shareToken security scheme, POST /share endpoint, 401/410 responses on retrieval endpoints.
- **Backlog**: Marked auth gate done. Added parking lot items for revocation, analytics, auto-share.
- **Site content**: Updated index.md and authentication.md.

## What Deviated from Plan

1. **Schema simplified**: The synthesis plan still had revoked/revoked_at/label columns and per-capture limit from the pre-review version. Phase 3.5 reviewers (lucy, margo) correctly identified these as scope creep. All removed before execution.
2. **No revocation endpoint**: The synthesis included a DELETE /share/{tokenHashPrefix} route. Removed per issue scope — revocation is explicitly listed as a future enhancement.
3. **Raw token not stored in env._captureAuth**: Margo flagged storing the raw token on the auth context object. Handlers extract it from URL params directly instead.

## Backlog Changes

- **Done**: R33 capture auth gate (this phase)
- **Added to parking lot**:
  - Share token revocation API (R33 follow-up)
  - Share token analytics (access counts, last-used tracking)
  - Auto-share tenant configuration (auto-generate share token on capture completion)
