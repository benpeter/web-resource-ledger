---
task: "Fix staging-production deploy race condition (#86)"
date: 2026-03-17
source-issue: 86
mode: execution
task-count: 2
gate-count: 1
agents: [iac-minion, user-docs-minion]
reviewers: [security-minion, test-minion, ux-strategy-minion, lucy, margo]
verdict: all-advise
---

## Summary

Fixed the race condition between `deploy-staging.yml` and `deploy-production.yml` by replacing the production workflow's `push: branches: [main]` trigger with a `workflow_run` trigger that fires after the staging workflow completes. This guarantees staging is deployed and smoke-tested before production proceeds. Updated OPERATIONS.md and CONTRIBUTING.md to document the new pipeline topology.

## Original Prompt

Fix the race condition between deploy-staging.yml and deploy-production.yml workflows (#86). Both workflows trigger on `push: branches: [main]` with no formal ordering. The production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code.

## Key Design Decisions

### workflow_run vs SHA-polling

**Chosen:** `workflow_run` trigger with `conclusion == 'success'` guard
**Over:** Commit-SHA verification (polling `/health` for expected SHA)
**Why:** Structural platform-level fix with zero application code changes, no timing windows, no new failure modes. SHA-polling would add a polling loop, `/health` endpoint changes (out of scope), and solve a symptom rather than the cause.

### Skip staging-smoke on automatic triggers

**Chosen:** Conditional `staging-smoke` job (`if: github.event_name == 'workflow_dispatch'`)
**Over:** Running staging-smoke unconditionally
**Why:** The staging workflow already runs its own smoke test. Re-running adds latency with zero additional signal.

### Drop concurrency group and traceability logging

**Chosen:** Omit both from implementation
**Over:** Including concurrency group + logging step (iac-minion recommendation, margo ADVISE to drop)
**Why:** YAGNI for solo developer; `workflow_run` already serializes through staging. GitHub Actions UI shows trigger context natively.

## Phases

### Phase 1: Meta-Plan
Identified 2 specialists needed: iac-minion (CI/CD workflow mechanics) and user-docs-minion (OPERATIONS.md updates). Excluded security-minion (no new attack surface), test-minion (no testable app code), ux-strategy-minion (solo developer workflow).

### Phase 2: Specialist Planning
- **iac-minion** recommended `workflow_run` trigger, identified 4 critical implementation details (conclusion guard, head_sha ref, always() for skipped jobs, coupling comment)
- **user-docs-minion** identified 4 OPERATIONS.md sections needing updates plus CONTRIBUTING.md, flagged the manual staging deploy → production chain question

### Phase 3: Synthesis
Consolidated into 2-task sequential plan with 1 approval gate. Key synthesis decision: drop concurrency group and traceability logging per YAGNI.

### Phase 3.5: Architecture Review
5 mandatory reviewers, all returned ADVISE (0 BLOCK):
- **security-minion**: Shell injection risk in logging step (moot — step was dropped)
- **test-minion**: Post-merge validation needs tracking artifact
- **ux-strategy-minion**: Rollback warning needs chain context; CLI framing consistency
- **lucy**: Evolution log entry and backlog review needed
- **margo**: Concurrency group is YAGNI; traceability logging duplicates UI

### Phase 4: Execution
2 tasks executed sequentially. Task 1 (workflow YAML) gated and approved. Task 2 (documentation) proceeded after approval.

### Phase 5: Code Review
3 reviewers: code-review-minion (ADVISE), lucy (ADVISE), margo (APPROVE). The ADVISE findings flagged missing concurrency group and logging step — false positives, as both were explicitly dropped at the Execution Plan Approval Gate.

### Phase 6: Test Execution
510 unit tests passed (23 files). API lint valid. No regressions.

### Phase 7: Deployment
Skipped (not requested).

### Phase 8: Documentation
Phase 8a assessment: 0 items. Task 2 already addressed all documentation impacts. No documentation debt.

## Agent Contributions

### Planning Phase
| Agent | Recommendation | Tasks |
|-------|---------------|-------|
| iac-minion | Use workflow_run trigger; identified 4 critical implementation gotchas | 4 proposed |
| user-docs-minion | 4 OPERATIONS.md sections + CONTRIBUTING.md need updates | 3 proposed |

### Review Phase
| Agent | Verdict | Key Finding |
|-------|---------|-------------|
| security-minion | ADVISE | inputs.ref injection in logging step (dropped from plan) |
| test-minion | ADVISE | Post-merge live validation tracking |
| ux-strategy-minion | ADVISE | Rollback warning chain behavior; CLI framing consistency |
| lucy | ADVISE | Evolution log + backlog review required |
| margo | ADVISE | Concurrency group and logging step are YAGNI |

## Execution

### Task 1: Modify deploy-production.yml (iac-minion)
- **Gate:** Approved
- **Deliverable:** `.github/workflows/deploy-production.yml` — replaced trigger block, added conditional staging-smoke, updated deploy job guards and ref resolution
- **Approach:** Surgical edits to existing file. Rejected: concurrency group (YAGNI), traceability logging (duplicates UI)

### Task 2: Update OPERATIONS.md and CONTRIBUTING.md (user-docs-minion)
- **Gate:** None (no gate)
- **Deliverable:** Updated OPERATIONS.md (+26 lines) and CONTRIBUTING.md (+5 lines)

## Verification

Verification: code review passed (3 reviewers, false-positive ADVISEs on intentionally dropped items), all tests pass (510/510). (Documentation: not applicable — already covered by Task 2)

## Test Plan

- [ ] Push to `main` and verify: staging workflow runs first, production workflow triggers only after staging completes successfully
- [ ] Verify production deploy job checks out the correct SHA (the one that was staged, not HEAD)
- [ ] Trigger a staging workflow failure and verify production does NOT deploy
- [ ] Test `workflow_dispatch` rollback on deploy-production: verify staging-smoke runs, deploys specified SHA
- [ ] Test `workflow_dispatch` on deploy-staging: verify both staging and production chain fires

## Session Resources

<details>
<summary>Skills Invoked</summary>

- `/nefario` — orchestration

</details>

<details>
<summary>Compaction Events</summary>

0 compaction events during this session.

</details>

## Working Files

Working files directory: `docs/history/nefario-reports/2026-03-17-154800-staging-deploy-race-condition/`

Files:
- `prompt.md` — original user prompt
- `phase1-metaplan-prompt.md` / `phase1-metaplan.md` — meta-plan
- `phase2-iac-minion-prompt.md` / `phase2-iac-minion.md` — iac-minion planning
- `phase2-user-docs-minion-prompt.md` / `phase2-user-docs-minion.md` — user-docs planning
- `phase3-synthesis-prompt.md` / `phase3-synthesis.md` — synthesis
- `phase3.5-*-prompt.md` / `phase3.5-*.md` — architecture review verdicts
- `phase4-iac-minion-prompt.md` — Task 1 execution prompt
- `phase4-user-docs-minion-prompt.md` — Task 2 execution prompt
- `phase5-*.md` — code review verdicts
- `phase6-test-results.md` — test results
- `phase8-checklist.md` — documentation assessment

Resolves #86
