# Margo Review: Optimize Capture Pipeline (#79)

## Verdict: ADVISE

The plan is well-scoped: three targeted changes in two source files, directly driven by measured staging data (8s wasted on 6/7 sites). No new dependencies, no new services, no speculative features. The complexity budget is minimal and proportional. Two items warrant attention before execution.

---

### Finding 1: 'error' vs 'failed' -- unnecessary status distinction

**What**: The plan introduces a new `'error'` consent status alongside the existing `'failed'` status. The existing `consent.js` already catches all exceptions and returns `{ status: 'failed' }` (line 68-70). The new outer try/catch in `capture.js` would produce `{ status: 'error', cmp: null, durationMs: 0 }` for errors that escape consent.js's own catch.

**Why this looks accidental**: From the consumer's perspective (the KV record, the WACZ bundle, the API response), the distinction between "autoconsent reported failure" and "autoconsent threw an unexpected error" does not drive any different behavior. The capture completes identically in both cases: single screenshot, no consent-before/after diff. The `captureSettings.consent.result` ternary already maps `'failed'` for the existing failure path. Adding `'error'` means:
- A new enum value in OpenAPI that clients must handle
- A new branch in the ternary mapping
- A new fixture and test section
- A comment in consent.js documenting a status it does not produce

The original user request says "degrade to consentStatus: 'failed' instead of crashing" -- not 'error'. The issue description (#79 success criteria) literally says `'failed'`.

**Simpler alternative**: Use `{ status: 'failed', cmp: null, durationMs: 0 }` in the outer catch. This matches the user's request, matches consent.js's own error handling, requires no OpenAPI schema change to the result enum, no new fixture, and one fewer test section. The consent_error log event (which IS valuable for operators) still fires based on whether the catch was entered, independent of the status string.

If the team later needs to distinguish "autoconsent said failure" from "autoconsent threw," that is when you add the enum value -- not now. YAGNI.

**Severity**: Non-blocking. The extra enum value is small in isolation, but it propagates to OpenAPI, tests, and fixtures for no behavioral difference. Recommend collapsing to 'failed'.

---

### Finding 2: The adaptive settle implementation is appropriately complex

The `waitForSettle(page)` function (~30 lines) replaces a fixed 3s sleep with request-count tracking, quiescence detection, and a hard cap. This is **essential complexity** -- the entire point of the change is to observe real network activity. The implementation:

- Uses standard Playwright event APIs (already proven in the codebase at line 393)
- Has a hard cap fallback (degrades to current behavior)
- Cleans up listeners explicitly
- Returns structured telemetry (settleMs, settleReason) -- useful for validating the optimization actually works

The ~30 lines are proportional to the problem. No frameworks, no abstractions, no state machines. The browser death error list in the outer catch (8 string patterns) is slightly verbose but each pattern represents a real Playwright/Chromium failure mode. Acceptable.

---

### Finding 3: Settle telemetry in fixtures is fine

Adding `settleMs` and `settleReason` to existing fixture renderers is mechanical and necessary -- tests should reflect the new return shape. Not over-engineered.

---

### Summary

| Item | Assessment |
|------|-----------|
| Adaptive settle (~30 LOC) | Proportional to problem. Essential complexity. |
| Consent timeout 8s to 2s | Single constant change. Evidence-backed. |
| Consent try/catch with selective re-throw | Necessary for graceful degradation. Error list is verbose but justified. |
| New 'error' status | **YAGNI violation.** User asked for 'failed'. Collapse to 'failed'. |
| OpenAPI changes | Proportional if 'error' is dropped. |
| Test additions | Proportional. Consent error test section is needed regardless of status string. |
| Complexity budget | 0 new dependencies, 0 new services, ~30 LOC new function, 1 constant change. Well under budget. |

**Recommendation**: Collapse `'error'` to `'failed'` in the outer catch. Keep the `consent_error` log event (it fires based on the catch path, not the status string). Remove the 'error' enum addition from OpenAPI. This eliminates one fixture, one test subsection, one ternary branch, and one OpenAPI enum value -- all for zero loss of functionality. Everything else in the plan is clean.
