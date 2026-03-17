## Delegation Plan

**Team name**: audit-logging
**Description**: Add structured audit trail to all authenticated API requests, enabling tenant activity investigation, key tracing, and compliance reporting via Coralogix.

### Task 1: Extend `verifyApiKey()` to return `keyId`
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Add keyId to verifyApiKey() return value

    You are modifying the auth module to return a `keyId` alongside `tenantId` on
    successful authentication. This is the foundational data-flow change that enables
    audit logging with per-key tracing.

    ### Context

    `src/auth.js` currently returns `{ ok: true, tenantId }` on success. Audit
    logging needs a `keyId` field to identify which API key was used. Pre-R12
    (per-tenant keys), there is only one key (`CAPTURE_API_KEY`), so derive a
    static `keyId` from it.

    ### What to do

    1. In `src/auth.js`, after successful auth (line ~94), compute `keyId` as
       the first 8 hex characters of SHA-256 of the raw `CAPTURE_API_KEY` value.
       Use `crypto.subtle.digest('SHA-256', enc.encode(env.CAPTURE_API_KEY))`,
       convert to hex, and take the first 8 chars. This matches the project's
       existing fingerprinting pattern (signing keys use SHA-256 prefix).

    2. Return `{ ok: true, tenantId, keyId }` on success.

    3. Update the JSDoc for `verifyApiKey()` to document the new `keyId` field
       in the success return type.

    4. Update `test/auth.test.js`:
       - Existing success tests should now also assert `keyId` is a string of
         8 hex characters.
       - Existing failure tests should verify `keyId` is NOT present in the
         response (no information leakage on failure).
       - Add a test that verifies `keyId` is deterministic: calling with the
         same key twice produces the same `keyId`.

    ### What NOT to do

    - Do NOT change the failure return type. Failed auth still returns
      `{ ok: false, response }`.
    - Do NOT log anything new in auth.js. Audit logging happens in the callers.
    - Do NOT create a new file for this. The change is ~10 lines in auth.js.

    ### Files to modify
    - `src/auth.js` -- add keyId computation and return field
    - `test/auth.test.js` -- extend existing tests, add determinism test

    ### Security constraint
    The `keyId` is a SHA-256 prefix of the secret API key. 8 hex chars (32 bits)
    of a 256-bit hash do not leak exploitable information about the key. This is
    the same pattern used for signing key fingerprints throughout the project.
    NEVER log the raw API key -- only the fingerprint.
- **Deliverables**: Updated `src/auth.js` returning `keyId`, updated `test/auth.test.js`
- **Success criteria**: `verifyApiKey()` returns `{ ok: true, tenantId, keyId }` where keyId is an 8-char hex string; all existing auth tests pass; new keyId tests pass

### Task 2: Add audit log events to authenticated handlers and thread keyId through capture pipeline
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 1
- **Approval gate**: yes
- **Gate reason**: This is the core implementation -- the audit event schema, field names, and subsystem choice lock in the Coralogix query contract that downstream tasks, documentation, and all future audit consumers depend on. Getting the schema wrong means query migration.
- **Gate rationale**: |
    Chosen: Dedicated `audit` subsystem with lean events at handler boundaries (not augmenting existing events)
    Over: (1) `audit: true` flag on existing events across existing subsystems (observability-minion); (2) Augmenting existing capture/list/security events with extra fields in-place
    Why: 4 of 6 specialists recommended a dedicated subsystem. The key advantage is query simplicity: `subsystemName:"audit"` returns exactly the compliance-relevant events without noise. The flag approach requires field-level filtering (`text.audit:true`) which is less ergonomic for operators and pollutes operational events with audit fields that are irrelevant to debugging. The dedicated subsystem also enables independent retention policies in Coralogix if needed later.
