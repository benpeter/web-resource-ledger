Fix staging-production deploy race condition (#86)

## Outcome

The production deploy workflow (`deploy-production.yml`) is guaranteed to smoke-test the *current* staging deployment — not a stale version from a previous push. The race condition between `deploy-staging.yml` and `deploy-production.yml` (both triggered by `push: branches: [main]`) is eliminated.

## Success criteria

- `deploy-production.yml` only runs its staging-smoke gate after the staging deploy for the same commit has completed successfully
- No change to the branching model (single-branch, push-to-main stays)
- OPERATIONS.md updated if workflow triggers change
- OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

## Scope

**In:** Workflow trigger ordering (`workflow_run` or commit-SHA verification), OPERATIONS.md updates, documenting ad-hoc staging deploy via `workflow_dispatch`

**Out:** Staging branch, tag-based promotion, production capture smoke (`SMOKE_SKIP_CAPTURE`), `/health` endpoint changes (unless needed for SHA verification)

## Context

The nefario advisory ([2026-03-17 report](docs/history/nefario-reports/2026-03-17-021553-staging-branch-deploy-strategy.md)) evaluated whether to introduce a staging branch. All five specialists unanimously recommended against it — the current single-branch model already provides staging-before-production safety.

However, they identified one genuine gap: both deploy workflows trigger on `push: branches: [main]` with no formal ordering. The production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code. This is the one safety property the current model doesn't fully deliver.

### Options identified by the advisory

1. **`workflow_run` trigger** — `deploy-production.yml` triggers on `deploy-staging.yml` completion instead of `push`. Guarantees ordering. Trade-off: production deploy no longer appears in the same Actions run as the push.
2. **Commit-SHA verification** — Staging smoke step checks that the `/health` endpoint reports the expected commit SHA before proceeding. Requires adding SHA to the health response. Trade-off: adds a polling loop and a code change.

### Related decisions

- Staging branch model evaluated and rejected (see advisory report)
- Re-evaluate branching model if team size > 1
