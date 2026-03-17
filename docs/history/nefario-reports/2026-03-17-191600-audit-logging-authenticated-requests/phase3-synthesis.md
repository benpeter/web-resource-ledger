## Delegation Plan

**Team name**: audit-trail
**Description**: Add structured audit logging to all authenticated API requests and key lifecycle events, enriching existing log calls with consistent tenant context fields for Coralogix-based compliance querying.

### Task 1: Return keyHashPrefix from verifyApiKey success path and pass cip to admin handlers
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: none
- **Approval gate**: yes
- **Gate reason**: Changes the auth result contract (verifyApiKey return type) and admin handler signatures -- both are internal interfaces with many downstream consumers. The gate also covers the `list.*` to `capture.list*` rename which is a breaking change for existing Coralogix queries.
- **Gate rationale**: |
    Chosen: Enrich existing log calls with consistent audit fields (no new subsystem, no new audit module)
    Over: (1) Separate `audit` subsystem with parallel log events; (2) `src/audit.js` module with builder functions per event type
    Why: Specialists unanimously agreed that enriching existing events is simpler and avoids operators needing to query two places. A separate audit.js module adds indirection for what is essentially adding 3-4 fields to existing log() calls -- violates KISS/YAGNI for this scope.
- **Prompt**: |
    ## Task: Audit field plumbing -- auth contract and admin handler signatures

    You are modifying the Web Resource Ledger worker to support audit logging.
    This task handles the plumbing changes that other audit logging work depends on.

    ### What to do

    **1. Add `keyHashPrefix` to `verifyApiKey()` success return** (`src/auth.js`)

    The success path (line ~199-205) currently returns `{ ok: true, tenantId, scopes, keyName, authMethod }`.
    Add `keyHashPrefix: sha256hex.slice(0, 8)` to this object. The `sha256hex` variable
    is already computed on line 144. This is an additive change -- existing destructuring
    callers will ignore the new field.

    Also update the JSDoc return type (line 122-123) to include `keyHashPrefix: string`.
    Also update the header comment (line 5) to include `keyHashPrefix` in the success return.

    **2. Compute `cip` once in the admin auth block and pass to admin handlers** (`src/index.js`)

    Currently in `src/index.js` lines 77-96, `cip` is computed twice (line 82 for rate limit,
    line 92 for auth fail) and scoped inside conditional blocks. The admin handlers never
    receive `cip`.

    Fix: compute `cip` once at the top of the `if (isAdminRoute)` block (line 77), before
    the rate limit check. Then pass `cip` as the 5th argument to admin handlers.

    Change the handler invocations on lines 29-31 (routes array) -- admin routes cannot use
    the routes array pattern because they need the extra `cip` parameter. Instead, after the
    admin auth check succeeds, dispatch to the admin handler directly (the routes array already
    dispatches admin routes through this code path). Pass `cip` as the 5th parameter:
    `handleAdminCreateKey(request, env, ctx, match, cip)` etc.

    Actually, looking at the code flow more carefully: admin routes ARE dispatched through the
    routes array (lines 29-31), but the admin auth check happens BEFORE the route dispatch
    (lines 88-96). The handler is then called via `response = await handler(request, env, ctx, match)`
    on line 105. The simplest approach: pass `cip` via a property on the request object or
    compute it inside each admin handler. But the cleanest approach matching the codebase style:
    move `cip` into a variable scoped to the admin block, then when the route matches an admin
    handler, pass it as a 5th arg. This requires changing the route dispatch for admin routes only.

    Simplest approach that avoids changing the route dispatch pattern: compute `cip` in each
    admin handler independently. All three admin handlers already receive `request` which has
    `CF-Connecting-IP`. Add `const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';`
    and `const cip = await computeCip(env, clientIp);` at the top of each admin handler. This
    matches the pattern used in `handleCreateCapture` and `handleListCaptures`. Import
    `computeCip` in `src/admin.js`.

    **3. Rename `list.*` events to `capture.list*`** (`src/index.js`)

    In `handleListCaptures`:
    - Line 316: change `log(env, 5, 'list', { event: 'list.error', ...` to
      `log(env, 5, 'capture', { event: 'capture.list_fail', ...`
    - Line 345: change `log(env, 6, 'list', { event: 'list.success', ...` to
      `log(env, 6, 'capture', { event: 'capture.list', ...`

    This aligns with the operator mental model: listing captures is a capture-domain action.
    The project is early enough that this breaking change to Coralogix queries is acceptable.

    ### What NOT to do
    - Do NOT add audit fields to log calls yet (Task 2 does that)
    - Do NOT create a new `src/audit.js` module
    - Do NOT change the log() function signature
    - Do NOT add any new log() calls -- only modify existing ones for the rename
    - Do NOT change the `verifyAdminKey()` return type (admin has no tenant context)

    ### Files to modify
    - `src/auth.js` -- add keyHashPrefix to success return, update JSDoc and header comment
    - `src/admin.js` -- add computeCip import, compute cip in each handler
    - `src/index.js` -- rename list.* events to capture.list*, fix cip scoping in admin block

    ### Success criteria
    - `verifyApiKey()` success return includes `keyHashPrefix` (8-char hex string)
    - All three admin handlers have access to `cip`
    - `list.success` renamed to `capture.list`, `list.error` renamed to `capture.list_fail`
    - All existing tests pass (run `npx vitest run`)
    - No changes to the log() function itself