- **Prompt**: |
    ## Task: Add audit log events to authenticated handlers

    You are adding structured audit log events at every authenticated API request
    boundary to create a full audit trail. This is the core R13 implementation.

    ### Context

    After Task 1, `verifyApiKey()` returns `{ ok: true, tenantId, keyId }`. You
    need to emit audit events using the existing `log()` helper with a new
    `audit` subsystem. The audit events are lean -- they record WHO did WHAT and
    WHEN, not the operational details (those stay in existing `capture`/`list`
    events).

    ### Architecture decision: dedicated `audit` subsystem

    Use `'audit'` as the subsystem name for all audit events. This enables
    `subsystemName:"audit"` queries in Coralogix to return exactly the audit
    trail. Do NOT add audit fields to existing events or use an `audit: true`
    flag approach.

    ### Audit event schema

    Every audit event uses this flat envelope:

    ```javascript
    {
      event: 'audit.<resource>.<action>',  // e.g., 'audit.capture.create'
      tenantId: string,                     // from auth result
      keyId: string,                        // from auth result (8-char hex)
      action: string,                       // 'create' | 'list'
      resource: string,                     // 'capture'
      resourceId: string | null,            // captureId when available, null for list
      outcome: string,                      // 'success' | 'denied' | 'error'
      cip: string,                          // hashed client IP (already computed)
    }
    ```

    Field rules:
    - ALL fields are flat (no nesting). Coralogix queries on flat fields are
      faster and more reliable.
    - `outcome` is a three-value enum: 'success' (action completed), 'denied'
      (auth failed, SSRF blocked), 'error' (action failed after auth).
    - `resourceId` is the captureId for capture operations, null for list.
    - Do NOT include: URL, durationMs, render details, error messages, request
      body fields. Those belong in the operational events that already exist.
    - Do NOT include the raw API key, bearer token, or raw IP address.

    ### What to do

    1. **`src/index.js` -- `handleCreateCapture()`**: After line 138
       (`const { tenantId } = auth;`), destructure `keyId` too:
       `const { tenantId, keyId } = auth;`

       Add ONE audit event AFTER the 202 response is built but before returning,
       in `ctx.waitUntil()`:
       ```javascript
       ctx.waitUntil(log(env, 3, 'audit', {
         event: 'audit.capture.create',
         tenantId,
         keyId,
         action: 'create',
         resource: 'capture',
         resourceId: captureId,
         outcome: 'success',
         cip,
       }) ?? Promise.resolve());
       ```

       Place this after `captureId` is generated (line 182) and the KV record
       is created (line 186), but before the `return jsonResponse(...)`. This
       way the audit event has the captureId and records a successful acceptance.
       If KV write fails, the error path returns early and no audit.capture.create
       is emitted (which is correct -- the capture was not created).

    2. **`src/index.js` -- `handleListCaptures()`**: After auth, destructure
       `keyId`: `const { tenantId, keyId } = auth;` (replace the implicit
       usage of `auth.tenantId` later in the function).

       Add ONE audit event alongside the existing `list.success` log. Place it
       right before the `return jsonResponse(...)` at the end:
       ```javascript
       ctx.waitUntil(log(env, 3, 'audit', {
         event: 'audit.capture.list',
         tenantId,
         keyId,
         action: 'list',
         resource: 'capture',
         resourceId: null,
         outcome: 'success',
         cip,
       }) ?? Promise.resolve());
       ```

    3. **`src/index.js` -- auth failure audit events**: The existing
       `security.auth_fail` events in both handlers already cover denied access.
       Add `outcome: 'denied'` to those existing log calls but do NOT move them
       to the audit subsystem. Failed auth has no tenant identity and belongs
       in `security`. The audit subsystem is for authenticated activity only.

       Specifically, update both `security.auth_fail` log calls to include:
       ```javascript
       { event: 'security.auth_fail', status: auth.response.status, cip, outcome: 'denied' }
       ```

    4. **`src/index.js` -- SSRF block**: Update the `security.ssrf_block` log
       call to include audit fields since the request was authenticated:
       ```javascript
       {
         event: 'security.ssrf_block',
         tenantId, keyId,
         reason: result.detail.startsWith('URL scheme') ? 'url_scheme_not_allowed' : result.detail,
         action: 'create', resource: 'capture', resourceId: null,
         outcome: 'denied',
         cip,
       }
       ```

    5. **`src/index.js` -- list error**: Update the `list.error` log to include
       the audit fields for queryability:
       ```javascript
       {
         event: 'list.error',
         tenantId, keyId,
         errorClass: err.constructor.name,
         durationMs, cip,
         action: 'list', resource: 'capture', resourceId: null,
         outcome: 'error',
       }
       ```
       Also emit a separate audit event for the error:
       ```javascript
       ctx.waitUntil(log(env, 5, 'audit', {
         event: 'audit.capture.list',
         tenantId, keyId,
         action: 'list', resource: 'capture', resourceId: null,
         outcome: 'error',
         cip,
       }) ?? Promise.resolve());
       ```

    6. **`src/capture.js` -- Thread keyId through performCapture()**: Add
       `keyId` as a parameter to `performCapture()`, after `cip` and before
       `renderer`. Update the function signature:
       ```javascript
       export async function performCapture(env, url, ip, captureId, tenantId, cip, keyId, renderer = defaultRenderer) {
       ```

       Update the call site in `src/index.js` handleCreateCapture() (line 199):
       ```javascript
       ctx.waitUntil(performCapture(env, result.url, result.ip, captureId, tenantId, cip, keyId));
       ```

       In `src/capture.js`, add audit fields to the existing `capture.start`
       log call (line 113):
       ```javascript
       await log(env, 3, 'capture', { event: 'capture.start', captureId, tenantId, keyId, url, cip });
       ```

       Add `keyId` to `capture.success`, `capture.partial`, and `capture.fail`
       log calls as well. This is purely adding one field to each existing
       log call -- do not change subsystems or add new log calls.

    ### What NOT to do

    - Do NOT create new files (no `src/audit.js`, no `src/audit-events.js`).
    - Do NOT create an audit event builder function or helper. Two log calls
      with inline objects is the KISS approach.
    - Do NOT modify `src/log.js`. The existing log() function handles
      arbitrary subsystems.
    - Do NOT add request-start events. Completion events only (as recommended
      by observability-minion). The existing `capture.start` covers the
      async pipeline case.
    - Do NOT log the capture URL in audit events. The URL is logged in the
      operational `capture.start` event. Audit events are lean.
    - Do NOT touch unauthenticated endpoints (verify, signing-key, status, get).

    ### Files to modify
    - `src/index.js` -- add audit log calls, destructure keyId, update
      existing log calls with outcome field, update performCapture call
    - `src/capture.js` -- add keyId parameter, add keyId to existing log calls

    ### Tests

    Tests for this task will be handled by Phase 6 (post-execution test phase).
    Focus on getting the implementation correct. The existing test suite must
    continue to pass -- the `performCapture()` signature change will require
    updating test call sites in `test/capture.test.js` to pass `keyId` (or
    `null` / `undefined`) as the new parameter.

    Update any existing test calls to `performCapture()` to include the new
    `keyId` parameter. The simplest approach: add `null` or `'test-key-id'`
    after `cip` in existing test calls.
