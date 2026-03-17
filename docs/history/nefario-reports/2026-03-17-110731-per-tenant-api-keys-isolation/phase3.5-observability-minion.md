# Observability Review -- Per-Tenant API Keys

**Verdict: ADVISE**

The plan's observability coverage is substantially correct. The three-auth-path structure (KV, legacy fallback, admin) produces distinguishable log events, and the migration monitoring path via `authMethod` + `security.legacy_auth_used` is well-designed. Four targeted issues follow.

---

## Advisory 1: `security.auth_fail` schema break -- supplement, don't replace

**SCOPE**: Task 3, `src/index.js` log enrichment section

**CHANGE**: The Task 3 prompt says to "replace bare `status` field with `reason` from auth result" in `security.auth_fail` events. Do not replace -- add `reason` alongside the existing `status` field.

The existing event shape is `{ event: 'security.auth_fail', status: 401, cip }`. Any saved Coralogix searches, dashboards, or alert rules querying `status:401` will break if `status` is dropped. The correct enrichment is:

```javascript
{ event: 'security.auth_fail', status: auth.response.status, reason: auth.reason, keyHashPrefix: auth.keyHashPrefix, tenantId: auth.tenantId, keyName: auth.keyName, cip }
```

Keep `status` (HTTP numeric). Add `reason` (semantic string). Both fields together give operators the query surface they need now and going forward.

**WHY**: Log schema breaks cause silent blind spots in existing monitors. The `status` field is currently the only filter available for `security.auth_fail` queries. Removing it before all consumers are migrated creates an observation gap exactly when the system is in a sensitive migration state.

---

## Advisory 2: Missing `reason` value for KV lookup errors

**SCOPE**: Task 1, `verifyApiKey` in `src/auth.js`

**CHANGE**: The failure `reason` enumeration in Task 1 covers `key_not_found | key_revoked | scope_insufficient | missing_header | invalid_scheme | service_not_configured`. It does not cover KV I/O failure (network error, timeout, unexpected exception from `env.KV.get()`).

Add `kv_error` as a valid `reason` value and wrap the `await env.KV.get()` call in a try/catch:

```javascript
let record;
try {
  record = await env.KV.get(`apikey:${sha256hex}`, 'json');
} catch (err) {
  log(env, 5, 'security', { event: 'security.auth_fail', reason: 'kv_error', cip: null, errorMessage: String(err?.message ?? '').slice(0, 128) });
  return { ok: false, response: problemResponse(503, 'Service is temporarily unavailable'), reason: 'kv_error' };
}
```

Without this, a transient KV failure causes an unhandled exception that propagates out of `verifyApiKey` rather than returning a clean 503 -- violating the function's documented contract ("NEVER throws for auth failures") and producing no structured log event.

**WHY**: Per CLAUDE.md debugging discipline -- "the system must distinguish 'service unavailable' from 'misconfigured'." A KV I/O error is service-unavailable; an absent `env.KV` binding is misconfigured. Both need distinct `reason` values and both need a log event. Currently only the misconfigured path is defined.

---

## Advisory 3: `admin.key_revoke` needs an idempotency field

**SCOPE**: Task 3, `handleAdminRevokeKey` in `src/admin.js`

**CHANGE**: The plan logs `admin.key_revoke` at severity 3 for both first-time revocation and idempotent re-revocation. Add an `idempotent: true/false` field to distinguish them:

```javascript
// First revocation:
log(env, 3, 'admin', { event: 'admin.key_revoke', keyHashPrefix, tenantId, keyName, idempotent: false, cip, authMethod })

// Re-revocation (already revoked):
log(env, 3, 'admin', { event: 'admin.key_revoke', keyHashPrefix, tenantId, keyName, idempotent: true, cip, authMethod })
```

Without this, operators cannot distinguish "the key was just revoked" from "someone called DELETE twice." The idempotent case is useful signal for audit investigation (was this a retry or a second actor?).

**WHY**: The migration runbook will trigger multiple DELETE calls during testing and rotation procedures. Without `idempotent` tagging, Coralogix will show repeated `admin.key_revoke` events that look identical, making it impossible to determine whether a key was revoked once or many times.

---

## Advisory 4: `auth.js` needs to import `log` -- document the new dependency

**SCOPE**: Task 1 prompt, `src/auth.js`

**CHANGE**: The Task 1 prompt says `verifyApiKey` should log `security.legacy_auth_used` from inside the auth module. But the current `auth.js` does not import `log.js`. The task prompt does not mention adding this import, nor does it list `log.js` in the reference files for Task 1.

Add an explicit import statement and reference file entry to the Task 1 prompt:

```javascript
import { log } from './log.js';
```

And add to the Task 1 reference files list: `src/log.js -- use log(env, severity, subsystem, data)`.

Also: the `log()` call inside `verifyApiKey` is fire-and-forget. The auth function does not have access to `ctx.waitUntil()`. This is acceptable (same pattern as `console.warn` in `log.js` itself), but the implementing agent should know this is intentional -- log delivery for this event is best-effort. Add a comment to the auth module: `// Log is fire-and-forget -- no ctx.waitUntil available in auth path`.

**WHY**: Without this explicit callout, the implementing agent may either (a) omit the import and cause a runtime error, (b) attempt to pass `ctx` into `verifyApiKey` which would break the established signature contract, or (c) skip the log call entirely.
