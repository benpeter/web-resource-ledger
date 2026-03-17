# Domain Plan Contribution: observability-minion

## Recommendations

### (a) Auth Event Logging for KV Key Lookup

The current `security.auth_fail` event logs `{ status, cip }` and fires on any auth failure. With KV-based key lookup, auth has more failure modes and richer success context. The auth success path currently logs nothing -- the tenantId just flows silently into downstream events (`capture.start`, `list.success`). This is correct for R12; explicit auth success logging is R13 territory.

**New/changed events for R12:**

| Event | Severity | Subsystem | Fields | Rationale |
|-------|----------|-----------|--------|-----------|
| `security.auth_fail` (existing) | 5 (error) | `security` | `{ event, status, cip, reason }` | Add `reason` field to distinguish failure modes: `'missing_header'`, `'invalid_scheme'`, `'key_not_found'`, `'key_revoked'`, `'scope_violation'`, `'misconfigured'`. Currently all failures look identical in Coralogix -- when there are multiple tenants you need to know whether someone is using a revoked key vs. a typo. |
| `security.scope_violation` (new) | 5 (error) | `security` | `{ event, tenantId, keyName, requiredScope, cip }` | Fires when a valid key is used for an operation its scopes don't permit (e.g., read-only key attempts capture). This is distinct from `auth_fail` because the key IS valid -- the caller is authenticated but not authorized. Separate event allows filtering authorized-but-forbidden separately from unauthenticated. |
| `security.key_not_found` -- NOT recommended | -- | -- | -- | Folding "unknown key" into `security.auth_fail` with `reason: 'key_not_found'` is simpler than a separate event. The reason field gives you Coralogix filter capability without event proliferation. The backlog explicitly dropped "auth reason codes" and "additional security event types" as low signal-to-noise for MVP -- R12 should add the minimum viable distinction (a reason field) rather than creating many new event names. |

**Key naming in logs:** When auth succeeds, the key record from KV should include a human-readable `keyName` (e.g., `"ben-cli"`, `"ci-pipeline"`). This name should flow into downstream events that already log `tenantId`. The `keyName` does NOT replace `tenantId` -- it supplements it for debugging "which key was used for this capture?" Never log the key value or its hash in success paths. On failure paths, logging the SHA-256 prefix (first 8 chars) of the attempted key is acceptable for correlation -- attackers can't reverse a partial hash, and operators need to correlate repeated bad attempts.

**Severity 5 for scope violations** is correct because it represents either a misconfigured client (needs operator attention) or a probing attempt. It should not be severity 4 (warn) because it never happens in normal operation -- a correctly configured client never sends a read-only key to a write endpoint.

### (b) Per-Tenant Metrics: R12 vs. R13 Boundary

Per-tenant capture counts and rate limit hits are **operational metrics**, not audit data. However, they need different treatment:

**In scope for R12 (operational):**
- The `tenantId` field already exists on `capture.start`, `capture.success`, `capture.fail`, `capture.partial`, and `list.success`. No new events needed for per-tenant capture counting -- you can already `count(tenantId='x')` in Coralogix on existing events.
- Rate limit hits (`security.rate_limit`) should add `tenantId` when auth has succeeded before rate limiting fires. Currently rate limits fire before auth on some paths. This is fine for per-IP limits but means you can't attribute all rate limit events to a tenant. Adding tenantId where it's available (post-auth) is R12 work. Restructuring middleware ordering is not.
- Adding `keyName` to existing events where `tenantId` is already present (capture and list events) is R12 scope. This is a field addition, not a new event.

**Deferred to R13 (audit):**
- Explicit `audit.request` event on every authenticated API call (not just captures -- includes GET /captures/:id, GET /status, etc.)
- Per-tenant usage summaries or aggregation
- Admin API access logging (every key list/create/revoke logged as an audit event with operator identity)
- Full request/response metadata on authenticated endpoints

The boundary is: **R12 logs what the system already logs, enriched with key identity. R13 logs things the system does NOT currently log** (read-only GET requests, admin operations as a complete trail).

### (c) Changes to Existing Coralogix Log Entries

**Existing events that need field additions:**

