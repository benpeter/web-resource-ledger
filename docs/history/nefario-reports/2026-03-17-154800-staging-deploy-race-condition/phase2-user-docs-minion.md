## Domain Plan Contribution: user-docs-minion

### Recommendations

After reviewing OPERATIONS.md, CONTRIBUTING.md, and README.md, I identified **four files** containing content that must change to accurately describe the new deploy flow. The scope is broader than just OPERATIONS.md -- CONTRIBUTING.md describes the staging/production relationship to contributors, and README.md references the staging auto-deploy trigger.

The key documentation changes fall into three categories:

1. **Trigger model change**: The production workflow shifts from "both workflows fire on push to main" to "production fires after staging completes." This is a fundamental change to how the deploy pipeline works. Every description of "push to main triggers..." must be updated.

2. **New ad-hoc staging deploy capability**: The `workflow_dispatch` trigger on `deploy-staging.yml` already exists, but OPERATIONS.md does not document how to use it for ad-hoc staging deploys. The success criteria explicitly require this documentation.

3. **Removal of the race condition caveat**: The current staging environment protection rules note in OPERATIONS.md (line 181) says the production pipeline's `staging-smoke` job "polls staging before every prod deploy." This language implies the staging-smoke job independently checks staging health -- it does not communicate that the production workflow now waits for staging to complete before starting at all. The note must be updated to reflect the sequenced relationship.

#### Specific sections requiring changes

**OPERATIONS.md** -- three sections affected:

- **"Deploy to Production" (lines 26-36)**: Currently says "Every push to `main` triggers the pipeline automatically" and lists `staging-smoke` as step 1. After the change, the production workflow triggers after the staging workflow completes, not on push. The description of step 1 (`staging-smoke`) also changes meaning -- it is now a gate that only runs after staging has deployed the same commit, not a concurrent check that might hit stale code.

- **"Rollback > Option A" (lines 47-55)**: Says "the pipeline runs staging-smoke, deploys the old SHA, runs smoke." With `workflow_run`, a `workflow_dispatch` rollback of production bypasses the staging workflow entirely (it triggers production directly). The description of what happens during a rollback via dispatch needs updating. If the production workflow keeps `workflow_dispatch` alongside `workflow_run`, the staging-smoke job still runs during dispatch rollbacks, but it is worth clarifying that the staging-smoke check during rollback tests whatever is currently on staging -- not the rollback SHA.

- **"staging environment > Protection rules" (line 180-182)**: The note about why staging must not have a required reviewer references "the production pipeline's `staging-smoke` job polls staging." This should be updated to explain the `workflow_run` dependency chain: production triggers after staging completes, so staging still must deploy without approval to avoid blocking the pipeline.

- **New section needed: "Deploy to Staging"**: OPERATIONS.md documents production deploys and rollbacks but has no dedicated section for staging operations. Adding one creates a natural home for: (a) the automatic deploy-on-push behavior, (b) the `workflow_dispatch` ad-hoc deploy instructions, (c) how to run smoke tests against staging manually.

**CONTRIBUTING.md** -- one section affected:

- **"Staging & Deployment" (lines 39-44)**: Currently says "Merging to `main` automatically runs three jobs in sequence: CI tests -> staging deploy -> smoke tests (`deploy-staging.yml`). All three must pass." This description is correct for the staging workflow. But the section does not mention the production workflow at all. After this change, the relationship becomes: staging deploys on push, then production triggers automatically after staging completes. Contributors should understand this pipeline topology -- especially that their merge triggers a two-stage deployment process with a built-in ordering guarantee.

**README.md** -- minimal impact:

- **Line 288**: "Staging auto-deploys on merge to `main` via `deploy-staging.yml`." This statement remains accurate. No change needed unless we want to add context about the production workflow triggering after staging.

### Proposed Tasks

#### Task 1: Add "Deploy to Staging" section to OPERATIONS.md

**What to do:** Insert a new section between "Monitoring" and "Deploy to Production" documenting staging deploy operations.

**Content to include:**
- Automatic: every push to `main` triggers test, deploy, and smoke jobs in `deploy-staging.yml`
- Manual (GitHub UI): Go to Actions > Deploy to Staging > Run workflow. Document that this deploys HEAD of `main` (or whichever branch) and is useful for re-deploying after a staging-only config change or debugging a staging issue
- Manual (CLI): `wrangler deploy --env staging` for emergency bypass

**Deliverable:** New "Deploy to Staging" section in OPERATIONS.md

**Dependencies:** Must know the final workflow_dispatch input parameters (if any) on `deploy-staging.yml` -- currently it has bare `workflow_dispatch:` with no inputs

