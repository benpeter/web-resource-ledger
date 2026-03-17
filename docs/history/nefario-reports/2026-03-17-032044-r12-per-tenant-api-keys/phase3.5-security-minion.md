## Security Minion Review -- R12 Per-Tenant API Keys

**Verdict: ADVISE**

The auth architecture is sound. The six-step ordering, revocation invariant (no fallthrough),
KV error fail-closed, timing-safe env-var comparison, IDOR prevention via authMethod check on
list, and self-revocation 409 guard are all correctly specified. One genuine implementation gap
and one documentation gap need to land in the task prompts before execution.

---

### MEDIUM: Missing `env.ADMIN_RATE_LIMITER` null guard in admin handlers

**Location**: Task 2, all three handler specs (handleAdminCreateKey, handleAdminListKeys,
handleAdminRevokeKey).

**Gap**: Every existing rate-limited handler in `src/index.js` wraps its rate limit call with
`if (env.CAPTURE_RATE_LIMITER)` or `if (env.VERIFY_RATE_LIMITER)`. The admin handler specs
prescribe `env.ADMIN_RATE_LIMITER.limit(...)` unconditionally. If the binding is absent -- which
is the case in local dev and in any vitest environment (Task 4 only adds `ADMIN_KEY` to
`miniflare.bindings`, not `ADMIN_RATE_LIMITER`) -- the call throws a TypeError and the handler
returns 500 (or an unhandled rejection).

**Impact**: Admin endpoints become non-functional in local dev and in the test suite unless the
binding is explicitly mocked. The 500 would silently eat the rate limit check and block the
admin API. This is a correctness bug that undermines the test coverage the test-minion is
planning to write.

**Fix**: Add the null guard in Task 2's handler specs, consistent with the existing pattern:
```js
if (env.ADMIN_RATE_LIMITER) {
  const { success } = await env.ADMIN_RATE_LIMITER.limit({ key: clientIp });
  if (!success) {
    ctx.waitUntil(log(...));
    return problemResponse(429, 'Rate limit exceeded. Try again later.', { 'Retry-After': '60' });
  }
}
```
Also add `ADMIN_RATE_LIMITER` to the miniflare.bindings mock in Task 4 if rate-limiting behavior
needs to be testable (or at minimum document that rate limit tests require manual wrangler dev).

---

### LOW: Last-admin-key guard race condition (documented, rating confirmed correct)

The plan correctly identifies the read-modify-write race on the last-admin-key guard (risk #4).
Two concurrent DELETE requests both passing the guard before either writes is theoretically
possible. Given the 5/min admin rate limit this is effectively unexploitable. LOW rating is
appropriate. Documenting as a known limitation in the runbook is sufficient -- no code change
required.

---

### LOW: Fan-out cap on key listing

`handleAdminListKeys` reads the `tenant-keys:{tenantId}` index then does a KV.get per hash with
no upper bound. A tenant that accumulates many keys (slow drip over days at 5/min) could trigger
a large fan-out. At WRL's current scale (2-3 tenants, single-digit keys) this is not a real
concern. Note it in the backlog for when key volume grows.

---

### Confirmations (no action required)

- **Revocation invariant**: STOP after revoked-key check in Step 3 explicitly prevents
  fallthrough to ADMIN_KEY or CAPTURE_API_KEY paths. Critical and correctly specified.
- **KV error fail-closed**: try/catch → 500, not fallthrough. Correct.
- **IDOR on list**: `auth.tenantId` used, query param ignored for non-superadmin. Correct.
- **IDOR on revoke**: Cross-tenant access returns 404 not 403 (enumeration prevention). Correct.
- **Key storage**: SHA-256 hex stored in KV, raw key never persisted. Correct.
- **Timing safety**: `timingSafeMatch()` for env-var comparison; KV path uses hash so timing of
  raw comparison is irrelevant. Correct.
- **Misconfiguration guard**: 503 when no credentials bound. Correct.
- **Self-revocation guard**: 409 on `keyHash === auth.keyHash`. Correct.
- **Error messages**: Static strings throughout, user input never reflected in responses. Correct.
- **Log safety**: Raw keys never logged; hash truncated to 16 chars in log events;
  `Cache-Control: private, no-store` on all admin responses. Correct.
- **ADMIN_KEY scope**: Only `['admin']`, not capture/read. Infrastructure credential separated
  from tenant credentials. Correct.
- **Scope ordering**: Scope check fires after auth but before rate limit on capture/list
  (403 does not consume a rate limit token). Admin endpoints rate-limit before auth. Both
  are correctly specified and the task prompts explicitly prohibit crossing these orderings.
- **key format**: `wrl_live_` prefix supports secret scanning detection. 256 bits entropy
  (32 random bytes). Correct.

---

### Required action before execution

Amend Task 2's handler spec to add the `if (env.ADMIN_RATE_LIMITER)` null guard to all three
handlers. Optionally add the binding to Task 4's vitest config. All other findings are either
confirmations or LOW-severity backlog items.
