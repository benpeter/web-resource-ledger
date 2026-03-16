---
task: "fix(wacz): log TSA errors instead of silently swallowing"
source-issue: 72
date: 2026-03-16
status: complete
agents: observability-minion, test-minion, security-minion, lucy, margo, ux-strategy-minion
task-count: 2
gate-count: 0
mode: execution
---

## Summary

Replaced the empty `catch {}` block in `src/wacz.js` (TSA timestamp request) with
structured error logging to Coralogix and a three-way `timestampStatus` return value.
This enables diagnosing why the Sectigo TSA fails in production (Cloudflare Workers)
despite working from curl/Node.js.

**Changes**: 2 files (src/wacz.js, test/wacz.test.js)
**Tests**: 500 pass (3 new, 0 regressions)

## Original Prompt

Replace empty `catch {}` block in TSA timestamp request with error logging to Coralogix.
Enables diagnosing why Sectigo TSA fails in production (Cloudflare Workers) despite
working from curl/Node.js. After merging #68 (TSA switch to Sectigo), production captures
show `timestampStatus: absent` -- the TSA call fails silently.

Resolves #72

## Key Design Decisions

1. **Severity 4 (warn)**: TSA failure is degraded-but-functional, not a capture failure.
   Matches `capture.wacz_fail` and `capture.header_fail` patterns.

2. **No classifyTsaError() helper**: Error messages from rfc3161.js are framework-generated
   (DER parser, HTTP status) with no user-controlled content. Log.js INVARIANT satisfied
   by inspection. YAGNI.

3. **No function signature change**: Log from within buildWacz() with available context.
   capture.success already has captureId/tenantId alongside timestampStatus for correlation.

4. **Three-way timestampStatus (present/absent/error)**: Per CLAUDE.md "fail loudly"
   principle, distinguishes "service unavailable" from "misconfigured."

## Phases

### Phase 1: Meta-Plan
Selected observability-minion and test-minion. Excluded security-minion (error messages
are framework-generated, no new attack surface).

### Phase 2: Specialist Planning
- **observability-minion**: Recommended severity 4, subsystem 'capture', await the log
  call. Also recommended classifyTsaError() helper and logCtx parameter (both rejected
  as YAGNI/KISS).
- **test-minion**: Recommended 3 tests in graceful degradation block, testing return
  values not log calls.

### Phase 3: Synthesis
Synthesized plan: 2 tasks (implement logging, add tests), 0 gates. Resolved conflicts
in favor of simplicity.

### Phase 3.5: Architecture Review
5 mandatory reviewers: 4 APPROVE, 1 ADVISE.
- **test-minion ADVISE**: Caught that vitest.config.js sets TSA_URL in test env, requiring
  explicit env construction for the 'absent' test. Incorporated before execution.

### Phase 4: Execution
Direct execution (no subagent delegation needed). Both tasks completed in one pass.

### Phases 5-8
Verification: all tests pass (500/500). Code review: changes are minimal (import + catch
block + return expression + JSDoc). Documentation: evolution log entries written.

## Agent Contributions

### Planning Agents
| Agent | Recommendation |
|-------|---------------|
| observability-minion | Severity 4 (warn), subsystem 'capture', await log, classified error codes (rejected) |
| test-minion | 3 focused tests on return values, skip log call assertions |

### Review Agents
| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| lucy | APPROVE | Plan aligns with CLAUDE.md "fail loudly" principle |
| margo | APPROVE | Change is minimal and proportional |
| security-minion | APPROVE | Error messages safe per log.js INVARIANT |
| test-minion | ADVISE | TSA_URL in vitest.config.js affects test env |
| ux-strategy-minion | APPROVE | error/absent/present taxonomy is clear |

## Verification

All tests pass: 500/500 (23 test files, 3 new tests added).
No code review findings. No documentation debt.

## Test Plan

- [x] `test/wacz.test.js` passes (18 tests, 3 new)
- [x] Full test suite passes (500 tests, 0 regressions)
- [ ] After deploy: trigger capture, check Coralogix for `capture.tsa_fail` event

## Session Resources

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-16-185445-tsa-error-logging/`

| File | Description |
|------|-------------|
| prompt.md | Original task description |
| phase1-metaplan.md | Meta-plan output |
| phase2-observability-minion-prompt.md | Observability specialist prompt |
| phase2-observability-minion.md | Observability specialist contribution |
| phase2-test-minion-prompt.md | Test specialist prompt |
| phase2-test-minion.md | Test specialist contribution |
| phase3-synthesis.md | Synthesized execution plan |
| phase3.5-lucy.md | Lucy governance review |
| phase3.5-margo.md | Margo YAGNI/KISS review |
| phase3.5-security-minion.md | Security review |
| phase3.5-test-minion.md | Test coverage review (ADVISE) |
| phase3.5-ux-strategy-minion.md | UX strategy review |

</details>

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

Compaction events: 0
