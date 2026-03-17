## Test-Minion Review: cmp-late-frame-injection

**Verdict: ADVISE**

The test strategy is sound for this project's philosophy, but two gaps need addressing before execution begins. Neither is a blocker alone, but together they leave the primary success criterion insufficiently validated.

---

### What is correct

**503-test regression gate is appropriate.** The existing suite covers the orchestration layer, KV lifecycle, auth, and HTTP contract. Running it after the consent.js change correctly validates that additive frame listener code does not break any existing behavior path. This is the right gate for a non-breaking, single-file additive change.

**Staging validation as the integration test is correct.** The CLAUDE.md engineering philosophy is explicit: "test the real boundaries." The frame event listener integrates tightly with Playwright's internal CDP lifecycle. A mock-based unit test of `page.on('framenavigated', ...)` would be testing Playwright itself, not the injection logic. Staging with real sites is the appropriate validation layer for this kind of runtime behavior.

**14-site selection is reasonable.** The set covers the primary regression (NYT/OneTrust), known-failed Sourcepoint, geo-variant sites, and confirmed non-CMP controls. The false-positive check (github.com, bbc.co.uk) is correctly present.

---

### Gap 1: NYT success criterion is too weak (MEDIUM)

The table marks NYT as acceptable for `dismissed, failed, timeout (NOT none)`. But the primary bug is that autoconsent is never injected into the OneTrust iframe at all, so the current result is `none`/`notDetected`. After the fix, the minimum acceptable result is that CMP is detected -- `status` is anything other than `none` or `notDetected`. That is what the Key regression check correctly states.

The conflict is that `timeout` appearing in the Acceptable Status column for NYT means the validation would pass even if autoconsent is injected but the opt-out times out. That is actually acceptable -- the fix is injection, not opt-out success. However, the validation logic must explicitly confirm `cmp != null` (or `cmp != 'notDetected'`) for NYT, not just `status != none`. A capture that returns `{ status: 'timeout', cmp: null }` would technically pass the status check but still represents a failed injection.

**Recommendation**: Update the NYT check in Task 2 to require `cmp` field is non-null AND non-`notDetected`, not just `status != none`. The key regression check prose already says this correctly ("NYT shows CMP detected (not none)"), but the table does not enforce it. The orchestrator executing Task 2 should check both fields.

---

### Gap 2: `active` flag cleanup path is not verified by any test (LOW)

The plan specifies a `try/finally` cleanup pattern to ensure `page.off('framenavigated', injectIntoFrame)` is called after `Promise.race` resolves. This is the most complex part of the change -- a race between async resolution and a live event listener. The 503 existing tests have no mock Playwright page and cannot cover this path.

The synthesis explicitly defers `consent.test.js` to Phase 6, citing "integration logic that cannot be meaningfully unit-tested." This is mostly correct -- you cannot unit-test Playwright frame events without Playwright. But the `active` flag guard and the cleanup sequencing are pure JavaScript logic that does not require Playwright. The pattern:

```javascript
let active = true;
const injectIntoFrame = (frame) => {
  if (!active) return;
  // ...
};
page.on('framenavigated', injectIntoFrame);
// ... await Promise.race ...
active = false;
page.off('framenavigated', injectIntoFrame);
```

The `active` flag behavior can be unit-tested with a minimal mock that calls the listener after `active = false` is set. This is a cheap test (5-10 lines) that catches the specific race condition the plan is defending against.

**Recommendation**: Phase 6 `consent.test.js` should include one test for the cleanup path: verify that `injectIntoFrame` called after `active = false` does not call `frame.evaluate`. The plan should note this as a specific test to write in Phase 6, not leave it as a general deferred concern.

---

### Gap 3: Dedup set behavior under concurrent listener + loop is not staged-testable (LOW / INFORMATIONAL)

The dedup Set prevents double-injection in the overlap window between `page.frames()` snapshot and the `framenavigated` listener. Staging cannot validate this because it produces only the observable result (consent outcome), not injection counts. If both paths fire for the same frame, it results in two autoconsent instances on that frame -- this is the failure mode the Set prevents, but staging cannot detect it.

This is an informational note only, not a requirement to address before execution. The deduplication logic is straightforward and the Set approach is correct. This is another argument for Phase 6 unit tests covering the dedup path specifically.

---

### Staging validation execution notes

The Task 2 orchestrator should capture the full consent result shape `{ status, cmp, durationMs }` per site, not just status. Specifically:

- NYT: assert `cmp != null && cmp != 'notDetected'`
- Guardian/Spiegel: assert `cmp == 'Sourcepoint-frame'` (detection not regressed)
- github.com / bbc.co.uk: assert `status == 'none' && cmp == null` (no false positives)
- All 14: assert capture `status == 'complete'` (not capture-level error)

These are already implied by the Key regression checks but should be made explicit as assertions in the validation script, not just visual checks on a results table.

---

### Summary

The overall approach is correct and appropriate for this change size. The two recommendations are:

1. (Before execution) Tighten the NYT success criterion to check `cmp != null`, not just `status != none`.
2. (Phase 6 note) Add a specific test target to Phase 6: unit test the `active` flag + cleanup path with a minimal mock, separate from Playwright-dependent frame event tests.

Neither issue blocks Task 1 implementation. The staging validation can proceed as designed with the NYT check tightened.
