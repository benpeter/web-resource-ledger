# Observability Minion -- Planning Contribution

## Planning Question Responses

### 1. Existing log events that need `keyName` enrichment

After auditing every `log()` call site in `src/index.js` and `src/capture.js`,
here is the complete enumeration, split by "needs enrichment" vs "does not."

**Events that NEED `keyName` enrichment** (they occur after auth succeeds,
so the authenticated key identity is known):

| File | Line | Event | Current fields | Add |
|------|------|-------|----------------|-----|
| `src/index.js:177` | `security.ssrf_block` | `tenantId, reason, cip` | `keyName` |
| `src/index.js:188` | `capture.kv_create_fail` | `captureId, tenantId, cip, errorMessage` | `keyName` |
| `src/index.js:270` | `list.error` | `tenantId, errorClass, durationMs, cip` | `keyName` |
| `src/index.js:299` | `list.success` | `tenantId, resultCount, status, cursor, durationMs, cip` | `keyName` |
| `src/capture.js:113` | `capture.start` | `captureId, tenantId, url, cip` | `keyName` |
| `src/capture.js:127` | `capture.stage.fail` | `captureId, tenantId, stage, errorCategory, retryable, cip, ...` | `keyName` |
| `src/capture.js:136` | `capture.header_fail` | `captureId, tenantId, cip` | `keyName` |
| `src/capture.js:198` | `capture.key_archive_fail` | `captureId, tenantId, cip, errorMessage` | `keyName` |
| `src/capture.js:211` | `capture.wacz_fail` | `captureId, tenantId, cip, errorMessage` | `keyName` |
| `src/capture.js:218` | `capture.partial` | `captureId, tenantId, cip, renderQuality, durationMs, ...` | `keyName` |
| `src/capture.js:230` | `capture.success` | `captureId, tenantId, durationMs, waczStatus, ...` | `keyName` |
| `src/capture.js:248` | `capture.consent_error` | `captureId, tenantId, cip, errorClass, errorMessage` | `keyName` |
| `src/capture.js:258` | `capture.fail` | `captureId, tenantId, stage, errorClass, errorMessage, cip` | `keyName` |
| `src/capture.js:262` | `capture.kv_fail` | `captureId, tenantId, cip, errorMessage` | `keyName` |

**Events that need `keyName` AND `reason` enrichment** (auth failure events --
`reason` replaces the currently bare status code):

| File | Line | Event | Current fields | Add |
|------|------|-------|----------------|-----|
| `src/index.js:135` | `security.auth_fail` (handleCreateCapture) | `status, cip` | `reason, keyName` (keyName only when key was found but rejected) |
| `src/index.js:219` | `security.auth_fail` (handleListCaptures) | `status, cip` | `reason, keyName` (keyName only when key was found but rejected) |

**Events that do NOT need `keyName` enrichment** (unauthenticated endpoints
or events that occur before/without auth):

| File | Line | Event | Reason no enrichment |
|------|------|-------|---------------------|
| `src/index.js:144,228` | `security.rate_limit` (capture) | Per-IP rate limit fires before auth completes in the current flow, and after auth in list. For consistency after multi-tenant, these could carry `keyName` when auth has already run. See recommendation below. |
| `src/index.js:153,235` | `security.capacity_limit` | Global limiter -- fires after auth in create, after auth in list. Same consideration. |
| `src/index.js:446` | `security.rate_limit` (verify) | Public endpoint, no auth |
| `src/index.js:476,560` | `signing.key_unavailable` | Public verify/signing-key endpoints, no auth |
| `src/index.js:553,583` | `security.rate_limit` (signing_key/signing_keys) | Public endpoints, no auth |
| `src/wacz.js:115` | `capture.timestamp_fail` | Internal pipeline, keyName already available via captureId correlation |

**Implementation note -- propagating `keyName` to `capture.js`**: The current
signature of `performCapture()` is
`(env, url, ip, captureId, tenantId, cip, renderer)`. Rather than adding yet
another positional parameter, the auth result should include `keyName` and it
should be passed as part of a context object or as an additional named field.
The cleanest approach: add `keyName` to the `performCapture()` call (one more
string parameter before renderer) since the function already takes 6 positional
args. Alternatively, bundle `tenantId`, `cip`, and `keyName` into an `authContext`
object -- this is a design decision for the implementer, but the observability
contract requires `keyName` to be available in all capture pipeline log events.

