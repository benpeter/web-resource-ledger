# UX Strategy: Production CD Pipeline

## Planning Question

What is the ideal deploy-to-production journey for a single developer who is both author and approver?

---

## Analysis

### The User's Job-to-Be-Done

"When I merge code to main, I want it to reach production safely and predictably, so I can ship with confidence without babysitting the pipeline."

The functional job is deploying code. The personal job is confidence -- knowing production is safe without anxiety. The social job is negligible (single developer, no team to signal to).

### Current State Journey Map

Today, the developer's staging deploy journey looks like this:

```
Push to main --> CI tests --> Deploy to staging --> Smoke tests
```

This is beautifully simple. Three automated steps, zero human intervention after the push. The developer's cognitive load during this process is near zero -- push and forget. The emotional journey is flat-positive: no anxiety, no decisions, no waiting.

Production deploys, by contrast, do not exist yet. The developer presumably runs `wrangler deploy` manually. This means the production deploy journey is:

```
Push to main --> [staging auto-deploys] --> ... some time later ...
--> remember to deploy production --> wrangler deploy (manual)
--> hope it works --> check manually
```

This journey has significant friction:
- **Memory load**: developer must remember to deploy production
- **Context switching**: must recall the right command, secrets, environment
- **No gate**: nothing prevents deploying untested code
- **No feedback**: no automated confirmation that production is healthy
- **Anxiety gap**: period between deploy and manual verification

### Cognitive Load Assessment of Deployment Ceremony Options

I evaluated four deployment ceremony designs against cognitive load:

**Option A: Fully manual (`wrangler deploy`)**
- Decisions per deploy: ~3 (when, command recall, verification)
- Memory items: command syntax, secret configuration, post-deploy checks
- Anxiety: high (no automated verification)
- Cognitive load: **high extraneous load** (remembering process, not the deployment itself)

**Option B: Fully automated (push to main auto-deploys to production)**
- Decisions per deploy: 0
- Memory items: 0
- Anxiety: moderate-to-high (no control, no gate between staging smoke and production)
- Cognitive load: **low extraneous, but germane load is also zero** -- you learn nothing, confirm nothing, control nothing. When something goes wrong, you have no muscle memory for the recovery.

**Option C: Tag-triggered with smoke gate (tag -> staging validates -> auto-promote to production)**
- Decisions per deploy: 1 (create a tag)
- Memory items: tag naming convention
- Anxiety: low (staging validates first, automated smoke)
- Cognitive load: **moderate** -- the tag is a meaningful ceremony, but tag naming conventions are one more thing to remember