- **Deliverables**: Updated `src/index.js` with audit log events, updated `src/capture.js` with keyId threading, updated test call sites for new performCapture signature
- **Success criteria**: Two new audit log events emitted per authenticated request (capture create and list); keyId threaded through capture pipeline; existing test suite passes; no new files created

### Task 3: Update log.js INVARIANT and add subsystem registry
- **Agent**: security-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update log.js INVARIANT comment and add subsystem registry

    You are updating the INVARIANT documentation in `src/log.js` to acknowledge
    the URL exception and the new `audit` subsystem.

    ### Context

    The INVARIANT in `src/log.js` (lines 9-15) states that `data` must contain
    only static values and predetermined strings, never attacker-controlled input.
    However, `capture.start` already logs the capture URL (which is attacker-provided
    but WHATWG-normalized and SSRF-validated). Adding audit logging does not create
    a new URL logging point, but the INVARIANT should acknowledge this existing
    exception explicitly. Additionally, a new `audit` subsystem is being introduced.

    ### What to do

    1. Update the INVARIANT comment in `src/log.js` to add:
       - An explicit exception for WHATWG-normalized URLs that have passed
         `validateUrl()`: "WHATWG-normalized URLs from validateUrl() are an
         accepted exception: scheme-restricted to http/https, no credentials,
         length-capped at 2048 chars. This applies to the `url` field in
         capture.start events."
       - A subsystem registry listing all valid subsystem names:
         `capture`, `security`, `list`, `audit`. One line each with a brief
         description of what each subsystem covers.

    2. Add a security constraint note for the `audit` subsystem:
       "Audit subsystem events follow the same INVARIANT. All fields are either
       static strings, server-generated identifiers (captureId, keyId), or
       HMAC-derived values (cip). The raw API key, bearer token, and raw IP
       address must NEVER appear in any log entry."

    ### What NOT to do

    - Do NOT change any functional code in log.js. Only update comments.
    - Do NOT add code validation or runtime checks. The INVARIANT is a
      documentation contract, not a runtime guard.

    ### Files to modify
    - `src/log.js` -- update INVARIANT comment block only