1. `security.auth_fail` -- add `reason` field (see table above). No other schema changes.
2. All events that already carry `tenantId` (`capture.start`, `capture.success`, `capture.fail`, `capture.partial`, `capture.stage.fail`, `capture.header_fail`, `capture.wacz_fail`, `capture.key_archive_fail`, `capture.consent_error`, `capture.kv_fail`, `capture.tsa_fail`, `security.ssrf_block`, `list.success`, `list.error`) -- add `keyName` field. This is a backward-compatible addition; Coralogix handles new fields gracefully.
3. `security.rate_limit` and `security.capacity_limit` -- add `tenantId` and `keyName` when auth has already succeeded at the point where the rate limit fires. Currently these only carry `cip`. In `handleCreateCapture`, auth runs before rate limiting, so tenantId IS available. Same for `handleListCaptures`.

**New events for R12:**

| Event | Severity | Subsystem | Fields | When |
|-------|----------|-----------|--------|------|
| `security.scope_violation` | 5 (error) | `security` | `{ event, tenantId, keyName, requiredScope, cip }` | Valid key used for unauthorized operation |
| `admin.key_create` | 4 (warn) | `admin` | `{ event, tenantId, keyName, scopes, createdBy }` | New API key provisioned |
| `admin.key_revoke` | 4 (warn) | `admin` | `{ event, tenantId, keyName, revokedBy }` | API key revoked |

**Events NOT needed for R12:**
- `security.auth_success` -- R13 territory. The auth result flows into `capture.start` and `list.success` already.
- `admin.key_list` -- R13 territory (read-only admin action). If you log every admin list operation now, you're building audit logging, which is out of scope.

### (d) R12/R13 Boundary: Forward-Compatible Schema

The key design decision is: **R12 establishes the fields that R13 will require, even if R12 doesn't log every event that R13 will.**

Forward-compatibility requirements for R12's log schema:

1. **`keyName` must be present on all tenant-scoped events.** R13 will use this to answer "which key performed this action." If R12 omits it, R13 has to retrofit every log call -- much harder than adding it once in R12.

2. **`reason` on auth failures must use a controlled vocabulary.** R13 will build Coralogix alerting rules on specific reason values. If R12 uses free-text, R13 has to migrate. Use the enum: `'missing_header'`, `'invalid_scheme'`, `'key_not_found'`, `'key_revoked'`, `'scope_violation'`, `'misconfigured'`.

3. **Admin events must use a separate subsystem (`admin`).** This ensures R13 can query admin activity independently without filtering through `security` noise. Establishing the subsystem in R12 means R13 just adds more event types to the same subsystem.

4. **Do NOT add an `action` field to capture/list events in R12.** R13 needs `action` (e.g., `'create_capture'`, `'list_captures'`, `'get_capture'`) for its audit trail, but adding it now to events that don't need it creates noise. R13 will introduce `audit.*` events with `action` as a required field. R12 events should not carry `action`.

5. **Coralogix severity mapping should be consistent.** R12 establishes the pattern that R13 follows:
   - Severity 3 (info): successful operations (`capture.success`, `list.success`)
   - Severity 4 (warn): degraded operations and key lifecycle changes (`admin.key_create`, `admin.key_revoke`, rate limit hits)
   - Severity 5 (error): security failures (`auth_fail`, `scope_violation`)
   - Severity 6 (verbose/debug): only for `list.success` currently -- keep this anomaly or normalize to 3

**Note on `list.success` severity:** It currently logs at severity 6 (verbose/debug). This is inconsistent with `capture.success` at severity 3 (info). R12 should normalize `list.success` to severity 3 for consistency, or document the rationale for the difference. When R13 adds audit events, having inconsistent severity levels across similar operations makes Coralogix queries harder.

### (e) Admin API Observability

**Severity:** Admin key operations (create, revoke) should log at severity 4 (warn), not severity 3 (info) or severity 5 (error).