**Option D: Staging-first with manual approval gate (push to main -> staging auto-deploys and smokes -> human clicks "approve" -> production deploys and smokes)**
- Decisions per deploy: 1 (approve/don't approve)
- Memory items: 0 (GitHub notifications guide you to the decision point)
- Anxiety: lowest (staging proves itself, you decide when production proceeds, production smoke confirms)
- Cognitive load: **minimal extraneous load** -- the single decision is germane (should this ship?) not extraneous (how do I ship?)

### Where Simplification Helps vs. Where Explicit Steps Add Safety

**Simplify (automate completely):**
- Test execution -- already automated, no human value in running tests manually
- Staging deployment -- already automated, correctly so
- Smoke test execution -- already automated, correctly so
- Production smoke tests -- should be automated, identical to staging smokes
- Notification/feedback -- should be automated (GitHub deployment status, not a separate tool to check)

**Keep explicit (human in the loop):**
- The production promotion decision. This is the ONE step that benefits from a human pause. Not because the developer might catch something the tests missed -- but because intentionality matters for production. The act of clicking "approve" is a forcing function that says "I am aware this is going to production." It costs 5 seconds and buys peace of mind.

**Avoid adding:**
- Tag-based workflows. Tags add a naming convention to remember, a step to execute, and a concept to maintain. They solve a problem (versioning, release naming) that a single-developer Cloudflare Worker does not have. YAGNI.
- Separate production deploy workflow files. If the staging workflow and production workflow are near-identical (and they should be), maintaining two files is a consistency tax. One workflow file that handles both environments is simpler.
- Rollback automation. A single developer can run `wrangler rollback` or redeploy the previous commit. Automated rollback on smoke failure sounds elegant but adds branching logic, failure modes, and debugging complexity. The simpler path: smoke fails, notification fires, developer manually fixes. This is the correct KISS choice for a single-operator system.

### Kano Analysis of CD Pipeline Features

| Feature | Category | Rationale |
|---------|----------|-----------|
| Automated tests before production | Must-be | Absence would be alarming |
| Staging validates before production | Must-be | The whole point of having staging |
| Production smoke tests | Must-be | Deploying blind is unacceptable |
| Deployment status visible in GitHub | Performance | Proportionally improves confidence |
| Manual approval gate | Performance | Proportionally improves control |
| Auto-rollback on smoke failure | Indifferent | Sounds good, rarely needed, adds complexity |
| Tag-based versioning | Indifferent | Solves a problem that doesn't exist for one developer |
| Slack/email notifications | Indifferent | GitHub already notifies; another channel is noise |
| Blue/green or canary deploys | Reverse | Adds massive complexity for a single Worker with one developer |

---

## Recommendations

### R1: The staging-then-approve-then-production model (Option D) is the right fit

This design minimizes cognitive load while preserving the one moment where human intentionality adds genuine safety. The journey becomes:

```
Push to main
  --> Tests run (automated)
  --> Deploy to staging (automated)
  --> Smoke tests pass (automated)
  --> [GitHub shows pending approval for production]
  --> Developer clicks "Approve" (5-second deliberate act)
  --> Deploy to production (automated)
  --> Production smoke tests pass (automated)
  --> [GitHub shows production deployment succeeded]
```

**Cognitive load per deploy: one binary decision (approve or not), zero recall, zero context switching.** The developer is guided to the decision point by GitHub's native notification system. The decision itself is recognition-based (green checkmarks on staging), not recall-based.

### R2: Use GitHub Environments with required reviewers, not a custom gate

GitHub's native environment protection rules support "required reviewers" -- even when the reviewer is the same person as the author. This is the lightest-weight approval gate available:
- No custom tooling to build or maintain
- Integrated into the GitHub deployment UI
- Shows deployment history per environment
- Supports the "pending deployment" notification natively

The developer sees a yellow "waiting for review" badge, clicks "Approve and deploy", done. This matches the mental model of "I authorize this to go to production" without any ceremony beyond the click.

### R3: Reuse the existing smoke test script for production

The smoke test already exists (`scripts/smoke-test.sh`) and is parameterized by `SMOKE_URL` and `SMOKE_API_KEY`. Point it at the production URL after production deploy. No new code needed. The developer already trusts this script for staging -- the same script confirming production extends that trust seamlessly.

### R4: One workflow file, two environment blocks -- not two separate workflow files

Having `deploy-staging.yml` and `deploy-production.yml` with near-identical content creates a consistency tax. Every change (e.g., updating a Node version, adding a test step) must be made in two places. A single `deploy.yml` with a job matrix or sequential jobs (staging -> approve -> production) is simpler to maintain and impossible to get out of sync.

However, I flag a tension: the current staging workflow triggers on `push to main`. If production is in the same workflow, it will also trigger on every push to main. This is actually desirable -- it means every merge to main is a potential production deploy, gated only by the approval step. The developer can batch approvals (let 3 merges stack up, approve once) or approve immediately. This flexibility comes for free.

### R5: Do not add tag-based versioning, auto-rollback, or multi-channel notifications

Per Kano analysis, these are indifferent or reverse features for a single developer:
- **Tags**: add naming convention overhead with no benefit (Cloudflare Workers have built-in version history)
- **Auto-rollback**: adds branching logic, edge cases, and a new failure mode (what if rollback fails?)
- **Slack/email**: GitHub already notifies; a second channel is redundant noise

If any of these are later needed, they can be added. YAGNI.

---

## Proposed Tasks (for implementation planning)

1. **Create GitHub Environment "production"** with the developer as required reviewer. Configure production secrets (API token, Worker secrets) in this environment.

2. **Extend the deploy workflow** to add production deployment as a downstream job after staging smoke passes. The production job should: require the `production` environment (triggering the approval gate), run `wrangler deploy` (not `wrangler deploy --env staging`), and run smoke tests against the production URL.

3. **Reuse `scripts/smoke-test.sh`** for production smoke, parameterized with production URL and API key from the production environment secrets.

4. **Consider merging `deploy-staging.yml` into a single `deploy.yml`** that handles both environments sequentially. This is a simplification recommendation, not a hard requirement -- if the team prefers separate files for clarity, the cognitive cost is small.

---

## Risks and Concerns

### Risk 1: Approval fatigue
**Severity**: Medium
**Description**: If the developer merges to main frequently (multiple times per day), the approval gate becomes a repetitive click with no real deliberation. Over time, the approval becomes muscle memory rather than a conscious decision, defeating its purpose.
**Mitigation**: This is acceptable. Even a muscle-memory click is better than fully automatic promotion, because it creates a natural pause point. The developer can choose to skip approval temporarily (let deployments queue) and batch-approve. The danger would be if approval were *difficult* (requiring multiple clicks, navigating to a separate tool, filling out a form). A single click in the same GitHub UI where they already work is friction-free enough that fatigue won't cause them to abandon the process.

### Risk 2: Staging smoke passes but production smoke fails
**Severity**: Low (but high impact when it happens)
**Description**: Environment-specific differences (different secrets, different KV/R2 bindings, different rate limit namespace IDs) could cause production to behave differently from staging even with identical code.
**Mitigation**: The smoke test script validates functional behavior (health, headers, signing key, capture round-trip), which covers the most likely environment-specific failures. The risk is inherent in any multi-environment setup and cannot be fully eliminated without identical environments, which defeats the purpose of staging.

### Risk 3: Workflow complexity creep
**Severity**: Low
**Description**: Once the CD pipeline exists, there is a temptation to add features: deployment windows, change logs, version bumps, notification integrations. Each addition is individually small but cumulatively transforms a simple pipeline into a complex system.
**Mitigation**: The YAGNI principle in CLAUDE.md is the guard rail. Document the intentional simplicity in the evolution log so future phases don't casually add complexity.

---

## What the Ideal Production Deploy Experience Feels Like

The ideal experience is **boring**. The developer merges a PR, glances at GitHub to see staging deploy and smoke pass (green checkmarks), clicks "Approve" on the production deployment, and within 2 minutes sees production smoke pass. Total active time: under 10 seconds. Total anxiety: zero. Total things to remember: nothing.

The deploy experience should feel like locking your front door -- a brief, habitual, low-effort action that gives you confidence without demanding thought. If it ever starts feeling like filing a tax return, something has gone wrong.

---

## Additional Agents Needed

None beyond those already planned. The implementation is straightforward GitHub Actions configuration plus Wrangler commands. The security minion should review production secret management, but that falls within standard scope for infrastructure work.
