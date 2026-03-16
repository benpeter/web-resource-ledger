# Lucy Review: Optimize Capture Pipeline (#79)

## Verdict: ADVISE

The plan is well-aligned with the user's intent, stays within declared scope, and follows project conventions. Two minor issues warrant adjustment before execution; neither blocks progress.

---

## Requirements Traceability

| # | User Requirement (from prompt.md) | Plan Coverage | Status |
|---|-----------------------------------|---------------|--------|
| R1 | Consent timeout 8s -> 2s; existing consent tests pass | Change 2 (consent.js line 30), verification step 3 | COVERED |
| R2 | Autoconsent failures degrade to consentStatus:'failed' instead of crashing | Change 3 (try/catch in capture.js) | SEE FINDING 1 |
| R3 | Settle delay adapts to network activity, 3s cap | Change 1 (waitForSettle function) | COVERED |
| R4 | Median capture time for CMP-absent pages drops by 5s+ | Budget math in verification steps 8-9 | COVERED (verified indirectly; staging test requested in prompt will confirm empirically) |
| R5 | No change to capture quality or artifact completeness | "What NOT to change" section; partial path excluded | COVERED |
| R6 | adobe.com captures succeed (currently TypeError crashes) | Change 3 graceful degradation | COVERED |
| R7 | Tests and OpenAPI updates | Changes 4 and 5 | COVERED |

---

## Findings

### Finding 1: Consent error status diverges from user's stated intent [DRIFT / minor]

**CHANGE**: The plan introduces `consent.status === 'error'` as a new distinct status, mapping to `captureSettings.consent.result === 'error'` in the API response and OpenAPI schema.

**USER REQUEST**: prompt.md line 10 says "degrade to consentStatus: 'failed' instead of crashing the renderer."

**PLAN**: Uses `'error'` (not `'failed'`) as the degraded status, with a new `'error'` enum value in OpenAPI.

**ASSESSMENT**: The plan's approach is actually better engineering -- it distinguishes "consent library reported failure" (`'failed'`) from "consent library threw an unexpected exception" (`'error'`), which aligns with the CLAUDE.md directive: "the system must distinguish 'service unavailable' from 'misconfigured' in both logs and API responses." This is a defensible deviation from the literal wording of the prompt, not drift. The user's intent (adobe.com captures should complete, not crash) is fully met.

**ACTION**: No code change needed, but the PR description should note this deliberate refinement and its rationale so the user can confirm intent at merge time.

### Finding 2: enrichedStubRenderer is inline in capture.test.js, not in fixtures.js [CONVENTION / minor]

**CHANGE**: The plan says to add `settleMs: 500, settleReason: 'quiesce'` to `enrichedStubRenderer` "in capture.test.js" (line 318).

**FACT**: `enrichedStubRenderer` is defined inline at test/capture.test.js:596, not in test/fixtures.js. The plan correctly identifies its location. However, `enrichedStubRenderer` lacks `consent` and `screenshotBefore` fields -- it is a minimal stub used for render metadata tests, not a full-capture fixture. Adding settle fields to it is fine, but the implementing agent must not assume it has the same shape as fixtures.js renderers.

**ACTION**: The implementing agent should verify `enrichedStubRenderer`'s actual shape at line 596 before modifying it. The plan's instruction is correct but terse enough to risk misinterpretation.

---

## Scope Containment

No scope creep detected. The plan modifies exactly the files declared in the user request's scope (consent.js, capture.js, tests, OpenAPI). The "What NOT to change" section explicitly excludes related but out-of-scope areas. The single-task structure avoids task inflation.

## CLAUDE.md Compliance

- **Fail loudly, degrade intentionally**: The consent try/catch uses selective error propagation (re-throws browser death errors) and produces a distinct `'error'` status. This complies with the "distinct status values" directive. The `consent_error` log event at warning level (severity 4) ensures visibility.
- **YAGNI / KISS**: The adaptive settle design uses three Playwright events and two timers -- minimal mechanism. No new dependencies.
- **Lean and Mean**: Single task, five files. No abstraction layers.
- **Test the real boundaries**: New tests use fixture renderers (mocked) for the orchestration path, consistent with existing test patterns. The user's prompt requests staging deployment + real-site verification (adobe.com, the guardian, etc.) for the integration boundary -- this is handled post-implementation, not in the plan's task scope.
- **Evolution log**: Not in this plan's scope (Phase 8 / wrap-up). The CLAUDE.md requirement is non-negotiable; nefario must ensure evolution log entries are created during wrap-up. (This is a standing concern, not a finding specific to this plan.)

## Proportionality

Problem complexity: three specific changes to two source files, with known line numbers and clear before/after states. Plan complexity: one task, one agent, one batch, five files. Proportional.

---

## Summary

Plan is approved to proceed with the two advisories noted. The status value divergence (Finding 1) is a positive refinement but should be documented in the PR for user confirmation. The enrichedStubRenderer note (Finding 2) is minor risk mitigation for the implementing agent.
