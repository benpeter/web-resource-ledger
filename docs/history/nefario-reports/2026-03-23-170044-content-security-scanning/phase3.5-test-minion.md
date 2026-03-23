# Test-Minion Review: content-security-scanning

**Verdict: ADVISE**

The plan is well-structured and the injectable dependency pattern is correctly specified throughout. The core unit test suite for `threat-check.js` (Task 2) is solid: 10 test cases cover clean, malicious, multi-threat, API error, timeout, network error, missing key, `checkUrls` fan-out, empty array, and URL encoding. That covers the module boundary completely.

---

## Gaps That Need Addressing

### 1. No tests specified for the new DB functions (Task 1)

Five new functions are added to `db.js` (`quarantineCapture`, `recordThreatCheck`, `listCapturesNeedingThreatCheck`, `quarantineCapturesByUrl`, `setCaptureThreatCheck`) and `rowToCapture` is changed. The existing `test/db.test.js` tests the current DB layer against the real D1 binding via `cloudflare:test`. The plan does not instruct data-minion to add DB-layer tests for the new functions.

**Required additions to `test/db.test.js`:**
- `quarantineCapture` only affects `status='complete'` rows (not pending/failed)
- `quarantineCapture` sets `quarantined=1`, `quarantine_reason`, `quarantined_at`, inserts audit row atomically
- `listCapturesNeedingThreatCheck` returns captures ordered by staleness (NULLs first), de-duplicated by URL
- `listCapturesNeedingThreatCheck` excludes already-quarantined captures
- `quarantineCapturesByUrl` quarantines all matching complete captures and returns affected captureIds
- `rowToCapture` maps new columns correctly (`quarantined` as boolean, not integer)
- Schema test should assert `threat_checks` table exists and `idx_captures_threat_rescan` index exists

The task prompt says "All new functions follow existing patterns" and "All new functions pass unit tests" in the success criteria, but does not instruct the agent to write those tests. This is a gap — the agent will likely skip it.

**Fix:** Add explicit test instructions to Task 1's prompt, pointing to `test/db.test.js` and the existing test patterns.

### 2. No tests specified for `rescan.js` (Task 4)

`handleRescanTick` has several distinct behaviors: normal re-scan, URL becomes newly flagged, API degraded (skip URL), error in single URL check doesn't abort batch, webhook dispatch per quarantined capture, batch summary logging. None of these are covered by a specified test.

The `test/scheduled-handler.test.js` pattern shows the framework supports calling `worker.scheduled(controller, env, ctx)` directly with a custom controller. The daily cron path (`cron === '0 3 * * *'`) is testable by constructing:
```javascript
{ scheduledTime: Date.now(), cron: '0 3 * * *', noRetry() {} }
```

**Required:** Task 4 should include `test/rescan.test.js` with injectable `lookup` stubs passed through to `checkUrl`. The tests should cover:
- No captures needing re-scan: summary logs zero scanned
- Clean URL: `last_threat_check_at` updated, no quarantine
- Newly flagged URL: all captures with that URL quarantined, webhook dispatched
- Degraded check (API error): URL skipped, counted as `skippedCount`, does not abort remaining URLs
- Individual URL failure does not abort batch (isolation test)

Without this, the entire re-scan path has zero unit test coverage.

### 3. Missing integration tests for quarantine state in retrieval endpoints (Task 3)

`test/capture-retrieval.test.js` tests `GET /v1/captures/{id}` with a seeded complete capture. After Task 3 adds quarantine handling to all retrieval handlers, there are no specified tests for:
- `GET /v1/captures/{id}` on quarantined capture returns 200 with `status:'quarantined'`, no artifact URLs
- `GET /v1/captures/{id}/artifacts/screenshot` on quarantined capture returns 451
- `GET /v1/captures/{id}/artifacts/wacz` on quarantined capture returns 451
- `GET /v1/captures` with `?status=quarantined` filter returns only quarantined captures
- `handleCaptureStatus` returns `status:'quarantined'` for quarantined capture
- `handleVerifyCapture` returns 451 for quarantined capture

These are straightforward to add to the existing test files using the pattern of seeding a capture then setting `quarantined=1` via a direct DB statement (or via the new `quarantineCapture` function once Task 1 is done).

**Fix:** Task 3 prompt should include explicit test instructions (or a separate Task 3.5 for test-minion). Without these, the quarantine gate in each handler is unverified.

### 4. Pre-capture threat check integration test

The plan notes "Phase 6 post-execution" will run the full test suite, but there are no specified integration tests for the pre-capture path. `test/batch-capture.test.js` and the HTTP-level capture tests in `test/capture-retrieval.test.js` use `SELF.fetch`. The pre-capture check calls `checkUrl(url, env)` with a real `env` — there's no injectable mock at the HTTP handler level.

**How to handle:** The `checkUrl` function accepts an injectable `lookup` option, but the handler in `index.js` calls `checkUrl(result.url, env)` without passing a `lookup`. This means integration tests that exercise the handler will hit the real Web Risk API (or fail if `GOOGLE_WEB_RISK_API_KEY` is absent, which gracefully degrades to `{ safe: true, degraded: true }`).

The plan should either:
- Accept that pre-capture tests run without the key (degraded path, `threatCheck: 'unavailable'`), and add explicit tests asserting this behavior
- OR expose the `lookup` option through the handler for testability (more work but enables rejection-path testing)

The degraded-path approach is sufficient for unit testing. Add a test: "capture creation proceeds when Web Risk API key is absent, `threatCheck` in DB is `unavailable`."

The rejection path (URL is flagged, 422 returned) currently has no testable path in the existing framework without a real API key. This is a gap. At minimum, document it as a known gap and add a comment in the test file.

---

## Non-blocking Observations

**Concurrent quarantine (concurrent re-scan invocations):** The cron is daily with a 15-minute CPU budget. Two invocations cannot overlap for the same cron. No race condition test needed.

**`checkUrls` fan-out in batch capture:** Task 3 specifies using `checkUrls()` for batch validation, but does not specify a test for partial failures (some URLs clean, some flagged, some degraded). This should be in `test/batch-capture.test.js`. Low priority but worth adding.

**`wrangler.test.toml` cron omission:** The plan correctly notes Task 4 should omit `[triggers]` from `wrangler.test.toml`. The test framework's `makeController` pattern supports passing `cron: '0 3 * * *'` directly, so the test environment doesn't need the trigger registered. This is correct.

---

## Summary

The plan covers the API client module (Task 2) well with injectable stubs. The gaps are in DB-layer tests (Task 1), rescan handler tests (Task 4), and retrieval endpoint integration tests (Task 3). These are not small gaps — Task 4's rescan handler is entirely untested as specified. The CLAUDE.md engineering philosophy states "test the real boundaries" — the re-scan cron is a real boundary.

**Condition for approval:** Add test specifications to Tasks 1, 3, and 4 covering the items above before delegating. Alternatively, add a Task 3.5 (test-minion) blocked on Tasks 1-4 that writes all missing tests in one pass after implementation completes.
