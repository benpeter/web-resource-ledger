# Domain Plan Contribution: observability-minion

## Audit Event Schema for Multi-Tenant Compliance Querying

### Current State Analysis

The codebase already has a strong logging foundation. Key observations:

1. **Consistent `log()` helper**: Fire-and-forget via `ctx.waitUntil()`, ships structured JSON to Coralogix with `applicationName`, `subsystemName`, `severity`, `timestamp`, and a stringified `data` payload.

2. **Existing event naming convention**: `subsystem.action` pattern is well-established:
   - `capture.*`: `capture.queued`, `capture.start`, `capture.success`, `capture.fail`, `capture.partial`, `capture.stage.fail`, `capture.kv_create_fail`, `capture.kv_fail`, `capture.header_fail`, `capture.wacz_fail`, `capture.key_archive_fail`, `capture.consent_error`
   - `admin.*`: `admin.key_create`, `admin.key_create_fail`, `admin.key_list`, `admin.key_revoke`, `admin.key_revoke_fail`, `admin.key_revoke_blocked`
   - `security.*`: `security.auth_fail`, `security.rate_limit`, `security.capacity_limit`, `security.ssrf_block`, `security.legacy_auth_used`
   - `signing.*`: `signing.key_unavailable`
   - `list.*`: `list.success`, `list.error`

3. **Tenant context already partially present**: `handleCreateCapture` already logs `tenantId`, `keyName`, `authMethod` on `capture.queued`. `handleListCaptures` does the same on `list.success`. Admin handlers log `tenantId` on key lifecycle events. The pattern exists but is inconsistent -- some log calls have it, others don't.

4. **Severity levels in use**: 3 (info) for success, 4 (warn) for degraded/rate-limit, 5 (error) for failures, 6 (verbose/debug) for low-priority operational data (`list.success`, `admin.key_list`).

5. **Security invariant**: The `log()` function's docstring mandates that `data` must contain only static values and predetermined strings, never attacker-controlled input. This is critical for audit logging -- field values must be safe.

---

### Recommendations

#### (a) Required Fields for Every Authenticated Request Log Entry

Every log entry emitted for an authenticated request must include the following fields in the `data` payload. This is the **audit envelope** -- a consistent set of fields that enables per-tenant querying and forensic correlation.

| Field | Type | Source | Purpose |
|-------|------|--------|---------|
| `event` | `string` | Handler | Event name in `subsystem.action` format. Already present on all log calls. |
| `tenantId` | `string` | `auth.tenantId` | Tenant isolation. Required for per-tenant Coralogix queries. |
| `keyName` | `string\|null` | `auth.keyName` | Human-readable key identifier. `null` for legacy auth. |
| `keyHashPrefix` | `string` | `sha256hex.slice(0, 8)` | First 8 hex chars of the key hash. Correlates to `keyHash` in admin output without exposing the full hash. Currently logged only on auth failures; should be added to success paths. |
| `authMethod` | `string` | `auth.authMethod` | One of: `'kv'`, `'legacy'`, `'admin_key'`. Distinguishes auth paths. |
| `action` | `string` | Handler | Verb describing what was requested: `'capture'`, `'list'`, `'key_create'`, `'key_list'`, `'key_revoke'`. Distinct from `event` because `event` encodes outcome (`capture.queued` vs `capture.fail`) while `action` is the intent. |
| `resource` | `string\|null` | Handler | The resource identifier if applicable: captureId, target URL (for captures), keyHashPrefix (for key operations). `null` for list operations. |
| `responseStatus` | `number` | Handler | HTTP status code returned. Critical for audit -- lets you answer "which requests failed" without parsing event names. |
| `cip` | `string\|undefined` | `computeCip()` | Pseudonymized client IP. Already present on most log calls. |
| `durationMs` | `number\|undefined` | Handler | Request duration where measurable. Already present on `list.success`. |

**Fields NOT to add (and why)**:

- **Full `keyHash`**: Exposing the full 64-char hash in logs creates a vector for key impersonation if logs are leaked. The 8-char prefix is sufficient for correlation.
- **Request body contents**: Violates the `log()` safety invariant. The `url` field on capture events is acceptable because it's been through `validateUrl()`.
- **Raw IP**: Already handled by `cip`. Never log `CF-Connecting-IP` directly.
- **User-Agent / Referer**: Attacker-controlled input, violates the `log()` safety invariant. If needed later, hash them like `cip`.

#### (b) Event Naming for Efficient Coralogix Filtering

The current `subsystem.action` pattern is sound and should be preserved. The Coralogix `subsystemName` field already carries the top-level module (`capture`, `admin`, `security`, `list`), and the `event` field in `data` provides the specific action.

**Recommended audit event taxonomy** (preserving existing names, adding missing ones):

