# Meta-Plan: Staging Deploy Race Condition Fix

## Task Summary

Eliminate the race condition where `deploy-production.yml`'s `staging-smoke` job can test a stale staging deployment. Both workflows trigger on `push: branches: [main]` with no ordering guarantee. The fix must ensure production's staging-smoke gate only passes after the staging deploy for the **same commit** completes successfully.

Two options from the advisory: (1) `workflow_run` trigger chaining, (2) commit-SHA verification via `/health` endpoint. The scope is limited to workflow files, OPERATIONS.md, and potentially `smoke-test.sh` and the health endpoint.

## Planning Consultations

### Consultation 1: CI/CD Workflow Design

- **Agent**: iac-minion
- **Planning question**: Given the two options -- `workflow_run` trigger (deploy-production triggers on deploy-staging completion) vs. commit-SHA verification (polling `/health` for expected SHA) -- which approach is simpler and more reliable for a single-developer, push-to-main Cloudflare Workers project? Specifically: (a) With `workflow_run`, how does `workflow_dispatch` on deploy-production still work for rollbacks (the `ref` input)?  (b) If using `workflow_run`, does the production workflow still get the correct commit SHA from the triggering staging run? (c) What are the edge cases (staging deploy failure, concurrent pushes, manual triggers)? Propose the concrete workflow YAML changes for the recommended approach.
- **Context to provide**: Current `deploy-staging.yml` and `deploy-production.yml` (both in `.github/workflows/`), the existing `workflow_dispatch` with `ref` input for rollbacks, OPERATIONS.md rollback section.
- **Why this agent**: CI/CD pipeline design is iac-minion's core domain. GitHub Actions `workflow_run` trigger semantics, workflow dispatch inputs, and job dependency chaining require specific expertise.

### Consultation 2: Documentation Updates

- **Agent**: user-docs-minion
- **Planning question**: What sections of OPERATIONS.md need to change if the production workflow's trigger changes from `push` to `workflow_run`? The issue scope also requires documenting `workflow_dispatch` on `deploy-staging.yml` for ad-hoc staging deploys. Review the current OPERATIONS.md and identify all sections that reference the deploy flow, manual triggers, or the staging-smoke relationship. What would the updated content look like?
- **Context to provide**: Current OPERATIONS.md, the two workflow files, the expected trigger change.
- **Why this agent**: OPERATIONS.md is an operator-facing document. user-docs-minion ensures the documentation accurately reflects the new workflow behavior and covers the new ad-hoc staging deploy capability.

## Cross-Cutting Checklist

- **Testing**: Exclude from planning. The change is to GitHub Actions workflow YAML and documentation. There is no application code to unit-test. The "test" is that the workflow runs correctly in GitHub Actions, which is verified by the existing smoke test infrastructure. If the SHA verification option is chosen (health endpoint change), test-minion would be needed for execution but their planning input is not required.
- **Security**: Exclude from planning. The change does not introduce new attack surface, handle auth, process user input, or manage secrets. The existing secrets and permissions blocks are unchanged.
- **Usability -- Strategy**: Include (see Consultation 2 above via user-docs-minion). The primary "users" here are operators running deploys. The UX question is whether the changed workflow triggers create confusion in the GitHub Actions UI. However, this is lightweight enough that user-docs-minion covers it via OPERATIONS.md updates. A separate ux-strategy-minion consultation would be over-engineering for a CI/CD plumbing fix.
  - *ux-strategy-minion*: Excluded. The "user journey" here is an operator pushing to main and watching Actions. The workflow_run approach is strictly simpler (one fewer concurrent workflow) and the documentation update is the right vehicle for any clarity needed. No separate strategy consultation warranted.
- **Usability -- Design**: Exclude. No user-facing UI is involved.
- **Documentation**: Include (Consultation 2). OPERATIONS.md updates are explicitly in scope.
- **Observability**: Exclude. No runtime components change. The health endpoint might gain a `commit` field if Option 2 is chosen, but that is a trivial addition, not an observability concern.

## Notable Exclusions

- **security-minion**: No new attack surface, auth changes, or secret handling. Workflow file permissions remain read-only. The change is purely trigger ordering.
- **ux-strategy-minion**: The "user" is a solo developer watching GitHub Actions. The documentation update (user-docs-minion) is the right vehicle for ensuring the changed flow is understandable. A separate UX strategy consultation would be disproportionate.
- **test-minion**: No testable application code changes unless Option 2 (SHA in health endpoint) is chosen. If it is, test coverage can be planned during synthesis without a planning consultation.

## Anticipated Approval Gates

1. **Workflow trigger approach** (MUST gate): The choice between `workflow_run` and commit-SHA verification is hard to reverse once implemented and all downstream work depends on it. This is the key architectural decision. iac-minion's recommendation should be presented for approval before execution begins.

This is the only gate needed. OPERATIONS.md updates and any smoke-test.sh changes flow directly from the trigger decision and are easy to reverse.

## Rationale

This is a focused infrastructure task with a clear binary decision point (Option 1 vs Option 2). The primary expertise needed is GitHub Actions workflow mechanics (iac-minion) and operator documentation (user-docs-minion). The task does not touch application logic, security boundaries, or user-facing interfaces, so most specialist agents have no material planning contribution.

Two agents is the right number: iac-minion brings the CI/CD expertise to evaluate the trade-offs and propose concrete YAML, and user-docs-minion ensures the operator documentation stays accurate. The synthesis step will verify cross-cutting coverage and add agents to the execution plan if the chosen approach requires them (e.g., if SHA verification is chosen, the execution plan would include work on `src/index.js` and `smoke-test.sh`).

## Scope

**In scope:**
- Fix the race condition between deploy-staging and deploy-production workflows
- Update OPERATIONS.md to reflect new trigger behavior
- Document `workflow_dispatch` on deploy-staging for ad-hoc staging deploys
- Evolution log entry (0037-staging-deploy-race-condition)

**Out of scope:**
- Staging branch or tag-based promotion model
- Production capture smoke (`SMOKE_SKIP_CAPTURE`) changes
- `/health` endpoint changes beyond what's needed for SHA verification (if Option 2 chosen)
- Any application logic changes

## External Skill Integration

No external skills detected in project (`.claude/skills/` and `.skills/` directories do not exist or are empty).
