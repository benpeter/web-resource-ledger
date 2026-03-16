# test-minion Review -- RFC 3161 Timestamp Integration

**Verdict: ADVISE**

## What the plan gets right

The plan references Phase 6 test execution and lists the right test categories: DER codec known-answer tests, TSA mocking, WACZ assembly with/without TSA, verification dual-format, backward compatibility. The risk table explicitly calls out DER parsing bugs and backward compatibility as high-impact items.

## Gaps that need addressing before Phase 6

### 1. No `test/rfc3161.test.js` spec exists yet -- it needs to be created in Phase 6

The plan says `test/rfc3161.js` is referenced in the file header comment, but no task creates it. Phase 6 must produce this file. The plan does not specify what agent writes it or what the minimum viable test surface is. This needs to be explicit.

Minimum required coverage for `rfc3161.js`:

- **DER encoder known-answer test**: encode a TimeStampReq with a known hash and known nonce, compare byte-for-byte against a pre-computed expected DER sequence. This is the single highest-value test in the entire PR.
- **DER parser**: feed a captured real DigiCert TSA response (stored as a base64 fixture) into `verifyTimestamp()`, assert genTime is extracted correctly and valid returns true.
- **Nonce mismatch rejection**: requestTimestamp mock path where response nonce differs from request nonce -- must throw.
- **Hash mismatch rejection**: response messageImprint hash differs from submitted hash -- must throw.
- **Status != 0 rejection**: PKIStatusInfo.status = 2 (rejection) -- must throw.
- **64KB size cap**: response body > 65536 bytes -- must throw before parsing.
- **Malformed DER**: truncated buffer, indefinite-length encoding, overlong length field -- each must throw without panic.

Without a real TSA fixture file (`test/fixtures/digicert-response.b64` or similar), the DER parser tests will use only synthetic data. The plan does not mention fixture capture. Phase 6 or Task 1 should capture a real DigiCert response during development and commit it as a test fixture.

### 2. Existing `verify.test.js` hardcodes `checks.length === 3` in three places

Lines 118, 254, and 410 assert `toHaveLength(3)`. After Task 3 ships, v0.1.0 WACZ files still return 3 checks (by design), so these tests remain correct for the test data they use. However, `buildTestWacz` in `verify.test.js` builds v0.1.0 format (flat `signedData`, `version: '0.1.0'`). Phase 6 must also add a `buildTestWaczV2()` helper that produces v0.2.0 format and drives the new check-4 scenarios.

Specific tests that must be added to `verify.test.js` (or a new `verify-v2.test.js`):

- v0.2.0 WACZ with valid timestamp entry: 4 checks, all pass, `verified: true`
- v0.2.0 WACZ with no rfc3161 entry: 4 checks, timestamp=skip, `verified: true`
- v0.2.0 WACZ with invalid timestamp (hash mismatch in token): timestamp=fail, `verified: false`
- v0.2.0 WACZ with malformed token (unparseable base64/DER): timestamp=fail, `verified: false`
- Unknown version string (`"0.9.0"`): all checks fail, `verified: false`
- `result.capture.timestamp` is populated when timestamp passes, absent when skip

### 3. `verified` predicate change needs explicit regression test

The change from `every(pass)` to `every(pass || skip)` is a security-sensitive invariant. The existing test suite does not test the `skip` state at all (no test currently triggers `status: 'skip'`). Phase 6 must add a test that:

- Builds a v0.2.0 WACZ without an rfc3161 entry
- Asserts `timestamp.status === 'skip'` AND `verified === true`
- Also asserts that a v0.2.0 WACZ with `timestamp.status === 'fail'` produces `verified === false`

This pair of tests is the direct guard for the conflict resolution documented in the plan.

### 4. `wacz.test.js` integration tests check old format fields directly

Line 180 accesses `digest.signedData.keyId` and line 208 destructures `{ hash, signature, publicKey }` from `digest.signedData` directly. After Task 2, these fields move into `signedData.signatures[0]`. The existing integration tests will break unless Task 2 maintains backward field access OR the tests are updated in Phase 6.

Phase 6 must update `wacz.test.js` to:
- Assert `signedData.version === '0.2.0'`
- Assert `signedData.signatures` is an array with at least one entry
- Assert `signatures.find(s => s.type === 'self')` has `signature`, `publicKey`, `keyId`
- Assert `timestampStatus` in the `buildWacz()` return value is either `'present'` or `'absent'`
- Add a test where `TSA_URL` is unset: `timestampStatus === 'absent'`, no rfc3161 entry in signatures array

### 5. TSA mock strategy is not defined

The plan says "TSA mocking" but does not specify the mechanism. The existing `wacz.test.js` uses `fetchMock` (cloudflare:test). The TSA POST to `http://timestamp.digicert.com` will be blocked by `fetchMock.disableNetConnect()` unless explicitly mocked.

Phase 6 must define:
- A minimal valid DER-encoded TimeStampResp fixture (or the test constructs one programmatically using the same `writeTLV` logic) to use as the mock response body
- A `fetchMock.post('http://timestamp.digicert.com').reply(200, <fixture>, { headers: { 'Content-Type': 'application/timestamp-reply' } })` pattern in relevant wacz.test.js tests
- A timeout simulation path: `fetchMock.post(...).reply(500)` or network-abort to test graceful degradation

## Minor observations

- The plan correctly scopes `verifyTimestamp` to hash-match only (no CMS chain validation). Tests should not attempt to verify the TSA's signature -- that would require a real certificate and is explicitly deferred.
- The `skip` detail message in the plan ("No independent timestamp was obtained for this capture") is good. A test should assert the exact detail string is present, since it is user-facing.
- The security invariant test in `verify.test.js` (lines 302-388) checks that `detail` messages never leak hash values. Phase 6 should extend this to cover the new timestamp failure case detail: "Independent timestamp verification failed" -- that string is safe.

## What blocks vs. advises

None of these gaps block execution. Tasks 1-6 can proceed as specified. Phase 6 is the right place to address them. The advice is that Phase 6 must be scoped explicitly to cover all items above -- especially the DER known-answer test and the `wacz.test.js` format migration -- or test coverage will be materially incomplete for the highest-risk code in this PR.
