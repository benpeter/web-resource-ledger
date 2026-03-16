# Decisions: TSA Error Logging

## 1. Severity level: warn (4) instead of error (5)

**Decision**: Use severity 4 (warn) for the `capture.tsa_fail` event.

**Rationale**: TSA failure is a degraded-but-functional state -- the capture completes
without a timestamp. Severity 5 is reserved for events where the capture itself fails
(capture.stage.fail, capture.fail). Severity 4 matches the pattern of other degraded
events: `capture.header_fail`, `capture.wacz_fail`, `capture.key_archive_fail`.

**Alternative considered**: Severity 5 (error). Rejected because it would trigger
error-level alerts for a non-fatal degradation.

## 2. No classifyTsaError() helper

**Decision**: Log the raw error name and truncated message directly, following the
existing pattern from capture.js:119.

**Rationale**: observability-minion recommended a classifyTsaError() function that maps
error messages to a bounded enum. This was rejected as YAGNI. The error messages from
rfc3161.js are framework-generated (DER parsing, HTTP status, validation failures) and
contain only static strings and numeric values -- no attacker-controlled input. The
log.js INVARIANT explicitly allows "truncated framework error messages when the framework
does not echo user-supplied content." TSA responses are binary DER; no user-supplied
strings flow through.

**Alternative considered**: classifyTsaError() enum mapping. Would add a new function
and maintenance burden for no safety benefit in this context.

## 3. No function signature change for logging context

**Decision**: Log from within buildWacz() with available context (tsaUrl, error details).
Don't pass captureId/tenantId into buildWacz.

**Rationale**: observability-minion recommended adding a `logCtx` parameter to pass
captureId/tenantId into buildWacz(). Rejected as over-engineering. The `capture.success`
log event in capture.js already includes captureId, tenantId, cip, and the timestampStatus
field. Operators can correlate `capture.tsa_fail` (which TSA endpoint, what error) with
`capture.success` (which capture, what tenant) using Coralogix's log correlation.

## 4. Three-way timestampStatus: present/absent/error

**Decision**: Add `timestampStatus: 'error'` to distinguish TSA call failures from
TSA not being configured.

**Rationale**: CLAUDE.md requires: "When a feature degrades, the system must distinguish
'service unavailable' from 'misconfigured'. Use distinct status values so operators can
tell the difference." Previously both states returned 'absent', making it impossible to
distinguish "TSA not configured" from "TSA call failed" in the capture.success log.

## 5. Test strategy: 3 focused tests, no log assertions

**Decision**: Add 3 tests to the graceful degradation describe block:
1. `timestampStatus: 'absent'` when no TSA_URL in env
2. `timestampStatus: 'error'` when TSA returns HTTP 500
3. `timestampStatus: 'error'` when TSA is unreachable

Don't assert on log() calls since log() is a no-op in the test environment (no
CORALOGIX_SEND_KEY).

**Key finding from review**: The vitest config at vitest.config.js:28 sets
`TSA_URL: 'https://timestamp.sectigo.com'` in the test environment. The 'absent' test
must explicitly construct an env without TSA_URL (e.g., `{ SIGNING_KEY: env.SIGNING_KEY }`)
to avoid the TSA fetch being attempted and erroring due to fetchMock.disableNetConnect().