Rationale:
- Severity 3 (info) is too low -- key provisioning is a high-impact action that changes the security posture. You want it to stand out in Coralogix, not blend in with routine capture events.
- Severity 5 (error) is too high -- creating a key is a normal, expected operation. Error-level would trigger alert fatigue if Coralogix alerts are configured on severity >= 5.
- Severity 4 (warn) is the "notable but not broken" level. Key lifecycle changes are notable. Rate limit hits already use this level, which is analogous -- something happened that's worth knowing about but isn't a failure.

**Subsystem:** Use a new `admin` subsystem, NOT the existing `security` subsystem.

Rationale:
- The `security` subsystem currently logs threat-adjacent events: auth failures, SSRF blocks, rate limits. These are defensive events -- something bad happened or was prevented.
- Admin key operations are constructive events -- an authorized operator is building or modifying the system. Mixing constructive and defensive events in one subsystem makes Coralogix queries noisy.
- Coralogix subsystem filtering is the primary way operators narrow their view. A dedicated `admin` subsystem lets you answer "what admin changes happened today?" without wading through rate limit hits and SSRF blocks.
- The subsystem list grows from 3 (`capture`, `security`, `list`) to 4 (`capture`, `security`, `list`, `admin`). This is manageable and each subsystem has a clear semantic boundary.

**Admin key listing** (`admin.key_list`) should NOT be logged in R12. Listing is a read-only operation with no security impact. Logging every list call is audit behavior (R13). If R12 logs key listing, it has effectively started building the audit trail that R13 owns.

**`createdBy` / `revokedBy` fields:** For CLI provisioning, this could be the operator's name or machine identity. For an admin endpoint, it would be the authenticated admin identity. R12 should define the field even if the initial CLI tooling just sets it to a static string like `'cli'`. R13 will need this field, and retrofitting it is harder than including it from the start.

## Proposed Tasks

### Task 1: Add `reason` field to `security.auth_fail` events

**What:** Extend all `security.auth_fail` log calls in `src/index.js` to include a `reason` field from the controlled vocabulary. This requires `verifyApiKey()` in `src/auth.js` to return a `reason` string on failure alongside the response.

**Deliverables:**
- `auth.js` returns `{ ok: false, response, reason: string }` on failure
- Both `security.auth_fail` calls in `index.js` include the `reason` field
- Existing behavior unchanged -- just richer log data

**Dependencies:** Must be part of the auth module rewrite (R12 auth changes). Not a standalone task -- it's a requirement on the auth module deliverable.

### Task 2: Add `keyName` field to all tenant-scoped log events

**What:** After auth succeeds, the auth result should include `keyName`. Flow this field into all existing log calls that already carry `tenantId`: capture events, list events, SSRF blocks, and post-auth rate limit events.

**Deliverables:**
- `verifyApiKey()` returns `{ ok: true, tenantId, keyName }` on success
- All log calls that include `tenantId` also include `keyName`
- Rate limit events in `handleCreateCapture` and `handleListCaptures` (which fire after auth) include `tenantId` and `keyName`

**Dependencies:** Depends on the KV key record schema including a `name` field. Auth module design task must define this.

### Task 3: Add `security.scope_violation` event

**What:** When auth succeeds (key is valid) but the key's scopes don't permit the requested operation, log `security.scope_violation` and return 403 Forbidden.

**Deliverables:**
- New log event with fields: `{ event, tenantId, keyName, requiredScope, cip }`
- Severity 5, subsystem `security`
- Auth module returns a distinct result for "authenticated but not authorized" vs. "not authenticated"

**Dependencies:** Depends on scope definition (what scopes exist, how they map to endpoints). Auth module design task.

### Task 4: Add `admin` subsystem with key lifecycle events

**What:** Create admin key lifecycle logging with `admin.key_create` and `admin.key_revoke` events in the new `admin` subsystem.

**Deliverables:**
- Two new event types at severity 4 in the `admin` subsystem
- `admin.key_create`: `{ event, tenantId, keyName, scopes, createdBy }`
- `admin.key_revoke`: `{ event, tenantId, keyName, revokedBy }`
- Events fire from the key provisioning code (CLI or admin endpoint)

**Dependencies:** Depends on key provisioning tooling being built. This task defines the logging contract; the provisioning code calls `log()` with these events.

### Task 5: Add `tenantId` and `keyName` to post-auth rate limit events

