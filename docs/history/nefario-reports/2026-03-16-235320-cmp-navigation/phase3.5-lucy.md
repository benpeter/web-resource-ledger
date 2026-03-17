# Lucy Review: cmp-navigation

## Verdict: ADVISE

The plan is well-aligned with the user's original intent and tightly scoped. Two findings require attention before execution; neither warrants blocking.

---

## Requirements Traceability

| Requirement (from prompt.md / issue #81) | Plan Element | Status |
|---|---|---|
| CMP consent iframes no longer blocked by route handler | Task 1, step 2: main-frame guard with `frame() === page.mainFrame()` | COVERED |
| Top-level cross-domain navigations still blocked (TOCTOU preserved) | Task 1, step 2: `if (isMainFrame)` still aborts | COVERED |
| Autoconsent detects CMPs on iframe-based consent sites | Downstream effect of the fix; manual verification step 2 | COVERED |
| BBC redirect succeeds | Not directly addressed in plan code changes | SEE FINDING 1 |
| All existing tests pass | Verification step 1: `npx vitest run` | COVERED |
| Staging validation against 8-site test set | Manual verification steps 2-3 | COVERED (manual) |
| Evolution log entries | Cross-cutting documentation section | COVERED (deferred to wrap-up) |
| process.md | Mentioned in prompt.md additional context | COVERED (deferred to wrap-up) |
| Backlog update | Not explicitly mentioned in plan | SEE FINDING 2 |

---

## Findings

### Finding 1 -- TRACE: BBC redirect success criterion not explicitly addressed

**What**: The prompt.md success criteria include "BBC capture follows the bbc.com -> bbc.co.uk redirect successfully (same-site redirect, not a security risk)." The plan's Informational Risk #5 documents that Playwright auto-continues 301/302 redirects and the route handler is never invoked for redirect hops. This means the BBC redirect was never blocked by the route handler in the first place -- it works independently of this fix.

**Severity**: Low. This is a traceability gap, not a functional gap. The plan correctly identifies the redirect as pre-existing behavior (Risk #5), but does not explicitly close the loop with the success criterion.

**Recommendation**: Add a note to the manual verification steps confirming BBC redirect works, so the success criterion is demonstrably checked even though the fix does not change redirect behavior. This takes 30 seconds and closes the traceability gap.

### Finding 2 -- COMPLIANCE: Backlog update requirement not mentioned in plan

**What**: CLAUDE.md Evolution Log Rule 4 states: "Update the backlog: review `docs/backlog.md` after every phase. Add items that were explicitly deferred or flagged as post-MVP. Remove or mark done items that were resolved." The plan explicitly defers an E2E staging test (Cross-Cutting Coverage, Testing section) and mentions a potential observability backlog item (debug log for allowed iframe navigations). Neither the task prompt nor the cross-cutting section mentions updating `docs/backlog.md`.

**Severity**: Low. This is a wrap-up compliance item, not a code issue. The plan's wrap-up phases (5-8) presumably handle this, but it should be explicit.

**Recommendation**: Add "Update `docs/backlog.md` with the deferred E2E staging test item" to the deliverables or post-execution checklist. This is a CLAUDE.md hard requirement.

### Finding 3 -- COMPLIANCE: Silent catch block

**What**: The proposed code includes `catch { }` (empty catch with a comment) on the `frame()` call. CLAUDE.md Engineering Philosophy states: "silent `catch {}` blocks are forbidden. Every catch must either log the error or handle a specific, named error type."

**Severity**: Medium. The catch block has a comment explaining intent, and it does handle the error by treating the request as non-main-frame (allowing it through). This is arguably "handling a specific error type" -- the known Playwright throw behavior. However, it is literally an empty catch body, which is the exact pattern the CLAUDE.md directive prohibits.

**Recommendation**: The catch block should either (a) name the error parameter and log at debug level, e.g. `catch (err) { /* frame() throws for pre-creation/SW requests -- allow */ }`, or (b) more strictly, add a debug-level log line. Option (a) is the minimum to satisfy the "handle a specific, named error type" reading. The minion prompt should specify this.

---

## Scope and Drift Assessment

**No scope creep detected.** The plan is a single-file, single-concern fix. The explicit "Do NOT" list in the task prompt (step 5) is unusually disciplined -- it preemptively blocks five specific drift vectors. The plan adds no new dependencies, no new files, no new abstractions, and no speculative features.

**No goal drift detected.** Every plan element traces to the original problem: CMP consent iframes being blocked by an over-broad navigation check.

**Proportionality: appropriate.** The solution is ~10 lines of code change for a ~10-line-of-code problem. The extensive documentation of edge cases (TDZ, frame() throws, redirect bypass) is justified by the security-sensitive context.

## CLAUDE.md Compliance Summary

| Directive | Status |
|---|---|
| Evolution log required | Planned for wrap-up |
| process.md required | Planned for wrap-up |
| Backlog update required | **Not mentioned -- FINDING 2** |
| YAGNI / no speculative features | Compliant |
| KISS / simple solution | Compliant |
| Fail loudly / no silent catch | **Empty catch body -- FINDING 3** |
| Test real boundaries | Compliant (no mock-based tests added; manual verification planned) |
| Vanilla JS preferred | Compliant (no dependencies added) |

## Bottom Line

Plan is well-scoped and correctly addresses the user's intent. The two actionable findings (backlog update mention and silent catch block) are minor adjustments that can be incorporated into the task prompt before execution. Finding 3 (the catch block) should be addressed in the minion prompt to avoid a CLAUDE.md violation in the delivered code.
