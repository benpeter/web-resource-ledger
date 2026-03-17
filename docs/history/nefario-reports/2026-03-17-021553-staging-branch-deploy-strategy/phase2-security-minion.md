## Domain Plan Contribution: security-minion

### Recommendations

#### The current "both environments deploy from main" model is sound and should be kept.

After reviewing the deployment workflows, wrangler configuration, secrets architecture, and operational runbooks, my assessment is that the current model provides **adequate security controls for a solo-developer project** and that introducing a separate `staging` branch would **create new security-relevant risks that outweigh the marginal safety gain**.

Here is the detailed reasoning:

**1. The current gate chain is already defense-in-depth.**

The production deployment (`deploy-production.yml`) enforces this sequence:

1. `staging-smoke` -- verifies staging is healthy (health check, security headers, signing key, optionally capture round-trip)
2. GitHub environment protection -- production requires reviewer approval
3. `deploy` -- deploys the exact same commit (`github.sha`) that passed staging
4. `smoke` -- post-deploy verification of production

This is the **same code, same commit SHA** deployed to both environments. The staging smoke test acts as a canary for production. This is the correct security posture: staging and production run identical code, and you verify the code works in staging before promoting it to production.

**2. A separate branch introduces secret drift -- a real security risk.**

The `wrangler.toml` shows four secrets per environment (`CAPTURE_API_KEY`, `SIGNING_KEY`, `CORALOGIX_SEND_KEY`, `IP_HASH_SEED`), set via `wrangler secret put --env staging`. With a separate branch:

- If the `staging` branch drifts ahead of `main`, secrets configuration in code (e.g., new env vars added in `wrangler.toml`) can diverge. The staging branch might add a secret reference that never gets merged to main, or main might add one that staging never picks up.
- `wrangler secret put` is a manual, out-of-band operation. There is no automated check that staging and production have the same set of secrets configured. Branch divergence makes this worse because developers lose the mental model of "these environments run the same code."
- The OPERATIONS.md already warns: "Secrets are NOT rolled back with code." Separate branches compound this problem by adding a second axis of divergence (code on branch vs. secrets on platform).

**3. A separate branch creates false confidence from diverged staging.**

This is the most dangerous security outcome. If the `staging` branch accumulates commits that are not on `main`, the staging-smoke gate in the production workflow is testing code that **will not be deployed to production**. The gate becomes theater:

- Staging passes with commit `abc123` (on `staging` branch)
- Production deploys commit `def456` (on `main` branch)
- The staging-smoke was never testing what production will run

The current model avoids this entirely: the production workflow's `staging-smoke` job runs against staging, which is running the exact commit that is about to be deployed to production.

**4. Branch-based environments expand the attack surface for CI/CD pipeline compromise.**

With the current model, only `main` has deployment authority. An attacker who compromises a non-main branch cannot trigger deployments. With a `staging` branch:

- Two branches now have deployment authority (expanding the supply chain attack surface per OWASP A03)
- Branch protection rules must be maintained for two branches instead of one
- The Cloudflare API token in the `staging` GitHub environment can be triggered by pushes to the `staging` branch, doubling the trigger surface for credential use
- Merge from `staging` to `main` introduces a second trust boundary crossing that doesn't exist today

**5. The current model's real weakness is not branch strategy -- it's the staging-smoke scope.**

The production workflow's `staging-smoke` job only runs the smoke test (lines 24-29 of `deploy-production.yml`). It does NOT re-run unit tests or linting. This is actually fine because the `deploy-staging.yml` workflow runs tests on the same commit, but there is a subtle race condition:

- Both workflows trigger on `push: branches: [main]`
- The production workflow's `staging-smoke` runs in parallel with the staging workflow's `test` + `deploy` jobs
- If the staging-smoke runs before the staging deploy completes, it tests the **previous** staging deployment, not the current commit

This is the actual security-relevant gap in the current design, and it has nothing to do with branch strategy. The fix is making the production workflow depend on the staging workflow's completion, or adding a version/commit check to the smoke test.