```
# Capture lifecycle (subsystem: "capture")
capture.queued          -- POST /v1/captures accepted (already exists)
capture.start           -- background capture begins (already exists)
capture.success         -- capture completed (already exists)
capture.partial         -- partial capture completed (already exists)
capture.fail            -- capture failed (already exists)

# List operations (subsystem: "list")
list.success            -- GET /v1/captures succeeded (already exists)
list.error              -- GET /v1/captures failed (already exists)

# Key lifecycle (subsystem: "admin")
admin.key_create        -- POST /v1/admin/keys succeeded (already exists)
admin.key_create_fail   -- POST /v1/admin/keys failed (already exists)
admin.key_list          -- GET /v1/admin/keys succeeded (already exists)
admin.key_revoke        -- DELETE /v1/admin/keys/:hash succeeded (already exists)
admin.key_revoke_fail   -- DELETE /v1/admin/keys/:hash failed (already exists)
admin.key_revoke_blocked-- last-admin-key guard triggered (already exists)

# Security events (subsystem: "security")
security.auth_fail      -- authentication failed (already exists)
security.auth_success   -- NEW: authentication succeeded (see below)
security.rate_limit     -- rate limit hit (already exists)
security.capacity_limit -- global capacity limit hit (already exists)
security.ssrf_block     -- SSRF URL blocked (already exists)
security.legacy_auth_used -- legacy auth path used (already exists)
```

**New event: `security.auth_success`**

Currently, successful authentication is logged implicitly through the downstream event (e.g., `capture.queued`). For audit purposes, consider whether a separate `security.auth_success` event is needed. My recommendation: **do not add it**. The downstream event (e.g., `capture.queued` with full tenant context) already serves as proof of successful auth, and a separate event would double log volume for zero additional queryability. The audit envelope fields on the downstream event are sufficient.

**Coralogix query patterns this taxonomy enables**:

```
# All actions by a specific tenant (last 24h)
subsystemName:"capture" OR subsystemName:"admin" OR subsystemName:"list"
AND text.tenantId:"acme-corp"

# All key lifecycle events
subsystemName:"admin" AND text.event:/admin\.key_.*/

# All failed auth attempts (abuse investigation)
subsystemName:"security" AND text.event:"security.auth_fail"

# All captures by a specific key
subsystemName:"capture" AND text.event:"capture.queued" AND text.keyName:"primary"

# All 4xx/5xx responses for a tenant
text.tenantId:"acme-corp" AND text.responseStatus:>=400
```

The `subsystemName` is a first-class Coralogix field (not nested in `text`), so filtering on it is cheap and avoids full-text search. The `text.*` fields require JSON parsing but Coralogix handles this natively with its JSON column indexing.

#### (c) Key Lifecycle Events -- Additional Fields

Current key lifecycle logging is good but missing some audit-critical fields. Specific gaps:

**`admin.key_create`** (currently logged):
```javascript
// Current
{ event: 'admin.key_create', keyHashPrefix, tenantId, scopes, name }

// Recommended additions
{
  event: 'admin.key_create',
  keyHashPrefix,          // already present
  tenantId,               // already present
  scopes,                 // already present
  name,                   // already present
  authMethod: 'admin_key', // NEW: who authorized this action
  responseStatus: 201,    // NEW: confirms success
  cip,                    // NEW: which IP performed the admin action
}
```

**`admin.key_revoke`** (currently logged):
```javascript
// Current
{ event: 'admin.key_revoke', keyHashPrefix, tenantId, idempotent }

// Recommended additions
{
  event: 'admin.key_revoke',
  keyHashPrefix,          // already present
  tenantId,               // already present
  idempotent,             // already present
  keyName: record.name,   // NEW: human-readable name of revoked key
  scopes: record.scopes,  // NEW: what access was removed
  authMethod: 'admin_key', // NEW: who authorized this action
  responseStatus: 200,    // NEW: confirms success
  cip,                    // NEW: which IP performed the admin action
}
```

**`admin.key_revoke_fail`** (currently logged):
```javascript
// Current
{ event: 'admin.key_revoke_fail', keyHashPrefix, reason: 'not_found' }

// Recommended additions
{
  event: 'admin.key_revoke_fail',
  keyHashPrefix,          // already present
  reason: 'not_found',    // already present
  authMethod: 'admin_key', // NEW
  responseStatus: 404,    // NEW
  cip,                    // NEW
}
```

**`admin.key_list`** (currently logged):
```javascript
// Current (severity 6)
{ event: 'admin.key_list', count, tenantFilter, includeRevoked }

// Recommended changes
{
  event: 'admin.key_list',
  count,                  // already present
  tenantFilter,           // already present
  includeRevoked,         // already present
  authMethod: 'admin_key', // NEW
  responseStatus: 200,    // NEW
  cip,                    // NEW
}
```

