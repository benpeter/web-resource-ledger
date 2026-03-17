# Test Minion Contribution: fail-loudly phase

## Summary of findings

I read all relevant test files and source files. Here is the precise impact map for the two categories of change.

---

## Category 1: `timestampStatus` rename `'absent'` → `'skipped'`

### Exact test that WILL BREAK

**File: `test/wacz.test.js`, line 278**

```js
it('timestampStatus is absent when env has no TSA_URL', async () => {
  // ...
  expect(result.timestampStatus).toBe('absent');
});
```

This test name and assertion are both wrong after the change. The fix is:

1. Rename the test: `'timestampStatus is skipped when env has no TSA_URL'`
2. Change the assertion: `.toBe('skipped')`

No other test files assert on `'absent'` directly. I grep-confirmed that `verify-integration.test.js`, `capture.test.js`, and the integration tests do not assert the `timestampStatus` value — they either ignore it or use `waczInfo?.timestampStatus` indirectly through the log call.

### No new tests needed for the rename itself

The rename is a semantic clarification with a single assertion to update. The existing test structure covers all three states:
- `'skipped'` (no TSA_URL) — test at line 270, needs update
- `'present'` (TSA returns token) — covered implicitly by integration path; no direct unit test but the field propagates through `waczInfo` to KV record
- `'error'` (TSA returns 500 or is unreachable) — covered by tests at lines 281–306

**However**, the KV record's `timestampStatus` field should also be confirmed. After the rename, `capture.test.js` does not assert `record.wacz.timestampStatus`. Consider adding a test in `test/wacz.test.js` or `test/capture.test.js`:

```js
it('KV record wacz.timestampStatus is skipped when no TSA configured', async () => {
  mockHeaderFetch();
  await createCapture(env.KV, TEST_ID, TEST_URL, TEST_IP, 'default');
  await performCapture(env, TEST_URL, TEST_IP, TEST_ID, 'default', undefined, stubRenderer);
  const record = await getCapture(env.KV, TEST_ID);
  expect(record.wacz.timestampStatus).toBe('skipped');
});
```

This test doesn't currently exist and would be newly failing if `timestampStatus` were missing entirely from the KV record. It is recommended but not strictly required for the rename to pass.

---

## Category 2: Bare `catch {}` blocks getting error parameters

### Source files with bare catch blocks and their current state

After reading all source files, here is the inventory:

| File | Location | Current form | Fix direction |
|------|----------|--------------|---------------|
| `src/capture.js` L261 | `failCapture` inner catch | `catch {` | `catch (err) {` — already has log call inside |
| `src/capture.js` L335 | `connect()` race condition | `catch {` | `catch (err) {` — fallthrough is intentional, but needs named param |
| `src/capture.js` L462-465 | `frame()` detached frames | `catch (err) {` | already named — no change needed |
| `src/capture.js` L563 | Partial capture fallback | `catch {` | `catch (err) {` — rethrows, needs named param |
| `src/cdxj.js` L75 | URL parse fallback | `catch {` | `catch (err) {` — returns fallback, named param clarifies intent |
| `src/index.js` L162-164 | JSON body parse | `catch {` | `catch (err) {` — returns 400, named param |
| `src/index.js` L187-189 | KV createCapture | `catch {` | `catch (err) {` — returns 500, named param |
| `src/kv.js` L198 | cursor decode | `catch {` | `catch (err) {` — returns `invalid_cursor`, named param |
| `src/log.js` L39 | fetch `.catch(() => {})` | anonymous arrow | `catch (err) => {}` — logger must not throw, but can log to console |
| `src/log.js` L40 | outer try/catch | `catch {` | `catch (err) {` — JSON.stringify failure, named param |
| `src/verify.js` L63 | unzipSync failure | `catch {` | already handled — returns structured failure; no param needed per spec |
| `src/verify.js` L104 | JSON.parse failure | `catch {` | same — returns structured failure |
| `src/verify.js` L209 | timestamp verify | `catch {` | same — returns structured failure |

### Tests that will BREAK due to catch block changes

**None of the existing tests will break** from adding `err` parameters to catch blocks. Naming a catch parameter is backward-compatible — it does not change behavior.

