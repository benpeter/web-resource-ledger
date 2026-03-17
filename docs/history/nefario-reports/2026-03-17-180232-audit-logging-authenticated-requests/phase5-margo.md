# Margo Review: Phase 0038 -- Audit Logging for Authenticated Requests

## VERDICT: ADVISE

The change is proportional to the requirement. No new dependencies, no new
abstractions, no new files. Audit events are emitted inline at handler
boundaries using the existing `log()` function. The `keyId` computation
in `auth.js` is 4 lines of straightforward Web Crypto. Decisions document
is thorough and captures rejected alternatives. Overall, this is lean work.

Two items worth addressing before merge:

---

## FINDINGS

### [ADVISE] src/index.js:177-185 -- SSRF reason derivation via chained string-includes is fragile

The ssrfReason closed enum is derived by sniffing substrings of
`result.detail` (the human-readable error message from `url-validation.js`):

```js
const ssrfReason = result.detail.includes('scheme')
  ? 'url_scheme_not_allowed'
  : result.detail.includes('private')
    ? 'private_ip_blocked'
    : result.detail.includes('credentials')
      ? 'credentials_not_allowed'
      : result.detail.includes('resolve')
        ? 'dns_resolution_failed'
        : 'ssrf_blocked_other';
```

This couples the audit enum to the wording of error messages in a different
module. If `url-validation.js` changes a detail string (e.g., "private IP"
becomes "non-routable IP"), the ssrfReason silently falls through to
`ssrf_blocked_other` with no test failure. That is accidental coupling --
the enum should be derived from structure, not from prose.

There are also two `validateUrl` error paths that will fall through to
`ssrf_blocked_other` unexpectedly:
- `'URL exceeds 2048 character limit'` (no matching substring)
- `'URL contains double-encoded characters'` (no matching substring)

These are not SSRF blocks at all -- they are input validation errors. Logging
them as `ssrf_blocked_other` under `security.ssrf_block` is misleading.

**FIX**: Have `validateUrl()` return a machine-readable `reason` field
alongside the human `detail` string. The audit code reads the `reason`
field; no substring parsing needed. This is a one-field addition to the
existing return shape, not a new abstraction:

```js
// in url-validation.js error returns:
return { ok: false, status: 422, detail: '...', reason: 'private_ip' };

// in index.js:
ctx.waitUntil(log(env, 5, 'security', {
  event: 'security.ssrf_block', tenantId, keyId,
  reason: result.reason, outcome: 'denied', cip
}) ?? Promise.resolve());
```

Alternatively, if modifying url-validation.js is out of scope for this phase,
add a comment acknowledging the fragility and file a backlog item. The
current code is not wrong -- it just has a maintenance trap.

### [NIT] src/index.js:187-197, 214-224 -- Audit event emitted on non-auth failures

The SSRF block path (line 187) and KV write failure path (line 214) both emit
`audit.capture.create` with `outcome: 'denied'` or `outcome: 'error'`. Per
decisions.md section (d), audit events track "authenticated request audit
trail." These events fire after auth succeeds, which is correct. Just noting
that the SSRF audit event fires even though the capture was never created --
`resourceId: null` makes this clear, so this is fine as-is. No action needed.

---

## Complexity Assessment

| Metric | Value | Assessment |
|--------|-------|------------|
| New dependencies | 0 | Clean |
| New files | 0 (excl. evolution docs) | Clean |
| New abstractions | 0 | Clean |
| Lines added (src/) | ~60 | Proportional |
| Cognitive complexity delta | Low -- inline log calls at existing handler boundaries | Acceptable |
| Complexity budget spend | 0 | No new services, layers, or technologies |

The `keyId` computation (auth.js:97-103) hashes on every successful auth call.
This is a single SHA-256 operation on a short string -- negligible cost. No
caching needed. If R12 introduces per-tenant keys and the hash becomes per-key,
the cost is still negligible.

## What went well

- No scope creep. The change does exactly what was requested: audit events at
  authenticated handler boundaries. No adjacent features, no future-proofing
  beyond the `keyId` field that R12 will use.
- Reuses existing `log()` infrastructure. No new logging framework, no new
  transport.
- Decision to defer `capture.js` changes (decisions.md section i) is the
  correct YAGNI call -- avoids a 50+ test site parameter change for a static
  value.
- URL exclusion from audit events (decisions.md section g) is a good security
  call that also keeps the audit schema simple.
- Tests cover keyId shape and determinism without over-testing.
