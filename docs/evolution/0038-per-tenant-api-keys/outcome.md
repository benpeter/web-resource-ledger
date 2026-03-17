# Outcome: Per-Tenant API Keys and Tenant Isolation

## Summary

Implemented per-tenant API key authentication with KV-based key lookup, admin key management API, scope enforcement, and a three-phase migration runbook. Dual-mode legacy fallback preserves backward compatibility. 575 tests pass (65 new). OpenAPI bumped to 0.5.0. PR #90 resolves issue #42.

## What Changed

### Source files (5 modified/created)

| File | Changes |
|------|---------|
| `src/auth.js` | Full rewrite. Exports `hashApiKey` (SHA-256 to hex), `hasScope` (capture implies read), `verifyApiKey` (KV lookup + legacy fallback + scope enforcement), `verifyAdminKey` (separate admin auth). All failure paths return enriched objects with `reason` field. |
| `src/admin.js` | New file. Three handlers: `handleAdminCreateKey` (201 with one-time raw key), `handleAdminListKeys` (no pagination, optional ?include=revoked and ?tenant filter), `handleAdminRevokeKey` (idempotent soft-delete). |
| `src/kv.js` | Added KV prefix registry comment. Four new functions: `createApiKeyRecord` (collision guard), `getApiKeyRecord`, `revokeApiKeyRecord` (idempotent), `listApiKeyRecords` (parallel fetch, in-memory filter). |
| `src/index.js` | Admin route registration, admin auth wrapper (rate limit before auth), scope enforcement on existing endpoints (`requiredScope: 'capture'` for create, `'read'` for list/get), log enrichment with `keyName`/`authMethod`/`reason` on all post-auth events. |
| `src/rate-limits.js` | Added `admin: { limit: 5, period: 60 }` entry. |

### Config files (2 modified)

| File | Changes |
|------|---------|
| `wrangler.toml` | `ADMIN_RATE_LIMITER` binding: production (namespace 1004), staging (namespace 2004). |
| `vitest.config.js` | Added `ADMIN_KEY: 'test-admin-key-for-vitest'` miniflare binding. |

### Test files (4 modified/created)

| File | Changes |
|------|---------|
| `test/auth.test.js` | Rewritten with 4 describe blocks: KV-based lookup, dual-mode legacy fallback, admin auth, preserved existing behavior. Uses real miniflare KV. |
| `test/admin-keys.test.js` | New file. 33 tests covering CRUD, round-trip lifecycle (create→capture→revoke→401), cross-tenant isolation, rate limiting, scope enforcement. |
| `test/kv.test.js` | Added API key record CRUD describe block (~22 new tests). |
| `test/fixtures.js` | Added `seedApiKey` helper, `TEST_ADMIN_KEY`, `TEST_TENANT_KEY` constants. |

### Documentation files (5 modified)

| File | Changes |
|------|---------|
| `openapi.yaml` | Version 0.4.0 → 0.5.0. New `adminAuth` security scheme. New `admin` tag. 4 new schemas, 3 new paths with full examples and curl commands. |
| `OPERATIONS.md` | `ADMIN_KEY` in secret surfaces table. New "Multi-Tenant Key Migration" section with three phases, curl examples, Coralogix query for legacy monitoring, rollback paths. |
| `README.md` | Step 4 reframed as legacy fallback. New step 8a for ADMIN_KEY. Usage section updated. Roadmap updated. |
| `SECURITY.md` | Added admin key compromise and tenant isolation escape to scope. Known gap documented for unauthenticated `GET /v1/captures/{id}`. |
| `docs/backlog.md` | R12 marked DONE. Parking lot items updated. New backlog item for capture endpoint auth post-multi-tenant. |

## Test Results

575 tests pass across 24 test files. No regressions. 65 new tests added.

## Backlog Changes

- **R12 marked DONE** in Act 2.
- **Updated**: parking lot Auth items gated on R12 now reflect that R12 shipped (per-tenant rate limiting condition met, API key rotation now possible).
- **Added**: "Evaluate auth requirement for GET /v1/captures/{id} post-multi-tenant" — security-minion flagged that single-capture retrieval relies on ID entropy, not auth. Acceptable while single-tenant; needs revisiting when a second tenant is onboarded.
- **Deferred**: `wrl_test_` prefix for staging keys (YAGNI), secondary KV index for key listing at 500+ keys, audit logging (R13).

## Surprises

1. **Legacy fallback does not enforce `requiredScope`** — The `verifyApiKey` legacy path returns hardcoded `scopes: ['capture', 'read']` and `{ ok: true }`. Scope enforcement happens at the handler level (which checks `hasScope` on the returned scopes), not inside the auth function. test-minion noted this and adjusted the test to verify returned scopes don't include `'admin'` rather than expecting a 403 from `verifyApiKey` itself. This is correct behavior — the handler is the enforcement point.

2. **Existing captures needed no migration.** All post-R8 records already carry `tenantId: 'default'`. The only change is where `tenantId` originates — from the KV key record instead of hardcoded in `auth.js`. data-minion confirmed this during planning, preventing unnecessary migration code.

3. **Admin rate limiter fires before auth.** This is intentional (prevents brute force against ADMIN_KEY), but means rate limit errors on admin endpoints don't carry auth context in logs. Acceptable trade-off: the rate limit event logs the IP, which is the relevant signal for brute force detection.