**`admin.key_revoke_blocked`** (currently logged):
```javascript
// Current
{ event: 'admin.key_revoke_blocked', keyHashPrefix, tenantId }

// Recommended additions
{
  event: 'admin.key_revoke_blocked',
  keyHashPrefix,          // already present
  tenantId,               // already present
  keyName: record.name,   // NEW
  authMethod: 'admin_key', // NEW
  responseStatus: 409,    // NEW
  cip,                    // NEW
}
```

The critical missing fields across all admin events are `cip` and `authMethod`. Without `cip`, you cannot correlate admin actions to a source IP for abuse investigation. Without `authMethod`, the audit trail cannot prove which authentication mechanism was used.

#### (d) Severity Levels for Audit Events

The current severity mapping is appropriate and should be preserved:

| Severity | Coralogix Name | Current Use | Audit Use |
|----------|---------------|-------------|-----------|
| 3 | Info | Successful operations | Audit trail for successful authenticated actions |
| 4 | Warning | Rate limits, degraded paths, non-fatal failures | Auth-adjacent events (legacy auth used, rate limit hit) |
| 5 | Error | Hard failures, auth failures | Failed authenticated actions, auth rejections |
| 6 | Verbose | Low-priority operational data (`list.success`, `admin.key_list`) | Keep for non-audit operational logs |

**One change to recommend**: promote `admin.key_list` from severity 6 to severity 3. Key listing is an administrative action that should appear in the audit trail. In an abuse scenario, an attacker with the admin key would list keys before revoking them. Severity 6 might be filtered out by Coralogix TCO policies that route verbose logs to cold storage, making them unavailable for real-time alerting. All admin key lifecycle events should be at severity 3 (info) for audit completeness.

Similarly, `list.success` should stay at severity 6. Listing captures is a read-only operation that does not change state. However, if compliance requirements mandate logging every authenticated data access, it should be promoted to severity 3.

**Do NOT create a separate "audit" severity**. The Coralogix severity range (1-6) is fixed, and overloading a severity level for "this is an audit event" would break the established semantic meaning. Instead, use the event naming taxonomy and a queryable `audit: true` field (see below) to identify audit-relevant events.

### Implementation Pattern: Audit Context Helper

Rather than requiring every handler to manually assemble the audit envelope fields, introduce a thin helper that extracts the common fields from the auth result. This reduces copy-paste errors and ensures consistency.

```javascript
/**
 * Builds the audit envelope fields from an auth result.
 * Returns an object that can be spread into any log data payload.
 *
 * @param {object} auth - Result from verifyApiKey() or verifyAdminKey()
 * @param {object} [extras] - Additional fields (cip, responseStatus, etc.)
 * @returns {object}
 */
function auditFields(auth, extras = {}) {
  return {
    tenantId: auth.tenantId ?? null,
    keyName: auth.keyName ?? null,
    authMethod: auth.authMethod,
    ...extras,
  };
}
```

Usage in handlers:

```javascript
// In handleCreateCapture, after successful auth:
ctx.waitUntil(log(env, 3, 'capture', {
  event: 'capture.queued',
  ...auditFields(auth, { cip, responseStatus: 202 }),
  captureId,
  url: result.url,
}) ?? Promise.resolve());
```

This is intentionally minimal -- it is NOT a middleware, NOT a class, NOT an abstraction layer. It is a data-shaping helper. The `log()` function signature does not change. The Coralogix payload format does not change. Only the consistency of what goes into the `data` object improves.

**Where to put it**: In `src/log.js` alongside the existing `log()` function, or inline in `src/index.js` if you want to avoid any API surface changes to `log.js`. Given that `admin.js` also needs it, `src/log.js` is the better location.

### Proposed Tasks

1. **Add `cip` computation to admin handlers** (HIGH PRIORITY)
   - `handleAdminCreateKey`, `handleAdminListKeys`, `handleAdminRevokeKey` currently do not compute `cip`. Admin auth happens in the fetch handler (`src/index.js` lines 77-96) but `cip` is not passed through to the admin handlers.
   - Options: (a) compute `cip` in the admin auth block and attach it to the request context, (b) compute `cip` in each admin handler independently (matches capture handler pattern), (c) pass `cip` as a parameter.
   - Recommendation: option (c) -- pass `cip` as a parameter alongside `request, env, ctx, match`. This is the least invasive change and matches the existing pattern where `cip` is computed at the handler level.
   - Actually, looking more carefully: the admin rate limit block in `src/index.js` (line 82) already computes `cip` for admin rate limit logging. But this `cip` value is scoped to the `if (!response)` block and is not passed to the admin handlers. The cleanest approach is to compute `cip` once at the top of the admin path and pass it through.

