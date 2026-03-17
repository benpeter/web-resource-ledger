# Decisions -- 0037 Per-Tenant API Keys

## Design Decisions (settled by advisory 2026-03-17)

These decisions were made in a prior advisory orchestration and carried into implementation unchanged:

1. **ADMIN_KEY is a separate infrastructure credential**, not tenant 1. Dedicated wrangler secret, analogous to SIGNING_KEY.
2. **Key provisioning via admin API only** (POST/GET/DELETE /v1/admin/keys). No CLI in R12.
3. **Three scopes: capture, read, admin**. capture implies read. admin does NOT imply capture/read.
4. **KV key storage**: `apikey:{sha256hex}` → `{ tenantId, scopes, name, createdAt, createdBy, revoked }`
5. **Soft-delete revocation** with 60s KV eventual consistency accepted.
6. **No KV key caching**: 10-40ms latency acceptable within 300ms budget.

## Implementation Decisions (made during synthesis)

1. **DELETE returns 200 with confirmation body** (not 204). Operator safety: a fat-fingered hash with silent 204 is undetectable. ux-strategy-minion's position won over api-spec-minion's REST purism.

2. **scope_violation folded into security.auth_fail** with `reason: 'scope_violation'` rather than a separate event. Single event per failure is simpler and existing Coralogix queries auto-capture it.

3. **Full 64-char SHA-256 hash as identifier everywhere** (not 16-char prefix). No collision risk, `name` field handles human readability.

4. **name field required on key creation**. Without it, key list is anonymous hashes making revocation guesswork. Not YAGNI overhead -- a single string preventing operational errors.

5. **lastUsedAt deferred**. KV write on every request is YAGNI at MVP scale.

6. **Auth flow ordering**: KV lookup → ADMIN_KEY → CAPTURE_API_KEY → reject. Revoked KV keys terminate immediately, never fall through to env-var paths. KV errors return 500 (fail closed).

7. **Rate-limit-before-auth on admin endpoints** (opposite of capture endpoints). Throttles brute-force pre-auth abuse.

## Rejected Alternatives

- **CAPTURE_API_KEY as bootstrap superadmin** (security-minion advisory proposal): Rejected in favor of dedicated ADMIN_KEY. Cleaner separation of tenant vs infrastructure credentials.
- **Separate verifyAdminAuth()**: Rejected. Unified verifyApiKey() + requireScope('admin') is simpler and consistent.
- **KV key caching via caches.default**: Rejected. Security (instant revocation) trumps marginal latency gain.
- **16-char keyId display prefix**: Rejected. Full hash everywhere, name field for human readability.