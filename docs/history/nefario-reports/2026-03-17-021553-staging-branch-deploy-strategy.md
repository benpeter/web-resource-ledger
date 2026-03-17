---
task: "Advisory: staging branch deployment strategy"
date: 2026-03-17
status: complete
mode: advisory
task-count: 0
gate-count: 0
agents: [iac-minion, devx-minion, security-minion, ux-strategy-minion, software-docs-minion]
slug: staging-branch-deploy-strategy
---

## Summary

Unanimous team recommendation: **do not create a staging branch.** The current single-branch model (push to main deploys to both staging and production, with staging-smoke gate and environment approval) already provides the safety properties a staging branch would offer, without the branch management overhead. A staging branch would actually degrade safety by making the staging-smoke gate test code that will never reach production. The one genuine gap -- a race condition between the staging and production deploy workflows -- is fixable with `workflow_run` or commit-SHA verification, not a branch change.

## Original Prompt

Should we create a separate branch, say staging, that deploys to staging when merges happen, and only main deploys to prod?

## Key Design Decisions

1. **Keep single-branch model** -- All five specialists independently recommended against a staging branch. The current model already gates production on staging health. A second branch adds coordination overhead with no safety benefit for a solo developer.

2. **Race condition is the real gap** -- Both `deploy-staging.yml` and `deploy-production.yml` trigger on `push: branches: [main]` with no ordering guarantee. The staging-smoke gate in the production workflow can test stale staging code. Fix with `workflow_run` trigger or commit-SHA verification.

3. **workflow_dispatch covers "test without shipping"** -- `deploy-staging.yml` already supports manual triggering for arbitrary refs. This covers the "deploy to staging without committing to production" use case with zero branch overhead.

4. **Re-evaluate at team size > 1** -- Environment branches solve a coordination problem between developers. With one developer, the branch communicates with no one. Backlog already tracks the trigger.

## Phases

### Phase 1: Meta-Plan
Identified 5 specialists: iac-minion (CI/CD changes and failure modes), devx-minion (workflow ergonomics comparison), security-minion (deployment risk assessment), ux-strategy-minion (pain point analysis), software-docs-minion (documentation burden).

### Phase 2: Specialist Planning
All 5 consulted in parallel. Unanimous: keep current model. Key insights per specialist:
- **iac-minion**: Staging-smoke gate becomes strictly worse with a staging branch (tests wrong code). Three failure modes: divergence, hotfix bypass, stale staging.
- **devx-minion**: Current model is 1 step to ship; staging branch is 3-4 steps. Cloudflare Workers lack artifact promotion, negating the core benefit of environment branches.
- **security-minion**: Staging branch introduces secret drift, false confidence from diverged staging, doubled CI/CD attack surface. Also flagged: production smoke skips capture testing.
- **ux-strategy-minion**: No evidence of pain. Solution looking for a problem. Applied JTBD and Kano analysis -- staging branch is at best indifferent, at worst a reverse feature.
- **software-docs-minion**: 7 documentation locations reference branching model. Two-branch model doubles explanation surface and creates ongoing sync tax.

### Phase 3: Synthesis
No conflicts to resolve. Synthesized unanimous recommendation with next steps: fix race condition, document decision, document workflow_dispatch for ad-hoc staging deploys.

### Phases 3.5-8
Skipped (advisory-only orchestration).

## Agent Contributions

| Agent | Phase | Verdict |
|-------|-------|---------|
| iac-minion | planning | Keep single-branch; fix race condition via workflow_run |
| devx-minion | planning | Keep Model A; staging branch adds 3-4 steps with drift risk |
| security-minion | planning | Keep single-branch; staging branch introduces 3 new security risks |
| ux-strategy-minion | planning | No evidence of pain; revisit at team size > 1 |
| software-docs-minion | planning | Current model has near-zero docs burden; two-branch doubles it |

## Team Recommendation

### Executive Summary

Do not create a staging branch. The current single-branch model already provides staging-before-production safety and is the correct architecture for a solo-developer Cloudflare Workers project.

### Consensus Points

1. Current model already gates production on staging health
2. Staging branch solves a coordination problem that doesn't exist for a solo developer
3. Branch drift is the primary risk -- stale staging, merge conflicts, forgotten promotions
4. Cloudflare Workers lack artifact promotion, so branch separation adds ceremony without safety
5. Race condition between deploy workflows is the one real gap, fixable without branch changes
6. `workflow_dispatch` already covers "test without shipping"
7. Documentation overhead roughly doubles with a second branch

### Dissenting Views

None. Difference in emphasis only: iac-minion and security-minion prioritize fixing the race condition; ux-strategy-minion views it as accepted tradeoff with no incident history. Both positions are compatible.

### Recommended Next Steps

1. **Fix race condition** -- Change `deploy-production.yml` to use `workflow_run` trigger on staging deploy success, or add commit-SHA verification to staging-smoke step
2. **Document this decision** -- Evolution log entry recording evaluation and rejection of staging branch model
3. **Document workflow_dispatch** -- One-liner in OPERATIONS.md for ad-hoc staging deploys
4. **Optionally evaluate production capture smoke** -- `SMOKE_SKIP_CAPTURE=1` means SSRF surface is never verified post-production-deploy (independent finding)

### Conditions to Revisit

- Second contributor joins (coordination problem becomes real)
- Documented incident from the race condition
- `workflow_dispatch` proves insufficient for "test without shipping" need
- Regulatory or compliance requirement for environment separation

## Working Files

[2026-03-17-021553-staging-branch-deploy-strategy/](./2026-03-17-021553-staging-branch-deploy-strategy/)

| File | Description |
|------|-------------|
| prompt.md | Original task description |
| phase1-metaplan.md | Meta-plan: specialist selection and planning questions |
| phase1-metaplan-prompt.md | Prompt sent to nefario for meta-plan |
| phase2-iac-minion.md | CI/CD analysis: workflow changes, failure modes |
| phase2-devx-minion.md | Developer experience: 3-model comparison |
| phase2-security-minion.md | Security risk assessment |
| phase2-ux-strategy-minion.md | Pain point analysis, JTBD/Kano |
| phase2-software-docs-minion.md | Documentation burden inventory |
| phase3-synthesis.md | Advisory synthesis with full recommendation |