- **Deliverables**: Updated INVARIANT comment with URL exception and subsystem registry
- **Success criteria**: INVARIANT comment explicitly documents URL exception and lists all subsystem names; no functional code changes

### Task 4: Document audit event schema and key lifecycle contract in evolution log
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create evolution log entries for audit logging phase

    You are creating the evolution log directory and documentation for the audit
    logging phase (R13). This is phase 0038 in the evolution log.

    ### Context

    The project requires evolution log entries for every significant phase
    (see CLAUDE.md "Evolution Log" section). This phase adds structured audit
    logging to authenticated API requests.

    ### What to do

    1. Create directory `docs/evolution/0038-audit-logging/`

    2. Create `docs/evolution/0038-audit-logging/prompt.md` with the original
       task briefing:
       ```
       # Phase 0038: Audit Logging for Authenticated Requests

       Full audit trail of authenticated API activity -- who captured what, when,
       with which key -- enabling abuse investigation and compliance reporting
       for multi-tenant operation.

       Depends on R12 (per-tenant keys) for full value; ships ahead of R12 with
       keyId derived from the single CAPTURE_API_KEY (static fingerprint).

       GitHub Issue: #43
       ```

    3. Create `docs/evolution/0038-audit-logging/decisions.md` documenting:

       a. **Subsystem strategy**: Dedicated `audit` subsystem chosen over
          `audit: true` flag on existing events. Rationale: clean
          `subsystemName:"audit"` queries, separation of audit trail from
          operational logs, independent retention possible. Rejected alternative:
          observability-minion recommended augmenting existing events with
          `audit: true` flag -- rejected because field-level filtering is less
          ergonomic than subsystem filtering, and mixing audit fields into
          operational events serves neither audience well.

       b. **Event naming convention**: `audit.<resource>.<action>` pattern
          extending the existing `subsystem.detail` taxonomy. Examples:
          `audit.capture.create`, `audit.capture.list`. Future key lifecycle:
          `audit.key.create`, `audit.key.revoke`.

       c. **Outcome enum**: Three values: `success`, `denied`, `error`. Not
          boolean. "denied" = system correctly rejected (auth fail, SSRF block);
          "error" = something broke after auth succeeded.

       d. **Audit events as supplements, not replacements**: Audit events are
          lean (common envelope only). Operational events (`capture.success`,
          `list.success`) remain for debugging with full detail.

       e. **keyId derivation pre-R12**: SHA-256 prefix (8 hex chars) of the
          single `CAPTURE_API_KEY`. Static value until R12 ships per-tenant keys.
          Documents the known limitation and why it is acceptable.

       f. **Key lifecycle event schema (R12 contract)**: Define the schemas
          for `audit.key.create` and `audit.key.revoke` events that R12 will
          emit from admin endpoints. Include field tables:

          **audit.key.create**:
          | Field | Type | Description |
          |-------|------|-------------|
          | event | string | `'audit.key.create'` |
          | tenantId | string | Tenant the key is for |
          | keyId | string | Fingerprint of new key (never key material) |
          | action | string | `'create'` |
          | resource | string | `'api_key'` |
          | resourceId | string | Same as keyId |
          | outcome | string | `'success'` or `'error'` |
          | scopes | string[] | Granted scopes |
          | cip | string | Hashed admin IP |

          **audit.key.revoke**:
          | Field | Type | Description |
          |-------|------|-------------|
          | event | string | `'audit.key.revoke'` |
          | tenantId | string | Tenant whose key is revoked |
          | keyId | string | Admin key fingerprint (who did this) |
          | action | string | `'revoke'` |
          | resource | string | `'api_key'` |
          | resourceId | string | Fingerprint of revoked key |
          | outcome | string | `'success'` or `'error'` |
          | cip | string | Hashed admin IP |

          Note: "Emitted by admin API (R12). Schema defined here for forward
          compatibility. Key material MUST NEVER appear in any log entry."

       g. **URL exclusion from audit events**: Audit events do not include the
          capture URL. The URL is attacker-controlled input and is already logged
          in the operational `capture.start` event. Audit events use `captureId`
          as the resource identifier; operators correlate to URL via KV or
          operational logs.

    4. Update `docs/evolution/README.md` -- add row:
       `| [0038-audit-logging](0038-audit-logging/) | Audit logging for authenticated API requests (Issue #43) |`

    ### What NOT to do

    - Do NOT create `outcome.md` yet -- that is written after execution.
    - Do NOT create a standalone `docs/audit-events.md`. The event catalog
      lives in the evolution log following the Phase 0015 pattern.
    - Do NOT create an ADR. This is a documentation format choice documented
      in decisions.md.

    ### Files to create
    - `docs/evolution/0038-audit-logging/prompt.md`
    - `docs/evolution/0038-audit-logging/decisions.md`

    ### Files to modify
    - `docs/evolution/README.md` -- add Phase 0038 row

    ### Reference
    - See `docs/evolution/0015-coralogix-logging/outcome.md` for the existing
      log event taxonomy table format.
    - See `docs/backlog.md` line with R13 for the backlog item.