**Rate limit events after auth**: In `handleCreateCapture`, the per-IP rate
limit check (line 142) runs AFTER auth (line 133). Same for `handleListCaptures`
(line 225 runs after auth at 217). This means `tenantId` and `keyName` are
already resolved when rate limit events fire. These events SHOULD carry
`keyName` and `tenantId` for correlation. This is a minor enrichment that
significantly improves debugging "which tenant is hitting rate limits."

### 2. Fields for `admin.key_create` and `admin.key_revoke` events

**`admin.key_create`** -- severity 3 (info):

```json
{
  "event": "admin.key_create",
  "tenantId": "acme-corp",
  "keyName": "production-capture",
  "scopes": ["capture"],
  "keyHashPrefix": "a1b2c3d4",
  "cip": "<hashed admin IP>",
  "authMethod": "admin_key"
}
```

Fields rationale:
- `tenantId`: which tenant the key was created for (required for tenant-scoped audit)
- `keyName`: operator-chosen name for the key (low cardinality, bounded by key count)
- `scopes`: array of granted scopes (required to answer "who can do what")
- `keyHashPrefix`: first 8 hex chars of the SHA-256 hash (see Q3 answer below)
- `cip`: hashed IP of the admin performing the operation (consistent with existing events)
- `authMethod`: always `"admin_key"` for now, but future-proofs for KV-stored admin keys

Do NOT include: the raw key value (obvious), the full hash (unnecessary at rest), or the admin key itself.

**`admin.key_revoke`** -- severity 3 (info):

```json
{
  "event": "admin.key_revoke",
  "tenantId": "acme-corp",
  "keyName": "compromised-key",
  "keyHashPrefix": "a1b2c3d4",
  "revokedScopes": ["capture"],
  "cip": "<hashed admin IP>",
  "authMethod": "admin_key"
}
```

Fields rationale:
- `tenantId`, `keyName`, `keyHashPrefix`, `cip`, `authMethod`: same as create
- `revokedScopes`: what scopes were removed -- answers "what access was revoked"

**`admin.key_revoke_fail`** -- severity 4 (warn), for "key not found" on DELETE:

```json
{
  "event": "admin.key_revoke_fail",
  "keyHash": "<full hash from URL path>",
  "reason": "not_found",
  "cip": "<hashed admin IP>",
  "authMethod": "admin_key"
}
```

Here the full hash from the URL path is acceptable because it is already
in the request URL (operator-supplied, not a secret). The hash of a
nonexistent key reveals nothing.

**`admin.key_list`** -- severity 6 (debug/verbose) or omit entirely:

Key listing is a read-only admin operation. Logging it is optional but useful
during migration to confirm the admin API is being exercised. If logged:

```json
{
  "event": "admin.key_list",
  "resultCount": 3,
  "cip": "<hashed admin IP>",
  "authMethod": "admin_key"
}
```

Severity 6 (verbose) matches the existing `list.success` event.

**`admin.auth_fail`** -- severity 5 (error):

```json
{
  "event": "admin.auth_fail",
  "reason": "invalid_admin_key",
  "cip": "<hashed admin IP>"
}
```

This is distinct from `security.auth_fail` on capture/list endpoints. Admin
auth failures deserve their own event name so Coralogix alerts can distinguish
"someone failed to authenticate to the admin API" (high severity, possible
credential probe) from "someone used the wrong capture key" (normal noise).

### 3. Key hash prefix in auth failure logs -- security analysis

**Recommendation: YES, include an 8-character hex prefix of the SHA-256 hash
for debugging, but ONLY when the key was found in KV and rejected (revoked
or scope insufficient). Do NOT include any hash information when the key
was not found.**

Rationale:

- When a key is **found but rejected** (revoked, wrong scope): the key hash
  prefix lets operators correlate "which key is being misused" without exposing
  the full hash. An 8-char hex prefix (32 bits of entropy) is not brute-forceable
  back to the raw key (the key is 256 bits). This is analogous to how git short
  hashes work -- enough to identify, not enough to reconstruct.

- When a key is **not found**: logging any derivative of the provided token
  (even a hash prefix) violates the `log.js` safety invariant that `data` must
  contain "only static values and predetermined strings, never attacker-controlled
  input." A hash of attacker input is attacker-influenced (even if not directly
  attacker-controlled). For not-found cases, log only `reason: "key_not_found"`.

- The `keyName` field (operator-chosen, not attacker-controlled) is safe to
  include for found-but-rejected keys because it comes from the KV record,
  not from the request.

### 4. Severity levels for admin operations

The existing codebase uses Coralogix severity codes consistently:

