# Security Assessment: DELETE /v1/admin/keys/{keyHash} Safety Guards

## Assessment Scope

Two proposed safety guards for the key revocation endpoint, with specific
focus on: (1) race condition risk in the last-admin-key guard under KV
eventual consistency, and (2) whether a runtime self-revocation guard is
needed today or whether a TODO is sufficient.

---

## Question 1: Race Condition on Last-Admin-Key Guard

### Architecture Facts

- **KV is eventually consistent** with up to 60s propagation delay for writes.
  However, within a single Cloudflare colo, read-after-write is consistent
  because Workers KV caches the most recent write for that colo.
- **Admin auth uses `ADMIN_KEY`** (env var), not KV-stored API keys. There is
  currently exactly one admin credential, shared by all callers.
- The proposed guard will call `listApiKeyRecords()` to count active
  admin-scoped keys for the target tenant, then reject if count <= 1.
- Two concurrent DELETEs for different admin keys of the same tenant could
  both see count=2 (or more) and both proceed, leaving zero admin keys.

### Risk Assessment

**Likelihood: Very Low (1/5)**

- There is currently a single `ADMIN_KEY` for all admin operations. All admin
  callers share one credential. Concurrent revocations of the *last two*
  admin-scoped KV keys for the same tenant would require deliberate,
  near-simultaneous requests -- this is operational error territory, not
  an attack vector.
- Admin endpoints are rate-limited to 5 req/60s per IP. An attacker who has
  the ADMIN_KEY has already compromised the infrastructure secret; racing
  the last-admin-key guard is the least of the problems at that point.
- The tenant-scoped admin keys in KV are *not used for admin auth today*.
  They exist as metadata for future per-tenant admin delegation. Revoking
  all of them does not lock anyone out of the admin API -- `ADMIN_KEY`
  still works.

**Impact: Low (1/5)**

- Even if the race succeeds and all admin-scoped KV keys for a tenant are
  revoked, the `ADMIN_KEY` env var remains functional. The operator can
  immediately create new admin-scoped keys. There is no lockout scenario
  today.
- When per-tenant admin auth is implemented (admin-scoped KV keys used for
  actual authentication), the impact would rise to High. But that is a
  future state.

**Risk Score: 1 (Very Low x Low)**

### Recommendation: Accept the Race, Log It

**Do not add distributed locking, CAS operations, or KV transaction
workarounds.** The complexity is disproportionate to the risk. Instead:

1. **Implement the check as a best-effort guard.** List admin-scoped keys
   for the target tenant, reject with 409 if count <= 1. This catches the
   common case (single operator, sequential requests) which is 99.9% of
   real-world usage.

2. **Log aggressively.** When the guard fires (409), log at severity 4
   (WARN) with the tenant, keyHash prefix, and remaining admin key count.
   When a revocation *succeeds* and the remaining admin key count drops
   to 1, log at severity 4 as well -- this is the "you're one revocation
   away from zero" signal.

3. **Document the limitation.** Add a comment in the code:
   ```
   // KNOWN LIMITATION: This check is not atomic with the subsequent
   // revocation. Concurrent requests may both pass the check. Acceptable
   // because ADMIN_KEY (env var) prevents lockout. Revisit when admin
   // auth moves to per-tenant KV keys.
   ```

4. **Revisit when the auth model changes.** If/when admin-scoped KV keys
   become the actual authentication mechanism for admin routes (replacing
   `ADMIN_KEY`), this guard must be upgraded to use a stronger consistency
   primitive (e.g., Durable Objects for compare-and-swap, or an external
   coordination service). File this as a backlog item tied to the
   per-tenant admin auth feature.

---

## Question 2: Self-Revocation Guard -- TODO vs. Runtime

### Architecture Facts

- `verifyAdminKey()` compares the Bearer token against `env.ADMIN_KEY` via
  `timingSafeEqual`. It returns `{ ok: true, authMethod: 'admin_key' }` on
  success. It does **not** return a keyHash, tenantId, or any KV record
  identity.
- The `ADMIN_KEY` is an infrastructure secret (env var). It has no
  corresponding KV record under `apikey:`. It has no keyHash.
- `handleAdminRevokeKey` receives `match[1]` (the keyHash from the URL
  path), which identifies a KV-stored API key record. There is no mechanism
  to determine whether the caller's Bearer token corresponds to the key
  being revoked.
- KV-stored admin-scoped keys and the `ADMIN_KEY` env var are completely
  disjoint auth paths. A caller authenticated via `ADMIN_KEY` cannot be
  "revoking themselves" because `ADMIN_KEY` is not a KV key and cannot be
  revoked via this endpoint.

### Risk Assessment

**Can self-revocation happen today? No.**

The admin caller authenticates with `ADMIN_KEY` (env var). The DELETE target
is a KV-stored key identified by SHA-256 hash. These are different identity
domains. There is no scenario where `ADMIN_KEY` is the key being revoked,
because `ADMIN_KEY` does not exist in KV.

**Could self-revocation happen in a future auth model? Yes.**

If admin auth migrates to KV-stored admin-scoped keys (the keys that can
already be created with `scopes: ['admin']`), then a caller authenticated
via an admin-scoped KV key *could* revoke their own keyHash. At that point,
the self-revocation guard becomes meaningful.

