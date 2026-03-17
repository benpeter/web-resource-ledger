# Margo Review: staging-deploy-race-condition

## Verdict: ADVISE

The plan is proportional to the problem. The `workflow_run` trigger is the correct structural fix -- zero application code, platform-level ordering guarantee, no polling loops or timing hacks. Two tasks (workflow change + docs) is a reasonable split given the approval gate on the workflow change. The scope aligns tightly with the original request and Issue #86.

Three non-blocking concerns:

### Concern 1

- [simplicity]: Concurrency group adds configuration for a problem that does not exist in a solo-developer, single-branch project.
  SCOPE: `.github/workflows/deploy-production.yml`, concurrency group block
  CHANGE: Remove the `concurrency:` block. With `workflow_run` as the trigger, production deploys are already serialized by the staging workflow completing. Two concurrent production deploys require two staging completions in rapid succession -- which requires two pushes to main landing close enough that both staging workflows finish before the first production deploy completes. For a solo developer on a single branch, this is a scenario that has never occurred and almost certainly never will.
  WHY: YAGNI. The concurrency group is defensive infrastructure for a multi-developer scenario the project explicitly does not have. The prompt itself notes "re-evaluate branching model if team size > 1." Adding deploy queueing before team size > 1 is the same kind of premature infrastructure. If the team grows, adding a concurrency group is a one-line change. Removing it now eliminates one more thing to understand and maintain.
  TASK: Task 1

### Concern 2

- [simplicity]: Traceability logging step is low-cost gold-plating but still gold-plating.
  SCOPE: `.github/workflows/deploy-production.yml`, "Log deploy context" step
  CHANGE: Consider dropping this step. GitHub Actions already displays the trigger event, the triggering workflow run (with clickable link), and the ref being checked out in the default UI. The `echo` statements duplicate information already visible in the Actions run summary and the workflow_run event payload.
  WHY: This is minor -- a 4-line `echo` step is not expensive. But it sets a precedent of adding observability instrumentation to workflows that already provide the same information natively. If the team finds the Actions UI insufficient for debugging deploy issues in practice, add logging then. The information is not lost without this step; it is one click away in the Actions UI.
  TASK: Task 1

### Concern 3

- [simplicity]: Task 2 documentation scope is thorough but edges toward over-documentation for a project with one operator.
  SCOPE: OPERATIONS.md and CONTRIBUTING.md updates
  CHANGE: No change recommended -- this is an observation, not a request. The documentation updates are individually justified. But note that OPERATIONS.md is being asked to document behaviors like "manual staging deploy triggers production" and "concurrency group queues rather than cancels" for a project where the sole operator just designed the pipeline. If the concurrency group from Concern 1 is dropped, the documentation about queuing behavior in Task 2 should also be dropped.
  WHY: Documentation of pipeline topology for a solo project has diminishing returns. The value is primarily for the evolution log / blog-post use case described in CLAUDE.local.md, which is a legitimate project goal. Flagging for awareness, not action.
  TASK: Task 2

### Summary

The core fix (workflow_run trigger, conditional staging-smoke, head_sha ref resolution, always() guard) is exactly right. The risks section correctly identifies the critical gotchas (conclusion check, head_sha vs github.sha, always() for skipped jobs). No scope creep -- the plan does what was asked and nothing more. The two advisory items (concurrency group, logging step) are small additions that individually cost little but collectively represent the "while we're at it" pattern. Neither is blocking.
