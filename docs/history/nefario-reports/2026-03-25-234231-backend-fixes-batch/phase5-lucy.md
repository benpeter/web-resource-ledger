# Lucy Review: Phase 0082 Backend Fixes Batch

## Original Request (Issue #214)

Two items:
1. **#187**: Short-circuit `dispatchNotification` for `approaching_limit` when already sent this billing period (avoid ~2 wasted D1 queries for captures 161-200 on free tier).
2. **#181**: Set descriptive `Content-Disposition` filenames on capture artifact downloads (domain + date instead of opaque UUIDs).

## Traceability

| Requirement | Plan Element | Status |
|---|---|---|
| #187: Skip `approaching_limit` dispatch when already sent | `checkNotificationSent` call-site pre-check in `src/index.js:314-332` | Covered |
| #187: Test coverage for short-circuit | `test/notification-triggers.test.js` lines 290-344 (2 new tests) | Covered |
| #181: Descriptive Content-Disposition filenames | `buildArtifactFilename()` in `src/index.js:1734-1767`, wired at line 1839 | Covered |
| #181: Test coverage for filenames | `test/capture-retrieval.test.js` lines 346-385 (4 new tests) | Covered |
| Constraint: existing tests pass | Not verified here (CI responsibility) | N/A |

No orphaned tasks. No unaddressed requirements.

## Scope Check

No scope creep detected. The changes are strictly limited to the two items described in the issue. No new dependencies, no new abstractions, no adjacent features.

## CLAUDE.md Compliance

- **Fail loudly**: The `checkNotificationSent` call at line 319 sits inside a `try/catch` (line 335) that logs the error. The `buildArtifactFilename` catch block (line 1756) falls back to generic filenames rather than swallowing silently -- acceptable since a URL parse failure is a data quality issue, not an operational error. Compliant.
- **YAGNI/KISS**: Both changes are minimal and focused. The filename builder is ~33 lines with a clear fallback. No over-engineering.
- **Vanilla JS**: No new dependencies. Compliant.
- **Engineering philosophy**: The short-circuit is a measured optimization (the comment explains exactly what D1 cost it avoids). The filename builder has input sanitization (hostname and date). Compliant.

## Findings

- [ADVISE] `src/index.js:1747-1748` -- hostname sanitization strips to `[a-z0-9.-]` but does not handle IDN/punycode domains explicitly. A URL like `https://xn--nxasmq6b.example` would work fine since punycode is ASCII, but a non-ASCII URL stored in the DB (e.g., `https://example.com/path`) with a Unicode hostname would produce an empty or garbled hostname after the regex. The `try/catch` fallback handles this safely (generic filename), so this is not a bug -- just a note that the fallback will trigger for internationalized domains stored as Unicode.
  FIX: No fix required. The fallback behavior is correct. Document in a code comment if desired.

- [NIT] `src/index.js:1752` -- `record.createdAt` is sanitized with `.replace(/[^0-9-]/g, '')`, which is correct for ISO date prefixes but would silently produce `""` if `createdAt` is null/undefined (the `?? ''` handles that). The resulting filename would be `capture-example.com-.png` (note the trailing dash before extension). This is cosmetically odd but not harmful.
  FIX: Consider adding a fallback date like `const date = ... || 'unknown'` to produce `capture-example.com-unknown.png` instead. Low priority.

## VERDICT: APPROVE

Both changes align precisely with issue #214. Scope is contained. Test coverage addresses the new behavior (short-circuit when already sent, short-circuit pass-through on first crossing, Content-Disposition for screenshot/wacz/html/screenshot-before). CLAUDE.md conventions are followed. No drift detected.