| Severity | Code | Existing usage |
|----------|------|----------------|
| Info | 3 | `capture.start`, `capture.success`, `capture.partial` |
| Warn | 4 | `security.rate_limit`, `capture.header_fail`, `capture.wacz_fail` |
| Error | 5 | `security.auth_fail`, `capture.fail`, `capture.stage.fail` |
| Verbose | 6 | `list.success` |

**Recommended severity mapping for admin events:**

| Event | Severity | Code | Rationale |
|-------|----------|------|-----------|
| `admin.key_create` | Info | 3 | Normal operational event -- key provisioned successfully |
| `admin.key_revoke` | Info | 3 | Normal operational event -- key revoked successfully |
| `admin.key_list` | Verbose | 6 | Read-only query, low signal value (matches `list.success`) |
| `admin.key_revoke_fail` | Warn | 4 | Attempting to revoke nonexistent key -- possible operator error or stale reference |
| `admin.auth_fail` | Error | 5 | Failed admin authentication -- possible credential probe (matches `security.auth_fail`) |
| `admin.rate_limit` | Warn | 4 | Admin rate limit hit (matches existing `security.rate_limit`) |

Do NOT use severity 3 for `admin.auth_fail`. Admin auth failures are inherently
higher signal than capture auth failures because the admin API controls the
security posture of the entire system. A flood of admin auth failures should
trigger an alert.

### 5. Dual-mode fallback observability

The dual-mode fallback period (legacy `CAPTURE_API_KEY` env var coexisting
with KV-based keys) needs explicit observability so operators know when
migration is complete and the legacy key can be removed.

**Recommendation: Add an `authMethod` field to the auth result and propagate
it into all log events that already carry `tenantId`.**

Values:
- `"kv"` -- authenticated via KV-based key lookup (new path)
- `"legacy"` -- authenticated via `CAPTURE_API_KEY` env var fallback (old path)

This field should appear in:
- `security.auth_fail` events (with `reason` distinguishing the failure mode)
- All post-auth log events (`capture.*`, `list.*`, `security.ssrf_block`)

**Migration monitoring query** (Coralogix/Lucene):

```
authMethod:"legacy" AND event:"capture.start"
```

When this query returns zero results over a sustained period (e.g., 7 days),
the operator can safely remove `CAPTURE_API_KEY`.

**Metric recommendation**: If Coralogix supports count-based alerting on log
fields, set up a "legacy auth still in use" alert that fires weekly with the
count of `authMethod:"legacy"` events. When the count drops to zero for
two consecutive weeks, the alert message should instruct the operator to
remove `CAPTURE_API_KEY`.

**Alternative (lighter weight)**: Log a single `security.legacy_auth_used`
event at severity 4 (warn) whenever the legacy fallback path is taken. This
makes legacy usage visible without cluttering every event. The warning
severity signals "this is expected during migration but should eventually
stop." Operators can search for this event to gauge migration progress.

I recommend BOTH: the `authMethod` field on all events (for correlation and
filtering) AND the dedicated `security.legacy_auth_used` warn event (for
alerting and at-a-glance migration monitoring).

### 6. `reason` field taxonomy for auth failures

**Yes, the `reason` field must distinguish all four cases. This is the
single most important observability improvement in this change.**

Current state: `security.auth_fail` logs only `status` (401 or 503) and
`cip`. An operator seeing auth failures cannot tell whether it is a
misconfigured client, a revoked key, a permission issue, or expected
migration behavior without reading application code.

**Recommended `reason` values (exhaustive, machine-parseable):**

| reason | HTTP status | Description | Severity |
|--------|-------------|-------------|----------|
| `missing_header` | 401 | No Authorization header present | 5 |
| `invalid_scheme` | 401 | Not `Bearer` scheme | 5 |
| `key_not_found` | 401 | SHA-256 hash not in KV, and not legacy key | 5 |
| `key_revoked` | 401 | Key found in KV but `revoked: true` | 5 |
| `scope_insufficient` | 403 | Key found, not revoked, but lacks required scope | 5 |
| `legacy_fallback` | - | Not a failure -- legacy key matched (see Q5) | 4 |
| `service_not_configured` | 503 | Neither KV keys nor CAPTURE_API_KEY present | 5 |

**Why machine-parseable values, not human sentences**: These `reason` values
will be used in Coralogix queries, alert conditions, and dashboards. Spaces
and punctuation in log field values make queries fragile. Use `snake_case`
identifiers, put the human explanation in documentation.

**Additional fields per reason:**

- `key_revoked`: include `keyName`, `keyHashPrefix`, `tenantId` (from KV record)
- `scope_insufficient`: include `keyName`, `keyHashPrefix`, `tenantId`,
  `requiredScope`, `keyScopes` (what the key has vs what the endpoint needs)
