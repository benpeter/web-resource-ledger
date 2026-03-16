## Lucy Review: Alignment, Convention Compliance, and Drift Analysis

**Verdict: ADVISE**

### Requirements Traceability

| Requirement (from prompt.md) | Plan Element | Status |
|------------------------------|-------------|--------|
| R9: wrangler.toml staging env with isolated KV + R2 | Task 1a | COVERED |
| R9: GitHub Actions deploys staging on push to main | Task 2a | COVERED |
| R9: Smoke test (health + capture round-trip) | Task 2b | COVERED |
| R9: Separate staging API keys | Task 2a (env block with separate secrets) | COVERED |
| R9: Staging accessible for manual testing | Task 2a (workflow_dispatch) | COVERED |
| R7: ToS document | Task 3a | COVERED |
| R7: Content moderation policy with abuse reporting | Task 3b | COVERED |
| R7: ToS/policy accessible from API responses | Task 3c (Link header), 3d (health), 3e (footer) | COVERED |
| R7: Documents reviewed for legal soundness | Task 3a/3b disclaimers, Risk #4 | COVERED |
| Out of scope: Production CD (R14) | Not in plan | CORRECT |
| Out of scope: Preview deployments per PR | Not in plan | CORRECT |
| Out of scope: Automated content scanning | Not in plan | CORRECT |
| Combine both in one PR | Single plan, parallel execution | CORRECT |
| Skip approval gates | "No approval gates" stated | CORRECT |
| Evolution directory 0018-staging-and-tos | Not explicitly in tasks | SEE FINDING 1 |

No orphaned tasks. No unaddressed requirements (except finding 1 below). Scope is contained.

### Findings

1. **[COMPLIANCE]**: Evolution log directory not created by any task
   - SCOPE: `docs/evolution/0018-staging-and-tos/`
   - CHANGE: CLAUDE.md rule 1 requires "Before starting a phase: create the directory and write `prompt.md`." The user explicitly requested evolution directory `0018-staging-and-tos`. No task creates the directory, writes `prompt.md`, or updates `docs/evolution/README.md`. The plan's "Cross-Cutting Coverage" section mentions "Phase 8" for evolution log but this is a nefario wrap-up phase reference, not a task in the delegation plan.
   - WHY: CLAUDE.md states evolution log rules are "non-negotiable." The `prompt.md` should be written *before* execution begins (rule 1), not deferred to wrap-up. The nefario orchestration wrap-up phase typically handles `outcome.md` and `process.md`, but the pre-phase `prompt.md` and directory creation should happen before task execution starts, or be an explicit task.
   - TASK: None (missing task). The calling nefario session should create `docs/evolution/0018-staging-and-tos/prompt.md` before dispatching tasks, and update `docs/evolution/README.md` during wrap-up.

2. **[CONVENTION]**: `ci.yml` change filter may skip tests for this PR
   - SCOPE: `.github/workflows/ci.yml` changes step (lines 20-28)
   - CHANGE: The `ci.yml` has a `changes` step that skips tests when only `.md` or `docs/` files change. This PR adds `TERMS.md`, `CONTENT-POLICY.md`, and modifies `README.md` alongside code changes. The filter `grep -qvE '\.md$|^docs/'` correctly passes when non-markdown files are also changed -- so for *this* PR the tests will run. However, the `workflow_call` trigger (Task 1c) used by `deploy-staging.yml` will have a different `github.event` context. When called via `workflow_call`, neither `github.event.pull_request.base.sha` nor `github.event.before` will be populated, so `BASE_REF` will be empty, causing the `git diff` to fail.
   - WHY: The plan's Risk #2 acknowledges this but understates it. The `BASE_REF` computation will produce an empty string under `workflow_call`, and `git diff ""...HEAD` will error. This will cause the `changes` step to fail, which will block the entire test job, which will block the deploy job. This is not a "low" risk -- it will break staging deploys on first run.
   - TASK: Task 1c. The `workflow_call` addition to `ci.yml` needs the `changes` step to handle the missing base ref (e.g., default to always running tests when triggered via `workflow_call`).

3. **[SCOPE]**: Smoke test Link header check assumes Task 3 output
   - SCOPE: `scripts/smoke-test.sh` check #2 (security headers)
   - CHANGE: Task 2b's smoke test prompt says to "verify the `Link` header contains `rel="terms-of-service"` (wired by Task 3)." Since Tasks 2 and 3 run in parallel and are authored by separate agents, Task 2's smoke test script will include a check for a header that only exists after Task 3's changes are merged. This is fine for the committed script (both will be in the same PR), but it creates a temporal coupling: if Task 3 fails and Task 2 succeeds, the smoke test script will reference a header that doesn't exist in the codebase yet.
   - WHY: Minor. The risk is only realized if Task 3 is dropped from the PR while Task 2 is kept. The smoke test would then fail on staging deployment. The plan should note this dependency.
   - TASK: Task 2b prompt. Add a note that the Link header check depends on Task 3c being merged in the same PR.

4. **[CONVENTION]**: Helix Manifesto compliance -- plan is well-aligned
   - SCOPE: Overall plan
   - CHANGE: No change needed. For the record: the plan correctly applies YAGNI (no Worker endpoints for legal docs, no `/abuse` route, no styled ToS page), KISS (Link header in existing universal block, one-line log.js change, bash smoke test over Node.js), and Lean and Mean (no new dependencies, no abstraction layers). The conflict resolutions explicitly cite Helix Manifesto principles and reach the right conclusions. The `ux-strategy-minion` styled HTML page and `software-docs-minion` dedicated endpoints were correctly rejected.
   - WHY: Positive finding. The plan demonstrates strong alignment with the project's engineering philosophy.

5. **[COMPLIANCE]**: OpenAPI version bump explicitly declined -- correct
   - SCOPE: `openapi.yaml` version field
   - CHANGE: None needed. The plan says "Do NOT bump the version number (this is additive metadata, not a functional API change)." This is the correct call -- the health response schema change is additive (new optional `legal` field), the Link header is a transport-layer addition, and the staging server is spec metadata.
   - WHY: Positive finding. Confirming alignment with convention.

### Summary

The plan is well-scoped, well-reasoned, and tightly aligned with the user's stated requirements. Conflict resolutions are sound and consistently apply the Helix Manifesto. Scope is contained -- no scope creep detected. The two actionable findings are:

- **Finding 2 (ci.yml workflow_call BASE_REF)**: This will break staging deploys. The Task 1c prompt should instruct the agent to handle the empty `BASE_REF` case when triggered via `workflow_call` (e.g., skip the changes filter and always run tests).
- **Finding 1 (evolution log)**: Nefario should create the `0018-staging-and-tos` directory and `prompt.md` before dispatching tasks, per CLAUDE.md rule 1.

Finding 3 is a minor cross-task dependency note, not a blocker.
