# Domain Plan Contribution: test-minion

## Recommendations

### 1. Follow existing test file structure exactly

Both `webhook-dispatch.test.js` and `webhook-crud.test.js` follow clear patterns:

- **Unit tests** (webhook-dispatch.test.js): Import the function directly, call it with crafted inputs via `makeCaptureRecord()`, parse the JSON output, assert on fields. No D1 or HTTP involved.
- **Integration tests** (webhook-crud.test.js): Use `SELF.fetch()` through the real worker, with `seedWebhook()` + `seedApiKey()` for DB setup, `beforeEach`/`afterEach` with `cleanDb()`, and unique IPs per describe block via `nextIp()`.

New tests for `buildWebhookPayload` belong in `webhook-dispatch.test.js` (unit). New tests for ping response shape belong in `webhook-crud.test.js` (integration via `SELF.fetch`).

### 2. Artifact URL tests in buildWebhookPayload (unit tests)

Add to the existing `describe('buildWebhookPayload')` block in `webhook-dispatch.test.js`. Follow the exact same pattern as the existing test at line 166 that checks `captureId, status, url, completedAt, verificationUrl`:

```js
it('capture.complete payload includes artifacts object with screenshot, html, headers URLs', () => {
  const record = makeCaptureRecord({ status: 'complete', completedAt: '2024-01-01T00:00:00.000Z' });
  const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, {}));
  expect(parsed.data.artifacts).toBeDefined();
  expect(typeof parsed.data.artifacts).toBe('object');
  expect(parsed.data.artifacts.screenshotUrl).toContain(record.captureId);
  expect(parsed.data.artifacts.screenshotUrl).toContain('/artifacts/screenshot');
  expect(parsed.data.artifacts.htmlUrl).toContain(record.captureId);
  expect(parsed.data.artifacts.htmlUrl).toContain('/artifacts/html');
  expect(parsed.data.artifacts.headersUrl).toContain(record.captureId);
  expect(parsed.data.artifacts.headersUrl).toContain('/artifacts/headers');
});

it('capture.complete artifacts URLs use VERIFICATION_BASE_URL when set', () => {
  const record = makeCaptureRecord({ status: 'complete' });
  const testEnv = { VERIFICATION_BASE_URL: 'https://verify.example.com' };
  const parsed = JSON.parse(buildWebhookPayload('capture.complete', record, testEnv));
  expect(parsed.data.artifacts.screenshotUrl).toMatch(/^https:\/\/verify\.example\.com/);
});

it('capture.failed payload does not include artifacts', () => {
  const record = makeCaptureRecord({ status: 'failed', failedAt: '2024-01-01T00:00:00.000Z', error: 'render_timeout', retryable: false });
  const parsed = JSON.parse(buildWebhookPayload('capture.failed', record, {}));
  expect(parsed.data.artifacts).toBeUndefined();
});
```

Key design decisions:
- Assert URL **contains** captureId and artifact type path segments, not exact URL string. This is resilient to base URL changes.
- Verify `VERIFICATION_BASE_URL` env influences artifact URLs (same pattern as existing test at line 198).
- Negative test: `capture.failed` should NOT include artifacts (artifacts only make sense for successful captures).

### 3. Ping signature echo tests (integration tests)

Add to the existing `describe('POST /v1/webhooks/:id/ping')` block in `webhook-crud.test.js`. Follow the existing pattern (line 369) that already checks `success/httpStatus/latencyMs` shape:

```js
it('response includes signature and timestamp fields for verification testing', async () => {
  const id = 'whk_' + 'a'.repeat(32);
  await seedWebhook(env.DB, id, { tenantId: 'default' });

  const res = await ping(id);
  expect(res.status).toBe(200);
  const body = await res.json();
  // Signature echo fields let callers verify their HMAC logic
  expect(typeof body.signature).toBe('string');
  expect(body.signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
  expect(typeof body.timestamp).toBe('number');
  expect(body.timestamp).toBeGreaterThan(0);
});
```

