# 0037 Decisions

## workflow_run vs SHA-polling

**Chosen:** `workflow_run` trigger with `conclusion == 'success'` guard

**Rejected:** Commit-SHA verification (polling `/health` for expected SHA)

**Rationale:** `workflow_run` is a structural platform-level fix. It solves the race condition by making the production workflow depend on the staging workflow's completion event, rather than both racing on the same push trigger. SHA-polling would require:
- Adding commit SHA to the `/health` endpoint (application code change, out of scope)
- A polling loop with timeout (new failure mode)
- Timing sensitivity (how long to poll before giving up)

All to solve a symptom rather than the cause. `workflow_run` eliminates the timing window entirely with zero application code changes.

## Skip staging-smoke on workflow_run triggers

**Chosen:** Conditional `staging-smoke` job (`if: github.event_name == 'workflow_dispatch'`)

**Rejected:** Running staging-smoke unconditionally

**Rationale:** The staging workflow already runs its own smoke test. Re-running the same smoke test in the production workflow adds 1-2 minutes of latency with zero additional signal. For `workflow_dispatch` rollbacks, the smoke test provides value because staging may not have been recently verified.

## Drop concurrency group

**Chosen:** No concurrency group

**Rejected:** `concurrency: group: deploy-production, cancel-in-progress: false`

**Rationale:** YAGNI. The `workflow_run` trigger already serializes production deploys through the staging workflow. Overlapping production deploys require rapid concurrent pushes that are essentially impossible with one developer. Add if team size grows.

## Drop traceability logging

**Chosen:** No dedicated logging step

**Rejected:** "Log deploy context" step echoing trigger type, deploy ref, and staging run URL

**Rationale:** GitHub Actions UI already shows all of this information natively (trigger type, triggering workflow run link, checked-out ref). The logging step duplicates information available one click away. Low cost but zero incremental signal.

## Manual staging deploys trigger production

**Chosen:** Document as intentional behavior (no filter)

**Rejected:** Adding `if: github.event.workflow_run.event == 'push'` filter to prevent manual staging deploys from triggering production

**Rationale:** If a staging deploy succeeds, promoting to production is the right default regardless of how the staging deploy was triggered. A filter would create a surprising inconsistency and an undocumented "staging-only deploy" path.

## CONTRIBUTING.md in scope

**Chosen:** Update CONTRIBUTING.md pipeline description

**Rationale:** Lines 39-44 described the deploy pipeline to contributors. Leaving it outdated after the trigger change creates a mental model mismatch. Small effort, high clarity.
