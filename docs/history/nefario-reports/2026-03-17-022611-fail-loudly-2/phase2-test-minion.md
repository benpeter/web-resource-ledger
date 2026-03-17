# Test-Minion: Phase 2 Contribution -- Fail Loudly Error Path Test Coverage

## Recommendations

### 1. wacz.js TSA error path -- ALREADY COVERED

The existing test suite in `test/wacz.test.js` (lines 259-306) already covers the TSA error path thoroughly in the `describe('WACZ -- graceful degradation')` block:

- `timestampStatus is absent when env has no TSA_URL` (line 270) -- asserts `result.timestampStatus === 'absent'`
- `timestampStatus is error when TSA returns HTTP 500` (line 281) -- asserts `result.timestampStatus === 'error'`
- `timestampStatus is error when TSA is unreachable` (line 297) -- asserts `result.timestampStatus === 'error'`

**GAP**: No test verifies that the TSA error path actually calls `log()`. Currently the `log()` call is fire-and-forget and Coralogix env vars are absent in the test environment, so the log is a no-op. This is acceptable -- the test-minion advise from phase 0030 explicitly decided NOT to assert on the log call because it would be "testing the wrong thing." The return value assertion (`timestampStatus: 'error'`) is the externally observable contract. No new test needed here.

### 2. signing.js key validation failure -- GAP

`signing.js` line 83-86 has a `catch` block:

```js
} catch {
    console.warn('Signing key validation failed');
    return null;
}
```

The current `catch` is a bare `catch {}` (no error variable captured). The issue requires it to either log the error or name the error type. The proposed change is to log via `console.warn` with the error message. However, there is **no test** that verifies the behavior when `getSigningKeys()` receives an invalid/malformed SIGNING_KEY.

The existing tests only test the happy path:
- `test/signing.test.js` -- Ed25519 key generation and signing round-trips (no `getSigningKeys` tests at all)
- `test/key-rotation.test.js` -- exercises `getSigningKeys(env)` with valid keys only
- `test/signing-key.test.js` -- exercises `getSigningKeys(env)` through the HTTP endpoint with valid keys
- `test/wacz.test.js` line 260-268 -- `buildWacz` returns null when `env` has no `SIGNING_KEY` (tests the `!env?.SIGNING_KEY` guard, not the catch path)

**NEW TEST NEEDED**: Verify that `getSigningKeys()` returns `null` (not throws) when passed a malformed SIGNING_KEY. This test belongs in `test/key-rotation.test.js` alongside the other `getSigningKeys` tests.

Test case description:
- **Name**: `getSigningKeys returns null for malformed base64 SIGNING_KEY`
- **Arrange**: Pass `{ SIGNING_KEY: 'not-valid-pkcs8-at-all' }` to `getSigningKeys()`
- **Assert**: Result is `null` (graceful degradation, not a thrown error)
- **Purpose**: Confirms the catch block works and prevents a corrupt key from crashing the capture pipeline

### 3. The `timestampStatus` rename from `'absent'` to `'skipped'` -- ANALYSIS

The prompt.md for this phase (0035) specifies the three-way status should be `present`/`skipped`/`error`, changing the current `'absent'` to `'skipped'`. This rename affects:

**Source code to change:**
- `src/wacz.js` line 45 (JSDoc) and line 162 (return statement) -- currently `'absent'`, change to `'skipped'`

**Tests that assert on the old `'absent'` value and MUST be updated:**
1. `test/wacz.test.js` line 278: `expect(result.timestampStatus).toBe('absent')` -- rename to `'skipped'`

**Integration tests that assert on `timestampStatus` (do NOT need updating -- they assert `'present'`, not `'absent'`):**
- `test/integration/capture-pipeline.test.js` line 120: asserts `'present'` -- no change needed
- `test/integration/advisory.test.js` line 50: asserts `'present'` -- no change needed

