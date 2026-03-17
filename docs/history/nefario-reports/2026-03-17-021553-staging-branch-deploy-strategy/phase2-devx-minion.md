# Domain Plan Contribution: devx-minion

## Recommendations

### Model A: Current (everything from main) -- RECOMMENDED

**Daily workflow:**
1. Work on a feature branch, open a PR against main.
2. Merge PR. This triggers three things in parallel: CI, staging deploy, and production deploy (gated by staging smoke).
3. Done. One action, both environments updated.

**Steps to ship:** 1 (merge to main).

**Cognitive overhead:** Near zero. There is one branch that matters. The mental model is: "main is truth, merging ships it." No decisions about when to promote, no second branch to keep track of.

**Sharp edges when idle:** None. Come back after a week, `main` reflects exactly what is in both staging and production. There is no drift to reconcile. `git log main` tells you the full story.

**Assessment:** This is the right model for a solo developer project. The current pipeline is already well-designed -- staging deploys first, smoke tests gate production, and the `workflow_dispatch` with a ref input provides clean rollback. The only thing "missing" is the ability to test on staging without immediately deploying to production, and the question is whether that missing capability justifies the overhead of one of the other models.

---

### Model B: Two-branch (staging branch -> staging, main -> prod)

**Daily workflow:**
1. Work on a feature branch, open a PR against `staging`.
2. Merge PR to `staging`. Staging deploys.
3. Test on staging. Decide it's good.
4. Open a PR from `staging` to `main` (or merge `staging` into `main`).
5. Merge to `main`. Production deploys.

**Steps to ship:** 3-4 (merge to staging, verify, merge/PR to main, wait for prod deploy).

**Cognitive overhead:** Moderate and insidious. The two-branch model requires you to always know:
- Which branch your feature branch targets.
- Whether `staging` has diverged from `main` (it will, especially when you batch multiple features on staging before promoting).
- Whether a merge from `staging` to `main` is a fast-forward or needs conflict resolution.
- What is on staging right now vs. what is on main right now.

For a team of 5+, this overhead is amortized across people and pays for itself with a shared testing environment. For a solo developer, you are paying the tax and receiving no benefit -- you are both the person who ships and the person who approves.

**Sharp edges when idle:**
- **Branch drift is the killer.** You merge two features to `staging`, promote one to `main`, then go idle for a week. When you come back: `staging` has commits that are not on `main`, `main` has the promoted feature. Your next feature branch has to decide which base to use, and `staging`-to-`main` merges may carry unexpected diff.
- **Stale staging.** If you merge to `staging` but forget to promote before going idle, staging and production are now different. Coming back, you must first figure out what state each environment is in. With the current model, they are always the same (or production is at most one deploy behind).
- **PR confusion.** GitHub's PR interface works best with a single default branch. PRs targeting `staging` show a different diff base than PRs targeting `main`. Branch protection rules, CI triggers, and merge queue settings all need to be duplicated or split.

---

### Model C: Tag-based promotion (main -> staging on push, tag -> prod)

**Daily workflow:**
1. Work on a feature branch, open a PR against `main`.
2. Merge PR to `main`. Staging deploys automatically.
3. Test on staging. Decide it's good.
4. Create a tag: `git tag v1.2.3 && git push origin v1.2.3`.
5. Tag triggers production deploy.

**Steps to ship:** 2-3 (merge to main, optionally test staging, tag for prod).

**Cognitive overhead:** Low-to-moderate. The mental model is clean: "main is staging, tags are production." But it introduces version number management (trivial at first, annoying over months) and a new class of questions:
- What version am I on?
- Is this tag the same commit as HEAD of main, or is it three commits behind?
- I found a bug in production -- is it the tagged version or something that snuck in after?

**Sharp edges when idle:**
- **Tag lag.** You merge 5 features over two days, tag one of them for production, go idle. When you come back: staging has the 5 features, production has the tagged commit. You need to remember what was tagged and whether the untagged staging changes need promoting or reverting.
- **No natural promotion cadence.** With the current model, shipping is automatic -- you merge and it goes. With tags, you accumulate "staging-but-not-prod" state that you have to actively decide to promote. For a solo developer who sometimes goes idle for days, this is drift waiting to happen.
- **Rollback story changes.** Currently, rollback is: `workflow_dispatch` with a known-good SHA. With tags, rollback becomes: re-deploy the previous tag. This is fine operationally but now you need to track which tag is deployed, not just which SHA.
- **Tag discipline.** Semver is great for libraries with consumers. For a single Worker with a single deployment target, version numbers do not communicate useful information to anyone. The commit SHA already uniquely identifies the deployment.