- **Deliverables**: Modified `src/auth.js`, `src/admin.js`, `src/index.js` with plumbing changes
- **Success criteria**: `npx vitest run` passes; verifyApiKey success includes keyHashPrefix; admin handlers compute cip; list events renamed

### Task 2: Enrich all authenticated request log calls with audit fields
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 1
- **Approval gate**: no
- **Prompt**: |
    ## Task: Add audit envelope fields to all authenticated request log calls

    You are enriching existing log() calls across the WRL worker with consistent
    audit fields. Task 1 has already completed the plumbing (keyHashPrefix in auth
    success return, cip available in admin handlers, list.* renamed to capture.list*).

    ### Context: The audit envelope

    Every log entry for an authenticated request must include these fields in the
    `data` payload (where available):

    | Field | Source | Notes |
    |-------|--------|-------|
    | `tenantId` | auth result or request body | Always present; null for pre-auth failures |
    | `keyName` | auth result | null for legacy auth or pre-auth failures |
    | `keyHashPrefix` | auth result (now available on success) | 8-char hex; null for admin-key auth |
    | `authMethod` | auth result | 'kv', 'legacy', or 'admin_key' |
    | `cip` | computeCip() | Always present on request-handling events |
    | `responseStatus` | handler | HTTP status code being returned |

    ### What to do

    Add the missing audit fields to each log call. Work through each file systematically:

    **`src/index.js` -- handleCreateCapture:**
    - `capture.queued` (line ~233): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 202`
    - `capture.kv_create_fail` (line ~220): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 500`
    - `security.auth_fail` on capture path (line ~167): ADD `keyHashPrefix: auth.keyHashPrefix` (from auth failure result, already available as `auth.keyHashPrefix`), ADD `responseStatus: auth.response.status`. Note: auth failure results already include keyHashPrefix on some paths. Use `auth.keyHashPrefix || null` to handle paths where it's absent.
    - `security.rate_limit` (line ~176): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 429`
    - `security.capacity_limit` (line ~185): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 503`
    - `security.ssrf_block` (line ~209): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: result.status`

    **`src/index.js` -- handleListCaptures:**
    - `capture.list` (was list.success, line ~345): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 200`
    - `capture.list_fail` (was list.error, line ~316): ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 500`
    - `security.auth_fail` on list path (line ~264): ADD `keyHashPrefix: auth.keyHashPrefix || null, responseStatus: auth.response.status`
    - Rate limit events in list path: ADD `keyHashPrefix: auth.keyHashPrefix, responseStatus: 429` (or 503 for capacity)

    **`src/index.js` -- admin auth block:**
    - `security.auth_fail` for admin (line ~93): ADD `responseStatus: auth.response.status`
      Note: admin auth failures have no keyHashPrefix, keyName, or tenantId. This is correct.
    - `security.rate_limit` for admin (line ~83): ADD `responseStatus: 429`

    **`src/admin.js` -- handleAdminCreateKey:**
    - `admin.key_create` (line ~127): ADD `authMethod: 'admin_key', responseStatus: 201, cip`
    - `admin.key_create_fail` (line ~122): ADD `authMethod: 'admin_key', responseStatus: 500, cip`

    **`src/admin.js` -- handleAdminListKeys:**
    - `admin.key_list` (line ~173): ADD `authMethod: 'admin_key', responseStatus: 200, cip`
    - CHANGE severity from 6 to 3 (admin key listing is an audit-relevant action)

    **`src/admin.js` -- handleAdminRevokeKey:**
    - `admin.key_revoke` success (line ~251): ADD `keyName: result.record.name, scopes: result.record.scopes, authMethod: 'admin_key', responseStatus: 200, cip`
    - `admin.key_revoke` idempotent (line ~209): ADD `keyName: record.name, scopes: record.scopes, authMethod: 'admin_key', responseStatus: 200, cip`
    - `admin.key_revoke_fail` (line ~199): ADD `tenantId: null, authMethod: 'admin_key', responseStatus: 404, cip`
      Note: key_revoke_fail has no tenantId because the key wasn't found. Use explicit null.
    - `admin.key_revoke_blocked` (line ~235): ADD `keyName: record.name, authMethod: 'admin_key', responseStatus: 409, cip`

    ### INVARIANT safety notes

    All fields being added are safe per the log() INVARIANT:
    - `tenantId`: validated by TENANT_ID_RE at creation and auth time
    - `keyName`: validated by NAME_RE at creation time (safe charset, bounded length)
    - `keyHashPrefix`: SHA-256 derivative, fixed-length hex
    - `authMethod`: hardcoded enum string
    - `cip`: HMAC-derived, fixed-length hex
    - `responseStatus`: integer, handler-controlled
    - `scopes`: validated against VALID_SCOPES at creation time

    Never pass the raw `auth` object to log(). Always destructure and pick specific fields.

    ### What NOT to do
    - Do NOT create new log() calls -- only enrich existing ones
    - Do NOT change event names (Task 1 already renamed list events)
    - Do NOT change the log() function itself
    - Do NOT add an `action` or `resource` field (deferred -- event names provide sufficient queryability)
    - Do NOT add a separate `audit: true` marker field
    - Do NOT create an auditFields() helper function -- the number of log calls is small enough that inline field addition is clearer and more KISS-compliant

    ### Files to modify
    - `src/index.js` -- enrich all log calls in handleCreateCapture, handleListCaptures, and admin auth block
    - `src/admin.js` -- enrich all log calls in admin handlers, promote admin.key_list to severity 3

    ### Success criteria
    - Every log() call for an authenticated request includes tenantId, keyName (or null), keyHashPrefix (or null), authMethod, cip, and responseStatus
    - admin.key_list severity is 3 (info), not 6 (verbose)
    - `npx vitest run` passes
    - No raw auth objects passed to log()

- **Deliverables**: Modified `src/index.js` and `src/admin.js` with enriched audit fields on all log calls
- **Success criteria**: All authenticated request log calls include the audit envelope fields; tests pass

### Task 3: Update log() INVARIANT comment and add never-log documentation
- **Agent**: debugger-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Update log() INVARIANT comment and document never-log fields

    After audit fields have been added to all log calls, update the safety documentation
    in the codebase.

    ### What to do

    **1. Update the INVARIANT comment in `src/log.js`** (lines 9-15)

    Add two sentences to the existing INVARIANT comment:

    After "Callers are responsible for ensuring this contract." add:
    - "Validated and re-serialized URLs (post-validateUrl) are acceptable as they
      are scheme-restricted and constructor-normalized."
    - "Fields validated at creation time against restrictive regexes (tenantId via
      TENANT_ID_RE, keyName via NAME_RE) are acceptable as their character sets
      are bounded and injection-safe."

    **2. Add a NEVER-LOG comment block in `src/log.js`**

    After the INVARIANT comment block (after line 15), before the function, add:

    ```
     * NEVER LOG: raw API keys (tokens), raw ADMIN_KEY, raw IP addresses
     * (use computeCip), Authorization header values, full keyHash (use
     * keyHashPrefix: hash.slice(0, 8)), request/response objects, or
     * unvalidated request body content. Always destructure and pick
     * specific fields -- never pass auth result objects directly.
    ```

    This is inside the existing JSDoc block.

    **3. Add INVARIANT-safe annotation in `src/admin.js`**

    At the top of admin.js, after the security invariants comment (line ~15), add:
    ```
     *   - keyName is INVARIANT-safe: validated by NAME_RE at key creation.
    ```

    ### What NOT to do
    - Do NOT change any log() calls
    - Do NOT change the log() function implementation
    - Do NOT create new files

    ### Files to modify
    - `src/log.js` -- expand INVARIANT comment, add NEVER-LOG documentation
    - `src/admin.js` -- add keyName INVARIANT-safe annotation

    ### Success criteria
    - The INVARIANT comment covers validated URLs and regex-validated fields
    - The NEVER-LOG list is documented in the log() JSDoc
    - `npx vitest run` passes

- **Deliverables**: Updated documentation comments in `src/log.js` and `src/admin.js`
- **Success criteria**: Safety documentation is comprehensive; tests pass

### Task 4: Write audit log schema reference and evolution log
- **Agent**: software-docs-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: default
- **Blocked by**: Task 2
- **Approval gate**: no
- **Prompt**: |
    ## Task: Create audit log schema reference and evolution log entries

    Write the operator-facing audit log schema documentation and the required
    evolution log entries for this phase.

    ### What to do

    **1. Create `docs/evolution/0039-audit-logging/prompt.md`**

    Write the task briefing. Content:
    - Outcome: full audit trail of authenticated API activity
    - Success criteria from the original task
    - Scope (in/out)
    - Dependency on R12

    **2. Create `docs/evolution/0039-audit-logging/decisions.md`**

    Document these key decisions:

    a) **Enrich existing events vs. separate audit subsystem**: Chose enriching existing
       events. Rejected creating a parallel `audit` subsystem because operators would
       need to query two places for the same information. The existing subsystem structure
       (capture, security, admin) maps to operator mental models.

    b) **No src/audit.js extraction**: Chose inline field addition over extracting audit
       event construction into a module. The number of log calls is small (~15) and each
       has slightly different context. A builder module adds indirection for marginal
       deduplication benefit. KISS/YAGNI applies.

    c) **Rename list.* to capture.list***: The `list` subsystem was inconsistent with the
       operator mental model. Operators searching `event:capture.*` would miss list events.
       Breaking change accepted because the project is pre-GA.

    d) **admin.key_list severity 6 to 3**: Elevated to ensure admin key listing appears in
       the audit trail. Severity 6 events may be filtered by Coralogix TCO policies.

    e) **keyHashPrefix (8 chars) is safe to log**: SHA-256 prefix provides 2^32 uniqueness
       for correlation without enabling key recovery. Already logged on failure paths.

    f) **No admin caller identity beyond cip**: The current single ADMIN_KEY model cannot
       distinguish operators. Adding identity infrastructure is premature until per-operator
       admin keys exist. cip provides IP correlation for abuse investigation.

    g) **No separate security.auth_success event**: Downstream events (capture.queued,
       capture.list) already serve as proof of successful auth. A separate event would
       double log volume for zero additional queryability.

    h) **Deferred `action` and `resource` fields**: Event names + subsystemName provide
       sufficient query discrimination. Adding explicit action/resource fields is schema
       expansion for marginal queryability gain.

    **3. Create `docs/audit-log-schema.md`**

    This is the operator reference. Structure:

    a) **Purpose** (1 paragraph): Who this is for (operators investigating tenant activity
       via Coralogix), what it covers.

    b) **Event taxonomy table**: ALL events (not just audit-new ones), one row per event.
       Columns: Event name, Subsystem, Severity, Description, Audit fields present.

       Include all events from the codebase:
       - capture.queued, capture.start, capture.success, capture.partial, capture.fail
       - capture.list (renamed from list.success), capture.list_fail (renamed from list.error)
       - capture.stage.fail, capture.kv_create_fail, capture.kv_fail, capture.header_fail,
         capture.wacz_fail, capture.key_archive_fail, capture.consent_error
       - admin.key_create, admin.key_create_fail, admin.key_list, admin.key_revoke,
         admin.key_revoke_fail, admin.key_revoke_blocked
       - security.auth_fail, security.rate_limit, security.capacity_limit, security.ssrf_block,
         security.legacy_auth_used
       - signing.key_unavailable

    c) **Field dictionary**: Each audit field with type, description, which events include it.
       Fields: event, tenantId, keyName, keyHashPrefix, authMethod, cip, responseStatus,
       captureId, url, scopes, durationMs, errorMessage, reason, idempotent, count, etc.

    d) **Severity mapping table**: Map Coralogix severity numbers to WRL meanings.
       3=info (successful operations, audit trail), 4=warning (rate limits, degraded paths),
       5=error (failures, auth rejections), 6=verbose (operational data, non-audit).

    e) **Example Coralogix queries** (6 queries):
       - All actions by tenant X in last 24h
       - Key provisioning and revocation events for tenant Y
       - All failed auth attempts (abuse investigation)
       - All captures by a specific key
       - All 4xx/5xx responses for a tenant
       - All admin operations in last 7 days

    f) **Operator journey**: Brief note explaining the filter-then-scan-then-drill pattern.
       When querying by tenantId, results include both "what tenant did" (captures, lists)
       and "what was done to tenant" (key create, revoke).

    **4. Update `docs/evolution/README.md`**

    Add row:
    ```
    | [0039-audit-logging](0039-audit-logging/) | Audit logging for authenticated requests -- full tenant activity trail |
    ```

    **5. Add cross-reference to OPERATIONS.md**

    Find the monitoring-related section and add:
    ```
    **Audit log schema:** See [docs/audit-log-schema.md](docs/audit-log-schema.md) for event names, fields, and Coralogix queries.
    ```

    **6. Update `docs/backlog.md`**

    - Change `#43 **R13: Audit logging** [S]` line to struck-through DONE format:
      `~~#43 **R13: Audit logging** [S]~~ -- DONE: structured audit fields on all authenticated request and admin key lifecycle events`

    ### What NOT to do
    - Do NOT write outcome.md yet (written after PR creation)
    - Do NOT modify source code files
    - Do NOT document fields that were not implemented (action, resource, audit boolean)
    - Do NOT create a separate "audit events only" reference -- this doc covers ALL events

    ### Files to create
    - `docs/evolution/0039-audit-logging/prompt.md`
    - `docs/evolution/0039-audit-logging/decisions.md`
    - `docs/audit-log-schema.md`

    ### Files to modify
    - `docs/evolution/README.md`
    - `docs/backlog.md`
    - OPERATIONS.md (add cross-reference)

    ### Success criteria
    - docs/audit-log-schema.md covers ALL events in the codebase with consistent field documentation
    - Evolution log directory exists with prompt.md and decisions.md
    - Backlog updated with R13 DONE
    - README.md index includes 0039 entry