- `key_not_found`: include ONLY `reason` and `cip` (no hash data -- see Q3)
- `missing_header`, `invalid_scheme`: include ONLY `reason` and `cip`
- `legacy_fallback`: include `tenantId: "default"`, `authMethod: "legacy"`

**`requiredScope` field**: When a 403 is returned for scope insufficiency,
the log event should include `requiredScope` (what the endpoint needs) and
`keyScopes` (what the key has). This lets operators immediately diagnose
"the client is using a read-only key on the capture endpoint" without
reading code. The scope model is public (per advisory), so this is not
information disclosure.

## Recommendations

### R1: Enrich the auth result object to carry observability context

The current `verifyApiKey()` returns `{ ok: true, tenantId }` on success.
Extend this to:

```javascript
{
  ok: true,
  tenantId: 'acme-corp',
  keyName: 'production-capture',
  authMethod: 'kv',       // or 'legacy'
  scopes: ['capture'],    // resolved scopes
}
```

On failure, extend to:

```javascript
{
  ok: false,
  response: problemResponse(...),
  reason: 'key_revoked',  // machine-parseable reason
  keyName: 'old-key',     // only when key was found
  keyHashPrefix: 'a1b2c3d4', // only when key was found
  tenantId: 'acme-corp',  // only when key was found
}
```

This keeps all observability data in one place and avoids the handler
needing to re-derive auth context for logging.

### R2: Create the `admin` subsystem for Coralogix log routing

All admin API log events should use subsystem `'admin'`. This enables:
- Coralogix TCO Optimizer: route admin logs to a different priority tier
  than capture logs (admin events are low volume, high value)
- Dashboard filtering: separate admin operations from capture operations
- Alert scoping: admin auth failures alert separately from capture auth
  failures

### R3: Add `authMethod` to all post-auth log events

Every log event that currently includes `tenantId` should also include
`authMethod`. This is a small field addition (one string per event) with
high diagnostic value during and after migration.

### R4: Log `security.legacy_auth_used` as a dedicated warn event

```javascript
log(env, 4, 'security', {
  event: 'security.legacy_auth_used',
  tenantId: 'default',
  cip,
});
```

This fires once per legacy-authenticated request. During migration, operators
can track the volume of this event. After migration, any occurrence is
anomalous and worth investigating.

### R5: Do NOT add `keyName` as a high-cardinality metric label

`keyName` is safe in log events (structured text, queried by Lucene) but
should NOT be used as a Prometheus metric label if metrics are ever added.
Key names are operator-chosen strings with unbounded cardinality. In logs,
cardinality is managed by the search engine. In metrics, it would explode
the time series.

This is a future-proofing note -- the current system does not have Prometheus
metrics. But if metrics are added for auth success/failure rates, label by
`tenantId` and `authMethod`, not by `keyName`.

### R6: Admin API request logging pattern

Every admin endpoint handler should log both success and failure, following
the existing pattern in `handleCreateCapture` and `handleListCaptures`:

```
Entry:  (no entry log for admin -- operations are synchronous and fast)
Success: severity 3, event: admin.key_create / admin.key_revoke
Failure: severity 5, event: admin.auth_fail (auth) / admin.key_revoke_fail (not found)
```

Do NOT log the request body of `POST /v1/admin/keys` -- it contains
`tenantId`, `scopes`, and `name`, which are all safe to log individually
as structured fields, but logging the raw body violates the `log.js`
invariant against attacker-controlled input (the body is caller-supplied
even though the caller is an admin).

## Proposed Tasks

### Task O1: Extend auth result object with observability fields

- Add `keyName`, `authMethod`, `scopes` to success result
- Add `reason`, `keyName` (when applicable), `keyHashPrefix` (when applicable) to failure result
- Estimated complexity: small (auth.js changes only)
- Dependency: must be done before any log enrichment tasks

### Task O2: Enrich existing log events with `keyName` and `authMethod`

- Update all 14 post-auth log events in `src/index.js` to include `keyName` and `authMethod`
- Pass `keyName` through to `performCapture()` (new parameter or context object)
- Update all 10 capture pipeline log events in `src/capture.js` to include `keyName`
- Estimated complexity: medium (many call sites, but mechanical changes)
- Dependency: O1 must be complete

### Task O3: Enrich auth failure events with `reason` taxonomy

