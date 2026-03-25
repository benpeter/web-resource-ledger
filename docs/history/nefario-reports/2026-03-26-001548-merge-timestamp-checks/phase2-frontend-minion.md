# Domain Plan Contribution: frontend-minion

## Recommendations

### Pre-process the checks array, do not modify rendering logic

The strongest approach is a shared **merge function** that transforms the checks array *before* either renderer touches it. Both `format.js` (CLI) and `verify-page.js` (web) iterate over a checks array and look up labels by `name`. If we insert a single merged check entry (e.g., `name: 'timeVerification'`) and remove the two originals, both renderers work unchanged -- they just need the new label/description in their lookup objects.

Why pre-process rather than modify rendering:

1. **Single source of truth for merge logic.** The four-state decision ("qualified beats standard beats none") lives in one function, not duplicated across two renderers with different templating styles (ANSI vs HTML template literals).
2. **Renderers stay dumb.** `renderChecks()` and the `formatHuman()` check-table loop both iterate an array and look up labels. No conditional branching needed at render time.
3. **Testable in isolation.** A pure function `mergeTimestampChecks(checks) -> checks` can be unit-tested with the four states without rendering anything.

### Merge function specification

```js
/**
 * Replaces separate `timestamp` and `qualifiedTimestamp` check entries
 * with a single `timeVerification` entry.
 *
 * @param {Array<{name: string, status: string, detail?: string}>} checks
 * @returns {Array<{name: string, status: string, detail?: string}>}
 */
function mergeTimestampChecks(checks) { ... }
```

Decision table for the merged entry:

| qualifiedTimestamp | timestamp | Merged status | Merged detail |
|---|---|---|---|
| pass | skip | pass | "Qualified electronic timestamp (eIDAS)" |
| pass | pass | pass | "Qualified electronic timestamp (eIDAS)" (show strongest) |
| absent | pass | pass | "Independent timestamp from {TSA name}" |
| absent | skip | skip | "No independent timestamp" |
| fail | any | fail | propagate original detail |
| any | fail | fail | propagate original detail |

The function removes entries named `timestamp` and `qualifiedTimestamp` from the array, inserts a single `timeVerification` entry at the position of the first removed entry (preserving display order), and returns the new array.

### Where to place the merge function

**Option A (recommended): Shared utility in `packages/verify/lib/format.js`** -- exported and also imported by `verify-page.js`. But `verify-page.js` runs in the browser as an inline script inside a template literal, so it cannot `import`. Therefore:

**Option B (pragmatic): Duplicate the ~20-line function in both files.** The logic is small, stable, and unlikely to diverge. Both files already have parallel `CHECK_LABELS` objects. Add a clear comment in each copy pointing to the other.

**Option C (best of both): Define the function once in `packages/verify/lib/checks.js`, use it in `format.js` via import, and inline a copy in `verify-page.js`.** The `verify-page.js` copy is the "browser build" of the same logic. A test can verify both copies produce identical output for all four states.

I recommend **Option C** -- it gives a canonical source while acknowledging the browser constraint.

### TSA name in the merged detail string

The merged check needs the TSA name for state 3 ("Independent timestamp from {TSA name}"). The current checks array entries do not carry TSA metadata -- that lives in `result.capture.timestamp.tsa` / `result.capture.qualifiedTimestamp.tsa`. Two approaches:

- **Pass the signing/capture context to the merge function** so it can embed TSA name in the detail string.
- **Use a generic detail** like "Independent RFC 3161 timestamp" and let the cryptographic details section (which already shows TSA name) provide the specifics.

The second option is simpler and avoids coupling the merge function to the capture metadata shape. The check row says *what kind* of timestamp; the crypto details section says *who issued it*. This matches how the signature check works (check row says "pass", crypto details show the key).

### JSON output: do not change

The issue says "presentation-layer only." `formatJson()` should continue emitting the raw `timestamp` and `qualifiedTimestamp` check entries unchanged. Reasons:

1. **Backward compatibility.** JSON consumers (scripts, CI pipelines) may key on `name: 'timestamp'`.
2. **Machine-readable output should be granular.** Merging is a UX convenience for humans. Machines benefit from seeing both checks individually.
3. **The merge is lossy.** Collapsing two checks into one discards information that a JSON consumer might need.