- **Deliverables**: `docs/audit-log-schema.md`, evolution log entries, updated backlog and OPERATIONS.md
- **Success criteria**: Operator can find event names, field definitions, and copy-pasteable Coralogix queries in one document

### Cross-Cutting Coverage

- **Testing**: Covered by Phase 6 (post-execution test run). No dedicated test task because: (1) the changes are field additions to existing log() calls, not new code paths; (2) the project has no existing pattern of asserting on log payloads from handler tests; (3) introducing log payload assertions would require adding CORALOGIX_ENDPOINT to test config and handling fetchMock contention -- this is test infrastructure work that exceeds the scope of this feature. The auth contract change (keyHashPrefix in success return) will be validated by existing auth tests continuing to pass. If tests need updating for the new field, the executing agent handles that inline.
- **Security**: security-minion contributed to planning. All recommendations are incorporated: never-log field list documented (Task 3), keyHashPrefix 8-char prefix confirmed safe, INVARIANT compliance verified for all audit fields, destructured field picking enforced via documentation. No runtime security changes needed.
- **Usability -- Strategy**: ux-strategy-minion contributed to planning. Recommendations incorporated: list.* renamed to capture.list* (Task 1), mandatory field normalization across events (Task 2), admin.key_list severity elevated (Task 2), operator query patterns documented (Task 4).
- **Usability -- Design**: Not applicable. No user-facing interfaces produced.
- **Documentation**: software-docs-minion contributed to planning. Task 4 produces the audit log schema reference, evolution log, and backlog update.
- **Observability**: observability-minion contributed to planning as primary specialist. All audit field recommendations incorporated into Tasks 1-2. Coralogix query patterns documented in Task 4.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None. This plan modifies internal logging fields and documentation only. No UI, no new runtime components, no web-facing changes, no multi-service coordination.
- **Not selected**:
  - ux-design-minion: No user-facing interfaces produced
  - accessibility-minion: No web-facing HTML/UI produced
  - sitespeed-minion: No web-facing runtime code changes (log enrichment is fire-and-forget, no latency impact)
  - observability-minion: Already contributed to planning; no additional cross-service coordination to review (single worker, existing log infrastructure)
  - user-docs-minion: No end-user-facing documentation changes; audit log schema is operator-facing (covered by software-docs-minion in Task 4)

