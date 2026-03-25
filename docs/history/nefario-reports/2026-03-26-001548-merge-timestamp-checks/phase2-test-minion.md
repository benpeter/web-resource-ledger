# Domain Plan Contribution: test-minion

## Recommendations

### The merge happens in two layers -- keep tests aligned to each

1. **Verify layer** (`packages/verify/lib/verify.js`, `src/verify.js`): still emits separate `timestamp` and `qualifiedTimestamp` check objects. No change here -- verification logic remains untouched. Existing verify tests (`packages/verify/test/verify.test.js`, `test/verify.test.js`) should NOT be modified.

2. **Format/display layer** (`packages/verify/lib/format.js`, `src/verify-page.js`): this is where the two checks are merged into a single "Time verification" row for display. All new tests and test updates belong here.

### Merge logic must be tested in isolation

The merging of two raw checks into one display row is a pure function (or should be extracted as one). It takes the raw checks array and returns a display-ready array. Test this mapping directly, not just through `formatHuman` stdout capture.

### Verdict line arithmetic is the highest-risk area

The `buildVerdict()` function counts checks by status. Currently `makeSkipResult()` has 4 checks (3 pass + 1 skip), producing "3 of 3 applicable checks passed, 1 check not applicable". After the merge, the merged row replaces `timestamp` and `qualifiedTimestamp` with a single display check. The verdict must count the *merged* checks, not the raw checks. This is where bugs will hide.

---

## Proposed Tasks

### Task 1: Add timestamp merge unit tests to `packages/verify/test/format.test.js`

Add a new `describe('formatHuman -- timestamp merging')` block with four test cases for the four states. Each test constructs a result with specific raw checks and asserts the merged output.

**State 1 -- Qualified only (qualifiedTimestamp pass, timestamp skip):**
```js
checks: [
  { name: 'artifactHashes', status: 'pass' },
  { name: 'bundleHash', status: 'pass' },
  { name: 'signature', status: 'pass' },
  { name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' },
  { name: 'qualifiedTimestamp', status: 'pass' },
]
```
- Assert output contains "Time verification" (the merged label)
- Assert output contains "pass" for the merged row
- Assert output does NOT contain "Timestamp imprint" or "Qualified timestamp" as separate rows
- Assert output does NOT contain "skip" (the timestamp skip is subsumed by the qualified pass)

**State 2 -- Standard only (timestamp pass, no qualifiedTimestamp):**
```js
checks: [
  { name: 'artifactHashes', status: 'pass' },
  { name: 'bundleHash', status: 'pass' },
  { name: 'signature', status: 'pass' },
  { name: 'timestamp', status: 'pass' },
]
```
- Assert output contains "Time verification" with "pass"
- Assert output does NOT contain "Timestamp imprint"

**State 3 -- Both present (both pass):**
```js
checks: [
  { name: 'artifactHashes', status: 'pass' },
  { name: 'bundleHash', status: 'pass' },
  { name: 'signature', status: 'pass' },
  { name: 'timestamp', status: 'pass' },
  { name: 'qualifiedTimestamp', status: 'pass' },
]
```
- Assert merged row shows "pass"
- Assert only one "Time verification" row appears (not two rows)
- Assert the qualified tier is indicated (e.g., "eIDAS" in the label or detail)

**State 4 -- None (timestamp skip, no qualifiedTimestamp):**
```js
checks: [
  { name: 'artifactHashes', status: 'pass' },
  { name: 'bundleHash', status: 'pass' },
  { name: 'signature', status: 'pass' },
  { name: 'timestamp', status: 'skip', detail: 'No independent timestamp was obtained for this capture' },
]
```
- Assert merged row shows "skip"
- Assert skip detail is present

**Additional edge case -- failure propagation:**
```js
checks: [
  { name: 'artifactHashes', status: 'pass' },
  { name: 'bundleHash', status: 'pass' },
  { name: 'signature', status: 'pass' },
  { name: 'timestamp', status: 'fail', detail: 'Independent timestamp verification failed' },
]
```
- Assert merged row shows "FAIL"
- Assert fail detail is present

### Task 2: Update existing tests that break due to the merge

**Tests that will break and need updating:**

1. **`format.test.js` line 96 -- `makeSkipResult()` factory**: Currently has `{ name: 'timestamp', status: 'skip' }`. After the merge, the output will show "Time verification" instead of "Timestamp imprint". The test at line 170 (`'shows skip detail inline'`) will still work since it checks for the detail text, not the label. But the `makeSkipResult` factory itself should remain unchanged (it represents raw verify output, not display output).

2. **`format.test.js` lines 179-196 -- verdict line tests**: These are the critical breakages.
   - Line 181: `All 3 cryptographic checks passed` -- the `makePassResult()` factory has 3 checks (no timestamp). After the merge, if there's no timestamp or qualifiedTimestamp check in the raw data, the merged result still has 3 display checks. **This test may survive unchanged** if the merge logic only activates when timestamp/qualifiedTimestamp checks are present.
   - Line 185-188: `makeSkipResult()` has 4 raw checks (3 pass + 1 skip). After merging, the display has 4 checks (3 pass + 1 merged skip). The counts `3 of 3 applicable` and `1 check not applicable` should remain the same. **This test likely survives unchanged.**
   - Line 193: `makeFailResult()` has 3 checks (1 fail + 2 pass). No timestamp checks. **Survives unchanged.**

   **Verdict test that DOES need adding**: a result with 5 raw checks (3 core + timestamp pass + qualifiedTimestamp pass) should produce a verdict of "All 4 cryptographic checks passed" (not 5), because the two timestamp checks merge into one display check.

