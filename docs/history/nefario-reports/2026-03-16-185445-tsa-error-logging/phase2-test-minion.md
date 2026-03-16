# Test Strategy: TSA Error Logging Path

## Summary

Three new tests, all in the existing `describe('WACZ -- graceful degradation')` block. No new describe block needed. Total test surface: `timestampStatus: 'error'` vs `'absent'` on return value; no assertion on the log call itself. The log function is fire-and-forget with absent Coralogix credentials in the test env, so asserting it would be testing the wrong thing.

---

## What We Are Testing (and Why)

The change introduces two observable behaviors:

1. When `env.TSA_URL` is set and the TSA request throws, `buildWacz` must return `timestampStatus: 'error'` instead of silently returning `'absent'`.
2. When `env.TSA_URL` is absent, the result is still `'absent'` (existing behavior is unchanged and should be confirmed with an explicit assertion rather than implied by silence).

The error log call is explicitly NOT the test target. Rationale:

- `log()` is a no-op when `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY` are absent from env, which they are in all existing test fixtures. Testing that a no-op was called would assert nothing meaningful.
- The CLAUDE.md principle "test the real boundaries" tells us the boundary here is the return value shape that callers (capture.js, kv.js) depend on. That is what breaks downstream if wrong.
- Asserting `log()` calls by spying or injecting a mock log would add brittleness without adding confidence: it would couple the test to the internal call structure rather than the observable contract.

If Coralogix integration is ever wired into the test environment (unlikely -- it is a third-party service), a separate integration test for the log path belongs in a dedicated log.test.js, not in wacz.test.js.

---

## Minimal Test Set (3 tests)

### Test 1: `timestampStatus` is `'absent'` when `TSA_URL` is not set

**Purpose:** Confirm the existing no-TSA path produces `'absent'`. This is not currently asserted anywhere in the suite. Adding it makes the `'error'` vs `'absent'` distinction load-bearing in the test suite rather than accidental.

**Placement:** `describe('WACZ -- graceful degradation')`

**Approach:** Call `buildWacz` directly with `env.SIGNING_KEY` but without `TSA_URL` (same pattern as the existing null-return test). Assert `result.timestampStatus === 'absent'`.

```js
it('buildWacz returns timestampStatus "absent" when TSA_URL is not set', async () => {
  // Arrange: env has signing key but no TSA_URL
  const result = await buildWacz(
    TEST_URL,
    new Date().toISOString(),
    { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
    { SIGNING_KEY: env.SIGNING_KEY },
  );
  // Act + Assert
  expect(result).not.toBeNull();
  expect(result.timestampStatus).toBe('absent');
});
```

Note: `env.SIGNING_KEY` comes from the cloudflare:test env binding, which the existing integration tests already rely on (vitest.config.js / wrangler.toml test environment). Passing `{ SIGNING_KEY: env.SIGNING_KEY }` strips all other bindings, keeping the test focused.

---

### Test 2: `timestampStatus` is `'error'` when TSA endpoint returns non-200

**Purpose:** Cover the most common real-world TSA failure mode (HTTP 500, 503, timeout that resolves to a bad response). Validates the new `'error'` status on the return value.

**Placement:** `describe('WACZ -- graceful degradation')`

**Approach:** Register a fetchMock intercept for the TSA URL that returns HTTP 500. Pass `TSA_URL` pointing at that intercepted URL in the env object.

```js
it('buildWacz returns timestampStatus "error" when TSA returns HTTP 500', async () => {
  const TSA_URL = 'https://tsa.test/timestamp';
  fetchMock
    .post(TSA_URL)
    .intercept({ path: '/timestamp' })
    .reply(500, 'Internal Server Error');

  const result = await buildWacz(
    TEST_URL,
    new Date().toISOString(),
    { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
    { SIGNING_KEY: env.SIGNING_KEY, TSA_URL },
  );

  expect(result).not.toBeNull();
  expect(result.timestampStatus).toBe('error');
});
```

---