### Decisions

- **Enrich existing events vs. separate audit subsystem**
  Chosen: Add audit fields to existing log() calls within existing subsystems (capture, admin, security)
  Over: Creating a parallel `audit` subsystem with dedicated event names (proposed by security-minion as an option, explicitly rejected by ux-strategy-minion and observability-minion)
  Why: Operators would need to query two places for the same information. The existing subsystem structure maps to operator mental models. Single-event-per-action is simpler to reason about.

- **No src/audit.js builder module**
  Chosen: Inline field addition to each log() call
  Over: Extracting audit event construction into `src/audit.js` with builder functions per event type (proposed by test-minion)
  Why: ~15 log calls with slightly different context each. A builder module adds indirection and a new file for what amounts to adding 3-4 fields to existing calls. KISS/YAGNI -- the project philosophy explicitly says "don't build it until you need it." If field drift becomes a problem later, extraction is a safe refactor.

- **Rename list.* to capture.list***
  Chosen: Breaking rename now
  Over: Keeping `list.*` for backward compatibility or dual-emitting both names during transition (considered by ux-strategy-minion)
  Why: Project is pre-GA with no external consumers of Coralogix queries. Clean break is cheaper than transition period complexity. The operator (Ben) can update any saved Coralogix queries in the same session.

- **cip computation in admin handlers**
  Chosen: Compute cip independently in each admin handler (import computeCip in admin.js)
  Over: (a) Pass cip from index.js admin block as 5th parameter (proposed by observability-minion); (b) Compute once in index.js and attach to request context
  Why: Computing in each handler matches the existing pattern in handleCreateCapture and handleListCaptures. No signature changes to the route dispatch system. Minor redundancy (3 handlers each compute cip) is acceptable at admin rate limits (5 req/60s).

