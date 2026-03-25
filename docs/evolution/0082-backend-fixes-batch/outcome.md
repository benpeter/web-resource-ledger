# Phase 0082: Backend fixes batch — Outcome

## Summary

Shipped two backend fixes in a single PR:

1. **Notification short-circuit (#187)**: Added a `checkNotificationSent()` pre-check at the call site in the queue consumer. Captures 161-200 for free-tier tenants now skip `dispatchNotification()` entirely when the approaching_limit notification was already sent, saving ~2 D1 round-trips per capture.

2. **Descriptive Content-Disposition filenames (#181)**: Added `buildArtifactFilename()` function that produces filenames like `capture-example.com-2026-03-24.wacz` from the capture record's URL and date. Falls back to generic filenames on URL parse failure.

## Files Changed

| File | Change |
|------|--------|
| `src/index.js` | +78/-18: `checkNotificationSent` import, dedup short-circuit block, `buildArtifactFilename()` function, handler wiring |
| `test/notification-triggers.test.js` | +57: 2 new tests (short-circuit skip + normal dispatch) |
| `test/capture-retrieval.test.js` | +45: 4 new tests (screenshot, wacz, html, screenshot-before filenames) |

## Test Results

All 1530 tests pass, 0 failures.

## Verification

- Code review: 2 APPROVE (lucy, margo), 1 ADVISE (code-review-minion — flagged pre-existing vacuous test at notification-triggers.test.js:233-248, not introduced by this PR)
- Tests: All pass
- Docs: Not applicable (no API surface changes)

## Surface Consistency

| Surface | Action |
|---------|--------|
| OpenAPI spec | No update — Content-Disposition filenames are not part of the API contract |
| Docs site | No update — no new features or changed behavior for users to learn |
| Landing page | No update — no pricing or capability changes |
| MCP server | No update — no API endpoint changes |
| Legal pages | No update — no new data collection or services |

## Backlog Changes

No backlog changes. Issues #187 and #181 were not individually tracked in the backlog (they were small enough to batch into issue #214).

## Issues Resolved

- Resolves #214 (Backend fixes batch)
- Resolves #187 (Skip approaching_limit dispatch when already sent)
- Resolves #181 (Set descriptive Content-Disposition filenames)
