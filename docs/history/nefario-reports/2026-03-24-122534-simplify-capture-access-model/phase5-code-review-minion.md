---
reviewer: code-review-minion
phase: simplify-capture-access-model
task: "Simplify capture access model: remove share tokens, auth-gate list only (#169)"
verdict: APPROVE
---

# Code Review: Simplify Capture Access Model (#169)

## Summary

This change removes the share-token system and switches individual capture endpoints
(`GET /v1/captures/{id}`, `/status`, `/artifacts/*`) from requiring authentication to
being fully public, with auth becoming optional for tenant isolation. The implementation
is clean and well-executed. The auth gate logic is correct, null safety is handled
consistently across all handlers, and the D1 migration is safe. No stale share-token
references remain in live code paths.

**VERDICT: APPROVE**

---

## Findings

### Auth Gate Logic (src/index.js ~line 464-501)

No issues. The split between the list endpoint (hard-require auth) and individual
capture routes (optional auth) is implemented correctly.

The credential-sniffing logic for individual capture routes is sound:

```js
const hasCredentials = request.headers.has('Authorization')
  || (request.headers.has('Cookie') && request.headers.get('Cookie').includes('__Host-wrl_session'));
```

This matches the session cookie name used in `session.js` (`__Host-wrl_session`).
The semantic is correct: presenting bad credentials is rejected with 401, while
presenting no credentials gets public access. This is the right design -- it
prevents a client from accidentally using an expired key and silently falling
back to public access.

### Handler Null Safety

**NIT: src/index.js:1212-1213 -- handleListCaptures assumes captureAuth is always set**

```js
const captureAuth = env._captureAuth;
const { tenantId, authMethod } = captureAuth;  // throws if undefined
```

The auth gate guarantees `env._captureAuth` is set before this handler is reached
(the gate returns a 401 response before route dispatch if auth fails on `/v1/captures`).
The current logic is therefore correct in practice. However, a defensive guard would
make this invariant explicit and survive future refactors:

```js
const captureAuth = env._captureAuth;
if (!captureAuth) return problemResponse(401, 'Invalid or missing authentication');
const { tenantId, authMethod } = captureAuth;
```

`handleGetCapture`, `handleGetCaptureArtifact`, and `handleCaptureStatus` all
correctly guard with `if (captureAuth && ...)` before using it -- the pattern is
consistent with the new public-access model.

### D1 Migration (migrations/0013_drop_share_tokens.sql)

Migration is safe:

- Uses `DROP INDEX IF EXISTS` for all three indexes before `DROP TABLE IF EXISTS`.
- Index-before-table ordering is correct (D1/SQLite drops indexes automatically
  when a table is dropped, but explicit ordering is good practice and harmless).
- Uses `IF EXISTS` throughout -- idempotent and safe to re-run.
- Migration number 0013 is sequential after 0012.

`cleanDb` in `test/fixtures.js` correctly removes the `DELETE FROM share_tokens`
statement. The test DB applies all migrations (via `applyD1Migrations`), so
`share_tokens` will not exist in the test schema after migration 0013 runs.
The `db.test.js` schema verification test does not assert `share_tokens` exists,
so no test breakage expected there.

### Rate Limiting for Public Endpoints

**ADVISE: src/index.js -- VERIFY_RATE_LIMITER not applied to handleGetCapture and handleCaptureStatus for unauthenticated requests**

`handleGetCaptureArtifact` applies the `VERIFY_RATE_LIMITER` to unauthenticated
requests (line 1568). `handleVerifyCapture` applies it unconditionally (line 1663).
But `handleGetCapture` (metadata endpoint) and `handleCaptureStatus` have no
rate limiting for unauthenticated requests.

Before this change, these endpoints required auth, so the tenant rate limiter
covered them. Now they are public and unguarded for unauthenticated access.

The capture metadata endpoint (`GET /v1/captures/{id}`) hits D1 on every request.
At scale, an unauthenticated client could enumerate D1 reads freely. Consider
applying the `VERIFY_RATE_LIMITER` to unauthenticated requests in both handlers,
consistent with the artifact handler:

```js
// In handleGetCapture and handleCaptureStatus:
if (!captureAuth && env.VERIFY_RATE_LIMITER) {
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  const { success } = await env.VERIFY_RATE_LIMITER.limit({ key: clientIp });
  if (!success) {
    // log + return 429
  }
}
```

This is an ADVISE (not BLOCK) because the capture ID is 128-bit and unguessable,
so a purely random scan yields nothing. However, known-ID scraping (e.g., from
a leaked list) would be unrestricted on these two handlers.

### Cache-Control Header Change

The change from `Cache-Control: private, no-store` to `Cache-Control: no-store`
is correct. `private` instructs shared caches (CDN, proxy) not to cache the
response, which is appropriate for authenticated responses. Now that these
endpoints are public, `private` is no longer correct -- responses are the same
for all callers with a given capture ID. `no-store` alone is correct for these
endpoints since the data changes during the capture lifecycle. The openapi.yaml
enum for the `Cache-Control` response header has been updated to match.

### Remaining Share Token References

A thorough scan of `src/`, `test/`, `packages/`, `migrations/`, `openapi.yaml`,
`SECURITY.md`, and `README.md` finds no stale share-token references in live code
paths. References in `migrations/0010_share_tokens.sql` are expected (the original
creation migration; it is not modified or removed, which is correct -- migration
history must be preserved).

### Test Coverage

Test coverage for the new access model is adequate:

- Public access returns 200 for `GET /v1/captures/{id}`, `/status`, and all
  five artifact types (screenshot, html, headers, wacz, screenshot-before) --
  verified.
- Authenticated cross-tenant access returns 404 -- verified.
- Non-existent capture returns 404 unauthenticated -- verified.
- Incomplete capture artifact returns 404 -- verified.
- `captureUrl` in status response does not contain `?token=` -- verified.
- Artifact URLs in capture metadata do not contain `?token=` -- verified.
- List endpoint still requires auth -- verified (existing tests unchanged).

**ADVISE: test/capture-retrieval.test.js -- no test for invalid credentials on a public individual capture route**

The behavior "presenting an invalid API key to `GET /v1/captures/{id}` returns 401"
is a deliberate and security-relevant design decision (line 485-486 in index.js).
It is not currently tested. A test like:

```js
it('invalid API key on individual capture route returns 401', async () => {
  const res = await SELF.fetch(`https://worker.test/v1/captures/${CAP_A}`, {
    headers: { Authorization: 'Bearer invalid-key' },
  });
  expect(res.status).toBe(401);
});
```

This is ADVISE not BLOCK -- the logic is covered by the auth gate unit behavior,
but an explicit test would prevent accidental regression of the "bad credentials
are rejected, not silently ignored" invariant.

### Documentation

`SECURITY.md`, `README.md`, `openapi.yaml`, `site/content/authentication.md`,
`site/content/index.md`, and `packages/verify/README.md` are all consistent with
the new access model. The threat analysis in `SECURITY.md` correctly identifies
the residual risk (capture ID as bearer capability) and frames it accurately.

The 401 error message in `packages/verify/lib/key-resolver.js` is updated to
reflect that individual captures are publicly accessible, which is correct.

---

## Summary of Findings

| Severity | Location | Issue |
|----------|----------|-------|
| NIT | src/index.js:1212 | handleListCaptures lacks defensive guard for undefined captureAuth |
| ADVISE | src/index.js:1465, 1806 | handleGetCapture and handleCaptureStatus lack rate limiting for unauthenticated requests |
| ADVISE | test/capture-retrieval.test.js | Missing test: invalid credentials on public individual capture route should return 401 |