No changes to `formatJson()`.

### Cryptographic details section in verify-page.js

The crypto details section (lines 468-496) already shows TSA details conditionally when `signing.timestamp` exists. This section should be updated to also handle `signing.qualifiedTimestamp`:

- If qualified timestamp present: show QTSA name and time (labeled "Qualified timestamp authority" / "Qualified timestamp issued")
- If only standard timestamp: show TSA name and time (current behavior)
- If both: show qualified (it's the stronger credential)

This is a small rendering change in `buildResult()` and `populate()`, not a structural change.

### CHECK_ORDER and CHECK_LABELS updates

In `format.js`:
- Remove `timestamp` and `qualifiedTimestamp` from `CHECK_ORDER`
- Add `timeVerification` in their place (single entry)
- Add `timeVerification: 'Time verification'` to `CHECK_LABELS`
- Keep old labels for backward compat in `checkLabel()` (they're still used by `formatJson`)

In `verify-page.js`:
- Replace `timestamp` and `qualifiedTimestamp` entries in `CHECK_LABELS` and `CHECK_DESCS` with `timeVerification`
- New description: "Verifies the capture was timestamped by an independent authority."

## Proposed Tasks

1. **Create `mergeTimestampChecks()` function** in `packages/verify/lib/checks.js` (or `format-utils.js`). Pure function, no dependencies. Takes checks array, returns new array with merged entry. ~20 lines.

2. **Add unit tests for merge function** covering all four states plus edge cases (both fail, missing entries, empty array). In `packages/verify/test/`.

3. **Update `format.js`** (CLI formatter):
   - Import and call `mergeTimestampChecks()` at the top of `formatHuman()`
   - Update `CHECK_LABELS` and `CHECK_ORDER` to include `timeVerification`
   - Keep old labels in `CHECK_LABELS` (used by `formatJson` via `checkLabel()`)
   - Do NOT change `formatJson()`

4. **Update `verify-page.js`** (web verify page):
   - Inline `mergeTimestampChecks()` in the script block (with comment pointing to canonical source)
   - Call it in `buildResult()` before passing checks to `renderChecks()`
   - Update `CHECK_LABELS` and `CHECK_DESCS` with `timeVerification` entry
   - Update crypto details section to handle `signing.qualifiedTimestamp` in addition to `signing.timestamp`
   - Update `populate()` to fill QTSA details when present

5. **Update existing format tests** in `packages/verify/test/format.test.js` to reflect the merged check row in human output. Verify JSON output is unchanged.

6. **Cross-verify browser copy** -- add a test that imports both the canonical and inlined merge functions and asserts identical output for all states (optional but recommended).

## Risks and Concerns

1. **TSA name not available in checks array.** If the issue expects the merged row to show the TSA name inline (e.g., "Independent timestamp from DigiCert"), the merge function needs access to `result.capture.timestamp.tsa`. This couples the merge to the result shape. Recommend keeping the check row generic and showing TSA details in the crypto section only.

2. **`verify-page.js` inline script constraint.** This file builds HTML as template literals with an embedded `<script>` block. It cannot use ES module imports. The merge function must be inlined. Keeping it small (~20 lines) minimizes the duplication cost.

3. **Verdict count changes.** `buildVerdict()` in `format.js` counts applicable vs skipped checks. Merging two checks into one changes these counts. For example, a capture with no timestamp currently shows 2 skipped checks (timestamp + qualifiedTimestamp); after merge it shows 1 skipped. The verdict wording may need adjustment. This is minor but should be verified in tests.

4. **Existing snapshot/integration tests.** Any tests that assert exact CLI output or JSON structure will break if check counts change. Search for test fixtures referencing `timestamp` or `qualifiedTimestamp` in human-formatted output.

5. **`timestampChain` remains separate.** The merge only combines `timestamp` + `qualifiedTimestamp`. The `timestampChain` check stays as-is since it validates the certificate chain, which is a distinct concern.

## Additional Agents Needed

None.
