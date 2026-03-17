## Domain Plan Contribution: test-minion

### Analysis of the Planning Question

The question is whether tests should assert on specific audit fields in log calls, or whether that constitutes over-testing. After reading the codebase thoroughly, I have a clear recommendation based on the existing patterns and the nature of audit logging.

**Current state**: The codebase already makes `log()` calls in handlers (security events, capacity limits, capture lifecycle), but **no existing test asserts on the contents of those log calls**. The `log.test.js` file tests the `log()` function itself (payload structure, error handling, no-op guards), but handler tests (`capture-integration.test.js`, `admin-keys.test.js`, `list-captures.test.js`) never spy on `log()` or assert that specific log events were emitted.

This is a deliberate pattern, and it is the right one for operational logging. But audit logging has different requirements than operational logging, which changes the test boundary calculation.

### Recommendations

**1. Do NOT spy on `log()` calls from handler-level integration tests.**

The existing test suite uses `SELF.fetch()` for integration tests -- requests go through the full worker. These tests verify HTTP responses (status codes, body shapes, headers). Injecting a spy on `log()` into this flow would require either:
- Exposing a test-only hook to capture log calls (pollutes production code)
- Intercepting the Coralogix fetch via `fetchMock` and parsing payloads (brittle, couples tests to Coralogix format)

Neither is worth it. The handler tests should stay focused on HTTP contract verification. This aligns with the project's existing pattern: no handler test currently asserts on log payloads.

**2. DO write a focused unit test suite for the audit event schema.**

Instead of testing "did the handler call log with these fields", extract the audit event construction into a small, testable function (or set of functions). Then test the function directly:

```js
// src/audit.js
export function captureAuditEvent(auth, captureId, url, cip) {
  return {
    event: 'audit.capture',
    tenantId: auth.tenantId,
    keyId: auth.keyHashPrefix,   // never the raw key
    keyName: auth.keyName,
    action: 'capture',
    resource: captureId,
    url,
    cip,
  };
}
```

```js
// test/audit.test.js
it('captureAuditEvent includes required fields', () => {
  const event = captureAuditEvent(
    { tenantId: 'acme', keyHashPrefix: 'abcd1234', keyName: 'prod-key' },
    'cap_abc123', 'https://example.com', 'h:deadbeef'
  );
  expect(event).toEqual({
    event: 'audit.capture',
    tenantId: 'acme',
    keyId: 'abcd1234',
    keyName: 'prod-key',
    action: 'capture',
    resource: 'cap_abc123',
    url: 'https://example.com',
    cip: 'h:deadbeef',
  });
});
```