- **Deliverables**: Evolution log directory with prompt.md and decisions.md; updated README.md index
- **Success criteria**: Phase 0038 directory exists with prompt.md and decisions.md; decisions.md covers subsystem choice, event schema, key lifecycle contract, and naming convention; README.md index updated

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test phase). Task 2 updates existing test call sites for the performCapture signature change. Phase 6 will add audit-specific assertions: verifying audit events are emitted with correct fields on authenticated requests, PII absence checks, and auth failure non-leakage.
- **Security**: Task 3 (security-minion updates INVARIANT). Security constraints are embedded in Task 2's prompt (no raw keys, no raw IPs, no URLs in audit events). Architecture review will include security-minion.
- **Usability -- Strategy**: ux-strategy-minion's three investigation scenarios (tenant activity, key tracing, error triage) drove the event schema design in Task 2. The flat field structure and three-value outcome enum come directly from their recommendations. Architecture review will include ux-strategy-minion.
- **Usability -- Design**: Not applicable -- no user-facing interfaces produced. Audit events are operator-facing structured logs.
- **Documentation**: Task 4 (software-docs-minion creates evolution log). Phase 8 will produce outcome.md with the shipped event taxonomy table.
- **Observability**: This feature IS the observability enhancement. The audit subsystem, event schema, and Coralogix query patterns were designed by the observability-minion and validated against ux-strategy-minion's investigation scenarios. No separate observability task needed.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - observability-minion: The feature is fundamentally an observability enhancement. Review should validate that the `audit` subsystem naming, event field structure, and Coralogix query patterns are sound from an operational perspective.
    Review focus: subsystem naming convention consistency, field cardinality for Coralogix indexing, query pattern validation
- **Not selected**:
  - ux-design-minion: No user-facing UI produced; audit events are operator-facing structured logs
  - accessibility-minion: No web-facing HTML/UI produced
  - sitespeed-minion: No web-facing runtime components; audit logging is fire-and-forget with negligible latency impact
  - user-docs-minion: No end-user documentation impact; audit logs are operator-only. Coralogix query examples will be in evolution log outcome.md (Phase 8)

### Decisions

- **Subsystem strategy: dedicated `audit` vs. flag on existing events**
  Chosen: Dedicated `audit` subsystem with lean events at handler boundaries
  Over: `audit: true` flag on existing events across current subsystems (observability-minion recommended this)
  Why: 4 of 6 specialists recommended dedicated subsystem. `subsystemName:"audit"` is a cleaner query primitive than `text.audit:true`. Dedicated subsystem enables independent Coralogix retention policies and keeps operational events uncluttered. The flag approach would require operators to use field-level filtering, which is less ergonomic. The trade-off is some information duplication (audit events alongside operational events), but each serves a distinct audience: audit for "who did what" investigations, operational for "what went wrong" debugging.

