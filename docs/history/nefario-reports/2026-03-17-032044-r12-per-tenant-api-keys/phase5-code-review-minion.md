# Code Review: R12 Per-Tenant API Keys

## Summary

The implementation is well-structured with clear trust boundaries, fail-closed
error handling, and meaningful security annotations. Auth path ordering, timing-
safe comparisons, scope enforcement, IDOR prevention, and self-revocation guards
are all correctly implemented. One functional bug exists that silently breaks
observability for all KV-based keys. Two advisory-level findings follow.

---

VERDICT: ADVISE

FINDINGS:

- [BLOCK] src/admin.js:144-151 vs src/auth.js:166 -- KV record stores human-
  readable name under the field `name`, but auth.js reads `record.keyName`.
  Because the field never exists, the `??` fallback always fires and every
  KV-authenticated request will log and expose `keyHash.slice(0,8)` instead
  of the key's human-readable name. This affects every log event that
  includes `keyName` from auth (capture, list, all admin endpoints), the
  `keyName` value returned in the POST /v1/admin/keys 201 body field
  `name` is correct but the auth lookup is broken, and the list response
  spread at admin.js:254 (`{ keyHash: hash, ...record }`) correctly surfaces
  `name` from the record but the auth enrichment path never does.
  FIX: In src/admin.js, change the KV put at line 144 to store the field
  as `keyName` instead of `name`:
  ```js
  await env.KV.put(`apikey:${keyHash}`, JSON.stringify({
    tenantId,
    scopes,
    keyName: name,   // was: name
    createdAt,
    createdBy,
    revoked: false,
  }));
  ```
  Then update all references in admin.js that read `record.name` to read
  `record.keyName` (lines 346, 394, 399). The response shape at line 175
  (`{ ..., name, ... }`) can keep `name` as the response field name for
  API consumers -- only the KV storage field needs to change.
  Alternatively: keep the KV field as `name` and fix auth.js:166 to read
  `record.name ?? keyHash.slice(0,8)`. Either fix is acceptable; the
  storage-side fix is less intrusive because auth.js is the consumer.

- [ADVISE] src/admin.js:253-254 -- GET /v1/admin/keys spreads the full KV
  record into the response, including `createdBy` and `revokedBy` fields.
  For tenant-scoped admin callers (auth.authMethod !== 'env-admin'), this
  exposes the name of whichever admin key or env-var credential created or
  revoked each key. If `createdBy` is 'ADMIN_KEY' this is a mild information
  leak; if it is a human-readable key name from a different admin user it
  could be unexpected. The same spread also exposes the full `scopes` array
  and `revoked` boolean, which are useful, so the spread itself is not wrong.
  FIX: Construct an explicit projection in the list response instead of
  spreading the full record:
  ```js
  entries.push({
    keyHash: hash,
    keyName: record.keyName,
    tenantId: record.tenantId,
    scopes: record.scopes,
    createdAt: record.createdAt,
    revoked: record.revoked,
    ...(record.revoked ? { revokedAt: record.revokedAt } : {}),
  });
  ```
  This omits `createdBy` and `revokedBy` from the list response while
  keeping all fields a tenant admin needs.

- [NIT] src/admin.js:153-162 -- The tenant key index update (write to
  `tenant-keys:${tenantId}`) happens after the key record is successfully
  written to KV, but there is a silent failure mode: if the index read at
  line 156 fails and the catch swallows the error, a fresh empty array is
  used and any existing keys in the index are lost from the list. The comment
  "Start fresh if read fails" is accurate but the consequence (existing tenant
  keys disappear from list results until the next successful index read) is
  not documented.
  FIX: Log the index read failure at warning level before continuing with
  the empty array, so operators can detect index corruption:
  ```js
  } catch (err) {
    await log(env, 4, 'admin', { event: 'admin.index_read_fail', tenantId,
      errorMessage: String(err?.message ?? '').slice(0, 256) });
  }
  ```

- [NIT] src/admin.js (all three handlers) -- The rate-limit check,
  auth+scope check, and cip computation are repeated verbatim across
  handleAdminCreateKey, handleAdminListKeys, and handleAdminRevokeKey (roughly
  40 lines duplicated three times). This is a DRY concern rather than a bug,
  and extracting it would reduce future drift risk between handlers.
  FIX: Extract a shared `requireAdminAuth(request, env, ctx)` helper that
  returns `{ auth, cip }` or a response on failure:
  ```js
  async function requireAdminAuth(request, env, ctx) {
    const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
    const cip = await computeCip(env, clientIp);
    if (env.ADMIN_RATE_LIMITER) { ... }
    const auth = await verifyApiKey(request, env);
    if (!auth.ok) { ... return { response: auth.response }; }
    const scopeFail = requireScope(auth, 'admin');
    if (scopeFail) { ... return { response: scopeFail }; }
    return { auth, cip };
  }
  ```
  Each handler then calls `const result = await requireAdminAuth(...); if
  (result.response) return result.response;`. Not a blocker -- leave for
  a follow-up if auth logic evolves.

- [NIT] test/auth.test.js -- The existing auth test suite does not cover
  KV-path authentication (the R12 addition). It only exercises the
  CAPTURE_API_KEY env-var path. The BLOCK finding above (keyName field
  mismatch) would have been caught by a test asserting that a KV-auth
  result has `keyName` equal to the human-readable name rather than a
  hash prefix. Consider adding tests for:
  1. KV auth success: keyName matches the stored name, tenantId matches
  2. KV auth with revoked record: returns 401, does not fall through to
     env-var checks
  3. KV error: returns 500, does not fall through (fail-closed)
  4. Scope expansion: capture scope implies read scope

---

## Notes

**auth.js correctness**: The three-path fallback ordering is correct. The
revoked-key hard-stop at line 146 (before any env-var check) is correctly
placed. The fail-closed KV error handling at line 136 is correct. Timing-safe
comparison is used for env-var paths. The SHA-256 hash for KV lookup is
computed before any branching, which is correct.

**admin.js correctness**: The IDOR prevention on GET (ignoring query param
for tenant-scoped keys, line 235) and DELETE (404 on cross-tenant access,
line 341) are both correctly implemented. The self-revocation guard correctly
handles the env-admin case (auth.keyHash is null, so `keyHash === null` is
always false for a valid URL parameter). The last-admin-key guard is
best-effort and correctly documented as such.

**index.js**: The DELETE route regex `/^\/v1\/admin\/keys\/([a-f0-9]{64})$/`
at line 31 correctly constrains the keyHash path parameter to 64 lowercase
hex characters before it reaches the handler -- the handler does not need to
re-validate the format.

**generateApiKey**: The `wrl_live_` prefix + 32 random bytes (256 bits) base64url
gives adequate entropy. The `btoa(String.fromCharCode(...bytes))` spread is
safe for 32 bytes (well under the V8 stack argument limit).

**wrangler.toml**: ADMIN_RATE_LIMITER namespace_id 1004/2004 is correctly
added. The simple limit of 5/60s matches the RATE_LIMITS constant in
rate-limits.js.
