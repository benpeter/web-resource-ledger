# Data Architecture Contribution -- Per-Tenant API Keys and Tenant Isolation

## Recommendations

### 1. KV Schema for API Key Records

**Key**: `apikey:{sha256hex}` where `sha256hex` is the lowercase hex-encoded SHA-256 of the raw key string.

**Value** (JSON):

```json
{
  "tenantId": "acme-corp",
  "scopes": ["capture", "read"],
  "name": "production-capturer",
  "createdAt": "2026-03-17T14:30:00.000Z",
  "createdBy": "admin",
  "revoked": false,
  "revokedAt": null
}
```

Field specifications:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `tenantId` | string | yes | Matches `/^[a-z0-9_-]{1,64}$/` (existing contract from `kv.js` and `auth.js`) |
| `scopes` | string[] | yes | Subset of `["capture", "read", "admin"]`. `capture` implies `read` at auth check time, not stored as expansion. Store what was granted; derive effective permissions in the auth layer. |
| `name` | string | yes | Human-readable label, 1-128 chars. Used for observability (`keyName` in log events). Not unique -- operators may reuse names. |
| `createdAt` | string (ISO 8601) | yes | Server-generated, immutable. |
| `createdBy` | string | yes | See section 5 below for identity model. |
| `revoked` | boolean | yes | Default `false`. Set to `true` on DELETE. Never set back to `false` (revocation is permanent). |
| `revokedAt` | string (ISO 8601) \| null | yes | `null` until revoked, then ISO timestamp. Immutable once set. |

**No TTL/expiration on key records.** See section 4 for rationale.

**SHA-256 key format**: The sha256hex in the KV key is exactly 64 lowercase hex characters. Example KV key: `apikey:a1b2c3d4e5f6...` (64 chars). This is long enough to be globally unique and short enough to be manageable as KV key material. The raw key (which includes the `wrl_live_` prefix) is never stored -- only the hash.

### 2. Existing Capture Records -- No Migration Needed

The existing data model is already correctly structured for multi-tenancy:

**Primary records** (`capture:{captureId}`): All records created since R8 already contain `tenantId: 'default'` in their value. The `completeCapture` and `failCapture` functions in `kv.js` already read `existing.tenantId` and handle the `tenantId` field correctly. Pre-R8 records that lack `tenantId` are already handled -- `completeCapture` and `failCapture` both guard with `if (existing.tenantId && existing.createdAt)` before writing index keys.

**Secondary index keys** (`tenant:default:ts:{ISO}:{captureId}`): All post-R8 captures are already indexed under `tenant:default:`. The `listCaptures` function already scopes queries by `tenantPrefix(tenantId)`.

**No backfill or migration of capture records is required.** The only thing that changes is how `tenantId` flows into the system: currently hardcoded to `'default'` in `auth.js` line 88, it will be derived from the KV key record after the auth rewrite. The data model downstream of auth is already tenant-aware.

**Pre-R8 records** (the oldest captures, before tenantId was introduced) remain accessible via direct `getCapture(captureId)` but are invisible in `listCaptures` because they have no secondary index key. This is existing behavior and the correct treatment -- they belong to the `default` tenant implicitly but were created before the indexing infrastructure existed. No remediation needed; these captures age out of relevance naturally.

### 3. Consistency Guarantees for Key Revocation

KV's eventual consistency model (up to 60 seconds for writes to propagate to all edge locations) means:

**Accepted risk**: A revoked key may continue to authenticate for up to 60 seconds after the DELETE call returns. The prompt already states this is accepted per the advisory.

**Why this is acceptable for WRL specifically**:

- Key revocation is an emergency/administrative operation, not a high-frequency path.
- The blast radius during the consistency window is bounded: a compromised key can only create captures (write) or list captures (read) for a single tenant. Cross-tenant access is impossible because tenantId is embedded in the key record, not derived from the request.
- The 60s window is a worst case; most KV propagation happens in seconds.
- The admin key (`ADMIN_KEY` env var) is not subject to KV consistency -- it is a wrangler secret baked into the Worker deployment. Revoking admin access requires a new deploy, which is instant.

