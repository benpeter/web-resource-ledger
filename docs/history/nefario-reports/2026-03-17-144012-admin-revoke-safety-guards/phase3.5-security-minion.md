# Security Review: Admin Key Revocation Safety Guards

**Verdict: APPROVE**

The plan is sound. The implementation is correctly scoped and the risk
acceptances are well-reasoned. One advisory note below.

---

## Guard 1: Last-admin-key 409 -- Can it be bypassed?

The pre-flight read pattern is correct and the logic is tight:

1. Read target key -- null returns 404, already-revoked skips guard.
2. Scope check gates the list call -- non-admin keys bypass entirely.
3. List filters `includeRevoked: false` and excludes `keyHash` from the
   count. Both are necessary and both are specified. Missing either would
   create a bypass.
4. Count === 0 triggers 409.

No bypass path is visible in the specified logic. A caller cannot manipulate
the guard because:
- The keyHash is validated by route regex (64 hex chars) before reaching the
  handler. No hash injection.
- The guard reads from KV, not from caller-supplied data.
- The tenant scope is derived from the stored record, not from the request.

The one structural concern is the guard depends on `listApiKeyRecords`
returning consistent results -- which it does via an in-memory filter on a
KV list scan. There is no opportunity for a caller to influence the list
result through the DELETE request itself.

## Race Condition Assessment -- Correct

The synthesis document's risk score of 1/25 (very low likelihood x low
impact) is accurate for current conditions. Supporting factors:

- The admin endpoint has a 5 req/60s per-IP rate limit. Concurrent DELETEs
  from the same IP are rate-limited. Concurrent DELETEs from different IPs
  targeting the same tenant's last two admin keys is an extremely narrow
  window.
- Even if the race fires and both keys are revoked, the ADMIN_KEY env var
  provides a recovery path. Actual lockout is impossible while the env var
  exists. This makes the worst-case impact "orphaned tenant admin keys" rather
  than "operator locked out."
- The race exists in the read-check-write pattern inherently. The only fix
  would be distributed CAS or a KV transaction primitive, which Cloudflare KV
  does not provide. The scope boundary (no distributed locking) is correct.

The KNOWN LIMITATION comment is appropriately placed and accurately describes
the condition and the safety net.

## TODO Placement -- Correct

Placing the self-revocation TODO immediately after `const keyHash = match[1]`
and before any KV operations is the right location. It will sit at the natural
insertion point for the future guard, making it easy to find and implement
without reading the whole function. The comment accurately states the
prerequisite (auth result must carry the caller's keyHash) and why it is not
possible today (ADMIN_KEY is a static env var with no hash). Issue #42
reference is correct per the PR context.

## Advisory: `listApiKeyRecords` does a full KV scan

Not a blocker, and the plan already documents this. Worth noting the exact
behavior: `listApiKeyRecords` calls `kv.list({ prefix: 'apikey:' })` which
returns up to 1000 keys across ALL tenants, then filters in-memory by
tenantId. At current scale this is irrelevant. At a few hundred tenants with
many keys each, the guard would be reading O(all tenants' keys) on every
DELETE of an admin-scoped key. The synthesis already flags the 1000-key
default limit as a future consideration. The constraint is correctly scoped
out of this PR -- just note it in the KNOWN LIMITATION comment if you want
to be precise, or leave it for the future KV-index work. Either is
acceptable.

## Test Coverage Assessment

The 6 test cases cover the security-relevant cases completely:

- Test 1: primary guard path fires (409, key not revoked)
- Test 2: guard passes with sibling key present (200)
- Test 3: non-admin scope bypasses guard entirely (200)
- Test 4: already-revoked key skips guard (idempotency)
- Test 5: tenant isolation -- other tenant's admin keys don't count (critical)
- Test 6: RFC 9457 response shape validated

Test 5 is the most security-critical and it is correctly specified: use
`seedApiKey` to write directly to KV (bypasses rate-limited API), use two
distinct tenant IDs, DELETE tenant-a's key, expect 409. This correctly
validates that the tenant scoping in the guard cannot be satisfied by
cross-tenant keys.

The use of `nextIp()` per test and a `beforeEach` cleanup prevents rate limit
state from leaking between tests. The approach is consistent with the existing
test file patterns.

---

**No blocking issues. Proceed to implementation.**
