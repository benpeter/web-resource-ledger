# Domain Plan Contribution: security-minion

## Context Assessment

I reviewed `src/log.js`, `src/auth.js`, `src/index.js`, `src/capture.js`,
`src/kv.js`, `src/ip-hash.js`, `src/url-validation.js`, and `src/responses.js`.

The existing logging infrastructure is solid: fire-and-forget to Coralogix,
structured JSON payloads, HMAC-derived `cip` for pseudonymized client
correlation, and a clearly documented INVARIANT in `log.js` that prohibits
attacker-controlled input in log data. The current auth model is single-key
(`CAPTURE_API_KEY`), hardcoded to `tenantId: 'default'` -- R12 will introduce
per-tenant keys with `keyId` lookup.

---

## Recommendations

### (a) Fields That Must NEVER Appear in Audit Logs

The `log.js` INVARIANT states: `data` must contain only static values and
predetermined strings, never attacker-controlled input. HMAC-derived values
are acceptable.

**Fields that must NEVER be logged:**

1. **Bearer token / API key** -- already enforced by auth.js comments (`SECURITY: Never log or echo`). The audit log must use `keyId` (a server-derived identifier from KV lookup) as the key's proxy identity, never any portion of the key material.

2. **Raw IP address** -- already solved by `cip` (HMAC-SHA256 pseudonymized). Audit logs must use `cip`, never `CF-Connecting-IP`.

3. **Raw request URL** -- this is the critical nuance. The capture target URL (e.g., `https://evil.com/<script>alert(1)</script>`) is attacker-controlled input that happens to have been validated for SSRF safety. SSRF validation does NOT sanitize for log injection. The URL passes through `validateUrl()` which returns `parsed.href` (WHATWG-normalized), but arbitrary path/query/fragment content survives normalization intact.

   **However**, I observe that `capture.start` on `capture.js:113` already logs `url` directly. This is an existing tension with the INVARIANT. Two options:

   - **Option A (strict)**: Do not log the URL in audit entries. Log only the `captureId`, which is a server-generated value that can be correlated to the URL via KV lookup. Audit consumers query KV for the URL when needed.
   - **Option B (pragmatic)**: Accept that the WHATWG-normalized URL from `validateUrl()` is sufficiently constrained (scheme-restricted to http/https, no credentials, no double-encoding, length-capped at 2048 chars) and document it as an explicit exception to the INVARIANT. The URL has passed a validation boundary that strips the most dangerous patterns.

   **My recommendation is Option B** with an explicit amendment to the INVARIANT comment. The URL is essential for "who captured what" -- requiring a KV join defeats the purpose of the audit log. The existing `capture.start` event already logs it, so this is not a new risk. However, the INVARIANT comment must be updated to acknowledge this exception and document why it is acceptable.

4. **Request body fields** -- no raw request body content in audit logs. For capture requests, log the validated URL (per above exception) but not other body fields.

5. **Error messages from user-supplied data** -- already handled by `.slice(0, 256)` truncation on framework error messages. Audit entries should not include error details at all; those belong in the `capture` subsystem logs that already exist.

6. **Request headers** -- User-Agent, Referer, Cookie, and other headers are attacker-controlled. Never log them in audit entries.

**Fields that ARE safe for audit entries (server-controlled or derived):**

- `tenantId` -- from KV key record (server-controlled, validated against `/^[a-z0-9_-]{1,64}$/`)
- `keyId` -- from KV key record (server-controlled, will be a hash fingerprint from R12)
- `captureId` -- server-generated (`cap_` + random UUID)
- `cip` -- HMAC-derived from IP
- `action` -- static string (e.g., `'capture.create'`, `'capture.list'`)
- `resource` -- route pattern (e.g., `'/v1/captures'`), NOT the request URL
- `url` -- WHATWG-normalized capture target URL (explicit INVARIANT exception, see above)
- `statusCode` -- HTTP response status (integer)
- `timestamp` -- server-generated
- `durationMs` -- server-measured

### (b) Failed Auth: Audit Trail vs. Security Subsystem

