# Domain Plan Contribution: software-docs-minion

## Current State of Documentation

The branching and deploy model is documented in **seven** distinct locations across the repository. This is the core finding: what looks like a simple workflow change touches a surprising number of documentation surfaces.

### Inventory of branching-model-sensitive documentation

| # | File | What it says | Coupling strength |
|---|------|-------------|-------------------|
| 1 | **OPERATIONS.md** "Deploy to Production" | "Every push to `main` triggers the pipeline automatically" | **Hard** -- operational procedure |
| 2 | **OPERATIONS.md** "Rollback" | "The next push to `main` re-deploys whatever is on `main`" and the revert-to-main procedure | **Hard** -- rollback safety depends on this being accurate |
| 3 | **OPERATIONS.md** "Rollback Option A" | Entire workflow_dispatch rollback references deploying a SHA via the production pipeline, which currently triggers on `main` | **Medium** -- procedure still works but context sentence changes |
| 4 | **CONTRIBUTING.md** "Staging & Deployment" | "Merging to `main` automatically runs three jobs: CI tests -> staging deploy -> smoke tests" | **Hard** -- contributor-facing workflow |
| 5 | **CONTRIBUTING.md** "Making Changes" | "Branch from `main`" | **Soft** -- still true in both models, but if `staging` becomes the default merge target, this must change |
| 6 | **README.md** "Deploy" (step 9 postscript) | "the CD pipeline handles staging and production deploys automatically on every push to `main`" | **Medium** -- onboarding context |
| 7 | **deploy-production.yml** (line 1 comment) | `# Rollback: see OPERATIONS.md` -- this cross-reference is fine, but the workflow trigger (`branches: [main]`) is the source of truth that docs reflect | **Source** -- docs follow this |

Additionally, **CLAUDE.md** (the project instructions for agents) does not explicitly document the branching model, but agents infer it from the workflow files and OPERATIONS.md. If the model changes, agents working on this repo will pick up the new behavior from workflows, but any agent-authored docs or PRs referencing "push to main deploys to prod" would be wrong until the docs are updated.

---

## Recommendations

### 1. The current model (single branch) has the lowest documentation burden

The current model is simple: `main` deploys to staging, staging smoke gates production deploy. One sentence explains it. Every location above states the same simple rule. There is minimal risk of docs contradicting each other because the rule is trivially stated.

**Documentation cost of current model: near-zero ongoing maintenance.**

### 2. A two-branch model (staging + main) roughly doubles the explanation surface

With a `staging` branch, the documentation must now explain:
- Which branch deploys where (the mapping)
- The promotion path (staging -> main, via PR? via merge? via fast-forward?)
- What "branch from" means for contributors (branch from `main`? from `staging`?)
- How rollback works for each environment independently
- What happens if staging and main diverge (conflict resolution)
- Whether PRs target `staging` or `main` (and when each is appropriate)

Each of these is a new paragraph or section in existing docs. The rollback procedure in OPERATIONS.md becomes notably more complex -- you need separate rollback instructions for "staging is broken" vs "production is broken," and the current clean "revert and push to main" procedure now has a prerequisite question: "which branch do I revert on?"

**Documentation cost of two-branch model: moderate initial rewrite, ongoing maintenance to keep the two-environment procedures in sync.**

### 3. A Cloudflare-native environment promotion model (same branch, different deploy triggers) would have the least documentation disruption

If the change is implemented as "merge to `main` deploys to staging; promote to production via manual workflow_dispatch or approval gate," then the documentation impact is minimal because:
- Contributors still branch from `main` and PR into `main`
- The single-branch mental model is preserved
- Only OPERATIONS.md needs updating (the promotion step)
- Rollback procedures stay structurally the same

I am not advocating for a specific deployment architecture -- that is the infrastructure minion's domain -- but from a documentation clarity perspective, the fewer branches contributors need to understand, the better.

### 4. If two branches are chosen, write a short branching model document

Rather than scattering the branching explanation across OPERATIONS.md, CONTRIBUTING.md, and README.md, create a single canonical section (I recommend in CONTRIBUTING.md under "Branching Model") and have the other docs link to it. This prevents the most common failure mode: docs diverge when only one of three files gets updated.

---

## Proposed Tasks