**Design implication -- fail closed**: The auth check must treat a missing KV record as "deny". If `kv.get("apikey:{hash}")` returns `null`, the request is rejected. This means a KV read failure or timeout also results in denial, which is the correct security posture. Log the distinction between "key not found" and "KV error" for operational diagnosis (different log event types, not different HTTP responses).

**Soft-delete over hard-delete**: The `revoked: true` pattern (not `kv.delete()`) is correct because:
1. It preserves audit trail (who created the key, when, and when it was revoked).
2. It prevents key hash reuse -- if the same raw key were somehow generated again, the hash collision would hit a revoked record rather than a missing one.
3. The admin `GET /v1/admin/keys` listing can show revoked keys with their revocation timestamp.

### 4. Key Record TTL / Expiration

**Key records should persist indefinitely (no TTL).** Rationale:

- API keys are long-lived credentials. An unexpected expiration would silently break a tenant's integration with no indication of why, violating the "fail loudly" principle.
- The operator controls the lifecycle explicitly via `DELETE /v1/admin/keys/{keyHash}`.
- Soft-deleted (revoked) records serve as an audit trail and collision guard. Setting a TTL on revoked records would eventually garbage-collect them, losing both benefits.
- The number of key records is small (see section 6) -- storage cost is negligible.
- If a future requirement for key expiration emerges (e.g., "keys valid for 90 days"), add an `expiresAt` field to the record and check it at auth time. Do not use KV's `expirationTtl` because it silently deletes the record, losing the audit trail. An `expiresAt` field lets the system return a specific "key expired" signal instead of the generic "invalid key" that a missing record would produce.

### 5. `createdBy` Field Identity Model

The admin key has no associated identity beyond "someone who holds the admin secret." The `createdBy` field should reflect this reality honestly:

**For keys created via `ADMIN_KEY` (wrangler secret, global superadmin)**:
- `createdBy: "admin"` -- literal string, not a tenant or user identifier.

**For keys created via a KV-stored admin-scoped key (tenant-scoped admin)**:
- `createdBy: "key:{sha256hex_prefix}"` -- the first 8 hex chars of the creating key's SHA-256 hash. This provides traceability (which key created which key) without storing the full hash in a way that might confuse it with a key reference. The 8-char prefix matches the `keyId` convention already used for signing key fingerprints in the codebase.

**Why not just use `"admin"` for everything**: When the system has multiple admin-scoped keys across different tenants, a flat `"admin"` string loses the ability to trace who provisioned what. The `key:` prefix format preserves traceability. But for the initial implementation where only the global `ADMIN_KEY` creates keys, `"admin"` is sufficient.

**Recommendation**: Start with `createdBy: "admin"` for all keys created via `ADMIN_KEY`. Extend to `createdBy: "key:{prefix}"` when KV-stored admin-scoped keys are implemented, if they are in this same PR. The field format is not part of the public API contract (it is internal to admin responses), so this evolution is non-breaking.

### 6. Key Count Upper Bound and Listing Strategy

**Expected scale**: WRL is a single-operator or small-team product. Realistic key count is 2-20 keys total across all tenants. Even at aggressive scaling (50 tenants, 5 keys each), that is 250 keys.

**Listing approach -- full `apikey:` prefix scan is acceptable**:

Cloudflare KV `list()` returns up to 1,000 keys per call. With an expected ceiling well under 1,000 total API keys, a single `kv.list({ prefix: 'apikey:' })` retrieves all keys in one call. Adding a secondary index (`tenant:{tenantId}:keys:`) would add write complexity (two KV writes per key creation, index cleanup on revocation) for zero practical benefit at this scale.

**But the admin list endpoint needs tenant filtering**: The `GET /v1/admin/keys` endpoint lists keys. If called by the global `ADMIN_KEY`, it should list all keys (or optionally filter by tenantId query param). The implementation should:

