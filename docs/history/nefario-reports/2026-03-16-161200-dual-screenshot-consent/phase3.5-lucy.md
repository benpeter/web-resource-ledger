# Lucy Review: Dual-Screenshot Cookie Consent Dismissal

**Verdict: ADVISE**

The plan is well-aligned with Issue #58's intent and respects the project's engineering philosophy. Four items need attention before execution; none are blocking.

---

## Requirements Traceability

| Issue #58 Requirement | Plan Element | Status |
|---|---|---|
| Two screenshot artifacts (before + after) | Task 1 Step 2: dual-screenshot pipeline in `defaultRenderer()` | COVERED |
| Both screenshots in WACZ bundle + Ed25519 signature | Task 2 Steps 1-2: dual WARC records, `captureSettings` in datapackage.json | COVERED |
| `captureSettings` in `datapackage.json` | Task 2 Step 2: `captureSettings` spread into datapackage object | COVERED |
| Graceful degradation when dismissal fails | Task 1 Step 2 items 4-5: single screenshot + metadata on failure/timeout | COVERED |
| Existing API contract unchanged | Task 2 Step 4: `screenshot` always points to best-available; `screenshotBefore` is additive | COVERED |
| Capture within 30s `ctx.waitUntil` budget | Task 1: NAV_TIMEOUT_MS 25s->20s, consent hard timeout 8s | COVERED |
| Phase 0017 security constraints respected | Task 1: message allowlist, `enablePrehide: false`, `enableCosmeticRules: false`, before-screenshot sequencing | COVERED |
| Verification endpoint displays consent status | Task 3: consent check in checks list, capture details disclosure | COVERED |

No stated requirements are missing from the plan. All plan elements trace to stated requirements.

---

## Findings

### 1. DRIFT -- Artifact naming terminology mismatch with Issue #58

**Issue #58 says:** "Captures produce two screenshot artifacts: `screenshot-before.png` (as-is) and `screenshot-after.png` (post-dismissal)"

**Plan says:** Primary screenshot stays at `screenshot.png` (best-available); before-screenshot is `screenshot-before.png`. There is no `screenshot-after.png`.

This is not a bug -- the plan's approach (api-design-minion's backward-compatible naming) is arguably better than the issue's literal naming. However, it is a deliberate deviation from the issue's stated success criteria. The Conflict Resolutions section documents this decision.

**Recommendation:** No code change needed. Document this deviation in `decisions.md` during the evolution log phase. The issue's success criteria should be updated to match the actual implementation naming after the PR merges.

### 2. SCOPE -- `consent.durationMs` inconsistency in the return shape

Task 1 Step 2 item 4 defines the consent return shape as:

```js
consent: {
  status,      // 'dismissed' | 'none' | 'timeout'
  cmp,         // string | null
  durationMs,  // number
}
```

But the `status: 'none'` result from `dismissCookieConsent()` (Step 1 item 3) returns only `{ status: 'none' }` -- no `cmp`, no `durationMs`. The Task 4 fixtures also show `durationMs: 2500` for `status: 'none'`, suggesting duration should always be present, yet the consent module's "none" result omits it.

**Recommendation:** Make the return shape consistent. The `dismissCookieConsent()` function should always return `{ status, cmp, durationMs }` even for `status: 'none'` (where `cmp` is `null` and `durationMs` reflects the detection wait time). This avoids null-check branches downstream.

### 3. CONVENTION -- `categorizeError` error message says "25 seconds" after timeout change

`categorizeError()` in `src/capture.js` (lines 457, 461) hardcodes the message "Page did not finish loading within 25 seconds". The plan reduces `NAV_TIMEOUT_MS` to 20000 but does not mention updating these error messages. Task 1 Step 2 item 6 says "Update the `categorizeError` function **if needed** for new error patterns" but the existing 25-second messages will become factually wrong.

**Recommendation:** Task 1 should explicitly update the two error message strings in `categorizeError()` from "25 seconds" to "20 seconds", or use the constant: `` `Page did not finish loading within ${NAV_TIMEOUT_MS / 1000} seconds` ``.

### 4. COMPLIANCE -- Evolution log phase numbering

The evolution log index (`docs/evolution/README.md`) ends at 0024. The plan does not specify which phase number this work will use. Per CLAUDE.md: "Number sequentially: use zero-padded four-digit prefixes (0001, 0002, ...)."

**Recommendation:** This phase should be `0025-dual-screenshot-consent` (or whatever the next number is at execution time if other phases land first). The wrap-up phase must create the evolution log directory and entries per CLAUDE.md rules 1-6.

---

## CLAUDE.md Compliance

| Directive | Status |
|---|---|
| YAGNI: no speculative features | PASS -- compact rules explicitly deferred; no extra parameters |
| KISS: simple beats elegant | PASS -- consent module is a single function; no abstraction layers |
| Lean and Mean: minimize deps | PASS -- one new dependency (autoconsent), vendored to a single file |
| Vanilla JS preference | PASS -- no frameworks in verify-page changes |
| Evolution log required | PASS (implicit) -- not in task scope but mandatory at wrap-up |
| Backlog update required | PENDING -- must update #58 row in backlog after phase completes |
| Engineering philosophy: <300ms uncached latency | N/A -- consent phase is within capture pipeline, not on the request path |

## Scope Assessment

The plan is proportional to the problem. Four tasks for a feature that touches the capture pipeline, data layer (WARC/WACZ/KV), API surface, and verification UI is appropriate -- each task maps to a distinct layer. No gold-plating detected. Test fixture extraction (Task 4) is justified by real duplication in the existing test suite and the need for consent-aware stubs.

## Summary

The plan faithfully implements Issue #58 with one intentional, documented naming deviation (backward-compatible `screenshot.png` instead of `screenshot-after.png`). Three minor issues need fixing during execution: consistent `dismissCookieConsent()` return shape, updated error message strings in `categorizeError()`, and evolution log numbering. None warrant blocking.