2. **Add `auditFields()` helper to `src/log.js`** (MEDIUM PRIORITY)
   - Export a named function that takes an auth result and returns the common audit envelope fields.
   - Keep it simple -- just field extraction, no logic.

3. **Add `responseStatus` to existing log calls** (MEDIUM PRIORITY)
   - Every `log()` call that follows a handler decision should include the HTTP status code being returned.
   - For auth failures in the fetch handler, the status is available from `auth.response.status` (already logged on `security.auth_fail`).
   - For success paths, the status is known at the handler level (202 for capture, 200 for list, 201 for key create, etc.).

4. **Add `keyHashPrefix` to success-path log calls** (MEDIUM PRIORITY)
   - Currently, `keyHashPrefix` is only logged on auth failures (in `auth.js` line 158, 170, 194) and admin key operations.
   - For tenant API key auth, the hash is computed inside `verifyApiKey()` but not returned in the success result. The auth result should include `keyHashPrefix: sha256hex.slice(0, 8)` on the success path so handlers can include it in their log calls.
   - This requires a small change to `verifyApiKey()` to return `keyHashPrefix` in the success object.

5. **Promote `admin.key_list` to severity 3** (LOW PRIORITY)
   - Change severity from 6 to 3 in `src/admin.js` line 173.
   - Add `authMethod`, `cip`, and `responseStatus` fields.

6. **Enrich admin handler log calls with missing audit fields** (HIGH PRIORITY)
   - Add `authMethod`, `cip`, `responseStatus` to all admin event log calls.
   - Add `keyName` and `scopes` to `admin.key_revoke` events.
   - This is the bulk of the implementation work but is straightforward field addition.

7. **Add `action` field to all authenticated request log calls** (LOW-MEDIUM PRIORITY)
   - Optional but improves queryability. If `event` already encodes the action (e.g., `capture.queued` implies action is `capture`), this is somewhat redundant. Recommend deferring unless Coralogix query patterns prove it's needed.
   - Decision: **defer**. The `event` field + `subsystemName` already provide sufficient query discrimination. Adding `action` is a schema expansion for marginal queryability improvement.

### Risks and Concerns

1. **Log volume increase**: Adding `responseStatus`, `keyHashPrefix`, and `cip` to every authenticated request log entry adds ~50-80 bytes per log entry. At current traffic levels this is negligible, but should be monitored via Coralogix TCO tracking after deployment.

2. **`cip` computation cost in admin handlers**: `computeCip()` involves two HMAC operations (daily key derivation is cached, IP hash is not). For admin handlers that currently do not compute `cip`, this adds ~0.5ms per request. At 5 req/60s admin rate limit, this is immaterial.

3. **Auth result contract change**: Adding `keyHashPrefix` to the `verifyApiKey()` success return type changes the auth contract. This is a safe additive change -- existing destructuring like `const { tenantId, keyName, authMethod } = auth` will simply ignore the new field. But tests that assert on the exact shape of the auth result will need updating.

4. **Log schema backward compatibility**: Existing Coralogix queries, dashboards, or alerts that filter on specific field presence will not break because we are adding fields, not removing or renaming them. However, any Coralogix alerts that use field-count heuristics or strict schema matching should be reviewed.

5. **Admin auth does not return tenant context**: `verifyAdminKey()` returns `{ ok: true, authMethod: 'admin_key' }` with no `tenantId`, `keyName`, or `keyHashPrefix`. This is correct -- the admin key is an infrastructure secret, not a per-tenant key. Admin audit events should use `tenantId` from the request body or target resource (e.g., the tenant of the key being created/revoked), not from the auth result. This is already happening for `admin.key_create` (uses `body.tenantId`) and `admin.key_revoke` (uses `record.tenantId`). The audit envelope helper should handle the admin case by accepting an explicit tenantId override.

6. **`security.auth_fail` events for admin routes lack tenant context**: When admin auth fails, there is no tenant context because the request was rejected before a tenant could be identified. This is correct and expected. Querying these events requires filtering by `cip` or time range, not by `tenantId`.

7. **Race condition on `cip` for admin auth failures**: In `src/index.js` lines 82-96, `cip` is computed only after the rate limiter fails (line 82) or after auth fails (line 92). If rate limiting passes and auth passes, `cip` is never computed in the admin path. The fix is to compute `cip` once at the top of the admin block, before either check.

### Additional Agents Needed

- **test-minion**: Tests need updating for the auth result contract change (adding `keyHashPrefix` to success return) and for verifying that all authenticated request log calls include the audit envelope fields. A test helper that asserts the audit envelope schema on captured log calls would prevent future regressions.

- **security-minion**: Should review the `keyHashPrefix` exposure decision. The 8-char prefix provides 2^32 uniqueness -- sufficient for operational correlation but not for key reconstruction. Confirm this does not weaken key secrecy given the overall key space.
