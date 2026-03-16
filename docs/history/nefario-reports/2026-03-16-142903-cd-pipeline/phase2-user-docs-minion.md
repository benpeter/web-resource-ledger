# User Docs Minion -- Planning Contribution

## Domain: Rollback Documentation for WRL CD Pipeline

### Context Assessment

After reviewing the project state, here is what I see:

- **Single operator** -- Ben is the only developer and operator. Documentation audience is "future Ben at 2am when something breaks."
- **Cloudflare Workers** -- deployment is atomic (`wrangler deploy`), meaning rollback is conceptually simple: redeploy a known-good version. There is no rolling deployment, no canary, no blue-green -- the Worker is replaced in one shot.
- **Existing docs** -- README.md covers setup and key rotation. CONTRIBUTING.md covers dev workflow. No operations documentation exists. The README "Deploy" section is a single `wrangler deploy` command.
- **Existing infra** -- staging environment with smoke tests exists. Production CD pipeline is being built in this phase. The smoke test script validates health, security headers, signing key, and capture round-trip.
- **KISS/YAGNI mandate** -- the Helix Manifesto and CLAUDE.md both demand minimal, lean documentation. A full deployment runbook for a single-developer Cloudflare Worker project would be over-engineering.

---

## Recommendations

### 1. Location: Separate OPERATIONS.md at repo root

**Not** inline in README, not a full runbook. A short, focused `OPERATIONS.md` file.

**Rationale:**
- README is already 240 lines and serves a different audience (potential contributors, users of the API). Mixing rollback procedures into it would degrade scannability for both audiences.
- A separate file makes it findable under stress. When something is broken in production, you don't want to scroll past "What you get" and "Usage" to find the rollback command.
- `OPERATIONS.md` is a recognized convention in GitHub repos. It signals "look here for operational concerns" without being a heavyweight runbook.
- The file should be linked from README (one line in the Reference section) and from the CD workflow comments.

### 2. Scenarios to Cover: Three, but lean

Cover only scenarios that can actually happen with Cloudflare Workers atomic deploys:

| Scenario | Why include | Detail level |
|----------|-------------|--------------|
| **Failed deploy (CD pipeline)** | Most common. Wrangler deploy fails, smoke tests fail, or GitHub Actions fails mid-workflow. | Decision tree: "Did the deploy command succeed?" branches to different actions. |
| **Deployed but degraded** | Worker is live but something is wrong (errors in Coralogix, smoke tests pass but real traffic fails). This is the scariest scenario because it's not caught automatically. | Step-by-step: identify the last known-good commit, redeploy it, verify. |
| **Rollback-of-rollback (re-forward)** | After rolling back, how to move forward again. Not a separate procedure -- just clarify that the normal CD pipeline handles this. | One paragraph, no steps. |

**Omit:** Multi-region failover, database migration rollback (no database), secret rotation during rollback (separate concern already documented in README), scaling procedures (Cloudflare manages this).

### 3. Detail Level: Decision tree + step-by-step commands

The document should use a decision tree structure for diagnosis ("What went wrong?") leading to step-by-step commands for each recovery path.

- Exact `wrangler` commands with copy-pasteable syntax
- Exact `git` commands for finding the last known-good commit
- The smoke test command to verify the rollback worked
- Expected output at each step so the operator knows they succeeded

**Why this hybrid:** Pure decision trees are great for diagnosis but leave you stranded at the leaf node. Pure step-by-step assumes you already know which problem you have. The combination matches how a single operator works under pressure: "What's wrong? OK, now fix it."

### 4. No, it should not be a full deployment runbook

A deployment runbook implies a team with on-call rotation, escalation paths, communication templates, and incident management. WRL is a single-developer project. The documentation should answer three questions:

1. How do I know something is wrong?
2. How do I roll back?
3. How do I know the rollback worked?

Everything else is YAGNI.

---

## Proposed Tasks

### Task 1: Create OPERATIONS.md

**File:** `OPERATIONS.md` (repo root)

**Structure:**

```
# Operations

## Environments
- Production: wrl (wrangler deploy)
- Staging: wrl-staging (wrangler deploy --env staging)

## Monitoring
- Where to look when something seems wrong (Coralogix, health endpoint, smoke tests)

## Rollback

### Diagnosing the problem
Decision tree: deploy failed vs. deploy succeeded but something is broken

### Rolling back production
Step-by-step commands to redeploy a previous version

### Rolling back staging
Same pattern, with --env staging

### After a rollback
How to investigate and re-deploy the fix through normal CD

## Manual deploy
Emergency bypass of the CD pipeline (wrangler deploy from local machine)
```

**Estimated size:** 80-120 lines. Lean, scannable, copy-pasteable.

### Task 2: Add OPERATIONS.md link to README.md

One line in the README Reference section:

```markdown
### Operations

See [OPERATIONS.md](OPERATIONS.md) for rollback procedures and manual deploy instructions.
```

### Task 3: Add rollback reference comment in CD workflow

A YAML comment at the top of the production deploy workflow pointing to OPERATIONS.md, so the operator sees it when inspecting a failed pipeline run:

```yaml
# Rollback procedure: see OPERATIONS.md
```

---

## Risks and Concerns

### Risk 1: Documentation drift

**Problem:** OPERATIONS.md references specific wrangler commands, environment names, and workflow file names. If these change and the docs don't update, the rollback procedure becomes misleading under pressure -- worse than no documentation at all.

**Mitigation:** Keep the document minimal and tied to fundamentals (`wrangler deploy`, `git log`) rather than wrapper scripts that might change. The fewer moving parts in the doc, the less it can drift. Consider adding a brief comment in the CD workflow YAML pointing to OPERATIONS.md so future editors know to update both.

### Risk 2: Over-documenting for a single operator

**Problem:** KISS principle. Ben knows how `wrangler deploy` works. The value of this documentation is not teaching him Cloudflare -- it's reducing cognitive load under stress and providing the exact sequence he'd need to execute when his brain is in "fix it now" mode.

**Mitigation:** Write for "tired Ben at 2am," not "new engineer learning Cloudflare Workers." Skip explanations of what wrangler is. Focus on the exact commands and expected outputs. Keep it under 120 lines.

### Risk 3: Smoke test as the sole rollback trigger

**Problem:** The current smoke test checks health, headers, signing key, and capture round-trip. If a regression doesn't manifest in these checks (e.g., a subtle bug in verification, or a performance regression), the CD pipeline will report success and the operator won't know to roll back.

**Mitigation:** This is an infrastructure concern, not a documentation concern. But the OPERATIONS.md should explicitly state what the smoke tests do and do not check, and describe how to detect problems that smoke tests miss (Coralogix dashboards, manual spot-checks). This sets realistic expectations about the CD pipeline's coverage.

### Risk 4: Secrets during rollback

**Problem:** If a deployment included a secret rotation (e.g., SIGNING_KEY), rolling back the code without rolling back the secret creates a mismatch. The old code might work fine with the new secret, or it might not.

**Mitigation:** Document this as a callout: "If this deploy included secret changes, rolling back the code alone may not be sufficient. See Key Rotation in README.md." Keep it as a one-line warning, not a full procedure -- secret rollback is a different (and rare) scenario.

---

## Additional Agents Needed

None beyond what is presumably already involved in this phase. The documentation I'm proposing is tightly scoped and depends only on knowing the final shape of the CD pipeline (production workflow file, environment names, deploy commands). I can write it once the pipeline implementation is settled.

One coordination note: if a **devx-minion** is involved in writing the CD workflow YAML, they should include the `# Rollback procedure: see OPERATIONS.md` comment in their output. Otherwise I'll include it in my task list.