**What:** In `handleCreateCapture` and `handleListCaptures`, the rate limit and capacity limit log calls fire after auth has succeeded. Add `tenantId` and `keyName` to these events so rate limit hits can be attributed to tenants.

**Deliverables:**
- `security.rate_limit` events in handleCreateCapture/handleListCaptures include `tenantId` and `keyName`
- `security.capacity_limit` events in the same handlers include `tenantId` and `keyName`
- Pre-auth rate limit events (verify, signing-key endpoints) remain unchanged -- no tenantId available

**Dependencies:** Depends on Task 2 (keyName flowing through auth result).

### Task 6: Normalize `list.success` severity

**What:** Change `list.success` from severity 6 (verbose) to severity 3 (info) for consistency with `capture.success`.

**Deliverables:**
- Single line change in `src/index.js` line 292
- Document the rationale in the decisions.md

**Dependencies:** None. Can be done as part of any R12 PR.

## Risks and Concerns

### Risk 1: Cardinality from `keyName`

Adding `keyName` to every log event creates a new dimension in Coralogix. With the expected scale (single-digit tenants, 2-3 keys per tenant), cardinality is not a concern. If WRL ever scales to hundreds of tenants with dozens of keys each, the `keyName` field could create cardinality pressure. This is a distant concern -- the current design is correct for the foreseeable scale.

**Mitigation:** `keyName` is bounded by the number of provisioned keys. Unlike `cip` (which is bounded but large -- all possible IPs), `keyName` is operator-controlled and grows only through explicit provisioning. No mitigation needed now.

### Risk 2: Log schema drift between R12 and R13

R13 will add audit events (`audit.*`) with potentially different field schemas. If R12 doesn't establish clear conventions, R13 might introduce inconsistencies.

**Mitigation:** Task descriptions above specify field names and types explicitly. Document the log schema in a section of the codebase (e.g., a comment block in `log.js` or a `docs/log-schema.md`) listing all event types, their fields, and subsystems. This becomes the contract for R13.

### Risk 3: Admin endpoint auth logging gap

If the admin API uses a different auth mechanism (e.g., a separate admin key, or Wrangler's built-in auth), its auth failures might not flow through the same `verifyApiKey()` path. This could create a blind spot where admin auth failures are not logged.

**Mitigation:** Whatever auth mechanism the admin API uses must log failures through the same `log()` function with the same `security.auth_fail` event structure. This is a requirement on the admin API design, not a separate observability task.

### Risk 4: `reason` field expands attack surface information

Including `reason: 'key_revoked'` in logs (not in API responses) tells an operator that a revoked key was attempted. This is valuable. But if log data is ever exposed (misconfigured Coralogix access, log forwarding to a shared channel), it reveals that specific key hashes map to revoked keys.

**Mitigation:** The `reason` field is internal-only (Coralogix). API responses remain generic ("Invalid API key"). The risk is acceptable given that Coralogix access is operator-controlled. Document in `log.js` that `reason` values are internal and must never be reflected in HTTP responses.

### Risk 5: Missing `tenantId` on pre-auth rate limit events

Verify and signing-key endpoints don't require auth, so their rate limit events will never have `tenantId`. This is correct and expected, but operators should understand that rate limit queries filtered by `tenantId` will miss unauthenticated endpoint hits.

**Mitigation:** Document this explicitly. No code change needed -- unauthenticated endpoints genuinely don't have a tenant identity.

## Additional Agents Needed

None. The current team is sufficient. The observability changes are straightforward field additions and new event types using the existing `log()` infrastructure. No new infrastructure (iac-minion), no security architecture changes (security-minion is already involved for the auth design), and no API design changes (api-design-minion is already involved for the admin endpoint).

One note for the **security-minion**: the scope violation event (`security.scope_violation`) and the `reason` field on auth failures encode information about the auth system's internal state. Security-minion should validate that the proposed reason vocabulary doesn't leak information that could help an attacker enumerate valid key patterns or tenant structures. The proposed vocabulary (`missing_header`, `invalid_scheme`, `key_not_found`, `key_revoked`, `scope_violation`, `misconfigured`) is intentionally generic, but security-minion should confirm this during synthesis.
