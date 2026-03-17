# Outcome -- 0037 Per-Tenant API Keys

## What was built

R12 per-tenant API keys: KV-based multi-path authentication with admin API for key provisioning, scope enforcement on existing endpoints, and migration runbook.

### Files changed (15 files, 1 new)

| File | Change | Description |
|------|--------|-------------|
| src/auth.js | rewritten | Multi-path verifyApiKey (KV/ADMIN_KEY/CAPTURE_API_KEY), requireScope, hashKey |
| src/admin.js | **new** | POST/GET/DELETE /v1/admin/keys handlers with tenant isolation |
| src/index.js | modified | Admin routes, scope enforcement on capture/list, keyName logging |
| src/capture.js | modified | keyName parameter threaded through all log events |
| src/rate-limits.js | modified | Admin rate limit entry (5/min) |
| wrangler.toml | modified | ADMIN_RATE_LIMITER binding (1004/2004) |
| vitest.config.js | modified | ADMIN_KEY test binding |
| openapi.yaml | modified | Admin endpoints, scope docs, v0.5.0 |
| OPERATIONS.md | modified | Migration runbook, secret tables updated |
| README.md | modified | New step 5 (ADMIN_KEY), multi-tenant usage |
| CONTRIBUTING.md | modified | .dev.vars template + staging secrets |
| test/auth.test.js | rewritten | KV auth, scope, revocation, fallback tests |
| test/admin.test.js | **new** | 40 tests: admin CRUD, auth, IDOR, guards |
| test/capture.test.js | modified | keyName parameter in performCapture calls |
| test/verify-*.test.js | modified | keyName parameter in performCapture calls |

### Test results

577/577 tests pass across 24 test files. OpenAPI spec validates clean.

## What deviated from the plan

1. **Code review found name/keyName field mismatch**: admin.js stored `name` but auth.js read `record.keyName`. Fixed to read `record.name`. Would have caused all KV-authenticated keys to show truncated hash instead of human-readable name in logs.

2. **Silent catch blocks flagged by lucy**: 5 catch blocks in admin.js had no logging. Added `console.warn()` to all. CLAUDE.md explicitly forbids silent catch blocks.

3. **Tests were not part of the execution plan**: The synthesis assigned tests to Phase 6 (post-execution), but lucy blocked on zero test coverage for security-critical code. Tests were written as a fix task: 40 admin tests + full auth.test.js rewrite.

## Backlog changes

No new backlog items. Existing items unchanged:
- R13 (audit logging) remains gated on R12 (now resolved)
- Per-tenant rate limiting remains in parking lot
- lastUsedAt tracking explicitly deferred