**Failed auth attempts should remain in the `security` subsystem, NOT the `audit` subsystem.**

Rationale:

1. **Failed auth has no tenant identity.** The whole point of audit logging is "who did what" -- a failed auth attempt has no authenticated "who." The `security.auth_fail` event already logs `cip` and `status`, which is all you can know about an unauthenticated request.

2. **Separation of concerns.** The `audit` subsystem answers: "What did tenant X do between time A and time B?" The `security` subsystem answers: "Is someone attacking us?" Mixing them pollutes both queries. A Coralogix query for `subsystem=audit AND tenantId=acme` should return only legitimate activity, not brute-force noise.

3. **The existing pattern works.** `security.auth_fail` is already logged at severity 5 (error) on lines 135 and 219 of `index.js`. It includes the HTTP status code (401 vs 503) and `cip`. This is sufficient for detecting credential stuffing and brute-force patterns.

**One enhancement**: When R12 ships and keys carry `tenantId`, failed auth attempts that match a valid key format but fail comparison should log the **attempted** key format (e.g., key prefix length, whether it matches `wrl_live_` or `wrl_test_` prefix) but NOT the key itself. This helps distinguish "valid key format, wrong key" from "garbage input." This is an R12 concern, not an R13 concern.

### (c) Key Lifecycle Event Provenance

R12 (per-tenant keys) will introduce key provisioning and revocation via an admin API. For audit purposes, each key lifecycle event needs:

**Minimum provenance fields for key creation:**

| Field | Source | Rationale |
|-------|--------|-----------|
| `event` | static: `'key.create'` | Event type |
| `tenantId` | from admin API request body | Who the key is for |
| `keyId` | server-generated hash fingerprint | Key identity (never the key itself) |
| `scopes` | from admin API request body | What the key can do |
| `name` | from admin API request body (optional) | Human label, validated against safe char set |
| `createdBy` | `'admin'` (admin key auth) | Who created it -- for now just `admin`, but future-proofs for per-admin identity |
| `cip` | HMAC-derived from admin's IP | Network provenance |
| `timestamp` | server-generated | When |

**Minimum provenance fields for key revocation/deletion:**

| Field | Source | Rationale |
|-------|--------|-----------|
| `event` | static: `'key.revoke'` | Event type |
| `tenantId` | from KV key record | Which tenant's key |
| `keyId` | from route parameter or lookup | Which key was revoked |
| `revokedBy` | `'admin'` | Who revoked it |
| `cip` | HMAC-derived | Network provenance |
| `timestamp` | server-generated | When |
| `reason` | static string if provided | Why (optional, but valuable for compliance) |

**Important constraints:**

- The admin API does not yet exist (it is part of R12). R13 should define the audit log schema for these events so R12 can emit them. The schema is the deliverable; the emission points are R12's responsibility.
- Key material (the actual API key value) must NEVER appear in any log entry, including lifecycle events. The `keyId` (hash fingerprint) is the only key identifier in logs.
- The `name` field from the admin API body is attacker-controlled input (the admin is trusted but the field is free-form). Validate it: alphanumeric + hyphens + underscores, max 64 chars, same pattern as `tenantId`. Log it only after validation. If invalid, reject the request; do not sanitize and log.

### (d) Log Integrity Beyond Coralogix's Append-Only Model

Coralogix is append-only from the application's perspective, but the application itself does not have integrity guarantees on what it sends. Consider these threats:

**Threat 1: Log forgery by compromised Worker code.**
If the Worker code is compromised (supply chain, CI/CD), the attacker can emit arbitrary log entries with fabricated `tenantId`, `captureId`, etc. The logs would look authentic.

*Mitigation*: This is out of scope for R13. The defense is CI/CD pipeline integrity (R12 depends on this too). Document this as an accepted risk: "Audit log integrity assumes Worker code integrity. A compromised Worker can forge log entries."

