MODE: SYNTHESIS

You are synthesizing specialist planning contributions into a
final execution plan.

## Original Task

Fix the race condition between deploy-staging.yml and deploy-production.yml workflows (#86).

Both workflows trigger on `push: branches: [main]`. The production workflow's `staging-smoke` job can run before the staging deploy completes, testing stale code. The goal is to guarantee that production's staging-smoke gate only proceeds after the staging deploy for the same commit has completed successfully.

### Success criteria
- `deploy-production.yml` only runs its staging-smoke gate after the staging deploy for the same commit has completed successfully
- No change to the branching model (single-branch, push-to-main stays)
- OPERATIONS.md updated if workflow triggers change
- OPERATIONS.md documents `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys

### Scope
**In:** Workflow trigger ordering, OPERATIONS.md updates, documenting ad-hoc staging deploy via `workflow_dispatch`
**Out:** Staging branch, tag-based promotion, production capture smoke (`SMOKE_SKIP_CAPTURE`), `/health` endpoint changes (unless needed for SHA verification)

## Specialist Contributions

Read the following scratch files for full specialist contributions:
- `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase2-iac-minion.md`
- `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase2-user-docs-minion.md`

## Key consensus across specialists:

## Summary: iac-minion
Phase: planning
Recommendation: Use `workflow_run` trigger — solves race condition structurally at the platform level. Guard on `conclusion == 'success'`, use `head_sha` not `github.sha`, handle conditional job skipping, add concurrency group.
Tasks: 4 — modify deploy-production.yml triggers; update checkout refs to use head_sha; add concurrency group; update OPERATIONS.md
Risks: Missing `conclusion == 'success'` guard would deploy on staging failure; using `github.sha` instead of `head_sha` could deploy untested code
Conflicts: none

## Summary: user-docs-minion
Phase: planning
Recommendation: Four sections of OPERATIONS.md need updates; add new "Deploy to Staging" section; update trigger description; clarify rollback behavior with workflow_run; update staging environment protection notes. CONTRIBUTING.md also needs update.
Tasks: 3 — add Deploy to Staging section to OPERATIONS.md; update Deploy to Production section; update CONTRIBUTING.md staging description
Risks: Ad-hoc staging deploys via workflow_dispatch may or may not trigger production workflow_run — docs must accurately describe this behavior
Conflicts: none

## External Skills Context
No external skills detected.

## Instructions
1. Review all specialist contributions
2. Resolve any conflicts between recommendations
3. Incorporate risks and concerns into the plan
4. Create the final execution plan in structured format
5. Ensure every task has a complete, self-contained prompt
6. If external skills were discovered, include them in the execution plan:
   - ORCHESTRATION skills: create DEFERRED macro-tasks (see Core Knowledge)
   - LEAF skills: list in the Available Skills section of relevant task prompts
   - Apply precedence rules when skills overlap with internal specialists
7. Write your complete delegation plan to `/var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-xrXhca/staging-deploy-race-condition/phase3-synthesis.md`