**Log paths that use `'skipped'`:**
- `src/capture.js` line 239 already uses `'skipped'` as the fallback: `waczInfo?.timestampStatus ?? 'skipped'`. This currently refers to the case where waczInfo is null (no WACZ produced at all). After the rename, `'skipped'` will mean both "no WACZ" and "no TSA configured" -- which is intentional, since both are "not attempted" rather than "attempted and failed."

**TOTAL TESTS TO UPDATE**: 1 test assertion (wacz.test.js line 278).

### 4. log.js fallback behavior -- NOT WORTH TESTING FURTHER

`log.js` has two catch blocks:
1. `.catch(() => {})` on line 39 -- swallows fetch errors
2. `catch { return; }` on line 40 -- swallows JSON.stringify errors (circular refs)

Both are already tested:
- `test/log.test.js` line 159-168: `log -- swallows fetch errors silently` -- verifies `resolves.not.toThrow()`
- `test/log.test.js` line 170-181: `log -- handles JSON.stringify errors gracefully` -- verifies no throw for circular refs

The issue description says log.js is a legitimate case for silent catch -- logging infrastructure cannot throw errors that crash the capture pipeline. The `.catch(() => {})` on the fetch Promise is fire-and-forget by design. If the change here is to add `console.warn` inside the catch, no new test is needed because the existing tests already verify the externally observable behavior (no throw, returns undefined).

**One concern**: The current test `log -- swallows fetch errors silently` has a misleading describe block name ("swallows fetch errors silently"). If the implementation changes to log via console.warn, the test name should be updated for accuracy, but the assertion remains valid.

### 5. consent.js top-level catch -- GAP

`consent.js` line 71-73 has the top-level catch:

```js
} catch {
    return { status: 'failed', cmp: null, durationMs: Date.now() - start };
}
```

The proposed change would add an `_error` field to the returned object so the capture pipeline can log the actual error (per `capture.js` lines 247-254 which already check for `consent?._error`).

**Current coverage**: `test/capture.test.js` lines 894-933 has a `consentErrorRenderer` that returns a result with `_error` populated -- but this tests the downstream handling of `_error`, not the catch block in `consent.js` itself. There is no `consent.test.js` file at all.

**Testing feasibility**: `dismissCookieConsent()` requires a Playwright `page` object. Mocking a page object that triggers the catch block (e.g., `page.exposeBinding` throws) is feasible but would be a unit test with a fake page object. Per CLAUDE.md, "unit tests with mocked renderers are fine for orchestration logic" -- and the consent module IS orchestration logic around browser APIs.

**NEW TEST NEEDED**: However, creating a full `consent.test.js` with Playwright page mocks is significant effort for minimal value. The catch block's contract is simple: catch any error, return `{ status: 'failed', cmp: null, durationMs: <number>, _error: { name, message } }`. The more practical approach is to verify the `_error` shape in the existing `capture.test.js` integration-style test.

Test case description:
- **Name**: `consent error result includes _error field with name and message` (in `test/capture.test.js`)
- **Arrange**: Use the existing `consentErrorRenderer` stub
- **Assert**: `record.consent._error` has `name` and `message` properties (or wherever the capture pipeline stores this)
- **Alternative**: If `consent.test.js` is created, test `dismissCookieConsent()` with a page mock whose `exposeBinding` throws, verify the returned object has `_error.name` and `_error.message`

Actually, looking more carefully at the existing test at line 906, the `consentErrorRenderer` already includes `_error: { name: 'TypeError', message: 'Cannot read properties of null' }` in its stub return. The test at line 926 asserts `record.captureSettings.consent.result === 'failed'`. But it does NOT assert that the `_error` field propagates or that `capture.consent_error` is logged.