1. `kv.list({ prefix: 'apikey:' })` to get all key hashes.
2. `Promise.all(keys.map(k => kv.get(k.name, 'json')))` to fetch all records in parallel.
3. Filter in memory by `tenantId` if a query parameter is provided.
4. Filter out `null` records (should not happen, but defensive).
5. Return the list sorted by `createdAt`.

This is the exact same pattern used by `listCaptures` for the capture index -- fan-out fetch with in-memory filtering. It works because the dataset is small.

**When to add a secondary index**: If key count approaches 500+ (extremely unlikely in the near term), add `tenant:{tenantId}:keys:{sha256hex}` index keys. The activation trigger is clear: measure first, build second. Add this to the backlog as a parking lot item with the condition "when KV key count exceeds 500."

**Do not add a secondary index in this PR.** It violates YAGNI and adds write complexity that cannot be justified by the expected data volume.

---

## Proposed Tasks

### Task 1: Define key record schema in kv.js module header
Add the `apikey:` record shape documentation to the `kv.js` module header comment, alongside the existing capture record documentation. This establishes the schema contract before writing implementation code.

### Task 2: Implement key CRUD functions in kv.js
Add four functions to `kv.js`:
- `createApiKey(kv, sha256hex, record)` -- writes `apikey:{sha256hex}` with the full record object. Validates sha256hex is exactly 64 lowercase hex chars. Checks for key hash collision (existing non-revoked key at that hash) and returns an error indicator rather than silently overwriting.
- `getApiKey(kv, sha256hex)` -- reads and returns the parsed JSON record or null.
- `revokeApiKey(kv, sha256hex)` -- reads existing, sets `revoked: true` and `revokedAt`, writes back. Returns false if key not found or already revoked.
- `listApiKeys(kv, tenantId?)` -- lists all keys, optionally filtered by tenantId. Returns array of `{ keyHash, ...record }` objects.

All raw KV access for key records must go through these functions (same centralization principle as capture records).

### Task 3: Rewrite auth.js for dual-mode authentication
The new `verifyApiKey` must:
1. Check for `ADMIN_KEY` env var for admin endpoints (separate function: `verifyAdminKey`).
2. For tenant endpoints: extract Bearer token, SHA-256 hash it, `kv.get("apikey:{hash}")`.
3. If KV record found and `revoked === false`, return `{ ok: true, tenantId, scopes, keyName }`.
4. If KV record found and `revoked === true`, return 401 (same as not found -- do not reveal revocation status to the caller).
5. Fallback: if KV lookup returns null AND `CAPTURE_API_KEY` env var exists AND token matches it (timing-safe), return `{ ok: true, tenantId: 'default', scopes: ['capture', 'read'] }`. This is the migration bridge.
6. The auth result object should include `keyName` for log enrichment and `scopes` for authorization checks.

The KV namespace must be passed into the auth function. Currently `verifyApiKey(request, env)` only uses `env.CAPTURE_API_KEY`. It needs `env.KV` for the new path. The function signature should become `verifyApiKey(request, env)` (unchanged externally -- KV is available on `env.KV`).

### Task 4: Add scope enforcement to route handlers
After auth succeeds, routes need scope checking:
- `POST /v1/captures` requires `capture` scope.
- `GET /v1/captures`, `GET /v1/captures/{id}`, `GET /v1/captures/{id}/status` require `read` scope (and `capture` implies `read`).
- `POST/GET/DELETE /v1/admin/keys` require admin access (either `ADMIN_KEY` or a KV key with `admin` scope for the relevant tenant).
- Return 403 with the required scope name when scope is insufficient.

### Task 5: Tests for key CRUD and auth rewrite
- Unit tests for `createApiKey`, `getApiKey`, `revokeApiKey`, `listApiKeys` in `test/kv.test.js`.
- Unit tests for the new auth flow in `test/auth.test.js` -- KV-based auth, fallback to `CAPTURE_API_KEY`, revoked key rejection, scope checking.
- Test that revoked keys return the same 401 as nonexistent keys (no information leakage).

---

## Risks and Concerns

