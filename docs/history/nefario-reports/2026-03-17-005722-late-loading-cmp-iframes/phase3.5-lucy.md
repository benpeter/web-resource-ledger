# Lucy Review: cmp-late-frame-injection

**Verdict: APPROVE**

Two advisory findings below. Neither blocks execution.

---

## Requirements Traceability

| # | Requirement (from prompt.md) | Plan Element | Status |
|---|------------------------------|-------------|--------|
| 1 | Autoconsent injected into late-loading CMP iframes | Task 1: `framenavigated` listener in both `_dismissWithBinding` and `_dismissWithPolling` | COVERED |
| 2 | Existing Sourcepoint detection not regressed | Task 2: staging validation checks `theguardian.com` / `spiegel.de` still show `cmp=Sourcepoint-frame` | COVERED |
| 3 | Sourcepoint opt-out failure investigated and fixed if feasible | Conflict Resolutions section: debugger-minion diagnosed as selector mismatch in autoconsent 14.59.0 vs current SDK; not fixable without vendored changes (out of scope per prompt line 37). Deferred to backlog. | COVERED (investigated, not feasible, correctly deferred) |
| 4 | All 503 tests pass | Task 1 success criteria and verification steps | COVERED |
| 5 | Staging validation against 14-site test set | Task 2: full 14-site table with expected outcomes and regression checks | COVERED |
| 6 | CAUTION: do NOT revert PR #82 changes | Task 1 prompt explicitly says "Keep the existing `page.frames()` loop as-is" and only modifies `consent.js`. No capture.js changes. | COVERED |
| 7 | Only modify consent.js, not vendored autoconsent or capture.js | Task 1 constraints: "ONLY modify `src/consent.js`. Do NOT touch `src/capture.js` or the vendored autoconsent script" | COVERED |
| 8 | Use frame events, not polling | Task 1: `framenavigated` event. Explicitly excludes `frameattached` with rationale. | COVERED |
| 9 | Keep consent timeout at 8s | Task 1 "What NOT to do": "Do NOT change CONSENT_TIMEOUT_MS" | COVERED |

No orphaned tasks. No unaddressed requirements.

---

## CLAUDE.md Compliance

| Directive | Status |
|-----------|--------|
| Evolution log (prompt.md, decisions.md, outcome.md) | Cross-Cutting Coverage says "Phase 8 (post-execution) handles evolution log entries." Acceptable -- the evolution log is a wrap-up artifact, not a plan-time deliverable. The orchestrator must ensure this happens. |
| Backlog update after phase | Conflict Resolutions section identifies a new backlog item: "Update vendored autoconsent to support current Sourcepoint SDK." Must be added during wrap-up. |
| YAGNI / KISS / Lean and Mean | Single-file, ~25-line additive change. Proportional to the problem. |
| Fail loudly, degrade intentionally | See ADVISE #1 below. |
| Test the real boundaries | Staging validation (Task 2) is the integration test. Unit tests deferred to Phase 6. Consistent with project philosophy. |
| Wrangler CLI: unset CLOUDFLARE_API_TOKEN | Task 2 prompt includes `unset CLOUDFLARE_API_TOKEN &&` before `npx wrangler deploy`. Compliant. |

---

## Scope Containment

No scope creep detected. The plan is tightly scoped to the stated problem. Specifically:

- **No technology expansion**: Uses existing Playwright APIs (`page.on`, `page.off`, `frame.evaluate`).
- **No abstraction layers**: Inline listener with a local helper function. No new modules, no new exports.
- **No adjacent features**: Sourcepoint selector fix explicitly deferred. No diagnostic instrumentation added.
- **No pre-optimization**: `Set<Frame>` dedup is necessary correctness logic, not optimization.
- **Task count**: 2 tasks for 2 stated goals (fix injection timing + validate). Proportional.

---

## Drift Check

No drift detected. The plan directly addresses the stated problem (late-loading CMP iframes not receiving autoconsent injection) with the stated approach (frame events) and validates against the stated success criteria (14-site staging test).

The `frameattached` vs `framenavigated` selection is well-reasoned: `frameattached` fires before the frame has a document context, making `evaluate()` impossible. The prompt lists both as options ("frameattached/framenavigated"); the plan's restriction to `framenavigated` only is a correct technical refinement, not drift.

---

## Advisory Findings

### ADVISE #1 [CONVENTION] -- Silent `.catch(() => {})` in `injectIntoFrame`

**CHANGE**: Task 1 instructs the minion to use `frame.evaluate(...).catch(() => {})` inside the new `injectIntoFrame` helper.

**WHY**: CLAUDE.md Engineering Philosophy states "silent `catch {}` blocks are forbidden. Every catch must either log the error or handle a specific, named error type." The existing code on lines 159 and 216 of `consent.js` uses the same pattern with an inline comment explaining the rationale ("Cross-origin or detached frames may reject evaluate -- non-fatal"). The new `injectIntoFrame` function should carry the same explanatory comment so the pattern remains self-documenting and consistent with the existing convention.

**FIX**: Add the same inline comment to the `.catch(() => {})` in `injectIntoFrame`: `// Cross-origin or detached frames may reject evaluate -- non-fatal`

### ADVISE #2 [COMPLIANCE] -- Backlog item for Sourcepoint selector mismatch

**CHANGE**: Conflict Resolutions section says "This should be added to the backlog during wrap-up."

**WHY**: CLAUDE.md requires backlog updates after every phase. The backlog at `docs/backlog.md` line 83 already has a `[should]` item: "Inject autoconsent into late-loading CMP iframes." This item should be marked DONE after this phase, and a new item for the Sourcepoint selector mismatch should be added. The plan correctly identifies this but does not include it as a task deliverable.

**FIX**: Orchestrator must update `docs/backlog.md` during wrap-up: (1) mark line 83 as done, (2) add new parking-lot item for Sourcepoint autoconsent version update with condition "When autoconsent publishes a release with updated Sourcepoint selectors."