Key design decisions:
- Test the **response body** fields, not HTTP response headers. The ping response is a JSON object describing what happened; signature echo belongs there.
- Assert signature format matches the `t={ts},v1={hex}` pattern that the signing module produces.
- Timestamp should be a Unix epoch number (matching TIMESTAMP_HEADER behavior).

### 4. Regression tests -- existing behavior must not break

No new regression tests are needed as separate tests. The existing test suite already covers:

- `buildWebhookPayload` existing field assertions (lines 150-211) -- these already assert `captureId`, `status`, `url`, `completedAt`, `verificationUrl`, `failedAt`, `error`, `retryable`. Adding `artifacts` must not break any of these.
- Ping endpoint shape (line 369) -- the existing test asserts `success`, `httpStatus`, `latencyMs`. Adding `signature` and `timestamp` to the response is additive; the existing assertions remain valid.
- `dispatchWebhooks` fan-out tests (lines 217-348) -- unchanged by this work.
- Queue consumer tests (lines 355-426) -- unchanged by this work.

The existing tests ARE the regression tests. Running the full suite after changes confirms no regressions.

## Proposed Tasks

### Task 1: Add artifact URL unit tests to webhook-dispatch.test.js
- File: `test/webhook-dispatch.test.js`
- Location: Inside `describe('buildWebhookPayload')` block, after the existing `verificationUrl` tests
- Add 3 tests: artifacts in complete payload, artifacts respect env base URL, artifacts absent in failed payload
- Estimated: ~30 lines of test code

### Task 2: Add signature echo integration test to webhook-crud.test.js
- File: `test/webhook-crud.test.js`
- Location: Inside `describe('POST /v1/webhooks/:id/ping')` block, after existing shape test
- Add 1 test: response includes `signature` and `timestamp` fields with correct formats
- Estimated: ~15 lines of test code

### Task 3: Run full test suite to confirm no regressions
- Run `npx vitest run` to verify all existing tests pass alongside new ones
- This must happen after the code changes to `buildWebhookPayload()` and `handlePingWebhook()` are complete

### Task ordering
- Tests should be written BEFORE or IN PARALLEL with the code changes (TDD style fits here since the behavior is well-defined by the issue).
- Tests will fail initially (expected -- code changes haven't landed yet).
- After code changes, all tests (old + new) must pass.

## Risks and Concerns

### 1. Artifact URL pattern must be agreed before tests are written
The issue says URLs should follow `/v1/captures/{id}/artifacts/{type}`. The implementation minion should confirm the exact field names in the `artifacts` object. I've proposed `screenshotUrl`, `htmlUrl`, `headersUrl` based on the pattern in the docs, but the implementer may choose `screenshot`, `html`, `headers` as keys with URL values. The test assertions should match whatever naming the implementer picks.

**Mitigation**: Implementer writes the code, then test names/assertions are adjusted to match. Or: agree on field names in this planning phase.

### 2. Ping test hits a non-existent endpoint (existing behavior)
The existing ping test (line 369) already notes: "Ping will attempt a real fetch; the call fails since TEST_WEBHOOK_URL is not real." The signature echo test inherits this limitation -- the ping will fail at the network level, but the handler still returns the response shape including signature fields. The test should work as-is because signature computation happens before the fetch call.

### 3. No `makeCaptureRecord` change needed
The `makeCaptureRecord()` helper (line 39) does not include an `artifacts` field, and it should not need one. The artifact URLs in the webhook payload are constructed from the `captureId` and a base URL -- they are derived, not stored on the capture record. No fixture changes required.

## Additional Agents Needed

None beyond what is already planned. The code-minion (implementer) handles the production code changes to `buildWebhookPayload()` and `handlePingWebhook()`. The docs-minion handles `site/content/webhooks.md`. Tests are self-contained in the existing test files with existing helpers.
