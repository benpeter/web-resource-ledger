## Domain Plan Contribution: observability-minion

### Recommendations

#### (a) Subsystem: Extend Existing, Do Not Create a New `audit` Subsystem

The existing Coralogix subsystem taxonomy (`security`, `capture`, `list`) maps to functional modules, not to log purposes. Introducing a parallel `audit` subsystem would split contextually identical events across two subsystems -- an operator searching for "what happened with this capture" would need to query both `capture` and `audit` to get the full picture. That defeats the purpose.

Instead, **add an `audit: true` boolean field** to data payloads on events that constitute the audit trail. This gives Coralogix users a single filter (`text.audit:true`) to surface all audit-relevant events regardless of subsystem, while keeping events co-located with their functional context.

Concretely:
- `capture.start` already logs `tenantId` and `captureId` -- adding `audit: true` makes it an audit event without moving it to a different subsystem.
- `security.auth_fail` stays in `security` subsystem (where operators expect security events) but gains `audit: true` to appear in audit queries.
- Key lifecycle events (`key.create`, `key.revoke`) go in the `security` subsystem because they are security operations, with `audit: true`.

This approach has three advantages:
1. Zero disruption to existing Coralogix dashboards and queries that filter by subsystem.
2. One filter dimension (`audit:true`) surfaces the full audit trail across all subsystems.
3. New subsystems are reserved for genuinely new functional modules, not cross-cutting concerns.

#### (b) Required Fields Per Audit Event

Every event with `audit: true` must include these fields for tenant+time-range querying in Coralogix:

| Field | Type | Purpose | Coralogix Query |
|-------|------|---------|-----------------|
| `event` | string | Dot-notated event name | `text.event:capture.start` |
| `audit` | boolean | Audit trail marker | `text.audit:true` |
| `tenantId` | string | Tenant identity | `text.tenantId:acme` |
| `action` | string | Verb: `create`, `read`, `list`, `revoke` | `text.action:create` |
| `resource` | string | Resource type: `capture`, `api_key` | `text.resource:capture` |
| `resourceId` | string or null | Specific resource (captureId, keyId) | `text.resourceId:cap_abc123` |
| `keyId` | string | API key fingerprint used for auth | `text.keyId:k_1a2b3c` |
| `outcome` | string | `success`, `denied`, `error` | `text.outcome:success` |
| `cip` | string | HMAC-hashed client IP (already present) | `text.cip:abc123` |

The outer Coralogix envelope (`timestamp`, `severity`, `subsystemName`, `applicationName`) is already set by `log()`. The `timestamp` field (millisecond epoch) combined with `tenantId` gives Coralogix everything it needs for time-range queries. No additional timestamp field is needed inside `data`.

**Why `keyId` and not just `tenantId`**: A single tenant may have multiple API keys (R12 will support this). When investigating abuse, operators need to know which specific key was used, not just which tenant. This is the field that enables "revoke the compromised key" without revoking all keys for that tenant.

**Why `action` + `resource` instead of relying on `event` alone**: The `event` field is a programmer-facing identifier (`capture.start`). The `action` + `resource` pair provides a normalized, query-friendly decomposition. Coralogix queries like `text.resource:capture AND text.action:create AND text.tenantId:acme` are more readable and composable than parsing event name patterns.

**Cardinality note**: All audit fields are low-cardinality. `tenantId` is bounded by tenant count (single digits near-term). `keyId` is bounded by keys-per-tenant (also single digits). `action` and `resource` are enum-like. `resourceId` (captureId) is high-cardinality but is a data field, not a Coralogix label -- it lives inside the JSON `text` payload, not in `subsystemName` or `applicationName`, so it does not affect Coralogix metric cardinality or indexing costs.

#### (c) Completion Events Only -- No Request-Start Events

Do not add separate audit-specific start events. Here is the reasoning:

1. **`capture.start` already exists** and will gain `audit: true`. This covers the "who initiated what" question. It fires after auth succeeds but before the background pipeline runs.