### Test 3: `timestampStatus` is `'error'` when TSA fetch throws a network error

**Purpose:** Cover the network-failure path (TSA unreachable, DNS failure, AbortSignal timeout). These go through the same `catch` block but via a thrown exception rather than a bad HTTP status. This is the path the old silent `catch {}` was eating.

**Placement:** `describe('WACZ -- graceful degradation')`

**Approach:** fetchMock on `disableNetConnect()` already blocks unknown URLs, so any URL not explicitly registered will throw a network error. We simply pass a TSA_URL that has no registered intercept.

```js
it('buildWacz returns timestampStatus "error" when TSA is unreachable', async () => {
  // fetchMock.disableNetConnect() is active (set in beforeEach);
  // any unregistered URL throws a network error, simulating TSA unreachable
  const result = await buildWacz(
    TEST_URL,
    new Date().toISOString(),
    { screenshotBefore: PNG_BYTES, screenshotAfter: null, html: TEST_HTML, headers: null, captureSettings: null },
    { SIGNING_KEY: env.SIGNING_KEY, TSA_URL: 'https://tsa-unreachable.test/timestamp' },
  );

  expect(result).not.toBeNull();
  expect(result.timestampStatus).toBe('error');
});
```

This is the cleanest approach because it requires no additional mock setup -- the existing `fetchMock.disableNetConnect()` already provides the behavior we need.

---

## What We Are NOT Testing

**The `log()` call itself.** The `log()` function is a no-op in the test environment because `CORALOGIX_ENDPOINT` and `CORALOGIX_SEND_KEY` are absent. Testing a no-op proves nothing. The correct way to gain confidence in the logging path is:

- Code review of the `catch` block to verify `log()` is called with severity 5 (error), subsystem 'wacz', and the relevant fields (event, tsaUrl, error message).
- If log call verification is later required, inject `env` with stub Coralogix credentials and intercept the endpoint via fetchMock. That is a separate, dedicated test with its own tradeoffs (coupling to internal call shape), and it is not part of this minimal strategy.

**`timestampStatus: 'present'`** -- this is already implicitly covered by the existing integration tests that verify the full WACZ structure when the capture succeeds. The new tests only need to close the gap on the error and absent states.

**The rfc3161.js internals under TSA error conditions** -- `test/rfc3161.test.js` owns that surface. The wacz.test.js tests only need to verify that `buildWacz` handles the thrown exception correctly, which is what these three tests do.

---

## fetchMock Method Note

The existing `mockHeaderFetch` helper uses `.get(origin).intercept(...)`. The TSA endpoint is a POST (Content-Type: application/timestamp-query). Verify the fetchMock API for POST interception before finalizing the test code:

- If the mock library chains off `.post(url)`, use that form (shown in Test 2 above).
- If the library only supports `.get(url)` with a method override in `.intercept({ method: 'POST' })`, adjust accordingly.
- For Test 3, no fetchMock registration is needed at all -- the existing `disableNetConnect()` already handles it.

---

## Placement in File

All three tests belong inside the existing `describe('WACZ -- graceful degradation')` block, immediately after the existing `'buildWacz returns null when env has no SIGNING_KEY'` test. No new imports are needed; `env`, `buildWacz`, `PNG_BYTES`, `TEST_HTML`, `TEST_URL`, and `fetchMock` are all already imported at the top of the file.

---

## Risk Assessment

**Low risk.** These tests call `buildWacz` directly, bypassing the full performCapture / R2 / KV pipeline. They do not require additional test fixtures or setup. They should run in under 100ms each because they short-circuit at the TSA step and return without zipping or writing to R2.

The one dependency to verify: `env.SIGNING_KEY` must be available in the cloudflare:test env for the stripped-down env object `{ SIGNING_KEY: env.SIGNING_KEY, TSA_URL }` to work. The existing "graceful degradation" test passes `{}` (no key) intentionally. These new tests need a valid key, which means relying on the same test env binding that the full integration tests use. This is a safe assumption given the test suite already exercises that path successfully.