### Task 1: Documentation impact assessment (pre-decision)

**What:** Before committing to a branching model, confirm the seven documentation locations listed above are the complete set. Search for any additional references to `main` as a deploy trigger in scripts, CI configs, or `docs/evolution/` entries.

**Deliverable:** Validated checklist of every file that must change.

**Dependencies:** None -- this is pre-work.

### Task 2: Update OPERATIONS.md (post-decision, any model)

**What:** Rewrite the "Deploy to Production" and "Rollback" sections to match whichever model is chosen. This is the highest-priority doc change because it is the operational runbook -- getting it wrong means a botched rollback during an incident.

**Deliverable:** Updated OPERATIONS.md with:
- Accurate deploy flow description
- Rollback decision tree that covers both environments
- Rollback procedures for each environment
- Updated "Manual Deploy" section if the emergency bypass changes

**Dependencies:** Final decision on branching model; updated workflow YAML files.

### Task 3: Update CONTRIBUTING.md (post-decision, any model)

**What:** Update "Staging & Deployment" section and "Making Changes" bullet about which branch to target. If the two-branch model is chosen, add a "Branching Model" subsection explaining the branch-to-environment mapping and the promotion path.

**Deliverable:** Updated CONTRIBUTING.md.

**Dependencies:** Task 2 (OPERATIONS.md should be canonical; CONTRIBUTING.md should be consistent with it).

### Task 4: Update README.md deploy reference (post-decision, any model)

**What:** Update the one-liner after step 9 that says "every push to `main`". Minor edit.

**Deliverable:** One sentence change in README.md.

**Dependencies:** None beyond the decision.

### Task 5 (conditional -- two-branch model only): Add branching model diagram

**What:** If the two-branch model is adopted, add a small Mermaid diagram to CONTRIBUTING.md showing the branch-to-environment flow. This replaces the paragraph of explanation with something visual that contributors can reference at a glance.

**Deliverable:** Mermaid gitGraph or flowchart in CONTRIBUTING.md.

**Dependencies:** Two-branch model decision.

---

## Risks and Concerns

### Risk 1: Rollback documentation accuracy is a safety issue

The rollback section of OPERATIONS.md is not just reference material -- it is the document an operator reads during an incident at 2 AM. If the branching model changes and OPERATIONS.md is not updated atomically with the workflow change, the rollback instructions will be wrong exactly when someone needs them most.

**Mitigation:** The PR that changes the workflow YAML files must include the OPERATIONS.md update in the same commit or PR. Do not merge workflow changes without updated rollback docs. This should be a PR review checklist item.

### Risk 2: CONTRIBUTING.md staleness for external contributors

External contributors (or future-Ben) will read CONTRIBUTING.md to understand the workflow. If it says "branch from main" but PRs should now target `staging`, contributors will open PRs against the wrong branch. GitHub's default branch setting helps but does not eliminate this -- people read docs and follow them literally.

**Mitigation:** Update CONTRIBUTING.md in the same PR as the workflow change. Set the GitHub repo default branch to match whatever branch PRs should target.

### Risk 3: Two-branch model creates a documentation sync tax

With two branches, every time a procedure changes (new secret, new smoke test step, new approval gate), it must be documented for both environments. The current model avoids this because staging and production share the same pipeline entry point. A two-branch model means the OPERATIONS.md "Deploy" and "Rollback" sections effectively need parallel tracks.

**Mitigation:** If adopting two branches, structure OPERATIONS.md with a shared section for common procedures and environment-specific subsections only where they diverge. Avoid copy-paste duplication.

### Risk 4: Agent documentation context (CLAUDE.md)

Agent sessions working on this repo infer the deploy model from workflow files and OPERATIONS.md. If docs are stale, agent-generated PRs may reference the wrong branching model in their descriptions or evolution log entries. This is a low-severity but annoying failure mode.

**Mitigation:** No action needed beyond keeping OPERATIONS.md accurate. Agents read the files; as long as the files are correct, agents will be correct.

---

## Additional Agents Needed

None. The current team (infrastructure for workflow design, DevX for developer workflow impact, security for environment isolation, UX strategy for contributor experience) covers the relevant domains. The documentation updates are straightforward editing tasks once the branching model decision is made -- no additional specialist is needed for the docs themselves.