**RECOMMENDED**: Add an assertion to the existing consent error test that `_error` info is accessible. Since `_error` is logged (capture.js lines 247-254) but not stored in KV or returned via API (it's internal), the main thing to test is that `consent._error` on the renderer result does not crash the pipeline. This is already implicitly tested (the capture completes). No new test strictly needed unless the change adds `_error` to the `dismissCookieConsent` catch block return value, in which case integration test coverage flows through the existing renderer stub pattern.

### 6. Verification API response -- `timestampStatus` surfacing -- GAP

The verify API endpoint (`GET /v1/verify/{id}`) returns `signing: result.capture` (index.js line 508), which includes `result.capture.timestamp` when present. The `verifyWacz()` function already populates `result.capture.timestamp` with `{ genTime, tsa }` for valid timestamps, and omits it when timestamp is absent/skipped.

However, the verify API response does NOT directly surface `timestampStatus` as a field. Instead, the verify response includes a `checks` array where `timestamp` check has `status: 'pass'|'fail'|'skip'`. The `'skip'` status in the check corresponds to "no timestamp was obtained." This is different from the KV record's `wacz.timestampStatus` field.

**Current coverage**: `test/verify-integration.test.js` line 87-103 tests this:
- Asserts that core checks (artifactHashes, bundleHash, signature) pass
- For timestamp: `if (byName.timestamp) { expect(['pass', 'skip']).toContain(byName.timestamp.status) }`

This is sufficient for the current three-way check status. However, there is no test that verifies the `signing.timestamp` field is present when a timestamp exists, or absent when it's skipped.

**NEW TEST NEEDED**: Verify that the verify API response's `signing` object includes `timestamp` field when a timestamped WACZ is verified, and omits it when no timestamp is present. This could go in `test/verify-integration.test.js`.

Test case descriptions:
- **Name**: `verify response signing.timestamp is absent when no TSA timestamp in WACZ`
- **Assert**: For a capture produced without TSA_URL, `body.signing.timestamp` should be undefined
- **Purpose**: Verifies the API correctly reflects the three-way status to consumers

The complementary "timestamp present" test would require a WACZ with a real or synthetic timestamp -- the integration tests in `test/integration/capture-pipeline.test.js` cover this with a real TSA, but `test/verify-integration.test.js` uses the test env which has no TSA_URL. Adding a synthetic timestamp would be complex. The skip/absent case is the more important gap.

### 7. cdxj.js `toSurt` catch -- ADEQUATELY COVERED

`cdxj.js` line 75 has a catch block:

```js
} catch {
    // Fallback: return URL as-is if parsing fails
    return url;
}
```

**Current coverage**: `test/wacz.test.js` lines 369-377 has two `toSurt` tests:
- Normal URL: `toSurt('https://example.com/path')` produces `'com,example)/path'`
- URN passthrough: `toSurt('urn:wrl:screenshot:...')` passes through unchanged

**GAP**: No test covers what happens when `toSurt` receives an unparseable URL (triggering the catch block). This is the fallback path where a malformed URL is returned as-is.

**NEW TEST NEEDED**:
- **Name**: `toSurt returns unparseable URL as-is (fallback)` (in `test/wacz.test.js` CDXJ SURT describe block)
- **Arrange**: Call `toSurt('not a valid url at all')`
- **Assert**: Returns `'not a valid url at all'` unchanged
- **Purpose**: Verifies the catch block's fallback behavior -- the URL passes through without crashing CDXJ index generation

This is a small but worthwhile addition. The catch block is legitimate (URL parsing is not the CDXJ module's job to validate), but the fallback behavior should be regression-tested.

---

## Proposed Tasks

### Task 1: Update `timestampStatus: 'absent'` to `'skipped'` in test assertion
- **File**: `test/wacz.test.js` line 278
- **Change**: `expect(result.timestampStatus).toBe('absent')` -> `expect(result.timestampStatus).toBe('skipped')`
- **Depends on**: Source code change in `src/wacz.js` that renames `'absent'` to `'skipped'`
- **Effort**: Trivial

### Task 2: Add test for malformed SIGNING_KEY graceful degradation
- **File**: `test/key-rotation.test.js` (add to `computeKeyId` or new describe block)
- **Test**: `getSigningKeys returns null for malformed SIGNING_KEY`
- **Assert**: `getSigningKeys({ SIGNING_KEY: 'not-valid-pkcs8' })` returns `null`
- **Effort**: Small (3-5 lines)

### Task 3: Add test for `toSurt` fallback on unparseable URL
- **File**: `test/wacz.test.js` (add to `CDXJ SURT transform` describe block)
- **Test**: `toSurt returns unparseable URL as-is`
- **Assert**: `toSurt('not a valid url')` returns `'not a valid url'`
- **Effort**: Trivial (2 lines)

### Task 4: Verify `consent._error` field propagation (if consent.js catch adds `_error`)
- **File**: `test/capture.test.js` (extend existing consent error test)
- **Test**: Add assertion that the consent error renderer's `_error` field does not crash the pipeline and gets logged
- **Assert**: Capture completes, `_error` info accessible (existing test already covers "completes" -- may only need a descriptive assertion)
- **Effort**: Small

### Task 5: Add test for verify response `signing.timestamp` absence
- **File**: `test/verify-integration.test.js` (add to happy path describe block)
- **Test**: `verify response signing field reflects absent timestamp`
- **Assert**: `body.signing.timestamp` is undefined when capture was produced without TSA_URL
- **Effort**: Small (existing test setup produces captures without TSA)

### Task 6: Update log test describe block name (if log.js catch changes)
- **File**: `test/log.test.js` line 159
- **Change**: If the `catch` in log.js is changed to log via console.warn, update describe name from `log -- swallows fetch errors silently` to something more accurate like `log -- handles fetch errors without throwing`
- **Effort**: Trivial

---

## Risks and Concerns

### Risk 1: `'absent'` to `'skipped'` rename breaks downstream consumers
The rename affects the KV record's `wacz.timestampStatus` field. Any existing captures in production have `'absent'` stored. The verify API does NOT use this field -- it verifies the WACZ directly. But `GET /v1/captures/{id}` retrieval response may surface this field. If external consumers key on `'absent'`, this is a breaking change.

**Mitigation**: Check if `timestampStatus` appears in the retrieval response. From `capture-retrieval.test.js`, the retrieval response includes `body.wacz.bundleHash` and `body.wacz.size` but there is no assertion on `timestampStatus` in the retrieval response. Check `src/index.js` to see if `timestampStatus` is included in the GET capture response. Looking at lines 354-358, it includes `url`, `size`, `bundleHash` but NOT `timestampStatus`. So the rename is internal (KV + logs only) and safe.

### Risk 2: consent.js internal catch blocks are not "silent" in the same way
Many `.catch(() => {})` calls in `consent.js` are on `frame.evaluate()` calls for cross-origin or detached frames. These are genuinely expected failures (cross-origin security restrictions) and should NOT be logged -- they would generate noise for every page with cross-origin iframes. The issue should be careful to distinguish "silent catch on expected cross-origin failure" from "silent catch on unexpected errors."

**Mitigation**: Only the top-level `catch` in `dismissCookieConsent()` (line 71) and the `catch(e) {}` inside the eval handler (line 224) warrant changes. The `.catch(() => {})` on `frame.evaluate` calls are correct as-is.

### Risk 3: No test isolation for `console.warn` assertions
If signing.js changes `catch {}` to `catch (err) { console.warn('...', err.message) }`, testing that `console.warn` was called would require mocking `console.warn`. This is fragile and tests implementation details. Better to test the externally observable behavior (returns null) and not the logging side effect.

---

## Additional Agents Needed

None required for the test changes. The test changes are straightforward and can be implemented by the execution agent alongside the source code changes. The test-minion's guidance above is sufficient for the implementer to write the tests correctly.

One note for the **implementation agent**: when changing the `catch` blocks, be careful with `consent.js` -- many of its `.catch(() => {})` calls are on Playwright `frame.evaluate()` for cross-origin frames and are correct as-is. Only the top-level `catch` at line 71 and the inline `catch(e) {}` at line 224 need attention.