#### Task 2: Update "Deploy to Production" section in OPERATIONS.md

**What to do:** Rewrite the trigger description and pipeline step list.

**Current text:**
```
Every push to `main` triggers the pipeline automatically:
1. `staging-smoke` -- confirms staging is healthy
2. `deploy` -- deploys to production (requires environment approval if configured)
3. `smoke` -- verifies production health (read-only, skips capture round-trip)
```

**Updated text should communicate:**
- The production workflow triggers automatically after `deploy-staging.yml` completes successfully (not on push)
- `staging-smoke` verifies the staging deployment that just completed -- it is no longer a race-prone check against potentially stale code
- The rest of the pipeline (deploy, smoke) proceeds as before
- Add a note that only successful staging completions trigger production -- if staging fails, production does not start

**Deliverable:** Revised "Deploy to Production" section

**Dependencies:** Must know the exact `workflow_run` trigger configuration (which workflow name, which branches, which conclusion types)

#### Task 3: Update rollback documentation in OPERATIONS.md

**What to do:** Clarify what happens during a `workflow_dispatch` rollback now that the primary trigger is `workflow_run`.

**Key points to address:**
- `workflow_dispatch` on `deploy-production.yml` still works for rollbacks (confirm this is being kept)
- When triggered via dispatch, the staging-smoke job runs against whatever is currently on staging, not the rollback SHA
- If staging is in a bad state, the rollback's staging-smoke gate could fail -- document the escape hatch (Option B: emergency wrangler CLI)

**Deliverable:** Revised rollback section

**Dependencies:** Must confirm that `workflow_dispatch` remains on `deploy-production.yml` alongside `workflow_run`

#### Task 4: Update staging environment protection rules note

**What to do:** Update the note at OPERATIONS.md line 180-182.

**Current:**
```
**Protection rules:** Do NOT add required reviewer -- staging must deploy without approval
(the production pipeline's `staging-smoke` job polls staging before every prod deploy).
```

**Updated text should explain:**
- Staging must deploy without approval because the production workflow triggers automatically after staging completes
- Adding a reviewer gate to staging would block the entire deploy pipeline

**Deliverable:** Revised protection rules note

**Dependencies:** None

#### Task 5: Update CONTRIBUTING.md staging/deployment section

**What to do:** Update the "Staging & Deployment" section to describe the full two-stage pipeline.

**Current text only mentions the staging workflow.** Update to describe:
- Merging to `main` triggers the staging workflow (test, deploy, smoke)
- After staging completes successfully, the production workflow triggers automatically
- The full pipeline is: merge -> staging test/deploy/smoke -> production staging-smoke/deploy/smoke

**Deliverable:** Revised CONTRIBUTING.md "Staging & Deployment" section

**Dependencies:** Task 2 (use consistent language with OPERATIONS.md)

### Risks and Concerns

1. **Rollback path ambiguity with `workflow_run`**: If production's primary trigger is now `workflow_run`, operators need to understand that `workflow_dispatch` rollbacks bypass the staging-first guarantee. The documentation must make this clear without making rollbacks seem scary. The current rollback instructions are clean and confident -- the update should maintain that tone while adding the nuance.

2. **Monitoring link in OPERATIONS.md (line 21)**: Points only to `deploy-production.yml`. After this change, operators troubleshooting deploy issues may need to check `deploy-staging.yml` first (since staging must complete before production starts). Consider adding the staging workflow link alongside the production one.

3. **Mental model shift**: The current docs describe production as the "main" pipeline that happens to check staging first. The new model is that staging is the primary pipeline and production is downstream. This is a subtle but important shift in how operators think about the system. The documentation should make this sequencing intuitive without over-explaining.

4. **GitHub Actions link format for `workflow_run` workflows**: When a workflow uses `workflow_run` trigger, it appears differently in the GitHub Actions UI (it shows as triggered by another workflow run, not by a push event). The monitoring section link still works, but the visual grouping in the UI changes. The documentation does not need to address this directly, but operators familiar with the current UI should not be surprised.

5. **Ad-hoc staging deploy via `workflow_dispatch` does NOT trigger production**: This is a critical operational detail. If someone manually triggers a staging deploy via dispatch, it will NOT trigger the production workflow (GitHub's `workflow_run` only fires for workflows triggered by their configured events, and `workflow_dispatch` may or may not be included depending on the configuration). The documentation must clearly state whether a manual staging deploy triggers production or is staging-only.

### Additional Agents Needed

None. The documentation changes are straightforward content updates driven by the workflow trigger change. The implementing agent (likely the code-change agent) should make the workflow changes first, then these documentation updates can be applied. No additional domain expertise is needed beyond what the current team provides.
