# Phase 3: Synthesis -- Merge Timestamp Check Rows

## Delegation Plan

**Team name**: merge-timestamp-display
**Description**: Merge separate timestamp/qualifiedTimestamp check rows into a single "Time verification" row in CLI and web verify outputs.

### Task 1: Merge timestamp check rows in CLI formatter, web verify page, and tests
- **Agent**: frontend-minion
- **Delegation type**: standard
- **Model**: sonnet
- **Mode**: bypassPermissions
- **Blocked by**: none
- **Approval gate**: no
- **Prompt**: |
    ## Task: Merge two timestamp check rows into one "Time verification" row

    You are modifying the presentation layer of the WRL verify command. The verifier
    emits separate `timestamp` and `qualifiedTimestamp` check objects. Currently these
    render as two rows. Merge them into a single "Time verification" row in the CLI
    formatter and the web verify page. The JSON output (`formatJson`) must NOT change.

    ### Files to modify

    1. **`packages/verify/lib/format.js`** -- CLI formatter
    2. **`src/verify-page.js`** -- Web verify page (inline script, no ES imports)
    3. **`packages/verify/test/format.test.js`** -- Tests

    ### Merge function: `mergeTimestampChecks(checks)`

    Write a pure function that takes the raw checks array and returns a new array
    where `timestamp` and `qualifiedTimestamp` entries are replaced by a single
    `timeVerification` entry. Place the merged entry at the position of the first
    removed entry to preserve display order.

    **Status priority**: fail > pass > skip. If either original check has `fail`,
    the merged check is `fail` (with the failing detail). If either has `pass`,
    the merged check is `pass`. Both `skip` = merged `skip`.

    **Detail text for the merged check** (based on what's present and passing):

    | qualifiedTimestamp | timestamp | Merged detail |
    |---|---|---|
    | pass | any | `Qualified electronic timestamp (eIDAS Art. 41)` |
    | absent | pass | `Independent RFC 3161 timestamp` |
    | absent | skip | `No independent timestamp obtained` |
    | fail | any | propagate the failing check's detail |
    | any | fail | propagate the failing check's detail |

    When both are present and both pass, show the qualified text (it subsumes the
    standard timestamp in legal weight).

    **Where to place it:**
    - In `format.js`: define `mergeTimestampChecks()` as a module-level function
      (not exported -- only used internally by `formatHuman`). Call it on the checks
      array at the top of `formatHuman()`, BEFORE the ordering loop. Also feed the
      merged array to `buildVerdict()` so verdict counts reflect merged checks.
    - In `verify-page.js`: duplicate the function inside the inline `<script>` block
      (the browser context cannot import from packages/). Add a comment:
      `// Canonical source: packages/verify/lib/format.js -- keep in sync`
      Call it in `buildResult()` on the `checks` array before passing to `renderChecks()`.

    ### format.js changes

    **CHECK_LABELS**: Add `timeVerification: 'Time verification'`. Keep the old
    `timestamp` and `qualifiedTimestamp` entries -- they are still used by
    `formatJson()` via `checkLabel()`.

    **CHECK_ORDER**: Replace the two entries `'timestamp'` and `'qualifiedTimestamp'`
    with a single `'timeVerification'`.

    **formatHuman()**: After the existing line `const orderedChecks = [];`, merge
    the checks FIRST, then iterate. The flow becomes:
    ```
    const merged = mergeTimestampChecks(result.checks);
    // then use `merged` instead of `result.checks` for ordering and verdict
    ```

    **buildVerdict()**: No changes needed to the function itself. It already counts
    whatever array it receives. The key is to pass it the merged array, not the raw one.

    **formatJson()**: NO CHANGES. It must continue emitting raw `timestamp` and
    `qualifiedTimestamp` check entries with their original labels.

    **Metadata block** (TSA/QTSA lines below the check table): Keep as-is. These
    already show conditionally based on `result.capture.timestamp` and
    `result.capture.qualifiedTimestamp`. They provide the detailed TSA identity
    that the merged check row intentionally omits.

    ### verify-page.js changes

    **CHECK_LABELS**: Replace the `timestamp` and `qualifiedTimestamp` entries with
    `timeVerification: 'Time verification'`.

    **CHECK_DESCS**: Replace the two entries with a single `timeVerification` entry.
    But the description must be state-dependent. The simplest approach: after calling
    `mergeTimestampChecks()`, set a `desc` property on the merged check object itself,
    then in `renderChecks()` prefer `c.desc` over `CHECK_DESCS[c.name]` when present.

    State-dependent descriptions for the web page:

    | State | Description |
    |-------|-------------|
    | Qualified (pass) | `Qualified electronic timestamp from an EU Trusted List TSA (eIDAS Article 41).` |
    | Standard only (pass) | `An independent timestamp authority recorded the time of capture (RFC 3161).` |
    | None (skip) | `No independent timestamp was obtained. Time is based on the capture service clock.` |
    | Fail | `Timestamp verification failed.` |

    **renderChecks()**: Change the desc line to: `var desc = c.desc || CHECK_DESCS[c.name] || '';`

    **buildResult()**: Call `mergeTimestampChecks(checks)` before passing to the
    HTML builder. The function should also set the `.desc` property for the web
    page descriptions.

    **populate()**: The TSA name/time population (lines ~688-694) still works because
    it reads from `signing.timestamp`, not from the checks array. No change needed.

    ### Test changes in format.test.js

    **Existing factories**: Do NOT modify `makePassResult()`, `makeFailResult()`,
    or `makeSkipResult()`. They represent raw verifier output.

    **Existing tests that must be updated**:
    - `'shows "skip" (lowercase) for skipped checks'` (line 152): `makeSkipResult()`
      has a timestamp skip. After merge, the output will show "Time verification"
      with "skip". The test checks for `/skip/` which will still match. No change needed.
    - `'shows skip detail inline'` (line 169): Checks for `/No independent timestamp/`.
      The merged detail is `No independent timestamp obtained`. Update the regex to
      match the new text, or keep it as `/No independent timestamp/` which matches both.
    - Verdict tests (lines 179-196): These use factories with 3 or 4 raw checks.
      `makePassResult()` has 3 checks (no timestamps) -- verdict "All 3" survives.
      `makeSkipResult()` has 4 raw checks. After merge: 3 core + 1 merged skip = 4 display checks.
      Verdict: "3 of 3 applicable, 1 not applicable" -- same numbers. Survives unchanged.
      `makeFailResult()` has 3 checks (no timestamps) -- survives unchanged.

    **New tests to add** in a new `describe('formatHuman -- timestamp merging')` block:

    1. **Qualified only** (qualifiedTimestamp: pass, timestamp: skip):
       - Assert output contains `Time verification`
       - Assert output contains `pass` on that row
       - Assert output does NOT contain `Timestamp imprint` or `Qualified timestamp` as labels
       - Assert verdict: `All 4 cryptographic checks passed` (3 core + 1 merged pass)

    2. **Standard only** (timestamp: pass, no qualifiedTimestamp):
       - Assert `Time verification` with `pass`
       - Assert verdict: `All 4 cryptographic checks passed`

    3. **Both present** (both pass):
       - Assert single `Time verification` row with `pass`
       - Assert verdict: `All 4 cryptographic checks passed` (not 5)

    4. **Neither present** (timestamp: skip, no qualifiedTimestamp):
       - This is covered by existing `makeSkipResult()` tests, but add an explicit
         assertion that the label is `Time verification` (not `Timestamp imprint`)

    5. **Failure propagation** (timestamp: fail):
       - Assert `Time verification` with `FAIL`
       - Assert fail detail propagated

    6. **JSON output unchanged**: Add a test with a result containing both timestamp
       and qualifiedTimestamp checks, format with `formatJson()`, and assert the JSON
       output still has separate `timestamp` and `qualifiedTimestamp` entries with
       original labels.

    For test factories, create inline result objects in each test (or a local helper
    within the describe block). Do NOT modify the existing shared factories.

    ### What NOT to do

    - Do NOT change `formatJson()` or its tests (except adding the backward-compat assertion)
    - Do NOT modify the verifier (`verify.js`) -- this is presentation-layer only
    - Do NOT touch `timestampChain` -- it validates the certificate chain, separate concern
    - Do NOT create a separate utility file -- the function is ~20 lines, inline it in both files
    - Do NOT change the metadata block (TSA/QTSA lines) in `formatHuman()` -- keep showing both
    - Do NOT add the TSA name to the merged check row detail -- that's the metadata section's job

    ### Codebase context

    - `packages/verify/lib/format.js` -- full file, ~298 lines. Exports: `formatHuman`, `formatJson`, `formatJsonError`
    - `src/verify-page.js` -- large file (~700 lines), inline script in template literal. CHECK_LABELS at line 330, CHECK_DESCS at line 339, renderChecks at line 368, buildResult at line 384
    - `packages/verify/test/format.test.js` -- ~323 lines. Uses node:test. Factories at top, formatHuman tests, formatJson tests, formatJsonError tests
    - Run tests with: `cd packages/verify && node --test test/format.test.js`

- **Deliverables**:
    - Updated `packages/verify/lib/format.js` with `mergeTimestampChecks()` and updated CHECK_ORDER/CHECK_LABELS
    - Updated `src/verify-page.js` with duplicated merge function and updated CHECK_LABELS/CHECK_DESCS
    - Updated `packages/verify/test/format.test.js` with new timestamp merge tests and JSON backward-compat test
- **Success criteria**:
    - `node --test packages/verify/test/format.test.js` passes
    - CLI output shows single "Time verification" row for all timestamp states
    - JSON output is byte-identical to before (same check names, same labels)
    - Web verify page shows single "Time verification" row with state-dependent descriptions

### Cross-Cutting Coverage

- **Testing**: Covered within Task 1 -- new test cases for all 4 timestamp states plus failure propagation and JSON backward compatibility. Phase 6 will run the full test suite.
- **Security**: Not applicable -- presentation-layer only change, no new inputs, no auth changes, no dependency additions.
- **Usability -- Strategy**: Covered by ux-strategy-minion's planning contribution. Key decisions (label text, state descriptions, "qualified subsumes standard") are baked into the task prompt. Phase 3.5 mandatory review by ux-strategy-minion will validate.
- **Usability -- Design**: Not applicable -- no new UI components or visual design changes. The web page row structure is unchanged; only the label and description text change.
- **Documentation**: Deferred to Phase 8. The docs site verification page (`site/content/verification.md`) may need the "What each check confirms" table updated, but this is minor enough for the documentation assessment phase to catch.
- **Observability**: Not applicable -- no runtime components, no logging changes.

### Architecture Review Agents

- **Mandatory** (5): security-minion, test-minion, ux-strategy-minion, lucy, margo
- **Discretionary picks**:
  - None selected. This is a 3-file presentation-layer change with no UI components, no runtime services, no web-facing performance impact, and no user documentation changes beyond what Phase 8 will assess.
- **Not selected**:
  - ux-design-minion: No new UI components or visual patterns -- the row structure and icon system are unchanged, only text content changes.
  - accessibility-minion: The HTML structure of check rows is unchanged. Screen reader text (`sr-only` span) still announces the status. No new interaction patterns.
  - sitespeed-minion: No performance impact -- same number of DOM elements (fewer, actually), no new assets.
  - observability-minion: No runtime components affected.
  - user-docs-minion: Documentation updates deferred to Phase 8 assessment.

### Decisions

- **Inline duplication over shared utility file**
  Chosen: Duplicate the ~20-line `mergeTimestampChecks()` in both format.js and verify-page.js
  Over: frontend-minion's Option C (canonical source in a separate checks.js file with import in format.js and inline copy in verify-page.js)
  Why: The verify-page.js browser constraint means we cannot avoid duplication regardless. Adding a third file (checks.js) for a 20-line function that will rarely change violates YAGNI. The function is small, stable, and the test suite covers both copies implicitly through formatHuman tests and explicitly through the merge-specific tests.

- **Generic detail text (no TSA name in merged row)**
  Chosen: Merged row shows mechanism type only ("Independent RFC 3161 timestamp"), TSA identity shown in metadata section below
  Over: ux-strategy-minion's suggestion to include "RFC 3161 timestamp from [TSA name]" in the check row
  Why: Keeps the merge function decoupled from the capture metadata shape. The TSA/QTSA metadata lines already show this information. The check table answers "what kind of verification?" while the metadata section answers "who verified it?"

- **State-dependent descriptions via `.desc` property**
  Chosen: Merge function sets a `.desc` property on the merged check object; renderChecks prefers `c.desc` over static lookup
  Over: Making CHECK_DESCS a function that takes check data
  Why: Minimal change to renderChecks (one line: `c.desc || CHECK_DESCS[c.name] || ''`). Avoids refactoring the static object pattern used by all other checks. The `.desc` override is only needed for the merged timestamp check.

### Risks and Mitigations

1. **Verdict count regressions** (Medium): `buildVerdict()` counts are sensitive to array length changes. Mitigation: explicit count assertions in new tests for all 4 timestamp states, plus existing factories that lack timestamps (3-check results) ensure non-timestamp paths are untouched.

2. **verify-page.js duplication drift** (Low): The inline copy of `mergeTimestampChecks()` could diverge from the format.js copy. Mitigation: Both copies are tested -- format.test.js tests the CLI path directly, and the web page copy is exercised by manual verification. The comment cross-reference makes the relationship visible. If this becomes a problem, a build step can be added later (YAGNI for now).

3. **`timestampChain` contextual confusion** (Low, deferred): When a qualified timestamp is shown but the standard timestamp is visually suppressed, the separate "Timestamp chain" row validates the standard timestamp's certificate chain, which may confuse users. Mitigation: Out of scope for this issue. The chain check only appears when a standard timestamp exists and was verified, so the context is preserved. Can be addressed in a follow-up if user feedback warrants it.

### Execution Order

```
Batch 1 (parallel: single task):
  Task 1: frontend-minion -- merge timestamp rows in format.js, verify-page.js, format.test.js

Post-execution:
  Phase 5: Code review (code-review-minion, lucy, margo)
  Phase 6: Test execution (run format.test.js)
  Phase 8: Documentation assessment
```

No approval gates. No inter-task dependencies.

### Verification Steps

1. Run `cd packages/verify && node --test test/format.test.js` -- all tests pass
2. Manual CLI check: run `wrl verify` on a capture with qualified timestamp -- single "Time verification" row with "pass"
3. Manual CLI check: run `wrl verify` on a capture without timestamps -- single "Time verification" row with "skip"
4. Manual CLI check: run `wrl verify --json` -- JSON output unchanged (separate timestamp/qualifiedTimestamp entries)
5. Visual check of web verify page with a timestamped capture -- single "Time verification" row with correct description