The risk is the opposite: the implementation author might accidentally *add logging* to a catch block that was previously silent, which could cause tests that assert on console output or log call counts to fail. I found no such assertions in the test suite.

### New tests that SHOULD be added for error logging

The project philosophy ("fail loudly") means we should verify that the new logging in catch blocks actually fires. The following tests are warranted:

#### `test/capture.test.js` — verify WACZ bundling failure logs

The catch block at `src/capture.js` line 208-212 (WACZ bundling failure) already logs `capture.wacz_fail`. There is no test asserting this log fires. This is an existing gap, not introduced by the current change, but the current change is the right moment to add it.

#### `test/capture.test.js` — verify failCapture KV failure logs

The catch block at line 261 (catch-all inner `failCapture`) already logs `capture.kv_fail`. No test asserts this log fires.

#### `test/log.test.js` — the `log` function catch blocks

`src/log.js` has two catch sites:
- `.catch(() => {})` on the fetch — existing test at line 160 already covers this ("resolves without throwing when fetch rejects")
- `catch { return; }` around `JSON.stringify` — existing test at line 171 already covers this ("returns undefined for circular references without throwing")

Both are already tested. **No changes needed to `test/log.test.js`**.

#### `test/cdxj.js` (does not exist as a separate file but toSurt is tested in `test/wacz.test.js`)

The `catch` in `toSurt` is a URL parse fallback returning the original string. There is already a test confirming the fallthrough for `urn:` URIs. The catch block with a named parameter doesn't need a new test — the existing behavior is the same.

---

## Recommended test changes: priority-ordered list

### P0 (will cause test failure if not done)

**File: `test/wacz.test.js`**
- Line 270: rename test description from `'absent'` to `'skipped'`
- Line 278: change `toBe('absent')` to `toBe('skipped')`

### P1 (should add — closes observable gaps)

**File: `test/wacz.test.js` or `test/capture.test.js`**
- Add: `'KV record wacz.timestampStatus is skipped when no TSA configured'`
  - Asserts `record.wacz.timestampStatus === 'skipped'` after a full capture with no `TSA_URL`
  - This confirms the value flows from `buildWacz` → `waczInfo` → `completeCapture` → KV record

**File: `test/capture.test.js`**
- The test at line 696 (`'KV record has no wacz field'`) uses `partialRenderer` — this is fine, partial captures skip WACZ entirely
- Add: `'capture.wacz_fail log fires when WACZ bundling throws unexpectedly'`
  - Requires a mock or spy on the log function (or checking that `record.status` is still `'complete'` while `record.wacz` is undefined after injecting a `buildWacz` that throws)
  - The capture-completes-without-WACZ path is currently untested as an error path

### P2 (optional, lower value)

- `test/kv.test.js`: add a test for `listCaptures` with a malformed cursor returning `{ error: 'invalid_cursor' }` — the catch block at `kv.js` line 198 is already exercised by this semantic. Check if a test exists. (From my read of `test/kv.test.js` lines 1-80, there are tests for `listCaptures` pagination but the full file wasn't read — verify before adding.)

---

## Files NOT requiring test changes

These source files are being modified only to add a named error parameter to a bare `catch` — no behavioral change:
- `src/consent.js` — catch block gets `err` parameter, no test update needed
- `src/signing.js` — catch block gets `err` parameter, no test update needed
- `src/index.js` lines 162, 187 — catch blocks get `err` parameter, no test update needed

The `verify-page.test.js` and `verify-integration.test.js` tests do not assert on `timestampStatus` in the API response — they assert on the `checks` array structure and status values (`pass`, `skip`). The word `'skip'` (used in `verify.js` check status) is different from `timestampStatus: 'skipped'` (used in `wacz.js`). These are separate vocabularies and no verify-side test needs to change.

---

## Confidence levels

- **Breaking test identified**: high confidence — `test/wacz.test.js` line 278 is the only assertion on the string `'absent'` in the test suite
- **No other test files assert on 'absent'**: confirmed by reading all test files listed
- **Catch block changes are non-breaking**: high confidence — naming a catch parameter changes nothing observable
- **KV record timestampStatus gap**: confirmed by reading `capture.test.js` — no assertion on `record.wacz.timestampStatus` exists anywhere
