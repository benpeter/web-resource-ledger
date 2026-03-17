# Margo Review -- Staging Deploy Race Condition Fix

VERDICT: APPROVE

The changes are minimal, focused, and proportional to the problem. The core fix -- replacing `push` trigger with `workflow_run` -- is exactly one mechanism change that eliminates the race condition where staging and production deploys could run in parallel. No new dependencies, no new abstractions, no new services. The documentation updates accurately reflect the new behavior.

## Findings

- [NIT] `deploy-production.yml`:38-42 -- The `always()` wrapper on the `deploy` job `if` condition is necessary because `staging-smoke` is skipped on `workflow_run` events (skipped jobs cause dependent jobs to be skipped by default without `always()`), but it makes the condition harder to parse on first read. The inline comment or a YAML comment explaining why `always()` is needed would help future readers. Not blocking -- the logic is correct and the coupling comment on lines 6-7 sets a good precedent for documenting non-obvious behavior.
  AGENT: implementing minion
  FIX: Add a short comment above the `if` block, e.g., `# always() required: staging-smoke is skipped on workflow_run, which would skip this job without it`

- [NIT] `OPERATIONS.md`:80 -- The rollback `staging-smoke` description says "tests whatever is currently on staging, not the rollback SHA" which is accurate and important, but this is a subtle operational footgun. The warning on line 82 ("bypasses the staging-first guarantee") partially covers it, but an operator in a hurry might not connect the two. Consider combining into a single warning.
  AGENT: implementing minion
  FIX: Merge lines 80 and 82 into one warning block: "Warning: This deploys directly to production. The staging-smoke step tests whatever is currently on staging, not the rollback SHA -- this bypasses the staging-first guarantee."

## Complexity Assessment

- **Scope alignment**: 3 files changed, all directly related to the stated problem (race condition between staging and production deploys). No scope creep.
- **Abstraction layers**: Zero new layers. The `workflow_run` trigger is a native GitHub Actions mechanism replacing another native mechanism (`push`). This is a lateral move in complexity, not an addition.
- **Dependencies**: No new dependencies added.
- **Complexity budget**: Net zero. The `workflow_run` trigger adds a string coupling between workflow names (documented with the comment on line 6-7), but removes the implicit race condition between two `push`-triggered workflows. Fair trade.
- **YAGNI**: All changes serve the immediate problem. The documentation additions describe existing behavior, not speculative features.
- **Infrastructure proportionality**: The workflow is 71 lines for a deploy pipeline. Proportional.

The `staging-smoke` conditional skip on `workflow_run` events is the right call -- running staging smoke twice (once in `deploy-staging.yml`, once in `deploy-production.yml`) would be redundant. The condition is slightly more complex than the baseline, but it eliminates actual redundancy in the happy path.
