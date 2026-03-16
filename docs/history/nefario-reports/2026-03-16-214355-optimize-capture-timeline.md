---
task: Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle
date: 2026-03-16
slug: optimize-capture-timeline
mode: execution
source-issue: 79
task-count: 1
gate-count: 0
compaction-events: 0
---

## Summary

Optimized the capture pipeline with three changes: adaptive settle delay (500ms quiescence / 3s cap replacing fixed 3s), consent timeout reduction (8s → 2s), and graceful consent failure handling (selective try/catch with browser death error re-throw). New worst-case budget: 27s (was 33s). Fast path for CMP-absent pages: ~9.5s. 504 tests pass, zero regressions. Resolves #79.

## Original Prompt

Optimize capture pipeline: consent timeout, graceful consent failure, adaptive settle (#79). Stage-level timing analysis showed consent timeout burning 8s on 6/7 tested sites with no CMP detected — 33% of the 30s ctx.waitUntil budget spent doing nothing.

## Key Design Decisions

1. **Adaptive settle: in-flight request counter** — Uses page.on('request'/'requestfinished'/'requestfailed') with 500ms quiescence window and 3s hard cap. Ignores websocket/eventsource resource types. Works where networkidle doesn't because it counts HTTP request/response pairs, not TCP connections.

2. **Consent timeout: 2s** — Based on staging data: real CMPs resolve in <2s (slashdot.org at 1.8s). 6 of 7 tested sites had no CMP, wasting the full 8s timeout.

3. **Consent error: collapse to 'failed', not new 'error' status** — security-minion recommended a distinct 'error' status for evidence chain integrity. margo flagged YAGNI: user specified 'failed', log event provides operator distinguishability. Resolved in favor of simplicity (Helix Manifesto KISS).

4. **Selective error propagation** — Browser death errors (Target closed, Session expired, Protocol error, etc.) re-thrown from consent try/catch. Only consent-specific errors degrade gracefully. Prevents masking dead sessions.

## Phases

### Phase 1: Meta-Plan
Lean 2-agent planning team selected (debugger-minion for settle design, security-minion for error handling). Task was narrow enough that the full roster wasn't needed for planning.

### Phase 2: Specialist Planning
debugger-minion designed the in-flight request counter mechanism, explaining why the 0029 "Option C" rejection didn't apply (optimization is incremental, not speculative). security-minion identified the need for selective error propagation and recommended a new 'error' consent status.

### Phase 3: Synthesis
Single-task, zero-gate execution plan. All changes cohesive enough for one agent. Budget calculated: 27s worst case (down from 33s), ~9.5s fast path.

### Phase 3.5: Architecture Review
6 reviewers: 2 APPROVE, 4 ADVISE, 0 BLOCK. Key disagreement between security-minion ('error' status for evidence chain) and margo (YAGNI — 'failed' plus log event). Resolved in favor of margo per Helix Manifesto and user's own success criteria. Observability advisories (settle telemetry in logs, error context in consent_error) all incorporated.

### Phase 4: Execution
Single debugger-minion agent implemented all changes in one pass across 4 files. All reviewer advisories incorporated. 504 tests pass.

### Phases 5-8
Skipped (all approval gates skipped per user directive).

## Agent Contributions

### Planning (Phase 2)

| Agent | Recommendation | Tasks |
|-------|---------------|-------|
| debugger-minion | In-flight request counter with quiescence + cap | 1 — implement waitForSettle() |
| security-minion | Selective error propagation, distinct error status | 2 — try/catch + status mapping |

### Review (Phase 3.5)

| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | APPROVE | String() coercion for non-Error throws |
| test-minion | ADVISE | Verify render passthrough; don't touch partial fixtures |
| ux-strategy-minion | APPROVE | No user-facing changes |
| lucy | ADVISE | Note error/failed refinement in PR |
| margo | ADVISE | 'error' status is YAGNI — collapse to 'failed' |
| observability-minion | ADVISE | Add settle telemetry + error context to logs |

## Execution

| Task | Agent | Files Changed | Status |
|------|-------|--------------|--------|
| Optimize capture pipeline | debugger-minion (sonnet) | src/capture.js, src/consent.js, test/capture.test.js, openapi.yaml | Complete |

## Verification

Tests: 504 passed, 0 failed (23 test files). 4 new tests added for consent error handling and settle telemetry.

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration

</details>

<details>
<summary>Compaction</summary>

0 compaction events (context stayed within limits).

</details>

## Working Files

[Companion directory](./2026-03-16-214355-optimize-capture-timeline/)

| File | Description |
|------|-------------|
| prompt.md | Original task description |
| phase1-metaplan.md | Meta-plan output |
| phase2-debugger-minion.md | Settle delay design |
| phase2-security-minion.md | Consent error analysis |
| phase3-synthesis.md | Execution plan |
| phase3.5-*.md | Architecture review verdicts |
| phase4-debugger-minion-prompt.md | Execution agent prompt |