### Risk 1: SHA-256 computation in auth hot path
Every authenticated request will compute SHA-256 of the Bearer token. On Cloudflare Workers, `crypto.subtle.digest('SHA-256', ...)` is fast (sub-millisecond for a 44-byte key), but it is async. Ensure the implementation uses a single `await` for the hash, not repeated computation. The hash should be computed once and reused for both KV lookup and logging.

**Mitigation**: Straightforward -- compute once, pass through. No architectural concern, just an implementation note.

### Risk 2: KV read latency in auth path
The advisory states 10-40ms KV latency is acceptable within the 300ms budget, and no caching of key records. This is correct for the current scale. However, every authenticated request now adds a KV read that did not exist before (the current auth is a pure in-memory comparison). Monitor `auth_kv_duration_ms` via Coralogix after deploy to confirm the latency budget holds.

**Mitigation**: The observability-minion should add a timing metric to the auth KV read. If latency degrades, the fix is adding an in-Worker LRU cache with short TTL (e.g., 30s) -- but do not build this preemptively.

### Risk 3: Dual-mode auth ordering during migration
During the migration period, the auth function must check KV first and fall back to `CAPTURE_API_KEY`. The ordering matters: if the legacy key is also provisioned as a KV key for `default` tenant, the KV path should win (it carries scopes and enables key-specific logging). If the operator provisions a new KV key but forgets to update their client, the fallback catches it. If the operator revokes the KV version of the legacy key, the fallback must NOT re-authenticate it -- the fallback should only apply when the KV lookup returns `null` (key not found), not when it returns a revoked record.

**Mitigation**: Clear specification in Task 3 above. The auth function's fallback logic must be: `if (kvRecord === null && env.CAPTURE_API_KEY) { /* try legacy comparison */ }`. If `kvRecord` exists but is revoked, deny -- do not fall through to legacy.

### Risk 4: Admin key in wrangler secret vs. KV-stored admin keys
The prompt specifies both a global `ADMIN_KEY` wrangler secret and KV-stored keys with `admin` scope. These are different authorization paths with different trust levels:
- `ADMIN_KEY`: cross-tenant, cannot be revoked without redeploy, no audit trail of which request used it.
- KV admin key: tenant-scoped, revocable, has `createdBy` / `keyName` for audit.

The implementation must clearly separate these two paths and never conflate them. A KV admin key for tenant `acme` must not be able to create keys for tenant `other`. The global `ADMIN_KEY` can.

**Mitigation**: Two separate verification functions: `verifyAdminKey(request, env)` for global admin (checks `ADMIN_KEY` env var) and the standard `verifyApiKey(request, env)` for KV-based auth. Admin routes check `verifyAdminKey` first, then fall back to `verifyApiKey` and check for `admin` scope + matching tenantId.

### Risk 5: KV key namespace collision
The `apikey:` prefix shares the KV namespace with `capture:`, `tenant:`, and `signing-key:`. All four prefixes are distinct and non-overlapping. The implementation must validate that SHA-256 hex strings do not contain colons or other characters that could cause prefix confusion. This is guaranteed by the hex encoding (only `[0-9a-f]`), but a defensive regex check at write time costs nothing.

---

## Additional Agents Needed

**security-minion**: Should review the final auth flow, particularly the dual-mode fallback logic and the separation between global admin and tenant-scoped admin authorization. The timing-safe comparison already exists for the legacy path; the new KV path does not need timing-safe comparison (it compares a hash, not the raw key), but this assumption should be validated.

**observability-minion**: Should design the specific log event names and fields for the new auth subsystem (`auth.kv_lookup`, `auth.legacy_fallback`, `auth.revoked_key`, `admin.key_create`, `admin.key_revoke`). The advisory mentions enriching existing events with `keyName`/`reason` and a new `admin` subsystem -- observability-minion should specify the exact schema.

No other specialists are needed. The KV schema, data model, and scaling considerations are fully within the data architecture domain. The wrangler.toml changes (adding `ADMIN_RATE_LIMITER` binding) are straightforward and do not need iac-minion input.