- Replace bare `status` field in `security.auth_fail` with structured `reason`
- Add `keyName`, `keyHashPrefix`, `tenantId` to failure events when key was found
- Add `requiredScope`, `keyScopes` for scope-insufficient failures
- Estimated complexity: small (two call sites in index.js, auth.js changes)
- Dependency: O1 must be complete

### Task O4: Add `admin` subsystem events

- `admin.key_create` (severity 3) in POST handler
- `admin.key_revoke` (severity 3) in DELETE handler
- `admin.key_list` (severity 6) in GET handler
- `admin.auth_fail` (severity 5) in admin auth check
- `admin.rate_limit` (severity 4) in admin rate limiter
- `admin.key_revoke_fail` (severity 4) for not-found DELETE
- Estimated complexity: small (new code in new handlers)
- Dependency: admin API handlers must exist

### Task O5: Add `security.legacy_auth_used` event

- Fire once per request authenticated via legacy `CAPTURE_API_KEY` fallback
- Severity 4 (warn)
- Include `tenantId: 'default'`, `authMethod: 'legacy'`, `cip`
- Estimated complexity: trivial (one log call in auth.js or index.js)
- Dependency: dual-mode auth must be implemented

### Task O6: Enrich rate limit events with auth context when available

- In `handleCreateCapture` and `handleListCaptures`, the rate limit check
  runs after auth. Add `tenantId`, `keyName`, `authMethod` to
  `security.rate_limit` and `security.capacity_limit` events in these handlers
- Do NOT add auth context to rate limit events in unauthenticated handlers
  (verify, signing-key)
- Estimated complexity: trivial (field additions to existing log calls)
- Dependency: O1 must be complete

## Risks and Concerns

### Risk 1: `log.js` safety invariant violation

**Severity: High**

The `log.js` module header states: "data must contain only static values and
predetermined strings, never attacker-controlled input." Several of the new
fields come from KV records (`keyName`, `tenantId`, `scopes`) which are
admin-provisioned, not attacker-controlled. However, `keyName` is a
free-text field chosen by the admin operator.

**Mitigation**: Validate `keyName` at creation time (alphanumeric, hyphens,
underscores, max 64 chars -- similar to `TENANT_ID_RE`). Once validated and
stored in KV, the value is server-controlled and safe to log. The validation
must happen in the admin API handler, not at log time.

If `keyName` validation is not enforced at creation, it must be sanitized
before logging (truncate to 64 chars, strip non-ASCII). But validation at
source is strongly preferred.

### Risk 2: Log volume increase during migration

**Severity: Low**

Adding `security.legacy_auth_used` as a dedicated event doubles the log
volume for every legacy-authenticated request (the original event + the
legacy warning). For a single-tenant system with low request volume, this
is negligible. For higher-volume deployments, consider making the legacy
warning a field on the existing event rather than a separate event.

**Mitigation**: Start with the separate event (easier to alert on). If
volume becomes a concern, consolidate into a field.

### Risk 3: `keyName` as a correlation key is only useful if operators name keys well

**Severity: Medium (operational, not technical)**

`keyName` is operator-chosen. If operators create keys named "key1", "key2",
"test", the observability value drops significantly. The admin API response
and documentation should encourage descriptive names (e.g., include an
example like `"production-capture"` or `"ci-pipeline-read"`).

**Mitigation**: Documentation and API response examples. Not enforceable
at the API level without being paternalistic.

### Risk 4: Missing `authMethod` in capture pipeline events if auth context is not propagated

**Severity: Medium**

`performCapture()` currently receives `tenantId` as a parameter. If
`keyName` and `authMethod` are not also propagated, all capture pipeline
events will lack these fields. This is the most likely implementation
oversight because it requires changing the function signature.

**Mitigation**: Task O2 explicitly includes this. The implementer should
add `keyName` and `authMethod` to the `performCapture()` call before
enriching capture.js log events.

## Additional Agents Needed

No additional agents are needed for the observability scope. However, I want
to flag coordination requirements with other specialists:

- **security-minion**: Must agree on the `keyName` validation rules (Risk 1)
  and on which fields are safe to include in failure logs (Q3 answer). The
  security-minion's auth module design must produce an auth result object
  that carries the fields listed in R1.

- **api-design-minion**: Must enforce `keyName` validation at creation time
  (max length, character set) to keep the field safe for logging. Must also
  agree on the `reason` taxonomy (Q6) since these values appear both in logs
  and potentially in API error responses.

- **test-minion**: Auth failure log events with `reason` fields should be
  asserted in tests. The test suite should verify that `keyName` appears in
  capture pipeline log events when KV-based auth is used, and that it is
  absent when legacy auth is used (since there is no `keyName` for the
  legacy key).