This approach:
- Tests the contract (which fields exist, what they're called, what values they contain) without coupling to how `log()` is called
- Runs fast (pure function, no mocks, no KV, no fetchMock)
- Makes the audit schema explicit and reviewable in code review
- Catches regressions if someone renames a field or drops a required property
- Follows the project's YAGNI/KISS philosophy -- no test infrastructure changes needed

**3. DO write one "smoke" integration test per authenticated endpoint verifying audit events reach Coralogix.**

This is the boundary between "did we wire it up" and "is the schema correct." Use `fetchMock` to intercept the Coralogix POST and assert:
- The event was sent (Coralogix fetch was called)
- The `event` field matches (e.g., `audit.capture`, `audit.list`, `audit.key_create`)
- The `tenantId` field is present

Do NOT assert on all fields in this test. The unit tests on the audit event builder cover the schema; the integration test only proves the wiring works.

The test count should be small: one per authenticated endpoint (POST /v1/captures, GET /v1/captures, POST /v1/admin/keys, GET /v1/admin/keys, DELETE /v1/admin/keys) = 5 integration tests.

**4. DO assert that auth failure events are logged with the right event type.**

Auth failures are security-critical. The existing code already logs `security.auth_fail` events. The audit logging feature should NOT change this pattern -- it should be additive. But if the feature introduces new failure-path audit events (e.g., distinguishing auth_fail from rate_limit), one integration test per new event type is worthwhile.

**5. DO NOT test that every log call has `keyId` or `tenantId` via exhaustive handler tests.**

This is the over-testing boundary. If you extract audit event construction into a builder, the builder tests guarantee the schema. The handler tests guarantee the HTTP contract. The wiring smoke test guarantees the plumbing. Testing every handler's log payload field-by-field adds dozens of assertions that break every time a field is added or renamed, with zero additional confidence.

### Proposed Tasks

1. **Create `src/audit.js`** -- Extract audit event construction into pure functions. One function per event type: `captureAuditEvent`, `listAuditEvent`, `keyCreateAuditEvent`, `keyRevokeAuditEvent`, `keyListAuditEvent`. Each returns a plain object ready to pass to `log()`.

2. **Create `test/audit.test.js`** -- Unit tests for each audit event builder function. Test:
   - All required fields are present (tenantId, keyId/keyHashPrefix, action, resource, event)
   - No raw key material leaks into audit events
   - keyId is derived from hash prefix, not raw key
   - Edge cases: null keyName (legacy auth), undefined cip

3. **Add wiring smoke tests in existing handler test files** -- In `capture-integration.test.js` and `admin-keys.test.js`, add one test per authenticated endpoint that uses `fetchMock` to intercept the Coralogix POST and verify:
   - At least one log call was made with the correct `event` field value
   - The `tenantId` field is present and matches the authenticated tenant

4. **Add an "audit event completeness" test** -- A single test that exercises all authenticated endpoints and asserts the set of event types emitted covers the expected set. This is a lightweight "did we forget to add audit logging to a new endpoint" guard.

5. **Verify auth failure audit events** -- If the feature adds new auth-failure event types, add one test per new type. These belong in `auth.test.js` alongside the existing auth behavior tests.

### Risks and Concerns

**Risk 1: Coupling tests to Coralogix payload format.** The `log()` function double-serializes data (wraps in Coralogix envelope, then serializes the `data` object as `text`). Tests that parse intercepted Coralogix payloads are coupled to this format. Mitigate by keeping Coralogix-level assertions minimal (only in wiring smoke tests) and putting schema assertions in unit tests against the builder functions.

**Risk 2: `fetchMock` contention.** Several test files already use `fetchMock` to intercept outbound requests (header fetch in capture, etc.). Adding Coralogix interception in the same tests risks ordering conflicts. Mitigate by:
- Setting up a Coralogix intercept that matches the specific origin/path
- Using `.times()` or `.persist()` to avoid "unexpected request" errors
- Keeping Coralogix assertions in separate describe blocks

**Risk 3: `log()` no-op in tests.** The current test environment does not set `CORALOGIX_ENDPOINT` or `CORALOGIX_SEND_KEY` in `vitest.config.js` bindings. This means `log()` returns `undefined` (no-op) in all current tests. For the wiring smoke tests to work, you must either:
- Add `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY` to the vitest config bindings, OR
- Use a separate test file with its own config overrides

I recommend adding them to the vitest config. This makes `log()` attempt real fetches (which `fetchMock` intercepts) and enables all existing log calls to be observable in tests without changing production code. The cost is that all existing tests will now emit log fetches -- ensure `fetchMock` is configured to handle or ignore them.

**Risk 4: Breaking existing tests with new Coralogix fetches.** If `CORALOGIX_ENDPOINT` is added to the test env, every handler test that uses `fetchMock` will see unexpected Coralogix requests. Options:
- (Preferred) Add a default Coralogix intercept in a global test setup file that silently accepts all log requests
- (Alternative) Only enable Coralogix bindings in audit-specific test files

**Risk 5: Auth result must carry `keyHashPrefix` for audit.** The `verifyApiKey` success path currently returns `{ tenantId, scopes, keyName, authMethod }`. It does not return `keyHashPrefix` (only failure paths do). The audit event builder needs the key hash prefix as `keyId`. The auth function must be modified to include `keyHashPrefix` in the success response. This is a small code change but affects the auth contract -- verify existing tests still pass.

### Additional Agents Needed

- **code-minion**: To implement `src/audit.js` and modify `src/auth.js` to return `keyHashPrefix` on success. To wire `log(env, 3, 'audit', captureAuditEvent(...))` calls into each handler.
- **security-minion**: To review that audit events do not leak sensitive information (raw API keys, full IP addresses). The `cip` (computed IP hash) pattern is already established and should be followed, but a security review of the audit payload contents is warranted.
