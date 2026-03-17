## Security Minion Review

**Verdict: ADVISE**

---

### Finding 1 -- Unvalidated query parameter in existing log call (INVARIANT violation not caught)

**SCOPE**: Task 2, `src/admin.js` `handleAdminListKeys`, `admin.key_list` log call

**CHANGE**: The existing `admin.key_list` log entry at line 173-178 already logs `tenantFilter: tenantFilter || null`, where `tenantFilter = params.get('tenant') || undefined`. This is raw attacker-controlled input from the query string flowing into `log()`, violating the INVARIANT that `data` must contain only static values and predetermined strings.

The plan instructs Task 2 to enrich this log call with `authMethod`, `responseStatus`, and `cip`, but does not flag or remediate the pre-existing INVARIANT violation. Executing Task 2 as written will add safe fields but leave the unsafe field in place.

**WHY**: An attacker calling `GET /v1/admin/keys?tenant=<payload>` can inject arbitrary strings into Coralogix log entries. While `tenantFilter` does not appear in any downstream log parsing or alerting that would execute the payload, OWASP A09 / log injection (CWE-117) applies: malicious values can corrupt structured log entries, forge log lines if Coralogix ingests raw strings without strict JSON enforcement, or confuse operators during abuse investigations. The `listApiKeyRecords` call itself will simply filter out non-matching records -- the validation gap is exclusively in what gets logged.

**TASK**: In Task 2's `handleAdminListKeys` enrichment step, add a validation guard before the log call. Before logging `tenantFilter`, validate it against `TENANT_ID_RE`. If it does not match (i.e., the caller passed a garbage value), log `tenantFilter: null` instead of the raw string. Example:

```js
import { TENANT_ID_RE } from './kv.js'; // already imported

// In handleAdminListKeys, before the log call:
const safeTenantFilter = (tenantFilter && TENANT_ID_RE.test(tenantFilter)) ? tenantFilter : null;

ctx.waitUntil(log(env, 3, 'admin', {
  event: 'admin.key_list',
  count: data.length,
  tenantFilter: safeTenantFilter,
  includeRevoked,
  authMethod: 'admin_key',
  responseStatus: 200,
  cip,
}) ?? Promise.resolve());
```

This is a one-line guard and does not change the `listApiKeyRecords` filtering behavior (which already tolerates arbitrary tenant values by returning zero results). Add a note to the NEVER-LOG comment in Task 3 explicitly listing "unvalidated query parameters" as a forbidden input category.

---

### Finding 2 -- `scopes` field from revoked KV record is INVARIANT-safe (confirm, no change needed)

**SCOPE**: Task 2, `admin.key_revoke` and `admin.key_revoke_blocked` log calls

The plan instructs adding `scopes: result.record.scopes` to revoke log entries. This is safe: `scopes` is validated against `VALID_SCOPES = ['capture', 'read', 'admin']` at key creation time and stored in KV. The KV record is written only by `handleAdminCreateKey` after passing validation. No attacker can inject arbitrary scope values into the stored record.

No change needed. Documenting for the audit trail.

---

### Finding 3 -- `auth.keyHashPrefix || null` on pre-auth failure paths is correct

**SCOPE**: Task 2, `security.auth_fail` enrichment

The plan uses `auth.keyHashPrefix || null` for auth failure log calls. Reviewing `verifyApiKey()`: paths that fail before hashing (`missing_header`, `invalid_scheme`, `service_not_configured`) do not return `keyHashPrefix`. Paths that fail after hashing (`key_revoked`, `kv_error`, `scope_insufficient`, `key_not_found`, `legacy_scope_insufficient`) do return it. Using `|| null` correctly handles both cases and does not risk logging the raw token.

No change needed. The plan's INVARIANT safety notes on this point are accurate.

---

### Summary

One actionable remediation required (Finding 1). The rest of the plan's INVARIANT claims are correct. The never-log documentation in Task 3 is a positive addition. The plan correctly enforces destructured field picking over raw object passing.
