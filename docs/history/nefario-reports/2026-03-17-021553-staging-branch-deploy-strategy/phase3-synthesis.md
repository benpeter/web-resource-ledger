## Advisory Report

**Question**: Should we create a separate staging branch that deploys to staging when merges happen, with only main deploying to production?
**Confidence**: HIGH
**Recommendation**: Do not create a staging branch. The current single-branch model already provides staging-before-production safety and is the correct architecture for a solo-developer project on Cloudflare Workers. Instead, fix the race condition between the staging and production deploy workflows.

### Executive Summary

All five specialists independently reached the same conclusion: do not introduce a staging branch. This is rare -- usually at least one specialist argues the contrarian position. The unanimity reflects how clearly the current deployment model already satisfies the safety goals a staging branch would serve, and how directly the project's own engineering principles (YAGNI, KISS, Lean and Mean from the Helix Manifesto) argue against the additional branch.

The current model works as follows: every push to `main` triggers parallel staging and production deploy workflows. The production workflow gates on a staging-smoke check and a GitHub environment reviewer approval step. The same commit SHA deploys to both environments. This gives you defense-in-depth without branch management overhead. The only documented technical gap is a race condition where the production workflow's staging-smoke job can run before the staging deploy workflow finishes, potentially testing stale staging code. This is a real issue worth fixing, but a staging branch would make it worse, not better -- because staging and production would then intentionally run different code, making the staging-smoke gate meaningless.

If the underlying need is "I want to test on staging without committing to ship," the existing `workflow_dispatch` trigger on `deploy-staging.yml` already supports deploying arbitrary refs to staging without touching main. If the need is "I want strict ordering between staging deploy and production deploy," the fix is changing the production workflow to use a `workflow_run` trigger. Both solutions are smaller, safer, and more aligned with the project's engineering philosophy than introducing a second long-lived branch.

### Team Consensus

All five specialists agreed on the following points:

1. **The current single-branch model already provides staging-before-production safety.** The production deploy workflow gates on a staging-smoke check and an environment approval step. A staging branch does not add a safety property that is missing.

2. **A staging branch solves a coordination problem that does not exist for a solo developer.** Environment branches exist to let multiple developers share a staging integration environment before promoting to production. With one developer, the branch communicates with no one.

3. **Branch drift is the primary risk of the two-branch model.** Every specialist identified divergence between staging and main as a dangerous failure mode -- leading to stale staging, merge conflicts, forgotten promotions, and the staging-smoke gate testing code that will never reach production.

4. **Cloudflare Workers lack artifact promotion, negating the core benefit of environment branches.** Both environments deploy from source via `wrangler deploy`. "Promoting" staging to production is not moving a validated artifact -- it is rebuilding and redeploying from a different trigger. The branch model adds ceremony without the safety property (artifact identity) that makes it worthwhile in container-based systems.

5. **The real gap is the race condition between staging and production deploy workflows.** Both trigger on `push: branches: [main]` with no formal dependency. The fix is `workflow_run` or commit-SHA verification in the staging-smoke step -- neither requires a branch change.

6. **The `workflow_dispatch` trigger on `deploy-staging.yml` already covers the "test without shipping" use case.** You can deploy any ref to staging manually without touching main.

7. **Documentation overhead roughly doubles with a second branch.** Seven documentation locations currently reference the single-branch model. A two-branch model requires explaining branch-to-environment mapping, promotion paths, per-environment rollback procedures, and branch targeting for PRs.

### Dissenting Views

None. All five specialists recommended keeping the current model. This unanimity itself is a signal worth noting -- when infrastructure, developer experience, security, UX strategy, and documentation all independently reach the same conclusion, the case is strong.

The closest thing to dissent was a difference in emphasis on **what to do instead**:
- **iac-minion** and **security-minion** both prioritize fixing the staging-production race condition via `workflow_run` or commit-SHA verification, treating it as a genuine safety gap.
- **ux-strategy-minion** views the race condition as an accepted tradeoff (documented in Phase 0024) that has never caused an incident, and emphasizes that the question itself may be a "solution looking for a problem."
- Resolution: Both positions are compatible. The race condition is a real technical gap worth fixing opportunistically, but it is not urgent and has no incident history. It should not be conflated with the staging branch question -- the fix is orthogonal to branch strategy.

### Supporting Evidence

#### Infrastructure (iac-minion)

Provided the most detailed technical analysis of what a staging branch would require: workflow trigger changes across four files, new branch protection rules, a staging-to-main promotion workflow, and updated rollback procedures. Critically identified that the production workflow's `staging-smoke` job becomes *strictly worse* with a staging branch because it would test code that is not being deployed to production -- the opposite of its current purpose.

Mapped three concrete failure modes: branch divergence (the most dangerous), hotfix bypass dilemma (three bad options), and stale staging. Recommended instead: fix the race condition via `workflow_run` trigger or commit-SHA verification in the staging-smoke step, and add commit SHA to the `/health` endpoint response.

#### Developer Experience (devx-minion)