3. **`format.test.js` line 157 -- `'shows check labels from the mapping table'`**: Currently asserts "File integrity", "Bundle integrity", "Digital signature". This test survives because `makePassResult()` has no timestamp checks. But a companion test should assert "Time verification" appears when timestamp checks are present.

4. **`formatJson` tests (lines 203-277)**: The JSON formatter currently outputs raw check names/labels. **Decision needed**: does `formatJson` also merge the two rows, or does it preserve the raw granularity? If JSON stays raw (recommended for machine consumers), these tests are untouched. If JSON also merges, the `check labels match expected mapping` test (line 255) needs a "Time verification" entry.

### Task 3: Update `CHECK_LABELS` and `CHECK_ORDER` in format.js

Remove separate `timestamp` and `qualifiedTimestamp` entries. Add `timeVerification: 'Time verification'`. The merge logic should:
- Look for `timestamp` and `qualifiedTimestamp` in raw checks
- Produce a single `timeVerification` display check
- Status priority: fail > pass > skip (if either fails, merged fails; if either passes, merged passes; both skip = skip)

### Task 4: Verify verdict count correctness with explicit count tests

Add explicit tests that assert the exact number in the verdict string for each merge scenario:

| Raw checks | Expected display count | Verdict pattern |
|---|---|---|
| 3 core only | 3 | `All 3 cryptographic checks passed` |
| 3 core + timestamp:skip | 4 display (3 applicable + 1 skip) | `3 of 3 applicable` |
| 3 core + timestamp:pass | 4 display (4 applicable) | `All 4 cryptographic checks passed` |
| 3 core + timestamp:pass + qualifiedTimestamp:pass | 4 display (4 applicable) | `All 4 cryptographic checks passed` |
| 3 core + timestamp:skip + qualifiedTimestamp:pass | 4 display (4 applicable) | `All 4 cryptographic checks passed` |
| 3 core + timestamp:pass + qualifiedTimestamp:pass + timestampChain:pass | 5 display (5 applicable) | `All 5 cryptographic checks passed` |
| 3 core + timestamp:pass + qualifiedTimestamp:pass + timestampChain:skip | 5 display (4 applicable + 1 skip) | `4 of 4 applicable` |

### Task 5: Update web verify page (`src/verify-page.js`)

The `CHECK_LABELS` and `CHECK_DESCS` objects at lines 330-346 need the same merge treatment. The rendering loop at line 369 iterates raw checks -- it needs to merge before rendering.

No dedicated test file exists for verify-page display logic (`test/verify-page.test.js` has no timestamp-related tests). If the merge logic is extracted as a shared utility, the format.test.js tests cover it for both CLI and web.

### Task 6: Consider extracting merge logic as shared utility

Both `packages/verify/lib/format.js` (CLI) and `src/verify-page.js` (web) need the same merge logic. Extract a `mergeTimestampChecks(checks)` function that both consumers import. Test this function directly -- it's pure input/output, easy to test exhaustively.

---

## Risks and Concerns

1. **JSON output backward compatibility**: If `formatJson` also merges the two checks, any machine consumer parsing `name: 'timestamp'` or `name: 'qualifiedTimestamp'` will break. Recommendation: keep JSON raw, merge only in human/HTML formatters. Add a test that explicitly asserts `formatJson` preserves raw check names.

2. **`timestampChain` check depends on `timestamp`**: The `timestampChain` check validates the CMS chain of the standard timestamp. After the visual merge, `timestampChain` still appears as a separate row. The merge must NOT absorb `timestampChain` -- only `timestamp` and `qualifiedTimestamp` merge. Add a negative test: result with timestamp + qualifiedTimestamp + timestampChain should show TWO rows (Time verification + Timestamp chain), not one.

3. **Status priority in merge logic**: The priority rule (fail > pass > skip) needs careful testing. Edge case: `timestamp: fail` + `qualifiedTimestamp: pass`. Should the merged row show fail or pass? If the standard timestamp was present but invalid, that's a real verification failure, even if the qualified one passed. Recommend: any fail = merged fail. Test this edge case explicitly.

4. **`makeSkipResult` factory reuse**: Multiple test files use `makeSkipResult()`. Changing its shape (e.g., adding qualifiedTimestamp) would cascade. Recommendation: leave existing factories unchanged (they represent raw verify output). Create new factory variants for the four timestamp states, used only in merge-specific tests.

5. **Web verify page has no test infrastructure for rendering logic**: The `test/verify-page.test.js` file does not test the check rendering. If the merge logic is in a shared utility, this is fine. If it's inline in verify-page.js, it will be untested. Flag this as a coverage gap.

---

## Additional Agents Needed

None.