**Threat 2: Log gaps from Worker failures.**
`log()` is fire-and-forget. If the fetch to Coralogix fails (network issue, rate limit, Coralogix outage), the log entry is silently lost. The `catch` in `log.js` (line 39) logs a `console.warn` but `console.warn` itself goes to... Cloudflare's Workers logs, which are ephemeral (72 hours, no structured query).

*Mitigation for R13*: This is a known gap but not one R13 should solve. The existing `wrl:log_delivery_fail` console.warn pattern is adequate for MVP. If audit completeness becomes a compliance requirement, the fix is a Cloudflare Queue as a buffer (related to R16). Document this as a known limitation: "Audit log entries may be lost during Coralogix outages. For guaranteed delivery, see R16 (queue migration)."

**Threat 3: Coralogix account compromise.**
If an attacker gains access to the Coralogix account, they can delete or modify historical log data. Coralogix's append-only model protects against application-level tampering, not admin-level tampering.

*Mitigation*: Out of scope for R13. When compliance requires it, consider streaming audit logs to a secondary append-only store (S3 with Object Lock, or a dedicated SIEM). Add to the Parking Lot with trigger: "When a compliance framework requires independent audit log custody."

**Threat 4: Log injection via structured fields.**
Coralogix parses the `text` field as JSON. If any field contains JSON metacharacters, it could corrupt the parsed structure. This is NOT a concern here because `JSON.stringify()` in `log.js` handles escaping. The risk would be if a field contained a string that, when parsed by Coralogix's JSON parser, altered the schema. Since Coralogix receives the outer JSON array and the inner `text` is a stringified JSON blob, double-serialization provides structural integrity.

*No mitigation needed* -- the existing double-`JSON.stringify` pattern in `log.js` (lines 32-38) is correct and sufficient.

---

## Proposed Tasks

### Task 1: Define audit log event schema

**What**: Define the complete set of audit event types, their fields, and the field contract (which are mandatory, which are optional, value constraints).

**Deliverables**:
- A schema document or code constant (e.g., `src/audit-events.js`) listing each event type and its fields
- Update the `log.js` INVARIANT comment to document the URL exception explicitly

**Dependencies**: None (this is schema design, independent of R12)

**Recommended event types for R13 scope**:

| Event | Trigger | Key Fields |
|-------|---------|------------|
| `audit.capture.create` | POST /v1/captures succeeds (202 returned) | tenantId, keyId, captureId, url, cip |
| `audit.capture.list` | GET /v1/captures succeeds | tenantId, keyId, resultCount, cip |
| `audit.capture.get` | GET /v1/captures/:id succeeds | tenantId (if auth added to GET), captureId |
| `audit.key.create` | Admin creates a tenant key | tenantId, keyId, scopes, createdBy, cip |
| `audit.key.revoke` | Admin revokes a tenant key | tenantId, keyId, revokedBy, cip |

Note: `audit.capture.get` and `audit.capture.status` are currently unauthenticated (captureId-as-secret model). They should NOT have audit entries until authentication is added to those endpoints. Logging unauthenticated access to the audit trail would violate the "audit = authenticated activity" principle.

### Task 2: Emit audit events at authenticated request points

**What**: Add `log()` calls at each authenticated endpoint, using the `'audit'` subsystem.

**Deliverables**:
- Audit log calls in `handleCreateCapture` (after successful auth + after 202 response)
- Audit log calls in `handleListCaptures` (after successful auth + after response)
- Integration with `ctx.waitUntil()` (fire-and-forget, same pattern as existing logs)

**Dependencies**: Task 1 (schema must be defined first)

**Implementation guidance**:
- Use a new subsystem name: `'audit'` -- distinct from `'security'` and `'capture'`
- Severity: 3 (info) for all successful audit events. Audit events are informational by definition; they record what happened, not what went wrong.
- Audit log emission should happen AFTER the action succeeds (e.g., after `createCapture()` writes to KV, not before). If the action fails, the failure is logged by the existing `capture` or `security` subsystem, not the audit subsystem.
- The `keyId` field will be `undefined` until R12 ships. This is acceptable -- the schema should mark it as optional with a comment noting it will be populated by R12.

