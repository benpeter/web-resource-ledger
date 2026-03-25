# Margo Review -- Backend Fixes Batch

## VERDICT: APPROVE

The changes are proportional to the problems being solved. No new dependencies, no new abstraction layers, no YAGNI violations. Specific notes below.

## FINDINGS

- [NIT] src/index.js:1734-1767 -- `buildArtifactFilename` has a `try/catch` with a full fallback map that duplicates the extensions map. The fallback is justified (URL parse failure is a real edge case and the function sits in a Content-Disposition header path where a crash would be bad), but the two maps (`extensions` and `generics`) could share a single source. Not blocking -- the duplication is 6 lines and the function is self-contained.
  FIX: No action needed. If the artifact list grows, consolidate both maps into one object with `{ ext, fallbackName }` entries.

- [NIT] src/index.js:305-338 -- The notification short-circuit for approaching_limit is well-justified (avoids 2 D1 queries per capture for counts 161-200). The inline comment explains the rationale clearly. The nesting depth (3 levels of `if` inside an async IIFE inside `ctx.waitUntil`) is moderate but acceptable given the guard-clause pattern. Cognitive complexity stays within bounds because each condition narrows clearly.
  FIX: None needed.

- [NIT] test/notification-triggers.test.js:233-248 -- The "does NOT dispatch below 80% threshold" test (line 233) asserts only that a number is less than another number (`expect(belowThreshold).toBeLessThan(...)`) without actually exercising the production code path. It is a math assertion, not a behavior test. It does not harm anything, but it also does not catch regressions -- if the threshold guard in index.js were deleted, this test would still pass.
  FIX: Consider replacing with a test that runs the actual queue consumer with usage at 79% and asserts no notification is dispatched. Or accept this as a documentation test and move on.

- [NIT] test/capture-retrieval.test.js:346-385 -- The Content-Disposition filename tests are thorough and test a real user-facing behavior (download filenames). The regex assertions are specific enough to catch regressions without being brittle. Good coverage of the `-before` suffix edge case.
  FIX: None needed.

## Summary

No new complexity introduced. The `buildArtifactFilename` function is ~33 lines, single-purpose, no dependencies. The notification short-circuit adds one D1 query to save two, with clear comments explaining why. Tests are proportional to the code they cover. Nothing to block on.
