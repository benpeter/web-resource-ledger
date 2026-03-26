# Margo Review: Autoconsent Update Pipeline

## Verdict: ADVISE

The plan is proportional to the problem. Two tasks, two deliverables, no new dependencies, no new abstractions. This is a straightforward CI automation that matches the repo's existing patterns. One non-blocking concern:

### 1. Three-job workflow duplicates checkout/install/vendor three times

**What**: Jobs 2 (battery) and 3 (open-pr) each repeat checkout, npm ci, npm install autoconsent@latest, and vendor:autoconsent -- the full setup from Job 1. The plan acknowledges this adds ~2-3 minutes and justifies it because "GitHub Actions jobs don't share filesystems."

**Why this is worth watching**: The 3-job structure exists to give battery its own `continue-on-error` semantics and the `staging` environment. That justification is valid. But the `open-pr` job does not need either of those things -- it needs `contents: write` and `pull-requests: write`, which are already workflow-level permissions. Collapsing `open-pr` into the end of `update-and-test` (gated on unit test success, running after battery completes via `needs`) would eliminate one full redundant checkout/install cycle and simplify the workflow from 3 jobs to 2.

**Simpler alternative**: Two jobs: (1) `update-test-and-pr` -- version check, npm update, vendor, unit tests, sync tests, create branch/push/PR; (2) `battery` -- advisory, continue-on-error, staging environment. The PR body can note "battery: pending" and the battery job can update the PR body via `gh pr edit` with results. This removes one full redundant setup cycle and one job definition.

**Why ADVISE not BLOCK**: The 3-job approach works, the redundancy is CI time not code complexity, and the workflow runs weekly. The cost is minor. But if the implementer finds it natural to collapse to 2 jobs, that is the simpler path.

### What looks good

- Zero new dependencies. Vendoring script uses only Node built-ins.
- Reuses existing `staging` environment secret instead of creating a duplicate repo-level secret.
- No third-party actions for PR management -- `gh` CLI only.
- SHA-pinned actions matching existing repo conventions.
- Stale PR cleanup prevents accumulation.
- Battery failures are advisory, not blocking -- correct failure semantics.
- Task count (2) is proportional to the request.
- No scope creep: no Slack notifications, no auto-merge, no version pinning UI, no dashboard.
