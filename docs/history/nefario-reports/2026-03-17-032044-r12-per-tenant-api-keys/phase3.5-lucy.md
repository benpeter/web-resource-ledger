# Lucy Code Review: R12 Per-Tenant API Keys

**Verdict: BLOCK**

Two blocking issues: zero test coverage for all new code paths (admin endpoints, KV auth, scope enforcement), and silent catch blocks violating the project's "fail loudly" directive. The implementation itself aligns well with the original requirements and synthesis recommendations -- the code quality is good, but the test gap means it ships without any verification that the core feature works.

---

## Requirements Traceability

| Requirement (from issue #42 prompt + synthesis) | Code Element | Status |
|---|---|---|
| KV-based key lookup (`apikey:{sha256}` -> `{tenantId, scopes}`) | `src/auth.js` lines 123-172: SHA-256 hash, KV lookup, scope expansion | COVERED |
| Per-tenant capture isolation (tenant can only list/retrieve own captures) | `src/index.js` line 305: `listCaptures(env.KV, auth.tenantId, ...)` | COVERED |
| Read/write key scoping (capture vs read-only keys) | `src/auth.js` `requireScope()`, called in `handleCreateCapture` and `handleListCaptures` | COVERED |
| Key provisioning via admin API (not CLI) | `src/admin.js`: `POST/GET/DELETE /v1/admin/keys` | COVERED |
| Migration path (existing key works as first tenant key) | `src/auth.js` lines 189-203: `CAPTURE_API_KEY` fallback with deprecation warning | COVERED |
| v1 API contract unbroken | Routes unchanged, new 403 only for scope-limited keys, existing single key gets full scopes | COVERED |
| Per-IP rate limiting retained | `src/index.js`: all existing rate limiters untouched | COVERED |
| Dedicated ADMIN_KEY env var (not CAPTURE_API_KEY as superadmin) | `src/auth.js` lines 174-187: separate `ADMIN_KEY` path, admin scope only | COVERED |
| Admin rate limiter at 5/min | `wrangler.toml` line 39: `ADMIN_RATE_LIMITER`, `simple = { limit = 5, period = 60 }` | COVERED |
| Observability enrichment (keyName, reason, admin events) | `src/admin.js` and `src/index.js`: log calls with keyName, reason, admin subsystem | COVERED |
| OpenAPI spec updated | `openapi.yaml`: admin tag, three admin endpoints documented | COVERED |
| OPERATIONS.md migration guide | `OPERATIONS.md` lines 109-163: complete migration runbook | COVERED |
| Tests for new functionality | **NO test file for admin endpoints or KV auth path** | **MISSING** |
| IDOR prevention on admin API | `src/admin.js` line 236: tenant-scoped keys ignore query param; line 340: revoke returns 404 for cross-tenant | COVERED (code) / UNTESTED |

**Coverage: 13/14 requirements traced to code. 1 critical gap: no tests.**

---

## Findings

### F1 [COMPLIANCE / BLOCK]: No tests for admin endpoints or KV-based auth

**CHANGE:** Three new admin API handlers (`handleAdminCreateKey`, `handleAdminListKeys`, `handleAdminRevokeKey`) totaling ~400 lines, plus a rewritten `verifyApiKey()` with KV-first lookup, scope enforcement via `requireScope()`, and revocation checking.

**VIOLATION:** No `test/admin.test.js` exists. No tests for the KV auth path in `test/auth.test.js` (tests only cover the legacy `CAPTURE_API_KEY` env-var path -- see `makeEnv()` at line 7 which returns `{ CAPTURE_API_KEY: key }` only). No tests for scope enforcement (403 on `requireScope`). No tests for IDOR prevention on admin API. Zero occurrences of `admin`, `ADMIN_KEY`, `requireScope`, `scope`, or `403` anywhere in the `test/` directory (verified via grep).

**WHY this blocks:** CLAUDE.md Engineering Philosophy: "the test suite must include at least one assertion that the integration actually works end-to-end." And: "When adding a feature that depends on an external service, the test suite must include at least one assertion that the integration actually works end-to-end." The admin API and KV auth path are the primary new functionality of R12. The admin handlers contain security-critical logic -- IDOR prevention, revocation guards, scope enforcement -- that has zero automated verification. Shipping ~400 lines of new handler code with zero test coverage is incompatible with the project's testing philosophy.

**FIX:** Add `test/admin.test.js` covering at minimum:
- `POST /v1/admin/keys` -- happy path (key creation, response shape, KV record written)
- `POST /v1/admin/keys` -- auth failures (no auth, wrong key, non-admin scope -> 403)
- `GET /v1/admin/keys` -- lists only the authenticated tenant's keys (IDOR test)
- `DELETE /v1/admin/keys/:hash` -- revocation (soft-delete, already-revoked idempotency, cross-tenant 404)
- Self-revocation guard (409)
- Last-admin-key guard (409)

Extend `test/auth.test.js` to cover:
- KV-based key lookup (key found, scopes returned)
- Revoked KV key returns 401 (does NOT fall through to env-var check)
- `ADMIN_KEY` returns admin scope, null tenantId
- Scope enforcement: read-only key -> 403 on capture endpoint

### F2 [COMPLIANCE / BLOCK]: Silent catch blocks in `src/admin.js` violate "fail loudly"

**CHANGE:** Five `catch {}` blocks in `src/admin.js` at lines 158, 244, 256, 357, 369 that swallow KV read errors with only a comment.

**VIOLATION:** CLAUDE.md Engineering Philosophy: "silent `catch {}` blocks are forbidden. Every catch must either log the error or handle a specific, named error type." The comments in these catch blocks acknowledge degraded behavior ("Start fresh if read fails", "Return empty list on read error", "Skip records that fail to read", "guard is best-effort if index is unreadable") but no error is logged. The `log()` function and `ctx` parameter are both available in all three handlers.

**WHY this blocks:** The project explicitly calls this out as a pattern that "you own the next incident it hides." These catch blocks cover the tenant key index reads (`tenant-keys:{tenantId}`) and individual key record reads. If KV is degraded, an operator would see empty key lists and successful-looking revocations with no indication that data is being silently dropped. The existing `kv.js` module follows the correct pattern at line 82: `console.warn('createCapture: index write failed (non-fatal)', err?.message)`.

**FIX:** Add logging to each catch block. Example for line 158:
```js
} catch (err) {
  // Start fresh if read fails -- key will still be written
  console.warn('admin.createKey: tenant index read failed (non-fatal)', err?.message);
}
```
Or use the structured `log()` function with severity 4 and the `admin` subsystem.

### F3 [SCOPE / ADVISE]: `key_` display prefix from synthesis not implemented

**CHANGE:** The synthesis (phase3-synthesis.md, "Dissenting Views" point 4) resolved that list responses should display `key_` prefixed short IDs for human readability.

**OBSERVATION:** `src/admin.js` `handleAdminListKeys` returns `{ keyHash: hash, ...record }` (line 254). No `key_` prefix display ID is included.

**WHY this is ADVISE not BLOCK:** The synthesis says "The short ID is a display concern, not an API contract concern." The full hash is correct for API operations. Not implementing the display ID is a minor deviation from the synthesis, not a requirement gap from issue #42.

**FIX:** If desired, add `displayId: 'key_' + hash.slice(0, 16)` to list entries.

### F4 [CONVENTION / ADVISE]: Duplicated SHA-256 logic in `src/auth.js`

**CHANGE:** `src/auth.js` computes SHA-256 of the token inline at lines 125-128, and also exports a `hashKey()` function at lines 52-56 that performs the identical computation.

**WHY:** `verifyApiKey()` recomputes the hash inline instead of calling the exported `hashKey()`. Both produce identical hex-encoded SHA-256 digests. Minor DRY violation.

**FIX:** Replace lines 125-128 with `const keyHash = await hashKey(token);`.

### F5 [DRIFT / APPROVE]: No scope creep detected

The implementation stays within the boundaries defined by the synthesis:
- No OAuth, no social signup, no RBAC beyond capture/read/admin.
- No CLI tooling -- admin API only.
- No billing, quotas, or per-tenant rate limiting.
- `CAPTURE_API_KEY` dual-mode fallback preserves backward compatibility.
- `ADMIN_KEY` correctly separated from tenant credentials.
- Three scopes only (`capture`, `read`, `admin`) with `capture` implying `read` (line 160).
- Soft-delete revocation with `revoked: true` flag.
- Server-generated keys with `wrl_live_` prefix.
- Self-revocation guard and last-admin-key guard both implemented.
- Safety guards (409 on self-revoke, 409 on last-admin-key) are justified by the advisory's design decisions, not scope creep.

### F6 [COMPLIANCE / APPROVE]: CLAUDE.md conventions followed

- JavaScript (not TypeScript), vanilla, no frameworks.
- `// tva` present in `src/auth.js` line 21, `src/admin.js` line 11, `src/rate-limits.js` line 3.
- RFC 9457 error responses via `problemResponse()`.
- Timing-safe comparison for env-var checks.
- Security comments are thorough and accurate.
- `wrangler.toml` staging parity maintained (ADMIN_RATE_LIMITER in both environments with correct namespace IDs 1004/2004).
- Route registration follows existing `[method, regex, handler]` tuple pattern.
- Rate limit header correctly added for admin group in `getRateLimitGroup()`.

### F7 [COMPLIANCE / APPROVE]: Documentation is complete and accurate

- `OPERATIONS.md`: full R12 migration runbook (pre-merge, post-deploy ADMIN_KEY setup, first tenant key provisioning, verification steps, GitHub secrets update, CAPTURE_API_KEY removal, rollback procedure). ADMIN_KEY added to Manual Deploy emergency bypass section and both environment secret tables.
- `CONTRIBUTING.md`: `ADMIN_KEY` added to `.dev.vars` template and staging secrets list.
- `README.md`: step 5 added for ADMIN_KEY configuration; multi-tenant usage description added to Usage section.
- `openapi.yaml`: all three admin endpoints documented with request/response schemas, 403/409 error responses, admin tag defined.
- `vitest.config.js`: `ADMIN_KEY` binding added for test environment.

---

## Summary

The code implementation is well-structured, security-conscious, and faithfully implements issue #42 and the advisory synthesis. No scope creep. Two blocking issues must be resolved before merge:

1. **BLOCK: No tests for the core new feature.** ~400 lines of security-critical handler code (admin API, KV auth, scope enforcement, IDOR prevention, revocation guards) have zero automated test coverage. This directly violates the project's "test the real boundaries" philosophy.

2. **BLOCK: Silent catch blocks in admin.js.** Five catch blocks swallow KV errors with only comments, violating the "fail loudly" directive. Adding log lines is straightforward.

Two advisory items (display ID not implemented, DRY violation in hash computation) are minor and can be addressed at implementor discretion.
