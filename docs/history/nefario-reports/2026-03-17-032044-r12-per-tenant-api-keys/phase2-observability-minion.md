## Domain Plan Contribution: observability-minion

### Summary

R12 touches logging in three categories: (1) enriching existing security events with `keyName` and `reason`, (2) adding new admin subsystem events, and (3) introducing a new `security.scope_violation` event. The `log()` function itself needs no changes -- it already accepts arbitrary structured `data` payloads. All changes are to the call sites.

---

### Existing Log Call Inventory (what changes)

#### 1. `security.auth_fail` -- TWO call sites in `src/index.js`

**Line 135** (handleCreateCapture auth failure):
```js
log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status, cip })
```

**Line 212** (handleListCaptures auth failure):
```js
log(env, 5, 'security', { event: 'security.auth_fail', status: auth.response.status, cip })
```

**Required enrichment**: Add `reason` field (controlled vocabulary) and conditionally add `keyName` when the key was identified before the failure occurred.

The `reason` value comes from `verifyApiKey()` -- the auth function must return a failure reason alongside the response. Currently it returns `{ ok: false, response }`. R12 should change this to `{ ok: false, response, reason }` where `reason` is one of:

| reason | When | HTTP status |
|--------|------|-------------|
| `missing_header` | No Authorization header | 401 |
| `invalid_scheme` | Not `Bearer ` prefix | 401 |
| `key_not_found` | Key doesn't match any tenant record | 401 |
| `key_revoked` | Key matched but record is revoked | 403 |
| `scope_violation` | Key valid but not authorized for this operation | 403 |
| `misconfigured` | No API key store configured | 503 |

After R12, the log calls become:
```js
log(env, 5, 'security', {
  event: 'security.auth_fail',
  status: auth.response.status,
  reason: auth.reason,       // controlled vocabulary, always present on failure
  ...(auth.keyName ? { keyName: auth.keyName } : {}),  // present only when key was identified
  cip,
})
```

**Note**: `keyName` is the operator-chosen label for the key (e.g., "ben-dev", "ci-pipeline"), NOT the key material itself. It is safe to log because it is a static string set by the operator at key creation time. The security contract from `log.js` (line 9: "data must contain only static values and predetermined strings, never attacker-controlled input") is preserved because `keyName` comes from KV key metadata, not from the request.

#### 2. Tenant-scoped events that need `keyName` added

All events below already log `tenantId`. After R12, they should also include `keyName` so operators can distinguish which key within a tenant was used. The `keyName` is available from `auth.keyName` after successful authentication.

In **`src/index.js`**:

| Line | Event | Current fields | Add |
|------|-------|----------------|-----|
| 144 | `security.rate_limit` (capture per-ip) | `limiter, cip` | `keyName` |
| 153 | `security.capacity_limit` | `cip` | `keyName` |
| 177 | `security.ssrf_block` | `tenantId, reason, cip` | `keyName` |
| 221 | `security.rate_limit` (list per-ip) | `limiter, cip` | `keyName` |
| 228 | `security.capacity_limit` (list) | `cip` | `keyName` |
| 263 | `list.error` | `tenantId, errorClass, durationMs, cip` | `keyName` |
| 292 | `list.success` | `tenantId, resultCount, status, cursor, durationMs, cip` | `keyName` |

In **`src/capture.js`** -- all events within `performCapture()`:

| Line | Event | Add |
|------|----------|-----|
| 113 | `capture.start` | `keyName` (pass through from caller) |
| 127 | `capture.stage.fail` | `keyName` |
| 136 | `capture.header_fail` | `keyName` |
| 198 | `capture.key_archive_fail` | `keyName` |
| 211 | `capture.wacz_fail` | `keyName` |
| 218 | `capture.partial` | `keyName` |
| 230 | `capture.success` | `keyName` |
| 248 | `capture.consent_error` | `keyName` |
| 258 | `capture.fail` (catch-all) | `keyName` |
| 262 | `capture.kv_fail` | `keyName` |

**Implementation note for `capture.js`**: The `performCapture()` function signature currently is:
```js
performCapture(env, url, ip, captureId, tenantId, cip, renderer)
```

Add `keyName` as a parameter. The cleanest approach: pass it after `cip`:
```js
performCapture(env, url, ip, captureId, tenantId, cip, keyName, renderer)
```

Alternatively, bundle auth context into an object: `performCapture(env, url, ip, captureId, { tenantId, keyName, cip }, renderer)`. This avoids positional parameter sprawl and future breakage when R13 adds more auth context. However, this is a larger refactor touching tests. Defer to the implementation lead -- either approach works.

In **`src/wacz.js`**:

| Line | Event | Notes |
|------|-------|-------|
| 115 | `capture.tsa_fail` | Does NOT currently log `tenantId` or `cip`. This is a gap that R12 should close. `keyName` and `tenantId` should be passed through to `buildWacz()` or the TSA log call should be moved to the caller. |

#### 3. Rate limit events after successful auth

