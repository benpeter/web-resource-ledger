# 0037 Outcome

## What was built

Fixed the staging-production deploy race condition by changing `deploy-production.yml` from a `push: branches: [main]` trigger to a `workflow_run` trigger that fires after `deploy-staging.yml` completes. This guarantees staging is deployed and smoke-tested before production proceeds.

### Files changed

- `.github/workflows/deploy-production.yml` -- replaced trigger, added conditional staging-smoke, updated deploy job guards and ref resolution
- `OPERATIONS.md` -- added Deploy to Staging section, rewrote Deploy to Production description, updated rollback and staging env docs
- `CONTRIBUTING.md` -- updated pipeline topology description

### Key implementation details

- `workflow_run` fires on completion (success or failure); the deploy job checks `github.event.workflow_run.conclusion == 'success'` to prevent deploying on staging failure
- `github.event.workflow_run.head_sha` used instead of `github.sha` to prevent the drifting-SHA problem (where HEAD advances between push and trigger)
- `always()` required on the deploy job because a skipped `staging-smoke` job would otherwise cascade-skip dependent jobs
- Coupling comment added near the `workflow_run` trigger documenting the string match dependency on the staging workflow's `name:` field

## What deviated from plan

The Phase 3 synthesis included a concurrency group and traceability logging step. Both were dropped at the Execution Plan Approval Gate after Phase 3.5 review (margo ADVISE: YAGNI for solo developer). The execution task prompt explicitly instructed the agent to omit both.

## Backlog changes

No changes to `docs/backlog.md`. This issue was not on the backlog (it came from a nefario advisory finding). No new items were deferred.