2. **Request-start events for reads are unnecessary overhead.** `list.success` fires on every successful list request. Adding a `list.start` event doubles the log volume for read operations with zero additional information -- if the request succeeded, the completion event tells you everything. If it failed, the error event tells you everything.

3. **Auth failures already have events.** `security.auth_fail` already fires when authentication fails. There is no gap where a request starts but neither succeeds nor fails.

4. **The "dangling start" problem**: If you emit a start event and the Worker crashes before the completion event, you have a start with no end. This is useful for long-running processes (minutes to hours), but WRL requests complete in under 30 seconds. A missing completion event in Coralogix is detectable by querying for start events without a corresponding completion event within a time window -- but this analysis is rarely needed at WRL's scale and complexity.

**Exception**: `capture.start` (which already exists) is justified because captures run asynchronously in `ctx.waitUntil()` and take 5-30 seconds. A start event without a completion event is a meaningful signal that something went wrong in the background pipeline.

#### (d) Key Lifecycle Event Schema

Key lifecycle events (create, revoke) do not exist in the codebase yet because the admin endpoints for key management (R12) have not been built. The audit logging plan should define the event schema now so R12 implementers emit correct audit events from day one.

**Key creation** (`POST /v1/admin/keys`):
```javascript
log(env, 3, 'security', {
  event: 'key.create',
  audit: true,
  tenantId: targetTenantId,     // tenant the key is being created FOR
  action: 'create',
  resource: 'api_key',
  resourceId: newKeyId,         // fingerprint of the newly created key
  keyId: adminKeyId,            // key used to authenticate the admin request
  outcome: 'success',
  scopes: ['capture', 'read'], // granted scopes (predetermined strings)
  cip,
});
```

**Key revocation** (`DELETE /v1/admin/keys/{keyId}`):
```javascript
log(env, 3, 'security', {
  event: 'key.revoke',
  audit: true,
  tenantId: targetTenantId,     // tenant whose key is being revoked
  action: 'revoke',
  resource: 'api_key',
  resourceId: revokedKeyId,     // fingerprint of the revoked key
  keyId: adminKeyId,            // key used to authenticate the admin request
  outcome: 'success',
  cip,
});
```

**Key creation failure** (auth ok, but creation fails):
```javascript
log(env, 5, 'security', {
  event: 'key.create',
  audit: true,
  tenantId: targetTenantId,
  action: 'create',
  resource: 'api_key',
  resourceId: null,
  keyId: adminKeyId,
  outcome: 'error',
  cip,
});
```

Key points on the lifecycle schema:
- Both events use `security` subsystem because they are security-sensitive operations.
- `keyId` in the audit payload is the **authenticating key** (who did this), while `resourceId` is the **target key** (what was acted upon). This distinction is critical for abuse investigation: "admin key X was used to revoke tenant key Y."
- `scopes` on creation is an array of predetermined strings, not user input -- safe per the log() INVARIANT.
- Severity 3 (info) for success, severity 5 (error) for failures.
- Failed attempts where auth was denied are already covered by `security.auth_fail` -- no new event needed.

#### Augmenting Existing Events

The following existing events gain audit fields:

| Event | Subsystem | Added Fields |
|-------|-----------|-------------|
| `capture.start` | capture | `audit: true`, `action: 'create'`, `resource: 'capture'`, `resourceId: captureId`, `keyId`, `outcome: 'success'` |
| `capture.success` | capture | `audit: true`, `action: 'create'`, `resource: 'capture'`, `resourceId: captureId`, `keyId`, `outcome: 'success'` |
| `capture.fail` | capture | `audit: true`, `action: 'create'`, `resource: 'capture'`, `resourceId: captureId`, `keyId`, `outcome: 'error'` |
| `capture.partial` | capture | `audit: true`, `action: 'create'`, `resource: 'capture'`, `resourceId: captureId`, `keyId`, `outcome: 'success'` |
| `list.success` | list | `audit: true`, `action: 'list'`, `resource: 'capture'`, `resourceId: null`, `keyId`, `outcome: 'success'` |
| `list.error` | list | `audit: true`, `action: 'list'`, `resource: 'capture'`, `resourceId: null`, `keyId`, `outcome: 'error'` |
| `security.auth_fail` | security | `audit: true`, `action: null`, `resource: null`, `resourceId: null`, `keyId: null`, `outcome: 'denied'` |
| `security.ssrf_block` | security | `audit: true`, `action: 'create'`, `resource: 'capture'`, `resourceId: null`, `keyId`, `outcome: 'denied'` |

