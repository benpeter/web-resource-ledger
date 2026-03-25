## Task: Merge two timestamp check rows into one "Time verification" row

You are modifying the presentation layer of the WRL verify command. The verifier emits separate `timestamp` and `qualifiedTimestamp` check objects. Currently these render as two rows. Merge them into a single "Time verification" row in the CLI formatter and the web verify page. The JSON output (`formatJson`) must NOT change.

### Files to modify

1. **`packages/verify/lib/format.js`** -- CLI formatter
2. **`src/verify-page.js`** -- Web verify page (inline script, no ES imports)
3. **`packages/verify/test/format.test.js`** -- Tests

### Implementation approach

Write a `mergeTimestampChecks(checks)` function that transforms the raw checks array. Duplicate it in both files (browser can't import). Status priority: fail > pass > skip.

### Test advisories (from test-minion review)
1. Create explicit test fixtures with both timestamp and qualifiedTimestamp as raw checks
2. Assert `matches.length === 1` for "both present" case (verify two rows became one)
3. Exclude timestampChain from test fixtures (consistent with existing factories)
4. Assert JSON label field values explicitly in backward-compat test

### Run tests with
`cd packages/verify && node --test test/format.test.js`