Evaluated three deployment models head-to-head:
- **Model A (current)**: 1 step to ship, near-zero cognitive overhead, zero drift when idle.
- **Model B (staging branch)**: 3-4 steps to ship, moderate cognitive overhead, drift is the killer when idle.
- **Model C (tag-based promotion)**: 2-3 steps to ship, low-to-moderate overhead, tag lag and version number management when idle.

The decisive insight: "if you want a soak period on staging, add a manual approval gate to the production GitHub environment. Five minutes of configuration, zero workflow changes, zero branch management overhead." The production environment already has reviewer-based approval; the tooling for the "pause and think" moment exists.

#### Security (security-minion)

Identified three security-specific risks of the staging branch model:
1. **Secret drift**: Manual `wrangler secret put` operations across two branches with potentially diverged code leads to inevitable mismatch. No automated parity check exists.
2. **False confidence from diverged staging**: If staging runs different code than production, the staging-smoke gate provides false assurance -- it is testing code that will not be deployed. This is worse than having no gate because it masks risk.
3. **Doubled CI/CD attack surface**: Two branches with deployment authority doubles the trigger surface for pipeline compromise (relevant to supply chain attacks, OWASP A03).

Also flagged that production smoke currently skips capture (`SMOKE_SKIP_CAPTURE=1`), meaning the primary SSRF attack surface is never verified post-production-deploy. This is an independent finding worth evaluating separately.

#### UX Strategy (ux-strategy-minion)

Applied jobs-to-be-done analysis: "When I push code, I want to verify it works in staging before production." The current system already does this job. No incident history, no backlog item, no pain point motivating the change.

Identified two possible underlying needs:
- **"Test without shipping"**: Already served by `workflow_dispatch` on `deploy-staging.yml`.
- **"Safety buffer between merge and production"**: Already served by the environment approval gate.

Applied Kano analysis: a staging branch is at best indifferent (no user-facing impact) and at worst a reverse feature (adds ongoing cognitive tax). The solo-developer factor is decisive -- environment branches are a communication mechanism between people, and there is no one to communicate with.

Defined clear activation triggers for when this decision should be revisited: second contributor, documented incident from the race condition, or `workflow_dispatch` proving insufficient for the "test without shipping" need.

#### Documentation (software-docs-minion)

Inventoried seven documentation locations that reference the current branching model across OPERATIONS.md, CONTRIBUTING.md, README.md, and workflow comments. Key finding: the rollback section of OPERATIONS.md is an operational safety document read during incidents -- if it is wrong because the branching model changed without a docs update, the consequences are real.

Quantified the documentation burden: the current model requires near-zero ongoing maintenance (one simple rule stated seven times). A two-branch model roughly doubles the explanation surface and creates an ongoing sync tax for rollback procedures, promotion paths, and environment-specific instructions.

### Risks and Caveats

1. **The race condition is real, even if it has not caused an incident yet.** Both deploy workflows trigger on `push: branches: [main]` with no formal dependency. The production workflow's `staging-smoke` can test stale staging code. This is the one genuine safety gap in the current model. It is worth fixing on its own merits, independent of the staging branch question.

2. **The "no staging branch" recommendation assumes a solo developer.** If a second contributor joins, the calculus changes. The backlog already tracks this trigger: "[consider] Preview deployments on PRs | When team size > 1." A staging branch (or environment branches generally) should be re-evaluated at that point.

3. **Production smoke skips capture testing.** security-minion flagged that `SMOKE_SKIP_CAPTURE=1` in production means the SSRF attack surface is never verified post-production-deploy. This is unrelated to the branch question but is a real gap in the current safety model.

4. **The approval gate is only as strong as the discipline to use it.** If the approval gate becomes a rubber stamp, the staging-smoke check is the only automated safety net -- and it has the race condition. Fixing the race condition makes the automated safety net reliable regardless of approval discipline.

5. **This recommendation could be wrong if there is an unstated need.** The analysis assumes the question is about deployment safety. If the real motivation is something else (regulatory requirements, customer-facing staging URL, multi-tenant preview environments), the answer might differ. The advisory is only as good as the question.

### Next Steps

If the recommendation is adopted (keep single-branch model):

1. **Fix the staging-production race condition.** Change `deploy-production.yml` to trigger via `workflow_run` on `deploy-staging.yml` success, or add commit-SHA verification to the staging-smoke step. This is the one genuine safety improvement available. Requires adding the deployed commit SHA to the `/health` endpoint.

2. **Document the decision.** Create an evolution log entry recording that the staging branch model was evaluated and rejected, with rationale. This serves the project's process transparency goals and prevents the question from being relitigated without new evidence.

3. **Document `workflow_dispatch` for ad-hoc staging deploys.** Add a one-liner to OPERATIONS.md noting that `deploy-staging.yml` can be manually triggered for any ref, covering the "test without shipping" use case.

4. **Optionally evaluate production capture smoke.** security-minion's finding about `SMOKE_SKIP_CAPTURE=1` is worth a separate, lightweight assessment.

Items 1-3 are small, well-scoped tasks that could be handled in a single implementation phase. Item 4 is independent and lower priority.

### Conflict Resolutions

None. All five specialists independently recommended keeping the current model. The only difference was in emphasis (whether the race condition is an accepted tradeoff or an active gap to fix), which is a prioritization question rather than a disagreement about direction.