Events that should NOT have `audit: true`:
- `security.rate_limit`, `security.capacity_limit` -- these are operational, not identity-linked audit events. Rate limiting fires before auth in the current flow, so there is no tenant context.
- `capture.header_fail`, `capture.wacz_fail`, `capture.consent_error`, `capture.key_archive_fail`, `capture.kv_fail`, `capture.kv_create_fail`, `capture.stage.fail` -- these are operational diagnostics within the capture pipeline. The pipeline's audit story is covered by `capture.start` + `capture.success`/`capture.fail`.
- `signing.key_unavailable` -- operational, no tenant identity context in the verify flow (verify is unauthenticated).
- `capture.tsa_fail` -- operational diagnostic within the WACZ bundling pipeline.

#### Threading `keyId` Through the Call Chain

The current `verifyApiKey()` returns `{ ok: true, tenantId }`. For audit logging, it must also return `keyId` -- the fingerprint of the API key that authenticated the request. This is the most critical data-flow change in the implementation.

Today (pre-R12), `keyId` can be derived from the single `CAPTURE_API_KEY`. Post-R12, it will come from the key record in KV. The auth return type becomes:

```javascript
{ ok: true, tenantId: string, keyId: string }
```

The `keyId` must then be threaded from the handler in `index.js` into:
1. All `log()` calls in the handler itself (inline audit fields).
2. `performCapture()` -- which needs `keyId` to include it in `capture.start`, `capture.success`, and `capture.fail` log events.

This means `performCapture()` gains a `keyId` parameter. This is a signature change but a mechanical one.

#### Coralogix Query Patterns

With the schema above, operators can run these queries:

**All audit events for a tenant in a time range:**
```
text.audit:true AND text.tenantId:"acme" AND $d >= now-24h
```

**All captures by a specific API key:**
```
text.audit:true AND text.keyId:"k_1a2b3c" AND text.resource:"capture"
```

**All denied actions (auth failures + SSRF blocks):**
```
text.audit:true AND text.outcome:"denied"
```

**Key lifecycle for a tenant:**
```
text.audit:true AND text.resource:"api_key" AND text.tenantId:"acme"
```

**Full request lifecycle for a specific capture:**
```
text.resourceId:"cap_abc123"
```

These queries work with Coralogix's auto-parsed JSON from the `text` field. No custom parsing rules needed. The `subsystemName` filter is still available as an additional dimension if the operator wants to narrow results (`subsystemName:"security"` for security-only events).


### Proposed Tasks

#### Task 1: Extend `verifyApiKey()` return type to include `keyId`

**What to do**: Modify `src/auth.js` so that successful authentication returns `{ ok: true, tenantId, keyId }`. Pre-R12, derive `keyId` from the static `CAPTURE_API_KEY` using the same fingerprinting approach used for signing keys (first 8 hex chars of SHA-256 hash). Post-R12, this will come from the key record.

**Deliverables**: Updated `verifyApiKey()`, updated tests in `test/auth.test.js`.

**Dependencies**: None. This is the foundational change.

#### Task 2: Thread `keyId` through handlers and into `performCapture()`

**What to do**: In `src/index.js`, destructure `keyId` from `auth` alongside `tenantId`. Pass it into all `log()` calls in `handleCreateCapture` and `handleListCaptures`. Add `keyId` as a parameter to `performCapture()` in `src/capture.js`.

**Deliverables**: Updated `src/index.js`, updated `src/capture.js` signature, updated calls to `performCapture()`.

**Dependencies**: Task 1.

#### Task 3: Add audit fields to existing log events

