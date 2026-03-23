# Lucy Review: url-migration Plan

**Verdict: ADVISE**

## Requirement Traceability

| User Requirement | Plan Element | Status |
|---|---|---|
| Replace all functional references in code/config | Task 1: 11 code/config files listed | COVERED |
| Replace references in user-facing docs | Task 1: `docs/mcp.md` replacements | COVERED |
| Preserve `docs/history/`, `docs/evolution/`, `.claude/worktrees/` | Task 1 exclusion rules + grep filter | COVERED |
| Preserve staging URLs | Task 1 explicit exclusion + grep filter | COVERED |
| Grep returns 0 matches | Verification step 1 | COVERED |
| All tests pass | Verification step 2 (`npm test`) | COVERED |
| MCP server accessible at custom domain | Not in plan | GAP (see finding 1) |
| Smoke tests use domain URL | Script files updated in Task 1 | COVERED |

## Findings

### Finding 1 [TRACE] -- Missing runtime verification for live MCP endpoint

**SCOPE**: Plan verification steps vs. user success criterion 3.
**CHANGE**: The plan verifies only text replacement (grep) and test suite. The user's success criteria include "MCP server accessible at `api.webresourceledger.com/mcp`."
**WHY**: The prompt states the custom domain is already live, so this is arguably pre-existing. But the user listed it as a success criterion, which means they expect it checked. A single `curl -sf https://api.webresourceledger.com/health` in the verification step would close this gap without scope expansion.
**TASK**: Add a health check curl to the verification section of Task 1.

**Severity**: Low. The domain is already confirmed live. This is a traceability gap, not a functional risk.

### Finding 2 [TRACE] -- `openapi.yaml` has 5 occurrences but plan addresses only lines 16-17

**SCOPE**: Task 1, section "1. `openapi.yaml` (line 16-17)."
**CHANGE**: The plan instructs the agent to remove lines 16-17 (the legacy server entry). However, `openapi.yaml` also contains the old URL on lines 1028-1031 (example artifact URLs and verifyUrl in a webhook event example). These are functional references in the API specification -- they tell API consumers what URLs look like.
**WHY**: The agent is told "No other files beyond those listed above" and the openapi.yaml instructions only mention lines 16-17. If the agent follows the per-file instructions literally, it will miss 4 occurrences. The verification grep *should* catch this, but the explicit instructions create a contradictory signal: "only change what I listed" vs. "grep must return 0." Resolving the contradiction in the instructions is better than relying on the agent to self-correct.
**TASK**: Add lines 1028-1031 to the `openapi.yaml` section, or change the instruction to "replace all occurrences in this file" (using `replace_all: true`) plus remove lines 16-17.

**Severity**: Medium. Without this fix, the verification step will fail and the agent will need to debug why, wasting a cycle.

### Finding 3 [CONVENTION] -- Minor: occurrence count mismatch for `key-resolver.test.js`

**SCOPE**: Task 1, section "6. `packages/verify/test/key-resolver.test.js` (8 occurrences)."
**CHANGE**: The plan states 8 occurrences; actual grep count is 6. Also lists "Lines 46, 50, 64, 69, 81, 82" which is 6 lines, contradicting the "8 occurrences" header.
**WHY**: Not a blocking issue since the instruction says `replace_all: true`, but imprecise specifications erode agent trust in the instructions. If the agent tries to verify the count, the mismatch could cause unnecessary investigation.
**TASK**: Correct to "6 occurrences."

**Severity**: Low. Cosmetic inaccuracy; `replace_all` covers it.

## Scope Assessment

The plan is well-scoped. Single task, mechanical replacement, no feature additions, no technology changes. Proportionality is excellent -- simple problem, simple plan. The exclusion rules correctly preserve history, evolution, and staging. No scope creep detected.

## CLAUDE.md Compliance

- KISS: Single-task plan for a mechanical replacement. Compliant.
- YAGNI: No speculative additions. Compliant.
- Fail loudly: Not applicable (no runtime changes).
- Evolution log: `prompt.md` exists at `docs/evolution/0071-replace-worker-url-with-custom-domain/`. `decisions.md` and `outcome.md` are expected post-execution per CLAUDE.md rules 2-3. The orchestrator must ensure these are created during wrap-up.
- Verification grep correctly excludes `docs/history`, `docs/evolution`, `.claude/worktrees`, and staging. Compliant with the "Do NOT change" exclusion list.

## Summary

Two actionable findings: (1) add the 4 missed `openapi.yaml` example URLs to the task instructions, and (2) optionally add a health check curl for full traceability to the user's success criteria. Finding 2 is the one that matters -- without it, the verification step will fail on first pass. Neither finding requires restructuring the plan.
