---
task: "Switch navigation from networkidle to load + settle delay"
date: 2026-03-16
source-issue: 67
status: complete
mode: execution
task-count: 1
gate-count: 0
agents-consulted: [debugger-minion, test-minion, security-minion, ux-strategy-minion, lucy, margo, code-review-minion]
compaction-events: 0
---

## Summary

Switched `page.goto()` from `waitUntil: 'networkidle'` to `waitUntil: 'load'`
with a 3s post-load settle delay in `defaultRenderer()`. Ad-heavy sites
(tagesschau.de, adobe.com) that visually load in 2-3s but whose tracking
scripts keep network connections alive indefinitely no longer burn the full
NAV_TIMEOUT_MS budget waiting for network silence. 4 files changed (+38/-26
lines), 497 tests pass.

NAV_TIMEOUT_MS kept at 20s (not raised to 25s per issue suggestion) because
the `load` event is a much narrower target than `networkidle` and 25s creates
a real budget overrun window. Both planning specialists independently flagged
this risk.

## Original Prompt

Switch navigation wait strategy from networkidle to load + settle delay
(GitHub issue #67). Ad-heavy sites burn 20s waiting for network silence that
never comes, leaving insufficient budget for consent dismissal, screenshots,
and WACZ packaging.

## Key Design Decisions

1. **NAV_TIMEOUT_MS stays at 20s** -- 25s creates budget overrun
   (25+3+8+2=38s > 30s limit). 20s is generous for the `load` event.
2. **Plain `setTimeout` for settle delay** -- deterministic, no hang risk,
   avoids TimeoutError confusion with staged fallback catch block.
3. **Post-settle `limitExceeded` re-check** -- security advisory from
   Phase 3.5. Closes async size-limit bypass window during settle.
4. **Template literal in `categorizeError()`** -- derives message from
   constant. Single point of truth.

## Phases

### Phase 1: Meta-Plan
Nefario selected 2 planning specialists: debugger-minion (settle mechanism
tradeoffs) and test-minion (fixture/assertion audit). Excluded security, docs,
UX, and observability from planning -- narrow scope, Phase 3.5 provides
architectural coverage.

### Phase 2: Specialist Planning
Two specialists ran in parallel. Both independently flagged the NAV_TIMEOUT_MS
budget overrun risk. debugger-minion evaluated three settle options (plain
timer, networkidle-with-timeout, custom idle detection) and recommended the
simplest. test-minion identified all 5 test locations needing updates and
determined no new renderer variants were needed.

### Phase 3: Synthesis
Consolidated into 1 task, 0 gates. Resolved NAV_TIMEOUT_MS conflict by
keeping 20s with documented justification (issue explicitly allowed this).
Single-task structure appropriate for 4-file change.

### Phase 3.5: Architecture Review
5 mandatory reviewers. security-minion caught a real gap (post-settle size
limit bypass) and recommended a 2-line fix. All others approved. lucy
reminded about evolution log completeness.

### Phase 4: Execution
Single batch, single agent (debugger-minion on sonnet). All changes applied
cleanly. 497 tests pass. Security advisory incorporated (second
`limitExceeded` check after settle delay).

### Phase 5: Code Review
code-review-minion: APPROVE with 4 NITs. One fixed (comment arithmetic).
Three deferred (variable naming, DRY opportunity, Playwright definition
precision).

### Phase 6: Test Execution
497 tests pass, 0 failures.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Phase 8a: 0 documentation items identified. OpenAPI spec updated inline
during execution. Evolution log entries written.

## Agent Contributions

| Agent | Phase | Role | Verdict |
|-------|-------|------|---------|
| debugger-minion | planning | Settle mechanism analysis, budget math | -- |
| test-minion | planning | Fixture/assertion audit | -- |
| security-minion | review | Post-settle limitExceeded gap | ADVISE |
| test-minion | review | Test coverage verification | APPROVE |
| ux-strategy-minion | review | API consumer experience | APPROVE |
| lucy | review | Convention compliance | APPROVE (2 advisories) |
| margo | review | Complexity check | APPROVE |
| debugger-minion | execution | Implementation | -- |
| code-review-minion | post-exec | Code quality | APPROVE (4 NITs) |

## Verification

Verification: code review passed (4 NITs, 1 fixed), all 497 tests pass.

## Execution

### Task 1: Switch navigation from networkidle to load + settle delay
- **Agent**: debugger-minion (sonnet)
- **Files**: `src/capture.js` (+17/-8), `test/fixtures.js` (+3/-3),
  `test/capture.test.js` (+2/-2), `openapi.yaml` (+16/-13)
- **Outcome**: All changes applied, tests pass

## Decisions

### NAV_TIMEOUT_MS: 20s (not 25s)
Both specialists flagged budget overrun at 25s. With `waitUntil: 'load'`,
20s is generous (load fires in 1-5s typical). 25s creates overrun window.
Issue explicitly allowed "justified if kept at 20s."

### Settle mechanism: plain timer
`setTimeout(3000)` over `waitForLoadState('networkidle')` with timeout
(TimeoutError confusion) and custom idle detection (over-engineered).

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` (this orchestration)

</details>

<details>
<summary>Working Files</summary>

Companion directory: `docs/history/nefario-reports/2026-03-16-183802-load-settle-strategy/`

Files:
- `prompt.md` -- original prompt
- `phase1-metaplan-prompt.md`, `phase1-metaplan.md` -- meta-plan
- `phase2-debugger-minion-prompt.md`, `phase2-debugger-minion.md` -- debugger planning
- `phase2-test-minion-prompt.md`, `phase2-test-minion.md` -- test planning
- `phase3-synthesis-prompt.md`, `phase3-synthesis.md` -- synthesis
- `phase3.5-security-minion.md` -- security review (ADVISE)
- `phase3.5-test-minion.md` -- test review (APPROVE)
- `phase3.5-ux-strategy-minion.md` -- UX review (APPROVE)
- `phase3.5-lucy.md` -- lucy review (APPROVE)
- `phase3.5-margo.md` -- margo review (APPROVE)
- `phase4-debugger-minion-prompt.md` -- execution prompt
- `phase5-code-review-minion.md` -- code review (APPROVE)

</details>

Compaction events: 0