**What to do**: For each event listed in the "Augmenting Existing Events" table above, add the `audit`, `action`, `resource`, `resourceId`, `keyId`, and `outcome` fields to the `log()` data payload. This is a mechanical change -- adding fields to existing `log()` calls.

**Deliverables**: Updated `log()` calls across `src/index.js` and `src/capture.js`. No changes to `src/log.js` itself.

**Dependencies**: Task 2.

#### Task 4: Define key lifecycle event schema (documentation only)

**What to do**: Document the `key.create` and `key.revoke` event schemas in a format that R12 implementers can copy directly. This task produces documentation, not code -- the admin endpoints do not exist yet.

**Deliverables**: Event schema documentation in the evolution log `decisions.md` for this phase. The schemas from section (d) above, with field descriptions and examples.

**Dependencies**: None.

#### Task 5: Validate audit querying in Coralogix (post-deploy)

**What to do**: After deploying to staging, trigger authenticated captures and list requests. Query Coralogix using the patterns described above. Verify that:
- `text.audit:true` surfaces all audit events.
- `text.tenantId` and `text.keyId` are queryable.
- Time-range queries with tenant filter return expected results.
- `text.resource` and `text.action` filters work as designed.

**Deliverables**: Verification checklist in `outcome.md`.

**Dependencies**: Tasks 1-3 deployed to staging.


### Risks and Concerns

1. **`keyId` derivation pre-R12 produces a static value.** With the single `CAPTURE_API_KEY`, every request has the same `keyId`. This is correct but uninteresting -- audit logging only becomes meaningful after R12 introduces per-tenant keys. The risk is that someone tests audit queries before R12 and concludes "this doesn't work" because all events show the same keyId. Mitigate by documenting this in the evolution log.

2. **Log volume increase is negligible.** Adding 5-6 fields to existing log payloads increases per-event JSON size by ~100-150 bytes. At WRL's current request volume (single-digit captures per day), this has zero cost impact. Even at 10,000 captures/day, the additional Coralogix ingestion would be under 2MB/day.

3. **The `log()` INVARIANT must be maintained.** All new fields (`audit`, `action`, `resource`, `outcome`, `keyId`, `resourceId`) are either boolean literals, enum strings from code constants, or server-derived identifiers (SHA-256 fingerprints). None contain attacker-controlled input. This is safe. However, future R12 implementers adding key lifecycle events must be warned: never log the API key value itself, only its fingerprint (`keyId`).

4. **`performCapture()` signature change.** Adding `keyId` as a parameter changes the function signature. The `renderer` parameter (used for test injection) is already at position 7. Adding `keyId` at position 7 and moving `renderer` to position 8 could break existing call sites. **Recommendation**: Use an options object instead of positional parameters, or insert `keyId` before `cip` (position 6) since `cip` and `renderer` are already optional. Review existing test calls to `performCapture()` for breakage.

5. **Auth failure events have no `tenantId` or `keyId`.** By design -- a failed auth reveals nothing about tenant structure. The audit trail for denied requests uses `cip` (hashed IP) as the only identifier. This is correct but means abuse investigation for unauthenticated scanners requires IP-based correlation, not tenant-based. This is acceptable for the threat model.

6. **Coralogix JSON auto-parsing depth.** Coralogix auto-parses the `text` field as JSON, but nested objects may not be queryable with dot notation beyond 2-3 levels. All audit fields are top-level in the data payload (no nesting), so this is not a concern for this feature. Do not nest audit fields under an `audit: {}` sub-object -- keep them flat.


### Additional Agents Needed

**security-minion**: Should review the `keyId` fingerprinting approach to confirm that exposing a SHA-256 prefix of the API key in logs does not create an information leakage vector. The signing key uses the same pattern (first 8 hex chars of SHA-256 of the public key), but API key fingerprinting is a different threat model -- the API key is a secret, while the signing public key is not. A security review of whether 8 hex chars of SHA-256(secret_key) leaks exploitable information is warranted. (It almost certainly does not, but the security-minion should confirm.)

No other additional agents needed. The implementation is mechanical (adding fields to existing log calls) and does not require infrastructure provisioning, API design changes, or test framework modifications.