### Task 3: Define key lifecycle audit event schema (R12 contract)

**What**: Define the audit log schema for key provisioning and revocation events so that R12 can emit them when the admin API is built.

**Deliverables**:
- Schema definitions for `audit.key.create` and `audit.key.revoke` events
- Documented field contracts (see table in section (c) above)
- A comment or documentation note in the schema file saying "Emitted by the admin API (R12); schema defined here for forward compatibility"

**Dependencies**: Task 1

### Task 4: Update INVARIANT documentation

**What**: Amend the `log.js` INVARIANT comment to explicitly acknowledge the URL exception and document the audit subsystem's field contracts.

**Deliverables**:
- Updated INVARIANT comment in `log.js` that lists the URL exception with its safety rationale (WHATWG-normalized, SSRF-validated, length-capped, scheme-restricted)
- A note that `audit` subsystem events follow stricter field contracts than general logging

**Dependencies**: Task 1

### Task 5: Coralogix query documentation

**What**: Document how to query audit logs in Coralogix for the two primary use cases: (1) "what did tenant X do?" and (2) "who accessed resource Y?"

**Deliverables**:
- Query examples in the evolution log `outcome.md` or OPERATIONS.md
- Example: `subsystemName:"audit" AND tenantId:"acme"` filtered by time range
- Example: `subsystemName:"audit" AND captureId:"cap_abc123"`

**Dependencies**: Tasks 1, 2 (need real events to query)

---

## Risks and Concerns

### Risk 1: keyId availability before R12

The current auth model returns `{ ok: true, tenantId: 'default' }` with no `keyId`. Audit log entries emitted before R12 will have `tenantId: 'default'` and `keyId: undefined`. This is acceptable but creates a discontinuity in the audit trail -- pre-R12 entries cannot distinguish between callers because there is only one key.

**Mitigation**: Document this as a known limitation. The audit trail before R12 answers "what happened" but not "who did it" (because there is only one "who"). R12 populates the identity fields.

### Risk 2: INVARIANT tension with URL logging

As analyzed above, the `capture.start` event already logs the URL, but the INVARIANT comment does not acknowledge this. R13 will add more URL-containing audit events. If the INVARIANT is not updated, future reviewers will flag these as violations.

**Mitigation**: Task 4 explicitly addresses this. The INVARIANT update should happen in the same PR as the audit logging implementation.

### Risk 3: Subsystem proliferation

Adding `'audit'` as a third subsystem (alongside `'security'` and `'capture'`) is manageable, but the naming convention matters for Coralogix queryability. The `list` subsystem is already used on line 270 of `index.js` (`'list'`), and `signing` is used implicitly via event names. Ensure subsystem names are documented in one place.

**Mitigation**: Include a subsystem registry comment in `log.js` listing all valid subsystem names.

### Risk 4: Log volume and cost

Every authenticated request generates an audit log entry. At current scale (single user), this is negligible. At multi-tenant scale, audit logs could dominate Coralogix ingestion volume. Coralogix bills by data volume.

**Mitigation**: Not an R13 concern at current scale, but worth a Parking Lot entry: "Consider audit log sampling or tiered retention when Coralogix ingestion exceeds [threshold]."

### Risk 5: Audit log as timing oracle

Audit logs include `durationMs`. For capture operations, this leaks information about the target URL's response time. An attacker who can query audit logs (requires Coralogix access) could use this to fingerprint internal vs. external targets.

**Mitigation**: Acceptable risk. Coralogix access is admin-only. The `durationMs` field is more useful for operations than it is exploitable. If per-tenant audit log export is ever built, strip timing fields from the export.

---

## Additional Agents Needed

**observability-minion** -- should be consulted on:
- Coralogix index configuration for the new `audit` subsystem (does it need a separate index or pipeline rule for retention?)
- Alert rules: should there be an alert for "tenant X exceeded N captures in time window" based on audit events?
- Dashboard queries for the audit trail use cases

No other additional agents are needed. The existing team (implementation, testing, infra) can handle the code changes. The security analysis above provides the constraints they need to work within.
