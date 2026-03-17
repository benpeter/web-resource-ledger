# Lucy Review: Audit Logging for Authenticated Requests

## Verdict: ADVISE

The plan is well-aligned with the original request (Issue #43) and CLAUDE.md conventions. Scope is contained, complexity is proportional, and the evolution log requirements are addressed. Five specific concerns follow.

---

### Findings

1. **[CONVENTION] performCapture() signature change inserts keyId before the default-valued renderer parameter**
   SCOPE: `src/capture.js` -- `performCapture()` function signature
   CHANGE: The plan proposes `performCapture(env, url, ip, captureId, tenantId, cip, keyId, renderer = defaultRenderer)`. This inserts `keyId` between `cip` and the default-valued `renderer` parameter. All existing test calls use the pattern `performCapture(env, url, ip, captureId, tenantId, undefined, stubRenderer)` -- they pass `undefined` for `cip` and the renderer as the 7th positional argument. After the change, that 7th argument would become `keyId`, not `renderer`, silently breaking every test that passes a custom renderer. The plan's Task 2 says to update test call sites by "adding `null` or `'test-key-id'` after `cip`", but there are 60+ call sites across `test/capture.test.js`, `test/wacz.test.js`, `test/verify-integration.test.js`, `test/verify-html.test.js`, and `test/integration/capture-pipeline.test.js`. The plan's Task 2 prompt does not enumerate all affected test files -- it mentions only `test/capture.test.js`.
   WHY: Silent argument-position breakage across 60+ call sites in 5+ test files is a high-risk mechanical change. If the implementer only updates `test/capture.test.js` (the only file named in the prompt), the remaining tests will pass renderer functions as the `keyId` parameter and use `defaultRenderer` instead of their stubs, producing false-passing or false-failing tests. Task 2's prompt must list all affected test files explicitly.
   TASK: 2

2. **[CONVENTION] Existing event naming taxonomy uses `subsystem.detail`, not `subsystem.resource.action`**
   SCOPE: Audit event naming convention in `src/index.js`
   CHANGE: The plan introduces events named `audit.capture.create` and `audit.capture.list` -- a three-segment `subsystem.resource.action` pattern. Every existing event in the codebase uses a two-segment `subsystem.detail` pattern: `capture.start`, `capture.success`, `capture.fail`, `capture.partial`, `security.auth_fail`, `security.ssrf_block`, `security.rate_limit`, `list.success`, `list.error`, `signing.key_unavailable`. The three-segment pattern is a naming convention departure.
   WHY: This is not necessarily wrong -- the plan's decisions.md explicitly calls this out and offers a rationale (extending the taxonomy for a new subsystem). But the Task 4 prompt for `decisions.md` should acknowledge this is a convention extension, not a continuation. If future events adopt both two-segment and three-segment patterns without clear guidance, the taxonomy fragments. The subsystem registry in Task 3 should also document which naming pattern each subsystem uses.
   TASK: 3, 4

3. **[SCOPE] Key lifecycle event schemas (audit.key.create, audit.key.revoke) are out-of-scope documentation**
   SCOPE: `docs/evolution/0038-audit-logging/decisions.md` -- key lifecycle schema tables
   CHANGE: Task 4 defines full field-level schemas for `audit.key.create` and `audit.key.revoke` events, including fields like `scopes` (a string array) that do not exist in the current codebase. These events will be emitted by admin endpoints that do not exist yet (R12). The original prompt's scope says "In: Structured log entries on every authenticated request, key lifecycle events." However, R12 does not exist, and defining schemas with fields that depend on R12's design decisions (e.g., `scopes`, admin key fingerprinting, separate `keyId` for "who did this" vs "what was revoked") risks pre-committing R12's API design based on audit logging needs rather than letting R12 drive its own schema.
   WHY: YAGNI. The key lifecycle schemas cannot be validated or tested until R12 ships. If R12's admin API design differs from these assumptions, the documented schemas become stale. Documenting that key lifecycle events are planned and their general shape is useful; specifying exact field tables with type definitions for an endpoint that does not exist creates a maintenance burden with no current consumer. Consider reducing to a paragraph noting the intended event names and the constraint that key material must never appear, deferring field-level schema to R12's phase.
   TASK: 4

4. **[DRIFT] `list.success` severity level inconsistency -- plan omits audit event for successful list**
   SCOPE: `src/index.js` -- `handleListCaptures()` audit event placement
   CHANGE: The plan places the audit event for list "right before the `return jsonResponse(...)` at the end" using `ctx.waitUntil`. The existing `list.success` log call at line 299 uses severity 6 (a non-standard Coralogix severity -- typically 1-5; 6 is 'verbose'/'debug'). The audit event uses severity 3 (info). This is correct but worth noting: the audit event will be more visible in Coralogix than the operational list.success event. No action needed, just awareness.
   WHY: Informational only -- no change required. The severity difference is intentional (audit events are compliance-relevant; operational list.success is debug-level).
   TASK: 2

5. **[CONVENTION] Integration test calls to performCapture() omit cip and renderer parameters**
   SCOPE: `test/integration/capture-pipeline.test.js` -- `performCapture()` calls at lines 80, 90, 114, 143, 168, 197, 212, 238, 248
   CHANGE: Integration tests call `performCapture(env, url, ip, captureId, 'default')` with only 5 arguments (no `cip`, no `renderer`). After the signature change, these calls will still work because `cip`, `keyId`, and `renderer` all become `undefined` by positional default. However, this means `keyId` will be `undefined` in the capture pipeline's log calls during integration tests. This is acceptable behavior but Task 2's prompt should note that integration tests do not need updating (they use `defaultRenderer` and don't pass `cip` either).
   WHY: Risk is low since integration tests exercise the real browser path and the `keyId` parameter is purely for logging enrichment. But the task prompt should explicitly acknowledge that integration tests are unaffected rather than leaving the implementer to discover this.
   TASK: 2

---

### Traceability Check

| Requirement (from prompt.md) | Plan Coverage |
|------------------------------|---------------|
| All authenticated API requests logged with tenant context (tenantId, keyId, action, resource) | Task 2: audit events on capture create and list handlers |
| Key provisioning and revocation events logged | Task 4: schema documented in decisions.md (implementation deferred to R12) |
| Log entries integrate with existing Coralogix structured logging | Task 2: uses existing `log()` helper with new `audit` subsystem |
| Audit trail queryable by tenant and time range in Coralogix | Task 2: flat fields with `tenantId`, `keyId`, subsystem-level filtering |
| Scope-out: audit log export API | Not in plan (correct) |
| Scope-out: compliance report generation | Not in plan (correct) |
| Scope-out: log retention policies | Not in plan (correct) |

All stated requirements are covered. No orphaned tasks detected -- every task traces to a stated requirement or a CLAUDE.md-mandated deliverable (evolution log, INVARIANT update).

### CLAUDE.md Compliance

- **Evolution log**: Task 4 creates the required `0038-audit-logging/` directory with `prompt.md` and `decisions.md`. The plan correctly defers `outcome.md` to Phase 8 (post-execution). Index update included.
- **YAGNI**: Mostly compliant. Finding #3 flags the key lifecycle schemas as borderline pre-optimization.
- **KISS**: Two inline log calls, no abstraction layer, no new files. Compliant.
- **Fail loudly**: Audit log delivery via `ctx.waitUntil` is fire-and-forget (same as all existing log calls). The plan documents this as a known risk. Consistent with existing practice.
- **Backlog update**: Not explicitly mentioned in any task prompt. CLAUDE.md requires: "Update `docs/backlog.md` after every phase. Record what changed in a 'Backlog changes' section of `outcome.md`." The Phase 8 wrap-up should handle this but it is worth confirming.