Lines 144, 153, 221, 228 -- these fire AFTER `verifyApiKey()` succeeds, so `auth.tenantId` and `auth.keyName` are available. Currently the rate limit events do not include `tenantId`. **R12 should add both `tenantId` and `keyName`** to all post-auth security events. This closes a gap where rate-limited requests from authenticated tenants are indistinguishable from each other in logs.

---

### New Events

#### 4. `admin.key_create` -- new event, new subsystem

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | `"admin.key_create"` |
| `tenantId` | string | Tenant the key belongs to |
| `keyName` | string | Operator-chosen label for the new key |
| `scopes` | string[] | Granted scopes (e.g., `["capture", "list"]`) |
| `createdBy` | string | Who created the key (operator identifier or "cli") |
| `cip` | string | Hashed IP if available (may be null for CLI operations) |

- **Subsystem**: `"admin"`
- **Severity**: 4 (warn) -- admin mutations are always noteworthy, even when successful
- **When**: Emitted from the key management function (likely a new admin handler or CLI script) immediately after the key record is written to KV

#### 5. `admin.key_revoke` -- new event, same admin subsystem

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | `"admin.key_revoke"` |
| `tenantId` | string | Tenant the key belongs to |
| `keyName` | string | Label of the revoked key |
| `revokedBy` | string | Who revoked (operator identifier or "cli") |
| `cip` | string | Hashed IP if available |

- **Subsystem**: `"admin"`
- **Severity**: 4 (warn)
- **When**: Emitted immediately after the key record is marked revoked in KV

**Rationale for severity 4 (warn)**: Key lifecycle events are not errors, but they are operationally significant mutations that should never be routine enough to ignore. Severity 4 ensures they appear in any alert rule watching for admin activity and stand out in log queries.

#### 6. `security.scope_violation` -- new event, existing security subsystem

| Field | Type | Description |
|-------|------|-------------|
| `event` | string | `"security.scope_violation"` |
| `tenantId` | string | Authenticated tenant |
| `keyName` | string | Key that attempted the action |
| `requiredScope` | string | Scope needed for the operation (e.g., `"capture"`) |
| `grantedScopes` | string[] | Scopes the key actually has |
| `cip` | string | Hashed client IP |

- **Subsystem**: `"security"`
- **Severity**: 5 (error) -- this is a security event; a valid key attempted an unauthorized action
- **When**: Emitted from `verifyApiKey()` (or a new authorization check layer) when a key is valid but lacks the required scope

**Note**: This event is distinct from `security.auth_fail` with `reason: 'scope_violation'`. The `auth_fail` event fires from the handler (index.js) and records the HTTP status. The `scope_violation` event fires from the auth layer with the detailed scope information. Both fire for the same request. This is intentional -- the auth_fail event maintains backward compatibility with existing log queries and alerts, while scope_violation provides the security-specific detail needed for investigation.

Actually, reconsidering: emitting two events for one failure adds noise. **Recommendation**: Use a single `security.auth_fail` event with `reason: 'scope_violation'` and include the scope fields (`requiredScope`, `grantedScopes`) directly in that event. This avoids dual-event complexity. The advisory decision says "new security.scope_violation event at severity 5" -- but since auth_fail is already severity 5, folding the scope detail into auth_fail achieves the same observability with less log volume. Flag this for the implementation lead to decide.

---

### Integration with `log()` function

The `log()` function (`src/log.js`) needs **zero changes**. It already:
- Accepts arbitrary structured `data` objects (line 37: `text: JSON.stringify(data)`)
- Accepts any `subsystem` string (line 19: `@param {string} subsystem`)
- Ships to Coralogix as JSON with `subsystemName` field

The new `"admin"` subsystem value works out of the box. No schema registration or subsystem enumeration is needed -- Coralogix Streama indexes subsystem values dynamically.

---

### Failed Admin Auth

When someone calls an admin endpoint (key create/revoke) with bad credentials, the same `security.auth_fail` event fires with whatever `reason` applies. No special admin-specific auth failure event is needed.

If admin endpoints use a separate auth mechanism (e.g., a different env binding like `ADMIN_API_KEY`), the auth function should still return the same `{ ok, response, reason }` shape so the logging pattern is identical.

---

### Recommendations

1. **Change `verifyApiKey()` return shape on failure**: `{ ok: false, response, reason, keyName? }`. The `keyName` is present only when the key was identified (i.e., found in KV but revoked or scope-violated). For `missing_header`, `invalid_scheme`, and `key_not_found`, `keyName` is absent.

2. **Add `tenantId` to post-auth rate limit events**: Lines 144, 153, 221, 228 currently omit `tenantId`. This is a pre-existing gap that R12 should close.

3. **Close the `capture.tsa_fail` gap**: This event (wacz.js line 115) logs neither `tenantId` nor `cip`. Either pass tenant context into `buildWacz()` or move the TSA failure log to the caller (`capture.js`). I recommend the latter -- keep `buildWacz()` pure and let the capture orchestrator handle all logging.

