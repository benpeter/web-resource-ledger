## Domain Plan Contribution: security-minion

### Recommendations

#### (a) keyName and keyHashPrefix information disclosure risk

**keyHashPrefix (first 8 chars of SHA-256): LOW risk, acceptable.**

The full key hash is 64 hex characters (256 bits of entropy). Exposing 8 hex
characters (32 bits) of a SHA-256 hash does not enable key recovery or
brute-force attacks. SHA-256 is preimage-resistant; knowing a prefix does not
reduce the search space for the original key in any practical sense. The
prefix serves as a correlation identifier, not a credential. This is a
well-established pattern (Git commit short-hashes, GPG key fingerprint
prefixes, the project's own signing key `keyId`).

The system already logs `keyHashPrefix` in multiple places (auth failure,
legacy auth warning, admin key operations), so this is not a new exposure.
No change needed.

**keyName: LOW risk, but requires invariant enforcement.**

`keyName` is validated against `/^[a-zA-Z0-9 _.:-]{1,128}$/` (NAME_RE in
admin.js line 22) at creation time. This regex restricts the value to a safe
character set -- no control characters, no angle brackets, no percent
encoding, no quotes, no backslashes. The result is safe for JSON
serialization and log ingestion.

However, `keyName` originates from an admin-supplied request body. It is
attacker-controlled at creation time, even though the attacker must have the
ADMIN_KEY to set it. The NAME_RE validation makes it safe for the `log()`
INVARIANT, but this safety depends on the validation being applied
consistently. The recommendation is to document this dependency explicitly
in the audit logging code (see Proposed Tasks).

**Verdict**: Both fields are safe to log. No information disclosure concern.

#### (b) Fields to NEVER include in audit logs

The following fields must never appear in audit log entries:

| Field | Reason |
|-------|--------|
| Raw API key (`token`, `rawKey`) | Credential exposure -- possession = access. The codebase already enforces this (admin.js line 16: "Raw key is NEVER logged"). |
| Raw ADMIN_KEY | Same as above. Infrastructure secret. |
| Raw IP address | GDPR Article 4(5) -- IP addresses are personal data. The project uses `computeCip()` (HMAC-SHA256 with daily rotation) for pseudonymization. Continue using `cip` exclusively. |
| Authorization header value | Contains the Bearer token (the raw key). Never log request headers wholesale. |
| Request body content | May contain URLs that reveal surveillance targets (compliance/legal use case). The `url` field is already logged in `capture.queued` -- this is acceptable for operational correlation, but do not log request bodies in their entirety. |
| Stack traces in structured log data | May leak internal paths, dependency versions, or infrastructure details. The existing `errorMessage` pattern (truncated, framework-only) is correct. |
| Full keyHash (64 chars) | While not directly a credential (it's a hash), the full hash is the KV lookup key and the DELETE path parameter. Leaking it enables revocation by anyone with admin access. The 8-char prefix is sufficient for correlation. **Exception**: admin operations that already expose the full hash in API responses (list, create, revoke) may log it at `debug` severity for operational troubleshooting, but the standard audit event should use only the prefix. |

**Critical rule**: The `log()` helper's body is serialized via
`JSON.stringify(data)`. Any object passed as `data` will have all its
properties serialized. Never pass an auth result object directly -- always
destructure and pick specific fields.

#### (c) INVARIANT compliance of tenant context fields

Analysis of each proposed audit log field against the `log()` INVARIANT
("data must contain only static values and predetermined strings, never
attacker-controlled input"):

| Field | Source | Attacker-controlled? | INVARIANT-safe? | Rationale |
|-------|--------|---------------------|-----------------|-----------|
| `tenantId` | KV record or `'default'` (legacy) | Set by admin at key creation | **YES** -- validated by `TENANT_ID_RE` (`/^[a-z0-9_-]{1,64}$/`) at both creation and auth time (auth.js line 177). Fixed charset, bounded length. |
| `keyName` | KV record | Set by admin at key creation | **YES** -- validated by `NAME_RE` (`/^[a-zA-Z0-9 _.:-]{1,128}$/`) at creation time. Fixed charset, bounded length. Safe for JSON serialization. |
| `authMethod` | Hardcoded string in auth.js | No | **YES** -- one of `'kv'`, `'legacy'`, `'admin_key'`. Enum-like, never derived from input. |
| `keyHashPrefix` | `sha256hex.slice(0, 8)` | Derived from attacker-supplied key via SHA-256 | **YES** -- HMAC-derived value producing fixed-length hex string. Explicitly permitted by the INVARIANT comment. |
| `scopes` | KV record | Set by admin at key creation | **YES** -- validated against `VALID_SCOPES` (`['capture', 'read', 'admin']`) at creation time. Array of enum values. |
| `event` | Hardcoded string constant | No | **YES** -- static string like `'audit.capture'`. |
| `cip` | `computeCip()` output | Derived from IP via HMAC-SHA256 | **YES** -- explicitly permitted by the INVARIANT comment (HMAC-derived, fixed-length hex). |
| `url` (capture target) | Caller-supplied request body | **YES** | **CAUTION** -- already logged in `capture.queued` (index.js line 239), but this is technically attacker-controlled input. Mitigated by: (1) URL has passed `validateUrl()` which parses with WHATWG URL constructor and re-serializes via `parsed.href`, so it's normalized and scheme-restricted; (2) JSON.stringify encodes special characters. Still, a 2048-char URL with unicode could produce unexpected log content. The existing pattern is acceptable as a pragmatic operational necessity, but it bends the INVARIANT. |

**Verdict**: All proposed fields satisfy the INVARIANT. The `tenantId` and
`keyName` fields are admin-controlled (not attacker-controlled in the
traditional sense -- the admin has ADMIN_KEY access), and both are validated
against restrictive regexes with bounded lengths. They cannot contain
injection payloads.

**One caveat**: If admin auth ever moves from env var ADMIN_KEY to
KV-stored per-tenant admin keys (the TODO in admin.js line 191), then
`keyName` becomes settable by any admin-scoped key holder, broadening the
trust boundary. The NAME_RE validation still makes it safe, but the threat
model should be re-evaluated at that migration point.

#### (d) Admin operation caller identity

The current admin auth result is `{ ok: true, authMethod: 'admin_key' }`.
This is insufficient for audit purposes in a multi-operator environment.

**Current state**: There is exactly one ADMIN_KEY (infrastructure secret).
All admin operations are attributed to "the admin key" -- no distinction
between operators. This is adequate for single-operator use but insufficient
once multiple people have ADMIN_KEY access.

**Recommendation**: Do NOT add more caller identity to admin operations
right now. Here's why:

1. **YAGNI** -- There is currently one admin key. Adding operator identity
   infrastructure for a single shared secret adds complexity with no
   security benefit (you can't distinguish callers who all use the same
   credential).

2. **The right fix is per-operator admin keys** -- When admin auth moves to
   KV-based per-tenant keys with `admin` scope (already referenced in the
   TODO at admin.js line 191), each admin operation will naturally carry
   `tenantId`, `keyName`, and `keyHashPrefix` from the auth result, providing
   full caller attribution. Building a temporary identity scheme for the
   current shared-secret model is wasted work.

3. **What to do now**: Log `authMethod: 'admin_key'` on every admin
   operation (already happening). Add `cip` (pseudonymized client IP) to
   admin audit events. This provides a correlation signal for abuse
   investigation ("all these key creations came from the same IP") without
   building premature identity infrastructure.

4. **When to revisit**: When issue #42 (self-revocation guard) is
   implemented or when ADMIN_KEY is decomposed into per-operator keys,
   admin audit events should include `keyName`, `keyHashPrefix`, and
   `tenantId` from the auth result -- exactly like tenant API operations.

### Proposed Tasks

1. **Define the audit log event schema as a constant or documented contract**
   - Create an explicit list of audit event names and their required fields.
   - This prevents field drift across log callsites and makes it possible to
     validate that no callsite accidentally includes a forbidden field.
   - Suggested location: a comment block or constant map in `log.js` or a
     new `audit-events.js` module (if the project prefers colocation).

2. **Add `cip` to all admin operation log entries**
   - `handleAdminCreateKey`, `handleAdminListKeys`, `handleAdminRevokeKey`
     currently do not compute or log `cip`. The admin auth check in index.js
     computes `cip` for rate limiting and auth failure, but it is not passed
     through to the admin handlers.
   - Either: (a) pass `cip` as a parameter to the admin handlers, or
     (b) compute `cip` inside each handler (minor overhead, but maintains
     handler self-containment), or (c) have the index.js admin auth block
     attach `cip` to the request context and let handlers pull from there.
   - Option (a) is cleanest and matches how `handleCreateCapture` uses `cip`.

3. **Add INVARIANT annotation for `keyName` safety**
   - Where `keyName` is included in audit log data, add a brief comment:
     `// INVARIANT-safe: validated by NAME_RE at key creation (admin.js)`
   - This documents the dependency chain so future maintainers don't have to
     trace it.

4. **Ensure auth failure audit events include `keyHashPrefix` when available**
   - The auth failure path in index.js (lines 93, 167, 264) logs `reason`
     and `cip` but does not include `keyHashPrefix` from the failed auth
     result. For tenant API auth failures, the auth result includes
     `keyHashPrefix` (auth.js lines 158, 170, 194, 242). This should be
     included in the security audit log for correlation (e.g., "which key
     was someone trying to use?").
   - For admin auth failures, there is no `keyHashPrefix` available (the
     ADMIN_KEY has no hash in the current model). This is acceptable.

5. **Prevent wholesale auth result logging**
   - Add a code review guideline or lint rule: never pass the raw `auth`
     result object to `log()`. Always destructure. This prevents accidental
     inclusion of `response` (which contains status/headers) or future
     fields that might carry sensitive data.
   - Minimal implementation: a comment at the top of `log.js` or in the
     audit logging section: "Never pass request, response, or auth result
     objects to log(). Always pick specific fields."

6. **Log key lifecycle events with consistent schema**
   - Key creation: `event: 'audit.key_create'`, `keyHashPrefix`, `tenantId`,
     `scopes`, `keyName`, `authMethod`, `cip`
   - Key revocation: `event: 'audit.key_revoke'`, `keyHashPrefix`,
     `tenantId`, `authMethod`, `cip`, `idempotent`
   - Key list: `event: 'audit.key_list'`, `tenantFilter`, `includeRevoked`,
     `count`, `authMethod`, `cip`
   - Note: admin.js already logs these under the `admin` subsystem. The
     question is whether to add a parallel `audit` subsystem entry or rename
     the existing events. Recommendation: keep the `admin` subsystem events
     as-is for operational logging and add `audit` subsystem entries with
     the tenant context fields. Alternatively, if the project prefers
     single-event simplicity, enrich the existing `admin` events with the
     missing fields (`authMethod`, `cip`).

7. **Audit log for authenticated read operations**
   - `handleListCaptures` already logs `list.success` and `list.error` with
     tenant context. Verify that the new audit logging does not double-log
     these events. If the existing log entries contain all required audit
     fields (`tenantId`, `keyName`, `authMethod`, `cip`, `event`), they may
     serve as the audit record directly.
   - `handleGetCapture` and `handleGetCaptureArtifact` are unauthenticated
     (capture ID acts as access secret). These are explicitly out of scope
     for tenant audit logging.
   - `handleCaptureStatus` is unauthenticated. Out of scope.

### Risks and Concerns

1. **Log volume and cost** (LOW risk)
   - Adding audit log entries to every authenticated request increases
     Coralogix ingestion volume. Current tenant operations (capture, list)
     already log per-request, so the marginal increase is from adding
     fields to existing events rather than creating new events. Admin
     operations are rate-limited to 5/60s and are very low volume. Cost
     impact is negligible.

2. **`url` field in audit logs bends the INVARIANT** (MEDIUM risk, accepted)
   - The `capture.queued` event already includes `url: result.url` (the
     validated, re-serialized URL). This is attacker-controlled input that
     has passed SSRF validation. The INVARIANT comment permits HMAC-derived
     values and framework error messages but does not explicitly address
     validated URLs. The current practice is pragmatically necessary (you
     need to know what was captured) and the WHATWG URL re-serialization
     provides normalization. Recommend adding a note to the INVARIANT
     comment: "Validated and re-serialized URLs (post-validateUrl) are
     acceptable as they are scheme-restricted and constructor-normalized."

3. **Future admin key decomposition changes the threat model** (MEDIUM risk, deferred)
   - When ADMIN_KEY moves to per-tenant KV keys, admin operations will
     carry `keyName` from potentially different trust levels (tenant admins
     vs infrastructure admins). The NAME_RE validation keeps the field safe
     for logging, but the authorization model for "who can create admin
     keys" needs separate review. This is not a concern for the current
     audit logging task.

4. **Audit log entries are fire-and-forget** (LOW risk, accepted)
   - The `log()` helper is fire-and-forget with catch for delivery failures.
     This means audit events can be silently dropped if Coralogix is
     unavailable. For compliance purposes, this gap may need addressing
     later (e.g., dead-letter queue, local persistence). However, the
     project's current scope explicitly excludes "log retention policies"
     and compliance report generation, so this is a known accepted gap.

5. **No PII in audit logs** (CONFIRMED safe)
   - The proposed fields contain no PII. `tenantId` is an organizational
     identifier. `keyName` is an operator-chosen label. `cip` is
     pseudonymized. `keyHashPrefix` is a hash derivative. No email
     addresses, names, or other personal data are logged. GDPR Article 6
     legitimate interest basis is straightforward for security audit logs
     that contain no directly identifying information.

### Additional Agents Needed

- **observability-minion**: Should define the Coralogix query patterns for
  the audit trail (the success criterion "queryable by tenant and time range
  in Coralogix" requires dashboard/query design, not just log emission).
  Also should validate that the proposed event schema works well with
  Coralogix's structured log search and alerting.

- **test-minion**: Should define test cases that verify: (1) audit log
  entries are emitted for every authenticated request path, (2) forbidden
  fields (raw key, raw IP, full keyHash) are never present in log data,
  (3) auth failure events include available correlation fields.