---

## Key Insight: The "Problem" This Would Solve Is Tiny

Looking at the actual pipeline, the current model already has a staging gate. The production workflow runs `staging-smoke` before deploying to production. The staging deploy workflow runs tests, deploys, and smokes independently. Both trigger on `push to main`.

The only scenario where Model B or C adds value is: "I want to deploy to staging, test something manually, and NOT have it go to production yet." For a solo developer on a Cloudflare Worker, the concrete scenarios are:

1. **Testing a risky change.** Current mitigation: the staging-smoke gate already catches broken deploys. If staging smoke fails, production never deploys. If you want additional manual testing, you can add a GitHub environment protection rule (manual approval) on the production environment -- zero workflow changes needed.
2. **Batching multiple changes before a prod deploy.** This implies you want staging to accumulate changes. But why? If each change passes smoke tests independently, shipping them individually is lower risk than batching.
3. **Testing against staging-specific data.** This is a real need but it is already served: staging has its own KV, R2, and secrets. The question is not branch strategy but whether you can reach staging to test -- and you can, it is deployed.

The honest answer: if you want a "soak" period on staging, add a manual approval gate to the production GitHub environment. Five minutes of configuration, zero workflow changes, zero branch management overhead.

---

## Proposed Tasks

### If the recommendation is to keep Model A (recommended):

**Task 1: Add optional manual approval gate to production environment**
- What: Configure GitHub environment protection on `production` with a required reviewer (the repo owner).
- Deliverables: Updated OPERATIONS.md documenting the optional gate; GitHub environment setting change.
- Dependencies: None.
- Rationale: This gives the "staging soak" capability without any branch or workflow changes. When you want changes to flow straight through (the 90% case), approve immediately or remove the gate. When you want to hold (the 10% case), let it wait.

**Task 2: Document the decision and rationale**
- What: Add an evolution log entry explaining why the two-branch model was evaluated and rejected.
- Deliverables: Evolution log in `docs/evolution/`.
- Dependencies: Decision made.

### If the decision goes toward Model B or C despite the above:

**Task 3: Assess developer ergonomics impact**
- What: Map the full workflow for "fix a bug and ship it" under each model, including the exact git commands, GitHub UI steps, and wait times. Identify the steps that the current model eliminates.
- Deliverables: Workflow comparison document.
- Dependencies: Decision on which model to prototype.

---

## Risks and Concerns

1. **Complexity ratchet.** Adding a branch is easy. Removing one later is hard -- the workflows, documentation, OPERATIONS.md, and developer habits all need to be unwound. The YAGNI principle applies directly: do not add branch structure until you have evidence that the current model's shipping speed or safety is insufficient.

2. **Drift is the enemy of infrequent operators.** The project explicitly "sometimes sits idle for days." Every additional branch is additional state that drifts while you are away. The current model has zero drift because staging and production are always deployed from the same commit (or production is trivially one deploy behind, gated on smoke).

3. **Wrangler deployment model is a poor fit for branch-based promotion.** Cloudflare Workers do not have a native "promote staging to production" primitive. Both environments deploy from source via `wrangler deploy`. This means "promoting" staging to production is not moving an artifact -- it is re-building and re-deploying from a different trigger. The branch model adds ceremony without adding the safety property (artifact identity) that makes branch-based promotion worthwhile in container-based systems.

4. **Doubled CI/CD surface area.** Model B requires either duplicating triggers across branches or creating a shared workflow with conditional logic. Either way, the workflow files become more complex, harder to reason about, and have more failure modes. The current three-workflow setup (ci.yml, deploy-staging.yml, deploy-production.yml) is clean precisely because everything triggers from one branch.

5. **Solo developer antipattern.** The two-branch model exists to solve a coordination problem: multiple developers need a shared integration environment before shipping to production. A solo developer does not have this coordination problem. Adopting the solution without having the problem is pure overhead.

---

## Additional Agents Needed

None. The current team covers the relevant angles:
- Infrastructure (iac-minion) for workflow mechanics
- Security (security-minion) for environment isolation
- Documentation (software-docs-minion) for OPERATIONS.md updates
- UX strategy for broader workflow considerations

The developer experience analysis provided here covers the core question: is the added branch complexity worth it for a solo developer? The answer is clearly no, based on the project's own engineering principles (YAGNI, KISS, Lean and Mean).
