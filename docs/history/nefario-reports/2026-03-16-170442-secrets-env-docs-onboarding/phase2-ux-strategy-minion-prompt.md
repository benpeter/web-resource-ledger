You are contributing to the PLANNING phase of a multi-agent project.
You are NOT executing yet — you are providing your domain expertise
to help build a comprehensive plan.

## Project Task
Fix secrets and environment setup documentation for fork-ready onboarding

**Outcome**: A developer forking WRL can get both staging and production CD pipelines running by following README.md and OPERATIONS.md alone, without needing to reverse-engineer which secrets go where, what Cloudflare token permissions are required, or what infrastructure must pre-exist. This closes documentation gaps exposed during the pipeline fix session on 2026-03-16.

**Success criteria**:
- OPERATIONS.md lists the 5 specific Cloudflare API token permissions (Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read)
- OPERATIONS.md explains that Worker secrets persist across deploys and the CD pipeline only deploys code
- A "secret surfaces" explanation exists (once, in one file, cross-referenced from the other) covering: Cloudflare Worker secrets (runtime), GitHub environment secrets (CI), `.dev.vars` (local dev)
- README.md staging section documents KV namespace creation, R2 bucket creation, and wrangler.toml KV ID requirement
- Coralogix send key sourcing is documented (Settings > Send Your Data > API Keys)
- OPERATIONS.md environment setup tables link to README secret generation commands rather than duplicating them
- No content duplication between README.md and OPERATIONS.md — one is source of truth, the other cross-references
- Evolution log phase references today's pipeline fixes as context

**Scope**:
- In: README.md setup/staging sections, OPERATIONS.md environment setup section, evolution log entry for this phase
- Out: Code changes, workflow changes, wrangler.toml changes, new documentation files, CI pipeline modifications

**Constraints**:
- URLs in OPERATIONS.md remain as placeholders (they are correctly fork-dependent)
- Assume the reader knows Cloudflare Workers basics — document WRL-specific setup, not Workers 101

## Your Planning Question
A new operator encounters README.md and OPERATIONS.md and needs to go from "I just forked this" to "both pipelines are green." What cognitive load issues exist? Are there implicit assumptions (which Cloudflare permissions to pick, that Worker secrets persist independently of deploys) that must be made explicit? Is the 9-step README setup the right granularity?

## Context
- README.md, OPERATIONS.md
- The 5 specific Cloudflare token permissions needed: Workers Scripts Edit, Workers KV Storage Edit, Workers R2 Storage Edit, Account Settings Read, User Memberships Read
- Working directory: /Users/ben/github/benpeter/web-resource-ledger

## Instructions
1. Read relevant files to understand the current state
2. Apply your domain expertise to the planning question
3. Identify risks, dependencies, and requirements from your perspective
4. If you believe additional specialists should be involved that aren't already part of the planning, say so and explain why
5. Return your contribution in this format:

## Domain Plan Contribution: ux-strategy-minion

### Recommendations
<your expert recommendations for this aspect of the task>

### Proposed Tasks
<specific tasks that should be in the execution plan>
For each task: what to do, deliverables, dependencies

### Risks and Concerns
<things that could go wrong from your domain perspective>

### Additional Agents Needed
<any specialists not yet involved who should be, and why>
(or "None" if the current team is sufficient)
6. Write your complete contribution to /var/folders/3k/bfjvvz9s6dvdn_hvlhvr8lc00000gn/T//nefario-scratch-k31WEo/secrets-env-docs-onboarding/phase2-ux-strategy-minion.md
