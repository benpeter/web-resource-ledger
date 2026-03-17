## Domain Plan Contribution: test-minion

### Analysis of Current State

The existing test suite has strong patterns worth preserving and extending:

1. **`test/log.test.js`** validates the `log()` function in isolation using `cloudflare:test` `fetchMock` to intercept Coralogix HTTP calls. It captures the request body, parses the JSON, and asserts on payload structure (applicationName, subsystemName, severity, timestamp, text). This is the direct model for audit event tests.

2. **`test/auth.test.js`** tests `verifyApiKey()` as a pure function with constructed Request objects and env stubs. Returns `{ ok, tenantId }` on success, `{ ok, response }` on failure. Currently hardcoded `tenantId: 'default'`. This will need extension when R12 (per-tenant keys) ships, but for R13 the audit logging tests can use the existing `'default'` tenant.

3. **`test/capture-integration.test.js`** exercises the full HTTP handler via `SELF.fetch()` with the Workers test pool. This is the integration layer where we can verify that audit log calls are emitted during real request flows.

4. **`src/index.js`** already calls `log()` on auth failures, rate limit hits, SSRF blocks, and list operations -- using `ctx.waitUntil(log(...) ?? Promise.resolve())`. The feature essentially needs to add audit log calls on **successful** authenticated request paths (capture creation, list success) and eventually key lifecycle events.

5. The `log()` function is fire-and-forget (returns `fetch()` Promise or `undefined`). This means audit events are non-blocking. Tests must either:
   - Intercept the Coralogix fetch via `fetchMock` and inspect the captured payload, or
   - Spy on `log()` itself to verify it was called with correct arguments.

### Recommendations

**1. Unit tests for audit event payloads in `test/log.test.js` (extend)**

Add a new `describe` block for audit event shapes. The key thing to validate is not that `log()` works (already tested) but that the **data object structure** for audit events contains the required fields. Since `log()` just serializes `data` into `text`, these tests verify the contract between callers and Coralogix.

Recommended approach: create a helper function (e.g., `auditEvent(tenantId, keyId, action, resource)`) that returns the structured data object, then test that function directly. This is simpler and faster than intercepting HTTP calls.

**2. Unit tests for auth.js audit context (extend `test/auth.test.js`)**

If the feature enriches `verifyApiKey()` to return `keyId` alongside `tenantId` on success (needed for "which key" in audit trail), add tests that verify:
- Successful auth returns `keyId` field (even if `'default'` for now)
- Failed auth does NOT return `keyId` (no tenant information leakage on failure)

**3. Integration tests for audit log emission in `test/capture-integration.test.js` (extend)**

The highest-value tests verify that the full request flow actually calls `log()` with correct audit context. Two approaches:

**Option A (recommended): fetchMock interception.** The Coralogix endpoint is already mocked out in the vitest config (no CORALOGIX_ENDPOINT binding = `log()` returns undefined). To test audit emission, add CORALOGIX_ENDPOINT and CORALOGIX_SEND_KEY to the test env bindings, then use `fetchMock` to intercept the Coralogix POST and inspect the payload. This tests the real code path including the `ctx.waitUntil` wiring.

**Option B: vi.spyOn.** Spy on the imported `log` module to verify call arguments. Simpler but tests less of the real code path. In a Workers pool environment, module spying can be tricky because of how the runtime bundles modules.

I recommend Option A because it aligns with the project principle "test the real boundaries" and matches the existing pattern in `test/log.test.js`.

**4. Do NOT test audit logging in `test/capture.test.js`**

The `performCapture()` tests use injectable renderers and direct KV/R2 assertions. They already call `await log(env, ...)` inside `performCapture()`, but adding CORALOGIX_ENDPOINT to these tests would create coupling between capture logic tests and logging infrastructure. Keep capture tests focused on KV/R2 state transitions. The audit logging assertion belongs in the integration test layer.

**5. Test the absence of PII in audit events (security test)**

Add a dedicated test group that verifies audit log payloads do NOT contain:
- Raw IP addresses (only `cip` hashed IP allowed)
- API key values (neither the bearer token nor CAPTURE_API_KEY)
- Request body contents (no URL in auth failure logs)

This is a regression-prevention test. The existing `log()` INVARIANT comment states data must contain only "static values and predetermined strings, never attacker-controlled input." A test should enforce this.

**6. Shared audit event fixtures in `test/fixtures.js`**

Add audit-related test constants to the existing fixtures file:
- `AUDIT_TENANT_ID` (currently `'default'`)
- `AUDIT_KEY_ID` (currently `'default'` or derived)
- `AUDIT_ACTIONS` enum (`'capture.create'`, `'capture.list'`, `'key.provision'`, `'key.revoke'`)

This prevents test data duplication and makes it easy to update when R12 ships real per-tenant keys.

### Proposed Tasks

**Task 1: Add audit event builder function and unit tests**
- What: Create an `auditEvent(tenantId, keyId, action, resource, metadata)` helper (in `src/log.js` or a new `src/audit.js`) and corresponding unit tests
- Deliverables: Function + tests in `test/log.test.js` (or `test/audit.test.js`)
- Dependencies: Agreement on the audit event schema (fields: `event`, `tenantId`, `keyId`, `action`, `resource`, `cip`, `timestamp`)
- Tests validate: required fields present, field types correct, no PII leakage

