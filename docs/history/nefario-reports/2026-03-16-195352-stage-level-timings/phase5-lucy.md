# Lucy Code Review: Stage-Level Timing Instrumentation

**VERDICT: ADVISE**

The implementation is well-aligned with the original request and the synthesis plan. All stated requirements are addressed, no scope creep, and CLAUDE.md conventions are followed. Two findings worth noting -- one substantive (measurement boundary), one informational (log asymmetry). Neither blocks merge.

---

## Requirement Verification

| Requirement (from prompt.md) | Implementation | Status |
|---|---|---|
| Per-stage durations in `defaultRenderer()` return | `render.stages` with 7 fields in both full and partial paths (`src/capture.js:449-457`, `513-521`) | PASS |
| Stage timings flow into KV record | `stages` nested inside `render` object; `completeCapture()` already passes `render` opaquely to KV -- no change needed | PASS |
| Visible via `GET /v1/captures/:id` | `handleGetCapture()` already copies `record.render` to response -- no change needed | PASS |
| Structured log event with stage durations to Coralogix | `...(render?.stages ?? {})` spread on both `capture.success` (line 235) and `capture.partial` (line 220) | PASS |
| All existing tests pass | Two `toEqual` -> `toMatchObject` changes (`capture-retrieval.test.js:137`, `kv.test.js:318`). Assertions still verify the three original fields. | PASS |
| No change to capture behavior or timing | Instrumentation is pure `Date.now()` arithmetic at async boundaries. No control flow changes. `try/finally` structure preserved. | PASS |
| OpenAPI spec updated | `RenderStages` component (line 297) with 7 required nullable integer fields. `RenderInfo.stages` optional property (line 291). | PASS |
| `consentDurationMs` removed from log events | Confirmed absent from all source files. Replaced by `consentMs` via stages spread. | PASS |

No orphaned deliverables. No unaddressed requirements.

---

## Findings

### Finding 1 -- CONVENTION: `consentMs` includes before-screenshot duration (medium)

**WHERE**: `src/capture.js`, full capture path, lines 479-491.

**WHAT**: On the full capture path, `tSettle` is recorded at line 479 (after settle delay). Then `screenshotBefore` is taken at line 488, `dismissCookieConsent()` runs at line 490, and `tConsent` is recorded at line 491. Therefore `consentMs = tConsent - tSettle` includes the before-screenshot duration (typically 500ms-2s for full-page screenshots).

Meanwhile, `screenshotMs = tScreenshot - tConsent` measures only the after-screenshot (or is near-zero when no CMP was dismissed, since `screenshot = screenshotBefore` is a variable assignment, not a capture).

**WHY THIS MATTERS**: The OpenAPI description for `consentMs` says "Time in ms for cookie consent detection and dismissal." This is misleading -- it also includes before-screenshot time. An operator seeing `consentMs: 2400` on a page with `consentStatus: none` would incorrectly suspect a slow consent detection pass, when the time was actually spent on the before-screenshot. Similarly, `screenshotMs` described as "Time in ms to capture screenshot(s)" understates what it measures -- it's only the optional after-consent screenshot.

This was flagged in my phase 3.5 plan review (Finding 2) as needing resolution before execution. The implementation proceeded without resolving it.

**RECOMMENDATION**: Two options, either acceptable:

*Option A (minimal, preferred)*: Update the OpenAPI descriptions to match reality. Change `consentMs` to "Time in ms from post-settle to post-consent, including the before-consent screenshot." Change `screenshotMs` to "Time in ms for the post-consent screenshot (zero when no CMP was dismissed)." No code change needed.

*Option B*: Add a `Date.now()` call between the before-screenshot and `dismissCookieConsent()` to separate the two measurements. This would give accurate `consentMs` but shifts the before-screenshot time into `settleMs` or requires an 8th stage field.

Option A preserves the 7-field schema and is honest about what the numbers mean. The data is still useful for identifying slow stages -- before-screenshot time and consent time both happen in the same pipeline section.

**SEVERITY**: Medium. Does not block merge. The data is still directionally useful. But misleading descriptions will cause confusion in Coralogix queries.

---

### Finding 2 -- CONVENTION: Log event asymmetry between partial and success (informational)

**WHERE**: `src/capture.js`, lines 211-221 vs 223-236.

**WHAT**: `capture.partial` includes both the flat stage fields (`...(render?.stages ?? {})`) AND the nested `render` object as a separate field. `capture.success` includes only the flat stage fields -- no nested `render` field.

**WHY**: The observability minion noted this in their review and called it "acceptable." The flat fields serve Coralogix query ergonomics; the nested `render` on partial events provides completeness for debugging. The asymmetry is intentional but undocumented.

**RECOMMENDATION**: No action required. Noting for traceability. If this causes confusion later, consider aligning the two events (either add `render` to success or remove it from partial).

**SEVERITY**: Informational.

---

### Finding 3 -- CONVENTION: Pre-existing `durationMs` description inaccuracy now more visible (informational)

**WHERE**: `openapi.yaml`, line 286-288.

**WHAT**: `RenderInfo.durationMs` is described as "Wall-clock milliseconds from navigation start to the point the page was captured." In reality, `durationMs = tContent - renderStart`, where `renderStart` is set before session acquisition (`getOrCreateSession()`). So `durationMs` includes session acquisition and context setup, not just "from navigation start."

**WHY**: This is pre-existing, not introduced by this change. But now that `stages` explicitly shows `sessionAcquireMs` and `contextSetupMs` as components of the total, the description is visibly wrong. An operator summing the stages will see that `sessionAcquireMs + contextSetupMs + ... ≈ durationMs`, which contradicts "from navigation start."

**RECOMMENDATION**: Update the description to "Wall-clock milliseconds from render start (including session acquisition) to content extraction." This can be done in this PR or a follow-up.

**SEVERITY**: Informational. Pre-existing issue, not a regression.

---

## CLAUDE.md Compliance

| Directive | Status |
|---|---|
| YAGNI | PASS. Seven stages map 1:1 to seven code sections. No speculative fields. |
| KISS | PASS. Pure `Date.now()` arithmetic. No new abstractions or helpers. |
| Lean and Mean | PASS. Zero new dependencies. No new files. |
| Fail loudly, degrade intentionally | PASS. `null` for skipped stages is intentional with explicit semantics in OpenAPI. |
| Vanilla JS | PASS. No framework additions. |
| Silent catch blocks forbidden | PASS. No new catch blocks. Existing `try/finally` preserved. |
| Test real boundaries | N/A. Instrumentation only, no new external boundary. |
| Evolution log | Out of scope for this review (handled by wrap-up phase). |

---

## Scope Assessment

The implementation is tightly contained to the four files specified in the plan. No scope creep. No new dependencies, abstractions, or files. The `toEqual` -> `toMatchObject` changes are the minimal test adjustment needed. The OpenAPI schema is proportional (seven fields, well-described). The `consentDurationMs` retirement is correctly executed.

---

## Summary

Proceed to merge. Finding 1 (consentMs description accuracy) should be addressed in this PR if convenient, or tracked as a follow-up. The implementation faithfully executes the synthesis plan, maintains all conventions, and delivers exactly what was requested.
