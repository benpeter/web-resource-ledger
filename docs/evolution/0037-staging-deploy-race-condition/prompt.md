# 0037: Fix Staging-Production Deploy Race Condition

## Source

GitHub Issue #86

## Prompt

Fix the race condition between deploy-staging.yml and deploy-production.yml workflows. Both trigger on `push: branches: [main]` with no formal ordering, so the production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code.

The production deploy workflow must be guaranteed to smoke-test the current staging deployment, not a stale version from a previous push.

### Success criteria

- `deploy-production.yml` only runs its staging-smoke gate after the staging deploy for the same commit has completed successfully
- No change to the branching model (single-branch, push-to-main stays)
- OPERATIONS.md updated if workflow triggers change
- OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

### Options from prior advisory

1. `workflow_run` trigger -- production triggers on staging completion
2. Commit-SHA verification -- polling `/health` for expected SHA
