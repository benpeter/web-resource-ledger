## Domain Plan Contribution: ux-strategy-minion

### Recommendations

#### The core question: Is there a real problem here?

After reviewing the current deployment workflows, operations docs, CD pipeline decisions (Phase 0024), and backlog, I do not find evidence of a problem that a staging branch solves. What I find instead is a well-functioning system with one documented, accepted tradeoff -- and a question that, without anchoring to a specific pain point, risks introducing complexity in the name of process.

Let me walk through the analysis.

#### Current state: What the developer actually experiences today

1. Push to `main` triggers two parallel workflows: staging deploy and production deploy.
2. Production is gated by a staging-smoke check and an environment reviewer approval step.
3. The developer clicks "approve" in the GitHub UI to promote to production.
4. The known tradeoff: staging-smoke validates staging *health*, not *code parity* with what's being deployed. Phase 0024 explicitly accepted this for a solo project with linear history.

**Developer journey (current)**:
- Push code to main -> staging deploys automatically -> production workflow waits at approval gate -> developer approves -> production deploys -> smoke tests verify.
- Mental model: "main is the truth; approval gate is my safety net."
- Cognitive load: one branch, one mental model, one decision point (approve/don't).

#### What a staging branch would change

**Developer journey (proposed)**:
- Push code to feature branch -> merge to staging -> staging deploys -> verify -> merge staging to main -> production deploys.
- Mental model: "staging branch is the staging truth; main is the production truth; I need to keep them in sync."
- Cognitive load: two branches, merge direction decisions, potential drift between branches, and the question "is staging caught up with main?" every time you come back after days of idle time.

**The Kano analysis is harsh here**: A staging branch is not a must-be feature (nothing is broken without it). It is not a performance feature (it does not proportionally improve any measured outcome). It is at best indifferent (no user-facing impact) and at worst a reverse feature (adds ongoing cognitive tax for a solo developer who goes days between active sessions).

#### The JTBD test

"When I push code, I want to verify it works in a staging environment before it hits production, so I can catch issues without user-facing impact."

The current system already does this. The staging deploy runs first. The smoke test validates it. The approval gate gives the developer a manual checkpoint. The job is already being done.

The only scenario where the current system falls short is the documented race condition: both workflows trigger simultaneously on push to main, so theoretically the production staging-smoke could pass against old staging code. But:
- Phase 0024 explicitly evaluated this and accepted it for a solo project with linear history.
- There is no incident or near-miss in the project history triggered by this race.
- The backlog does not contain a "staging-branch" item -- the acknowledged fix path is `workflow_run` trigger if strict ordering becomes important.

#### What the question is really about

I suspect this question is exploring one of two underlying needs:

**Need A: "I want to test in staging without committing to ship."** This is the "I want to experiment in staging without those changes flowing to production" job. Today, anything on main will eventually reach production. A staging branch would let you deploy speculative changes to staging without production risk.

If this is the real need, it is valid -- but the simplest solution is not a staging branch. It is adding `workflow_dispatch` to `deploy-staging.yml` (already present!) and using it to deploy arbitrary refs to staging without touching main. The workflow already supports this. The developer can:
1. Stay on a feature branch.
2. Manually trigger the staging workflow with that branch/SHA.
3. Test against real staging.
4. Merge to main only when satisfied.

No new branch. No new mental model. No drift risk.

**Need B: "I want a safety buffer between merge and production."** The approval gate already provides this. If the concern is that the approval gate is too easy to click through, the answer is process discipline, not branch topology.

#### Progressive disclosure applied to deployment workflows

The current system embodies progressive disclosure well:
- Default path (push to main) is simple and automatic.
- Manual override (workflow_dispatch) exists for edge cases.
- Emergency bypass (wrangler CLI) exists for when everything breaks.

Adding a staging branch flattens this hierarchy. Every deploy now requires the developer to think about branch routing, which violates the "don't make me think" principle for the most common operation.

#### The solo developer factor

This is the decisive constraint. Every deployment workflow pattern has a target team topology:
- **Trunk-based development** (current): optimized for 1-3 developers with high trust. Minimal ceremony.
- **Environment branches** (proposed): optimized for teams where code review and staged promotion need organizational coordination. The branch is a communication mechanism between people.

For a solo developer, the staging branch communicates with no one. It is overhead without an audience. The project's own engineering philosophy (YAGNI, KISS, Lean and Mean) argues strongly against it.

#### When this answer changes

The backlog already has the right trigger: `[consider] Preview deployments on PRs | When team size > 1`. A staging branch (or environment branches generally) belongs in the same category. The activation trigger should be:

- When there is a second contributor who needs independent staging validation.
- When there is a documented incident where the current race condition caused a production issue.
- When the developer finds themselves wanting to test in staging without committing to ship, and `workflow_dispatch` on the staging workflow doesn't cover the need.

None of these conditions are met today.

### Proposed Tasks

**If the advisory concludes no change is needed (recommended):**

1. **Document the decision and rationale in the evolution log.** Even a "we decided not to" is worth recording for this project's process transparency goals.
   - Deliverable: Evolution log entry capturing the advisory recommendation and why a staging branch was rejected.
   - Dependencies: None.

2. **Verify `workflow_dispatch` on `deploy-staging.yml` covers Need A.** Confirm the developer can manually trigger staging deployment of any ref. If the workflow supports this already (it does -- line 6 shows `workflow_dispatch`), document it as the recommended path for "test in staging without shipping."
   - Deliverable: One-line addition to OPERATIONS.md documenting manual staging deploy for arbitrary refs.
   - Dependencies: None.

**If the advisory concludes a change is needed despite the above:**

3. **Do not create a staging branch.** Instead, change the production workflow's trigger from `push: branches: [main]` to use `workflow_run` on staging workflow success. This solves the only documented technical gap (race condition / code parity) without introducing a new branch or mental model.
   - Deliverable: Modified `deploy-production.yml` with `workflow_run` trigger.
   - Dependencies: Testing to verify `workflow_run` behavior with environment secrets.

### Risks and Concerns

1. **Cognitive load inflation (HIGH risk if staging branch adopted).** A solo developer returning after days of inactivity must now answer "what state are my branches in?" before doing anything. This is the worst kind of extraneous cognitive load -- it adds no value but consumes working memory on every session resume. The current system has no such question; main is always the truth.

2. **Branch drift (MEDIUM risk if staging branch adopted).** With days between active development, staging and main will drift. Merge conflicts, forgotten cherry-picks, and "wait, did I promote that to main?" uncertainty are predictable consequences. This is not theoretical -- it is the documented failure mode of environment branches in small teams.

3. **Process theater (LOW but corrosive).** Adding process without a demonstrated problem trains the developer to accept overhead as normal. This erodes the YAGNI muscle that has served the project well through 34 evolution phases.

4. **Opportunity cost.** Time spent managing branch topology is time not spent on Act 2 items (RFC 3161 timestamps, per-tenant keys) that advance the product toward evidence-grade integrity claims.

### Additional Agents Needed

None. The current team is sufficient for this advisory. The question is fundamentally about developer workflow (UX strategy territory) and infrastructure topology (iac-minion territory). If the advisory proceeds to implementation, iac-minion would handle the workflow YAML changes and security-minion would validate any changes to deployment protection rules.