**Task 2: Add integration tests for audit emission on POST /v1/captures**
- What: Extend `test/capture-integration.test.js` with a test that enables Coralogix env vars, intercepts the Coralogix POST via fetchMock, and asserts the audit payload includes `tenantId`, `action: 'capture.create'`, and `captureId`
- Deliverables: New `describe` block in `test/capture-integration.test.js`
- Dependencies: Task 1 (audit event shape defined), Coralogix env vars added to vitest config for these tests
- Key assertion: the fetchMock callback captures the request body, parses JSON, finds the audit event entry, and verifies tenant context fields

**Task 3: Add integration tests for audit emission on GET /v1/captures (list)**
- What: Extend `test/list-captures.test.js` with audit emission verification
- Deliverables: New `describe` block in `test/list-captures.test.js`
- Dependencies: Task 1

**Task 4: Add integration test for auth failure audit events**
- What: Verify that failed auth attempts (401) emit audit events with correct `event: 'security.auth_fail'` and hashed IP but no tenantId or keyId
- Deliverables: New tests in `test/capture-integration.test.js`
- Dependencies: Task 1
- Note: Auth failure logging already exists (`security.auth_fail`). This task verifies the existing behavior is preserved and adds assertion on absence of tenant context in failure events.

**Task 5: Add PII leakage guard tests**
- What: For each audit event type (auth success, auth failure, capture create, list, key lifecycle), assert the serialized payload does not contain raw IPs, API keys, or request bodies
- Deliverables: Dedicated `describe` block (in `test/log.test.js` or a new `test/audit-security.test.js`)
- Dependencies: Task 1
- Pattern: Build the event, serialize with `JSON.stringify`, assert `not.toContain(TEST_KEY)`, `not.toContain(TEST_IP)`, `not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/)`

**Task 6: Key lifecycle event tests (if in scope)**
- What: If key provisioning and revocation events are part of this phase (backlog says R13 depends on R12 which is per-tenant keys), add tests for `key.provision` and `key.revoke` audit events
- Deliverables: Tests in `test/auth.test.js` or `test/audit.test.js`
- Dependencies: R12 (per-tenant keys) or a decision to implement lifecycle events for the single-key model
- Risk: The backlog indicates R13 depends on R12. If R12 is not yet shipped, key lifecycle tests may need to be scoped to the existing `archiveSigningKey()` path (which already logs `capture.key_archive_fail` on error but not on success)

**Task 7: Add audit event constants to test fixtures**
- What: Add shared audit-related test constants to `test/fixtures.js`
- Deliverables: Updated `test/fixtures.js`
- Dependencies: None (can be done first)

### Risks and Concerns

**1. ctx.waitUntil + fetchMock timing in integration tests.** The `ctx.waitUntil(log(...))` pattern means audit log fetch calls happen asynchronously after the response is returned. In the Workers test pool, `SELF.fetch()` may return before the `ctx.waitUntil` promises have settled. The fetchMock interception might need to account for this timing gap. Mitigation: the Workers vitest pool typically drains waitUntil promises before completing the test, but this should be verified empirically. If not, a small `await new Promise(r => setTimeout(r, 0))` after `SELF.fetch()` may be needed.

**2. Coralogix env vars in vitest.config.js.** Adding `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY` to the test bindings will cause ALL `log()` calls in ALL tests to attempt real (mocked) fetches. This could create noise in tests that don't care about logging. Mitigation: either (a) add the bindings only to the specific test files that need them (vitest workspace config), or (b) accept the broader activation and ensure fetchMock is set up in all test files' `beforeEach` blocks. Given that `log.test.js` already does this successfully, option (b) is probably fine, but the impact on the full test suite must be checked.

**3. R12 dependency ambiguity.** The backlog states R13 depends on R12 (per-tenant keys). Currently `verifyApiKey()` returns hardcoded `tenantId: 'default'` and there is no `keyId` on the auth result. If this feature ships before R12, audit events will have `tenantId: 'default'` and no meaningful `keyId`. This is fine for the test strategy -- tests should assert on whatever values the auth layer provides. But the test fixtures should be designed to be easily updatable when R12 arrives (use constants, not inline strings).

**4. No admin API endpoints exist yet.** Key provisioning/revocation are manual (1Password + wrangler). If "key lifecycle events" means logging when admin API endpoints are called, those endpoints don't exist yet. If it means logging the `archiveSigningKey()` calls in the capture pipeline, that's already partially logged (error case only). Clarify scope before writing key lifecycle tests.

**5. Fire-and-forget log delivery failures are silent in tests.** If `log()` fails (e.g., fetchMock not set up for the Coralogix endpoint), it catches the error and calls `console.warn`. This means a missing audit event won't cause a test failure unless the test explicitly checks for it. Tests must assert positively that the audit fetch was made, not just that the response was correct.

### Additional Agents Needed

None. The current team is sufficient. The test approach is straightforward: extend existing patterns in log.test.js and capture-integration.test.js. The `api-design-minion` should define the audit event schema (field names, required vs optional, event name conventions) since the tests depend on that contract. The `security-minion` should review the PII leakage guard tests (Task 5) to confirm the right fields are being checked.
