# Margo -- Complexity Review: R12 Per-Tenant API Keys

## Verdict: ADVISE

The implementation is proportional to the problem. Per-tenant API keys are an
essential feature for any multi-tenant API service, and the chosen approach --
SHA-256 hashed keys in KV with a three-endpoint admin CRUD surface -- is the
simplest viable design. No new dependencies were introduced. No new services were
added. The auth module is 211 lines; the admin module is 402 lines. The
complexity budget spend is low.

Three findings below are non-blocking but worth watching.

---

## Findings

### 1. Duplicated auth/rate-limit boilerplate in admin.js (structural complexity)

**What:** All three admin handlers (`handleAdminCreateKey`, `handleAdminListKeys`,
`handleAdminRevokeKey`) contain near-identical blocks for: rate limiting
(lines 37-43, 189-195, 285-291), auth verification + failure logging
(lines 52-76, 198-222, 294-317), and scope checking. Each block is ~25 lines;
three handlers means ~75 lines of duplicated ceremony.

**Why accidental:** The logic is identical across all three handlers. This is
not three different auth strategies -- it is the same pattern copied three times.
When the logging shape changes or a new scope check is added, all three must be
updated in lockstep.

**Simpler alternative:** Extract a single `adminPreamble(request, env, ctx)`
function that performs rate limit check, auth verification, scope enforcement,
and CIP computation. Returns `{ ok: true, auth, cip }` or `{ ok: false, response }`.
Each handler becomes: call preamble, check result, proceed to business logic.
~50 lines eliminated, one place to maintain. Not blocking because three
handlers is manageable, but this will compound if more admin endpoints are added.

**Severity:** Non-blocking. Watch for growth.

### 2. Tenant key index as a separate KV key is a consistency risk (essential trade-off, document it)

**What:** `admin.js` maintains a `tenant-keys:{tenantId}` list alongside the
individual `apikey:{hash}` records. The two are written sequentially (line 144
writes the key record, lines 154-162 write the index). No transaction guarantees
exist in KV -- a failure between these two writes leaves a key that exists but
is not listed.

**Why this matters:** This is essential complexity -- KV has no transactions, so
any index is eventually-consistent at best. The code handles this gracefully
(line 158-160: starts fresh if read fails). But the consistency gap is not
documented anywhere. An operator who revokes a key via the list endpoint could
miss an unlisted key that still authenticates.

**Simpler alternative:** No code change needed. Add a one-line comment on the
`tenant-keys:` write documenting the consistency gap: "Key record exists even
if index write fails. Revocation targets keys by hash, not by index, so this
gap does not create a security hole -- it only affects listing completeness."
This prevents a future maintainer from assuming the index is authoritative.

**Severity:** Non-blocking. Documentation gap, not a code gap.

### 3. Last-admin-key guard in handleAdminRevokeKey is an N+1 KV fan-out (operational complexity)

**What:** Lines 352-377 of `admin.js` implement a "cannot revoke the last admin
key" guard. This reads the tenant key index, then fetches every key record in a
sequential loop to count active admin keys. For a tenant with N keys, this is
1 + N KV reads on every revocation of an admin-scoped key.

**Why accidental at current scale:** The project has one tenant today with a
handful of keys. This is a sub-5ms operation. But the pattern is a sequential
N+1 fan-out -- it does not parallelize the reads and will scale linearly with
key count.

**Simpler alternative:** Use `Promise.all` for the inner reads (same as
`listCaptures` in `kv.js` already does). Change:
```js
for (const h of hashes) { ... const r = await env.KV.get(...) ... }
```
to:
```js
const records = await Promise.all(hashes.map(h => env.KV.get(`apikey:${h}`, 'json').catch(() => null)));
const activeAdminCount = records.filter(r => r && !r.revoked && r.scopes?.includes('admin') && r !== record).length;
```
This is a one-line change that eliminates the sequential bottleneck and makes the
code consistent with the parallel-fetch pattern used elsewhere in the codebase.

**Severity:** Non-blocking. Marginal at current key counts, but inconsistent
with established patterns.

---

## What is NOT flagged (justified complexity)

- **Three auth paths (KV, ADMIN_KEY, CAPTURE_API_KEY):** Essential for backward
  compatibility during migration. The deprecation path is documented in
  OPERATIONS.md. The code explicitly warns on CAPTURE_API_KEY fallback usage
  (line 193 of auth.js).

- **Timing-safe comparison:** Essential security requirement for key comparison.
  Not over-engineering.

- **Self-revocation guard (line 323 of admin.js):** Prevents an operator from
  locking themselves out. Single conditional, justified.

- **Scope expansion (capture implies read, line 160 of auth.js):** Simple,
  documented, prevents a common misconfiguration.

- **ADMIN_RATE_LIMITER in wrangler.toml:** New rate limiter binding for admin
  endpoints. 5 req/min/IP is appropriate for a management API. No new
  technology -- same rate limiter mechanism already used for capture and verify.

- **OpenAPI spec updates:** Admin endpoints are documented inline with the
  existing spec. No separate doc-generation tooling added.

- **OPERATIONS.md migration runbook:** The R12 section (lines 109-163) is
  proportional -- it covers pre-merge (nothing), post-deploy (set ADMIN_KEY,
  provision first key), verification, and rollback. No over-documentation.

---

## Complexity Budget Tally (Managed/Serverless column)

| Item | Cost | Justification |
|------|------|---------------|
| New rate limiter binding (ADMIN_RATE_LIMITER) | 0 | Same mechanism, new instance -- config only |
| New module (admin.js) | 1 | 402 lines, three CRUD handlers, no abstraction layers |
| Auth module expansion (auth.js) | 1 | KV lookup path + scope model added to existing module |
| New KV key patterns (apikey:, tenant-keys:) | 1 | Essential data model for multi-tenant keys |
| **Total** | **3** | Well within budget for an auth feature |

No new dependencies. No new services. No new abstraction layers. No new
technology. The implementation uses existing KV, existing rate limiters, and
existing response helpers.