#### What I would recommend instead of a separate branch

If the goal is to add more safety to the production deployment pipeline, the following changes are higher-value and lower-risk than a branch change:

1. **Make production workflow wait for staging deploy** -- either use `workflow_run` trigger (production starts after staging completes) or add a commit-hash verification step that confirms staging is running the expected commit before running smoke.

2. **Add a staging smoke test that verifies the deployed commit** -- the `/health` endpoint should return the deployed git SHA. The production workflow's `staging-smoke` job should verify it matches `github.sha` before proceeding.

3. **Add production smoke parity** -- production smoke currently skips capture (`SMOKE_SKIP_CAPTURE=1`). This is documented but it means the highest-risk operation (SSRF surface via capture) is never verified post-production-deploy. Consider running the full capture smoke test in production too, or at minimum documenting why it is skipped and what compensating control exists.

### Proposed Tasks

**Task 1: Add deployed commit verification to smoke test**
- What: Extend `/health` endpoint to return the deployed git SHA. Update `smoke-test.sh` to accept an optional `SMOKE_EXPECTED_SHA` env var and verify it matches.
- Deliverables: Updated health handler, updated smoke script, updated staging-smoke step in production workflow to pass `github.sha`.
- Dependencies: None.
- Security rationale: Closes the race condition where staging-smoke tests a stale deployment.

**Task 2: Evaluate production smoke capture skip**
- What: Document the risk trade-off of `SMOKE_SKIP_CAPTURE=1` in production. If the skip exists to avoid cost or data pollution, add a compensating control (e.g., a synthetic capture that is automatically purged, or a dry-run mode).
- Deliverables: Decision documented in evolution log. Implementation if warranted.
- Dependencies: None.
- Security rationale: The capture endpoint is the primary SSRF attack surface. Not exercising it post-deploy means a misconfiguration that breaks SSRF protections would not be caught until a real user hits it.

**Task 3 (if branch model is adopted despite recommendation): Secret parity check**
- What: Add a CI job that verifies both environments have the same set of configured secrets (by name, not value). This can query the Cloudflare API for secret names.
- Deliverables: Workflow job, Cloudflare API token permissions update.
- Dependencies: Only if the separate branch model is chosen.
- Security rationale: Prevents secret drift from causing silent failures or security regressions.

### Risks and Concerns

| Risk | Likelihood | Impact | Notes |
|------|-----------|--------|-------|
| **Race condition: staging-smoke tests stale code** | Medium | Medium | Both workflows trigger on `push:main`. Production's staging-smoke can run before staging deploy completes. This is the real gap -- not the branch model. |
| **Separate branch: secret drift** | High (over time) | Medium | Manual `wrangler secret put` + diverged branches = inevitable drift. No automated parity check exists. |
| **Separate branch: staging-smoke tests wrong code** | High | High | If staging runs different code than main, the production gate is testing the wrong thing. This is worse than having no gate at all because it provides false assurance. |
| **Separate branch: doubled CI/CD attack surface** | Low | High | Two branches with deploy authority doubles the trigger surface for pipeline compromise. Relevant for supply chain (A03). Low likelihood for a solo project but high impact. |
| **Production smoke skips capture** | Current | Low-Medium | Capture is the SSRF surface. Not testing it post-deploy means SSRF protection regressions are not caught by automation. Compensating control: staging smoke does test capture. |
| **Cloudflare API token scope** | Current | Medium | Both environments share token permission scope. If staging token is compromised, attacker may be able to deploy to production depending on token scope. Verify tokens are environment-scoped. |

### Additional Agents Needed

None. The current team is sufficient for this advisory. The question is primarily about deployment architecture, CI/CD pipeline design, and operational risk -- all of which fall within the existing team's scope. If the decision moves toward implementation, an **iac-minion** would be appropriate for the workflow file changes, but that is execution, not planning.
