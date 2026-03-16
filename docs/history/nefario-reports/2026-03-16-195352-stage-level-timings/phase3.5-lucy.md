# Lucy Review: Stage-Level Timing Instrumentation Plan

**Verdict: ADVISE**

The plan is well-aligned with the original request, properly scoped, CLAUDE.md-compliant, and ready to proceed with two corrections noted below.

---

## Requirement Traceability

| Original Requirement | Plan Element | Status |
|---|---|---|
| Per-stage durations in `defaultRenderer()` | Task 1: Date.now() instrumentation in capture.js | COVERED |
| Stage timings flow into KV record | Task 1: `render.stages` sub-object flows through existing `render` plumbing | COVERED |
| Visible via `GET /v1/captures/:id` | Task 1: No code change needed, existing `body.render = record.render` passthrough | COVERED |
| Structured log event to Coralogix | Task 1: Flat stage fields spread onto `capture.success` and `capture.partial` log events | COVERED |
| All existing tests pass | Task 1: Two `toEqual` -> `toMatchObject` adjustments | COVERED (see finding 1) |
| No change to capture behavior | Task 1: Prompt explicitly forbids behavioral changes | COVERED |
| OpenAPI spec update | Task 1: `RenderStages` component + `RenderInfo.stages` optional property | COVERED |

No orphaned tasks (every plan element traces to a requirement). No unaddressed requirements.

---

## Findings

### Finding 1 -- DRIFT (minor): "All existing tests pass unchanged" vs plan reality

**CHANGE**: The plan modifies two test assertions (`toEqual` -> `toMatchObject`) in `test/capture-retrieval.test.js:137` and `test/kv.test.js:318`.

**WHY this is flagged**: The original prompt's success criteria state "All existing tests pass unchanged." The plan correctly identifies that two assertions must change, but this contradicts the prompt's literal wording. The plan's approach is the right call -- the prompt criterion was aspirational and the plan is honest about the minimal test changes needed. No action required; this is noted for traceability so the evolution log's `outcome.md` records the deviation from the original criterion.

**Severity**: Informational. The plan is correct; the original prompt criterion was slightly inaccurate.

### Finding 2 -- DRIFT (substantive): Stage boundary ordering mismatch with actual code

**CHANGE**: The plan's stage ordering in the instrumentation guide lists:
```
settleMs -> consentMs -> screenshotMs -> contentMs
```

**WHY this is flagged**: The actual code in `defaultRenderer()` (lines 459-484) executes in this order:
1. Settle delay (line 459) -- `settleMs`
2. **Screenshot before consent** (line 472) -- part of `screenshotMs`?
3. Cookie consent dismissal (line 474) -- `consentMs`
4. Screenshot after consent (line 479, conditional) -- part of `screenshotMs`?
5. `page.content()` (line 484) -- `contentMs`

The before-screenshot is taken BEFORE consent, not after. The plan's stage ordering implies screenshots happen entirely after consent. The executing minion needs to decide: does `screenshotMs` include only the after-screenshot (losing the before-screenshot timing)? Or does `screenshotMs` wrap around consent (making `consentMs` a sub-interval of `screenshotMs`, which breaks the "stages sum to durationMs" model)? Or should the stages be reordered to match the actual code flow: `settleMs -> screenshotBeforeMs -> consentMs -> screenshotAfterMs -> contentMs`?

**Recommendation**: Clarify the stage boundary definition for `screenshotMs`. The simplest correct approach that preserves the seven-stage model: measure `screenshotMs` as only the final screenshot (after consent), and fold the before-screenshot into `consentMs` (or into a preceding stage). Alternatively, rename to `screenshotAfterMs` and add `screenshotBeforeMs`, but that changes the schema to 8 stages. The executing minion should not be left to guess -- the plan should specify exactly which code boundaries each timer wraps. This is the only finding that could produce incorrect instrumentation if unresolved.

**Severity**: Medium. Could lead to misleading timing data if the minion makes an arbitrary choice.

---

## CLAUDE.md Compliance

| Directive | Status |
|---|---|
| Evolution log documentation (prompt.md, decisions.md, outcome.md, process.md) | Not in plan scope (handled by nefario wrap-up). Noting for completeness: the wrap-up phase must create these per CLAUDE.md. |
| Backlog update after phase | Same as above -- wrap-up responsibility. |
| YAGNI / KISS / Lean | PASS. Pure Date.now() arithmetic, no new dependencies, no speculative features. |
| Fail loudly, degrade intentionally | PASS. `null` for skipped stages is intentional degradation with explicit semantics. |
| Vanilla JS, no frameworks | PASS. No new dependencies introduced. |
| Test real boundaries | N/A for this change (instrumentation only, no new external boundary). |

---

## Scope Assessment

The plan is tightly scoped to the original request. No scope creep detected. The single-task structure is proportional to the problem (one logical change touching four files). The conflict resolutions are well-reasoned and favor simplicity. The `consentDurationMs` retirement is justified by the pre-production status and naming consistency argument.

---

## Summary

Proceed with execution after resolving the screenshot/consent stage boundary ordering (Finding 2). The plan is otherwise exemplary in its precision, constraint documentation, and alignment with the original request. Finding 1 is informational only.