### Recommendation: TODO Comment Is Sufficient

**Do not implement a runtime self-revocation guard today.** Reasons:

1. **It is impossible to trigger.** The `ADMIN_KEY` has no keyHash. There is
   no code path where the caller's auth identity matches a revocable KV key.
   A runtime guard would be dead code.

2. **YAGNI.** Per the project's engineering philosophy (Helix Manifesto),
   dead code is worse than no code. It adds cognitive load, test surface,
   and maintenance burden for zero security benefit.

3. **The TODO is the correct artifact.** It signals intent to future
   implementers. Place it at the exact location where the guard would go
   (top of `handleAdminRevokeKey`, before the `revokeApiKeyRecord` call):

   ```javascript
   // TODO: Self-revocation guard. When admin auth moves from ADMIN_KEY
   // (env var) to KV-stored admin-scoped keys, prevent a caller from
   // revoking their own keyHash. Requires verifyAdminKey to return the
   // caller's keyHash, which it currently does not (ADMIN_KEY has no hash).
   ```

4. **Gate the future implementation on the auth migration.** When
   `verifyAdminKey` is refactored to support KV-based admin auth, the
   TODO becomes actionable because the auth result will include a keyHash
   that can be compared against `match[1]`.

---

## Proposed Implementation Tasks

### Task 1: Last-Admin-Key Guard (409 on last admin key)

**Location:** `src/admin.js`, `handleAdminRevokeKey`

Before calling `revokeApiKeyRecord`, the handler must:

1. Read the target key record to get its `tenantId` and `scopes`
   (via `getApiKeyRecord`).
2. If the target key's scopes include `'admin'`:
   a. Call `listApiKeyRecords(env.KV, { tenantId })` to get all active
      (non-revoked) keys for that tenant.
   b. Count keys where `scopes.includes('admin')`.
   c. If count <= 1, return 409 with a clear message:
      `"Cannot revoke the last admin-scoped key for tenant '{tenantId}'. Create a replacement key first."`
3. If the target key does not have admin scope, skip the guard entirely
   (no performance penalty for non-admin key revocations).

**Edge cases to handle:**
- Target key is already revoked: `revokeApiKeyRecord` already handles this
  idempotently. The guard should check the target key's `revoked` status
  first -- if already revoked, skip the guard and let the existing
  idempotent path handle it.
- Target key not found: existing 404 path handles this. The guard runs
  after the existence check.

**Performance note:** `listApiKeyRecords` does a `kv.list()` + N `kv.get()`
calls. For the expected key counts (single digits to low hundreds per tenant),
this is well within acceptable latency. No optimization needed now.

### Task 2: Self-Revocation TODO Comment

**Location:** `src/admin.js`, `handleAdminRevokeKey`, line ~181 (after
extracting keyHash, before any KV operations)

Add the TODO comment as specified above. No runtime code.

### Task 3: Tests

**Location:** `test/admin-keys.test.js`

New tests for the last-admin-key guard:

1. **409 when revoking the only admin-scoped key for a tenant.**
   Create one key with `scopes: ['admin']`, attempt DELETE, expect 409.
   Verify the key is NOT revoked (GET list still shows it active).

2. **200 when revoking an admin key when another admin key exists.**
   Create two keys with `scopes: ['admin']` for the same tenant, revoke
   one, expect 200.

3. **200 when revoking a non-admin key even if it is the only key.**
   Create one key with `scopes: ['capture']`, revoke it, expect 200.
   The guard only protects admin-scoped keys.

4. **409 message includes tenant context.**
   Verify the 409 response body contains a useful error message referencing
   the tenant.

5. **Idempotent DELETE of already-revoked admin key still returns 200.**
   Create two admin keys, revoke one (200), revoke it again (200 --
   idempotent). This verifies the guard does not interfere with the
   existing idempotency behavior.

6. **Cross-tenant isolation: revoking last admin key for tenant A does not
   affect tenant B.**
   Create one admin key for tenant-a and one for tenant-b. Revoking
   tenant-a's last admin key should return 409. Revoking tenant-b's last
   admin key should also return 409. Neither blocks the other.

---

## Additional Security Observations

### Informational: Admin Key Scope Semantics

The `admin` scope on KV-stored keys is currently inert -- it grants no
additional privileges. All admin API access is gated by the `ADMIN_KEY` env
var via `verifyAdminKey()`, which does not check KV at all. The `admin` scope
exists as a forward declaration for per-tenant admin delegation.

This is worth noting in the guard's error message and logging: the guard
protects a *future* capability, not a *current* one. The operational signal
should be calibrated accordingly (WARN, not CRITICAL).

### Informational: listApiKeyRecords Pagination

`listApiKeyRecords` currently fetches all keys with a single `kv.list()` call.
KV list has a default limit of 1000 keys. If a tenant ever has >1000 API keys
(unlikely but theoretically possible), the list would be incomplete and the
guard could produce an incorrect count. This is acceptable for MVP but should
be noted as a scaling limitation.

### No New Attack Surface

The proposed changes do not introduce new inputs, new data flows, or new
external interactions. The guard reads existing KV data via existing functions
and makes a decision based on count. The attack surface remains unchanged.
The only new response code (409) does not leak sensitive information -- the
tenant ID in the message is already known to the authenticated admin caller.