### Risks and Mitigations

1. **Auth result contract change** (LOW): Adding `keyHashPrefix` to verifyApiKey success return is additive. Existing destructuring ignores new fields. Tests asserting exact object shape will need updating -- the executing agent handles this. Mitigated by running full test suite after Task 1.

2. **list.* rename breaks existing Coralogix queries** (LOW): The project has no automated Coralogix alerts on `list.success`. Ben may have saved queries. Mitigated by documenting the rename in decisions.md and the PR description. The audit-log-schema.md provides the new canonical event names.

3. **Log volume increase** (NEGLIGIBLE): Adding 3-4 fields (~50-80 bytes) per log entry to existing calls. No new log calls added. At current traffic levels, cost impact is immaterial.

4. **Schema doc drift** (LOW): docs/audit-log-schema.md written after implementation (Task 4 blocked by Task 2). Mitigated by sequencing. Future drift is a general documentation maintenance concern, not specific to this feature.

5. **Fire-and-forget audit delivery** (ACCEPTED, OUT OF SCOPE): log() is fire-and-forget. Audit events can be silently dropped if Coralogix is unavailable. Task scope explicitly excludes log retention policies. Known gap, documented.

### Execution Order

```
Batch 1 (sequential):
  Task 1: Auth contract + admin cip + list rename  [APPROVAL GATE]

Batch 2 (after gate approval):
  Task 2: Enrich all log calls with audit fields

Batch 3 (parallel, after Task 2):
  Task 3: Update INVARIANT and never-log documentation
  Task 4: Audit log schema reference + evolution log + backlog

Post-execution phases: 5 (code review), 6 (test run), 8 (documentation assessment)
```

### Verification Steps

1. **Field completeness**: After all tasks, grep for `log(env,` in `src/index.js` and `src/admin.js`. Every call on an authenticated request path must include `tenantId`, `authMethod`, `cip`, and `responseStatus` in its data object.
2. **No forbidden fields**: Grep for `keyHash[^P]` (full keyHash without "Prefix"), `token`, `rawKey`, `Authorization` in log() data payloads. Zero matches expected.
3. **Test suite**: `npx vitest run` passes with zero failures.
4. **Event name consistency**: No remaining references to `list.success` or `list.error` in source files.
5. **Documentation**: `docs/audit-log-schema.md` exists and covers all events found by grepping `event:` in source.