4. **Use controlled vocabulary for `reason`**: The six values (`missing_header`, `invalid_scheme`, `key_not_found`, `key_revoked`, `scope_violation`, `misconfigured`) should be defined as constants, not string literals scattered across the codebase. A simple object exported from `auth.js` suffices:
   ```js
   export const AUTH_FAIL_REASONS = {
     MISSING_HEADER: 'missing_header',
     INVALID_SCHEME: 'invalid_scheme',
     KEY_NOT_FOUND: 'key_not_found',
     KEY_REVOKED: 'key_revoked',
     SCOPE_VIOLATION: 'scope_violation',
     MISCONFIGURED: 'misconfigured',
   };
   ```

5. **Decide on scope_violation event shape**: Either a standalone `security.scope_violation` event OR fold scope fields into `security.auth_fail` when `reason === 'scope_violation'`. Not both. Single event is simpler and cheaper (one log entry per failure, not two).

6. **`keyName` invariant**: Document in auth.js that `keyName` values must match `/^[a-z0-9_-]{1,64}$/` (same pattern as `tenantId`). This ensures they are safe to log per the log.js security contract and safe to use in Coralogix queries without escaping.

---

### Proposed Tasks

1. **Enrich `verifyApiKey()` return type** -- Add `reason` (always on failure) and `keyName` (when key identified) to the failure result. Add `keyName` to the success result. Define `AUTH_FAIL_REASONS` constants.
   - File: `src/auth.js`
   - Depends on: R12 KV key record schema (from edge-minion/security-minion)

2. **Add `keyName` and `reason` to auth_fail log calls** -- Update both call sites in `src/index.js` (lines 135, 212).
   - File: `src/index.js`
   - Depends on: Task 1

3. **Add `keyName` and `tenantId` to post-auth security events** -- Update rate_limit, capacity_limit, ssrf_block events (lines 144, 153, 177, 221, 228).
   - File: `src/index.js`
   - Depends on: Task 1

4. **Add `keyName` to list subsystem events** -- Update list.error and list.success (lines 263, 292).
   - File: `src/index.js`
   - Depends on: Task 1

5. **Thread `keyName` through `performCapture()`** -- Add parameter, update all 10 log calls in `src/capture.js`.
   - File: `src/capture.js`, call site in `src/index.js` line 192
   - Depends on: Task 1

6. **Close `capture.tsa_fail` logging gap** -- Add `tenantId`, `keyName`, `cip` to TSA failure log. Recommend moving log call to capture.js caller.
   - File: `src/wacz.js` or `src/capture.js`
   - Depends on: Task 5

7. **Add admin subsystem events** -- Implement `admin.key_create` and `admin.key_revoke` log calls in the new key management functions.
   - File: wherever admin handlers land (new file or existing)
   - Depends on: admin endpoint implementation (edge-minion)

8. **Add scope_violation handling** -- Either standalone event or enriched auth_fail, per decision above.
   - File: `src/auth.js` (detection), `src/index.js` (logging)
   - Depends on: Task 1, scope model design (security-minion)

---

### Risks and Concerns

1. **Parameter sprawl on `performCapture()`**: Already 7 positional parameters. Adding `keyName` makes 8. This is a code smell that will get worse with R13 (audit logging will want even more context). **Mitigation**: Consider bundling `tenantId`, `keyName`, `cip` into an `authContext` object parameter in this phase, before it gets worse. The cost is updating existing tests.

2. **Log volume increase**: Adding fields to existing events increases per-event payload size slightly (keyName adds ~20-40 bytes per event). This is negligible. The new admin events fire only on key lifecycle operations -- no volume concern there.

3. **Coralogix query backward compatibility**: Adding new fields to existing events is additive and non-breaking. Existing Coralogix queries filtering on `event: 'security.auth_fail'` will continue to work. Queries can start using `reason` for finer filtering immediately.

4. **Log security contract**: The `keyName` value MUST be operator-controlled (set at key creation time from trusted input), not caller-supplied. If the key creation API accepts `keyName` from an HTTP request body, validate it against the `/^[a-z0-9_-]{1,64}$/` pattern before storing it in KV. Malicious `keyName` values (e.g., containing JSON injection characters) would violate the `log.js` invariant on line 9.

5. **Dual-event concern**: If both `security.auth_fail` and `security.scope_violation` fire for the same request, Coralogix alert rules on auth failures will fire for scope violations. This may be desired (scope violations ARE auth failures) or may cause alert fatigue if scope violations are expected (e.g., a read-only key probing a write endpoint). **Recommendation**: single event with reason field, as stated above.

---

### Additional Agents Needed

- **security-minion**: Must define the scope model (what scopes exist, how they map to endpoints) before observability can finalize scope_violation field schemas.
- **edge-minion**: Must define the KV key record schema (where `keyName` lives, how it's stored) and the admin endpoint handlers where `admin.key_create` / `admin.key_revoke` events will be emitted.
- **test-minion**: Needs to know about the `verifyApiKey()` return shape change so auth tests cover the new `reason` and `keyName` fields. Integration tests should verify that log payloads contain the expected enrichment fields.