- **Audit event placement: handler boundary vs. router-level wrapper**
  Chosen: Per-handler audit log calls after auth + after action succeeds
  Over: Router-level middleware/wrapper that intercepts all authenticated routes
  Why: Only 2 of 9 routes require auth. A wrapper would be a no-op for 7 routes and adds indirection with zero coverage benefit. Two inline `log()` calls is KISS-compliant and matches the existing logging pattern.

- **Auth failure subsystem: `security` (not `audit`)**
  Chosen: Failed auth stays in `security` subsystem with `outcome: 'denied'` added
  Over: Moving auth failures to `audit` subsystem (or duplicating in both)
  Why: Failed auth has no tenant identity -- the audit trail answers "what did tenant X do?" and a failed auth has no X. The `security` subsystem answers "is someone attacking us?" Mixing them pollutes both query patterns. security-minion and ux-strategy-minion agree on this boundary.

- **No audit event builder abstraction**
  Chosen: Inline log() calls with literal objects
  Over: Shared `auditEvent()` builder function (test-minion suggested this)
  Why: Two audit events with slightly different fields (capture.create vs capture.list) do not warrant a shared builder. The project philosophy is "more code, less blah blah" and KISS. A builder adds indirection and a file to maintain for saving ~5 repeated characters. If the audit event count grows significantly with R12, a builder can be introduced then.

### Risks and Mitigations

1. **keyId is static pre-R12**: With the single `CAPTURE_API_KEY`, every request produces the same keyId. Audit logging answers "what happened" but not "who did it" until R12 ships per-tenant keys. **Mitigation**: Documented as known limitation in decisions.md. The schema is correct from day one; R12 populates it.

2. **ctx.waitUntil log delivery not guaranteed**: If the Worker isolate terminates before the Coralogix fetch completes, the audit event is lost. Same risk as all existing log calls. **Mitigation**: Acceptable for MVP. Evolution log documents this as a known gap. If audit completeness becomes a compliance requirement, R16 (queue migration) provides the fix.

3. **performCapture() signature change**: Adding `keyId` parameter changes the function signature. Existing test calls will need updating. **Mitigation**: Task 2 explicitly includes updating test call sites. The change is mechanical (add one parameter).

4. **INVARIANT tension with URL logging**: `capture.start` already logs the URL (attacker-controlled but validated). **Mitigation**: Task 3 explicitly updates the INVARIANT to acknowledge this exception. Audit events themselves do NOT include the URL.

5. **Log volume increase is negligible**: ~2 additional small JSON events per authenticated request. At current scale (single-digit captures/day), this adds <1KB/day to Coralogix ingestion.

### Execution Order

```
Batch 1 (parallel):
  Task 1: Extend verifyApiKey() with keyId  [debugger-minion]
  Task 4: Evolution log documentation        [software-docs-minion]

  --- Task 1 completes ---

Batch 2:
  Task 2: Add audit events + thread keyId   [debugger-minion]
  [APPROVAL GATE: audit event schema]

  --- Task 2 approved ---

Batch 3:
  Task 3: Update log.js INVARIANT           [security-minion]

  --- All tasks complete ---

Phase 5: Code review (code-review-minion, lucy, margo)
Phase 6: Test execution + audit-specific test additions
Phase 8: Documentation (outcome.md with event taxonomy table, backlog update)
```

### External Skills

No external skills detected in project.

### Verification Steps

1. Run full test suite (`npx vitest run`) -- all existing tests pass with the performCapture() signature change.
2. Verify `verifyApiKey()` returns `keyId` field on success, does not return it on failure.
3. Verify `src/index.js` emits audit events with subsystem `'audit'` on successful capture and list requests.
4. Verify `src/index.js` includes `outcome: 'denied'` on existing auth failure and SSRF block log calls.
5. Verify `src/capture.js` includes `keyId` in `capture.start`, `capture.success`, `capture.partial`, and `capture.fail` log calls.
6. Verify `src/log.js` INVARIANT comment documents URL exception and subsystem registry.
7. Verify `docs/evolution/0038-audit-logging/` exists with prompt.md and decisions.md.
8. After staging deploy: query Coralogix for `subsystemName:"audit"` and verify events arrive with correct field structure.
